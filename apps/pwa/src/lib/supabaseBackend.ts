// Real backend: Supabase Auth + Postgres (RLS + RPCs) + Edge Functions, photos on
// Cloudflare R2 (or Supabase Storage when R2 isn't configured yet).
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Attributes, Kinks, LoveLanguageProfile, Personality, Preferences } from '@linky/matching';
import type { Backend, SessionUser } from './backend';
import { emptyProfile } from './mockBackend';
import {
  LimitError,
  type AdminReport,
  type FeedItem,
  type Handle,
  type LikeResult,
  type LikeTargetType,
  type LikeYou,
  type MatchSummary,
  type MyProfile,
  type Note,
  type Photo,
  type ProfileCore,
  type PromptAnswer,
  type PublicProfile,
  type ReportStatus,
  type SharedHandle,
  type VerificationResult,
} from './types';

const env = import.meta.env;
const PHOTO_BUCKET = 'photos';

function fail(error: { message: string; code?: string } | null): void {
  if (!error) return;
  if (error.code === 'P0003' || error.code === 'P0004') throw new LimitError(error.message);
  throw new Error(error.message);
}

export class SupabaseBackend implements Backend {
  readonly mode = 'supabase' as const;
  readonly sb: SupabaseClient;

  constructor() {
    this.sb = createClient(env.VITE_SUPABASE_URL!, env.VITE_SUPABASE_ANON_KEY!, {
      auth: { persistSession: true, detectSessionInUrl: true, flowType: 'pkce' },
    });
  }

  private async uid(): Promise<string> {
    const { data } = await this.sb.auth.getSession();
    const id = data.session?.user.id;
    if (!id) throw new Error('not signed in');
    return id;
  }

  private async rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.sb.rpc(fn, args);
    fail(error);
    return data as T;
  }

  // ---- auth ----------------------------------------------------------------
  async getSessionUser(): Promise<SessionUser | null> {
    const { data } = await this.sb.auth.getSession();
    const u = data.session?.user;
    return u ? { id: u.id, email: u.email ?? null } : null;
  }

  onAuthChange(cb: (u: SessionUser | null) => void) {
    const { data } = this.sb.auth.onAuthStateChange((_e, s) =>
      cb(s?.user ? { id: s.user.id, email: s.user.email ?? null } : null),
    );
    return () => data.subscription.unsubscribe();
  }

  async signInWithEmail(email: string) {
    const { error } = await this.sb.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    });
    fail(error);
    return { sentLink: true };
  }

  async signInWithProvider(provider: 'google' | 'apple') {
    const { error } = await this.sb.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${location.origin}/auth/callback` },
    });
    fail(error);
  }

  async signOut() {
    await this.sb.auth.signOut();
  }

  // ---- my profile ----------------------------------------------------------
  async getMyProfile(): Promise<MyProfile | null> {
    const id = await this.uid();
    const user = (await this.sb.auth.getUser()).data.user;
    const { data: p, error } = await this.sb.from('profiles').select('*').eq('id', id).maybeSingle();
    fail(error);
    const base = emptyProfile(id, user?.email ?? null);
    const step = Number(localStorage.getItem(`linky:onboarding:${id}`) ?? 0);
    if (!p) return { ...base, ...this.readDraft(id), onboarding_step: step } as MyProfile;

    const [photos, prompts, pers, love, attrs, prefs, kinks, handles, verification, loc] = await Promise.all([
      this.sb.from('photos').select('id,url,position,nsfw_score,r2_key,removed_by_admin').order('position'),
      this.sb.from('prompt_answers').select('id,prompt,answer,position').order('position'),
      this.sb.from('personality').select('*').maybeSingle(),
      this.sb.from('love_language').select('*').maybeSingle(),
      this.sb.from('attributes').select('*'),
      this.sb.from('preferences').select('*').maybeSingle(),
      this.sb.from('kinks').select('*').maybeSingle(),
      this.sb.from('messenger_handles').select('app,handle,preferred'),
      this.sb.from('verifications').select('*').maybeSingle(),
      this.rpc<{ profile?: { location_approx?: { lat: number; lng: number } } }>('export_my_data').catch(() => null),
    ]);

    const attributes: Attributes = {};
    for (const a of attrs.data ?? []) {
      attributes[a.key as keyof Attributes] = {
        value: a.value,
        visible: a.visible,
        is_dealbreaker: a.is_dealbreaker,
        accept: a.accept ?? undefined,
      };
    }
    return {
      ...base,
      ...p,
      location: loc?.profile?.location_approx ?? null,
      onboarding_step: p.onboarding_complete ? 99 : step,
      photos: (photos.data ?? []) as Photo[],
      prompts: (prompts.data ?? []) as PromptAnswer[],
      personality: pers.data ?? null,
      love_language: love.data ?? null,
      attributes,
      preferences: prefs.data ?? base.preferences,
      kinks: kinks.data ?? base.kinks,
      handles: (handles.data ?? []) as Handle[],
      verification: verification.data ?? null,
    };
  }

  /** Basics typed before the profiles row can exist (it needs name, birthdate and gender). */
  private draftKey = (id: string) => `linky:draft:${id}`;
  private readDraft(id: string): Partial<ProfileCore> {
    try {
      return JSON.parse(localStorage.getItem(this.draftKey(id)) ?? '{}');
    } catch {
      return {};
    }
  }

  async saveProfile(patch: Partial<ProfileCore>) {
    const id = await this.uid();
    const { location, onboarding_step, ...cols } = patch;
    if (onboarding_step !== undefined) localStorage.setItem(`linky:onboarding:${id}`, String(onboarding_step));
    const { data: existing } = await this.sb.from('profiles').select('id').eq('id', id).maybeSingle();
    if (existing) {
      if (Object.keys(cols).length > 0) fail((await this.sb.from('profiles').update(cols).eq('id', id)).error);
    } else {
      const draft = { ...this.readDraft(id), ...cols };
      if (draft.name && draft.birthdate && draft.gender) {
        fail((await this.sb.from('profiles').insert({ id, ...draft })).error);
        localStorage.removeItem(this.draftKey(id));
      } else {
        localStorage.setItem(this.draftKey(id), JSON.stringify(draft));
      }
    }
    if (location) await this.rpc('set_my_location', { p_lat: location.lat, p_lng: location.lng });
  }

  async savePrompts(prompts: Omit<PromptAnswer, 'id'>[]) {
    const id = await this.uid();
    fail((await this.sb.from('prompt_answers').delete().eq('profile_id', id)).error);
    if (prompts.length) {
      fail((await this.sb.from('prompt_answers').insert(prompts.map((p) => ({ ...p, profile_id: id })))).error);
    }
  }

  async savePersonality(p: Personality) {
    const id = await this.uid();
    fail((await this.sb.from('personality').upsert({
      profile_id: id, type: p.type, e_i: p.e_i, s_n: p.s_n, t_f: p.t_f, j_p: p.j_p,
      visible: p.visible, self_reported: Boolean(p.self_reported),
    })).error);
  }

  async saveLoveLanguage(l: LoveLanguageProfile) {
    const id = await this.uid();
    fail((await this.sb.from('love_language').upsert({ profile_id: id, ...l })).error);
  }

  async saveAttributes(a: Attributes) {
    const id = await this.uid();
    const rows = Object.entries(a)
      .filter(([, s]) => s)
      .map(([key, s]) => ({
        profile_id: id, key, value: s!.value, visible: s!.visible,
        is_dealbreaker: s!.is_dealbreaker, accept: s!.accept ?? null,
      }));
    fail((await this.sb.from('attributes').delete().eq('profile_id', id)).error);
    if (rows.length) fail((await this.sb.from('attributes').insert(rows)).error);
  }

  async savePreferences(p: Preferences) {
    const id = await this.uid();
    fail((await this.sb.from('preferences').upsert({ profile_id: id, ...p })).error);
  }

  async saveKinks(k: Kinks) {
    const id = await this.uid();
    fail((await this.sb.from('kinks').upsert({ profile_id: id, ...k })).error);
  }

  async saveHandles(h: Handle[]) {
    const id = await this.uid();
    fail((await this.sb.from('messenger_handles').delete().eq('profile_id', id)).error);
    if (h.length) fail((await this.sb.from('messenger_handles').insert(h.map((x) => ({ ...x, profile_id: id })))).error);
  }

  async addPhoto(blob: Blob, nsfwScore: number | null): Promise<Photo> {
    const id = await this.uid();
    const { count } = await this.sb.from('photos').select('id', { count: 'exact', head: true });
    const position = count ?? 0;
    if (position >= 6) throw new LimitError('You can add up to 6 photos');
    let key: string;
    let url: string;
    if (env.VITE_R2_ENABLED === 'true') {
      const { data, error } = await this.sb.functions.invoke('r2-upload', {
        body: { action: 'sign', contentType: blob.type },
      });
      fail(error);
      const put = await fetch(data.uploadUrl, { method: 'PUT', body: blob, headers: { 'Content-Type': blob.type } });
      if (!put.ok) throw new Error(`Upload failed (${put.status})`);
      key = data.key;
      url = data.publicUrl;
    } else {
      key = `${id}/${crypto.randomUUID()}.${blob.type.split('/')[1]}`;
      fail((await this.sb.storage.from(PHOTO_BUCKET).upload(key, blob, { contentType: blob.type })).error);
      url = this.sb.storage.from(PHOTO_BUCKET).getPublicUrl(key).data.publicUrl;
    }
    const { data: row, error } = await this.sb
      .from('photos')
      .insert({ profile_id: id, r2_key: key, url, position, nsfw_score: nsfwScore })
      .select('id,url,position,nsfw_score,r2_key')
      .single();
    fail(error);
    return row as Photo;
  }

  async removePhoto(photoId: string) {
    const { data: photo } = await this.sb.from('photos').select('r2_key').eq('id', photoId).single();
    if (photo && env.VITE_R2_ENABLED === 'true') {
      await this.sb.functions.invoke('r2-upload', { body: { action: 'delete', key: photo.r2_key } });
    } else if (photo) {
      await this.sb.storage.from(PHOTO_BUCKET).remove([photo.r2_key]);
    }
    fail((await this.sb.from('photos').delete().eq('id', photoId)).error);
    const { data: rest } = await this.sb.from('photos').select('id').order('position');
    await this.reorderPhotos((rest ?? []).map((r) => r.id));
  }

  async reorderPhotos(ids: string[]) {
    // One upsert statement; unique(profile_id, position) is deferred to commit.
    const id = await this.uid();
    const { data } = await this.sb.from('photos').select('*').eq('profile_id', id);
    const rows = (data ?? []).map((r) => ({ ...r, position: ids.indexOf(r.id) })).filter((r) => r.position >= 0);
    fail((await this.sb.from('photos').upsert(rows)).error);
  }

  async submitVerification(r: VerificationResult) {
    await this.rpc('submit_verification', {
      p_passed: r.passed, p_challenges: r.challenges, p_liveness: r.liveness_score, p_face: r.face_match_score,
    });
  }

  // ---- discover ------------------------------------------------------------
  async getFeed(): Promise<FeedItem[]> {
    const { data, error } = await this.sb.functions.invoke('feed', { body: { limit: 30 } });
    fail(error);
    return (data?.items ?? []) as FeedItem[];
  }

  getPublicProfile(id: string) {
    return this.rpc<PublicProfile | null>('get_public_profile', { p_id: id });
  }

  like(toId: string, targetType: LikeTargetType, targetId: string, comment: string) {
    return this.rpc<LikeResult>('like_profile', {
      p_to: toId, p_target_type: targetType, p_target_id: targetId, p_comment: comment,
    });
  }

  async skip(toId: string) {
    await this.rpc('skip_profile', { p_to: toId });
  }

  likesRemaining() {
    return this.rpc<number>('likes_remaining');
  }

  getLikesYou() {
    return this.rpc<LikeYou[]>('get_likes_you');
  }

  // ---- matches -------------------------------------------------------------
  getMatches() {
    return this.rpc<MatchSummary[]>('get_matches');
  }

  async getNotes(matchId: string): Promise<Note[]> {
    const { data, error } = await this.sb.from('notes').select('*').eq('match_id', matchId).order('created_at');
    fail(error);
    return data as Note[];
  }

  async sendNote(matchId: string, body: string): Promise<Note> {
    const id = await this.uid();
    const { data, error } = await this.sb
      .from('notes')
      .insert({ match_id: matchId, sender_id: id, body: body.trim() })
      .select('*')
      .single();
    fail(error);
    return data as Note;
  }

  notesRemaining(matchId: string) {
    return this.rpc<number>('notes_remaining', { p_match: matchId });
  }

  setConnect(matchId: string, value: boolean) {
    return this.rpc<{ both: boolean }>('set_connect', { p_match: matchId, p_value: value });
  }

  getSharedHandles(matchId: string) {
    return this.rpc<SharedHandle[] | null>('get_shared_handles', { p_match: matchId });
  }

  async unmatch(matchId: string) {
    await this.rpc('unmatch', { p_match: matchId });
  }

  // ---- safety --------------------------------------------------------------
  async block(targetId: string) {
    await this.rpc('block_profile', { p_target: targetId });
  }

  async report(targetId: string, reason: string, details: string, noteId?: string) {
    await this.rpc('report_profile', {
      p_target: targetId, p_reason: reason, p_details: details || null, p_note_id: noteId ?? null,
    });
  }

  // ---- admin ---------------------------------------------------------------
  adminReportQueue(status: ReportStatus | 'all') {
    return this.rpc<AdminReport[]>('admin_report_queue', { p_status: status });
  }
  async adminSetBanned(profileId: string, banned: boolean) {
    await this.rpc('admin_set_banned', { p_target: profileId, p_banned: banned });
  }
  async adminRemovePhoto(photoId: string) {
    await this.rpc('admin_remove_photo', { p_photo: photoId });
  }
  async adminResolveReport(reportId: string, status: ReportStatus) {
    await this.rpc('admin_resolve_report', { p_report: reportId, p_status: status });
  }

  // ---- account -------------------------------------------------------------
  async requestDeletion() {
    await this.rpc('request_account_deletion');
  }
  async cancelDeletion() {
    await this.rpc('cancel_account_deletion');
  }
  exportData() {
    return this.rpc<unknown>('export_my_data');
  }
}
