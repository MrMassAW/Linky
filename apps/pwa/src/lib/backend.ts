import type { Kinks, LoveLanguageProfile, Personality, Preferences, Attributes } from '@linky/matching';
import type {
  AdminReport,
  FeedItem,
  Handle,
  LikeResult,
  LikeTargetType,
  LikeYou,
  MatchSummary,
  MyProfile,
  Note,
  Photo,
  ProfileCore,
  PromptAnswer,
  PublicProfile,
  ReportStatus,
  SharedHandle,
  VerificationResult,
} from './types';

export interface SessionUser {
  id: string;
  email: string | null;
}

/**
 * Everything the screens need from a backend. Two implementations:
 * - MockBackend: in-browser (IndexedDB) with 50 seeded demo profiles and demo bots.
 * - SupabaseBackend: the real thing, used when VITE_SUPABASE_URL is set.
 */
export interface Backend {
  readonly mode: 'mock' | 'supabase';

  // auth
  getSessionUser(): Promise<SessionUser | null>;
  onAuthChange(cb: (user: SessionUser | null) => void): () => void;
  /** Returns true when a magic link was emailed (real backend); mock signs in at once. */
  signInWithEmail(email: string): Promise<{ sentLink: boolean }>;
  signInWithProvider(provider: 'google' | 'apple'): Promise<void>;
  signOut(): Promise<void>;

  // my profile
  getMyProfile(): Promise<MyProfile | null>;
  saveProfile(patch: Partial<ProfileCore>): Promise<void>;
  savePrompts(prompts: Omit<PromptAnswer, 'id'>[]): Promise<void>;
  savePersonality(p: Personality): Promise<void>;
  saveLoveLanguage(l: LoveLanguageProfile): Promise<void>;
  saveAttributes(a: Attributes): Promise<void>;
  savePreferences(p: Preferences): Promise<void>;
  saveKinks(k: Kinks): Promise<void>;
  saveHandles(h: Handle[]): Promise<void>;
  addPhoto(blob: Blob, nsfwScore: number | null): Promise<Photo>;
  removePhoto(photoId: string): Promise<void>;
  reorderPhotos(photoIds: string[]): Promise<void>;
  submitVerification(r: VerificationResult): Promise<void>;

  // discover
  getFeed(): Promise<FeedItem[]>;
  getPublicProfile(id: string): Promise<PublicProfile | null>;
  like(toId: string, targetType: LikeTargetType, targetId: string, comment: string): Promise<LikeResult>;
  skip(toId: string): Promise<void>;
  likesRemaining(): Promise<number>;
  getLikesYou(): Promise<LikeYou[]>;

  // matches
  getMatches(): Promise<MatchSummary[]>;
  getNotes(matchId: string): Promise<Note[]>;
  sendNote(matchId: string, body: string): Promise<Note>;
  notesRemaining(matchId: string): Promise<number>;
  setConnect(matchId: string, value: boolean): Promise<{ both: boolean }>;
  getSharedHandles(matchId: string): Promise<SharedHandle[] | null>;
  unmatch(matchId: string): Promise<void>;

  // safety
  block(targetId: string): Promise<void>;
  report(targetId: string, reason: string, details: string, noteId?: string): Promise<void>;

  // admin
  adminReportQueue(status: ReportStatus | 'all'): Promise<AdminReport[]>;
  adminSetBanned(profileId: string, banned: boolean): Promise<void>;
  adminRemovePhoto(photoId: string): Promise<void>;
  adminResolveReport(reportId: string, status: ReportStatus): Promise<void>;

  // account
  requestDeletion(): Promise<void>;
  cancelDeletion(): Promise<void>;
  exportData(): Promise<unknown>;

  // push (real backend only)
  registerPushToken?(token: string): Promise<void>;
}

/** Extra controls only the mock backend offers (Settings → Demo tools). */
export interface DemoTools {
  resetDemo(): Promise<void>;
  resetLimits(): Promise<void>;
  setAdmin(on: boolean): Promise<void>;
}

export const NOTE_MAX = 500;
export const LIKE_COMMENT_MAX = 200;
export const DAILY_LIKES = 10;
export const DAILY_NOTES = 20;

let instance: Promise<Backend> | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
}

export function getBackend(): Promise<Backend> {
  if (!instance) {
    instance = isSupabaseConfigured()
      ? import('./supabaseBackend').then((m) => new m.SupabaseBackend())
      : import('./mockBackend').then((m) => new m.MockBackend());
  }
  return instance;
}

export function hasDemoTools(b: Backend): b is Backend & DemoTools {
  return b.mode === 'mock';
}
