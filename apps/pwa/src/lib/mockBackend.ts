// In-browser backend for demos: everything lives in IndexedDB on this device.
// 70 seeded demo profiles act as simple bots so one person can walk the whole flow:
// some already like you, some like you back, they reply to notes and accept Connect.
import { createStore, del, get, set } from 'idb-keyval';
import {
  BOT_LIKE_COMMENTS,
  BOT_REPLIES,
  demoUuid,
  generateDemoProfiles,
  offsetPoint,
  type DemoProfile,
} from '@linky/content';
import {
  buildFeed,
  compatibility,
  hardFilter,
  type Attributes,
  type CompatibilityBreakdown,
  type GeoPoint,
  type Kinks,
  type LoveLanguageProfile,
  type Personality,
  type Preferences,
} from '@linky/matching';
import {
  DAILY_LIKES,
  DAILY_NOTES,
  PASS_VISIBLE_MS,
  type Backend,
  type DemoTools,
  type SessionUser,
} from './backend';
import { toMatchable, publicView } from './profileView';
import type { FeedExplanation } from './backend';
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

const DB_VERSION = 1;
/** Bump when generated demo profiles change; stored demos are refreshed in place. */
const DEMO_REVISION = 2;
const DEFAULT_CENTER: GeoPoint = { lat: 45.5017, lng: -73.5673 }; // Montréal
const BOT_DELAY_MS = 4000;

interface StoredProfile extends MyProfile {
  is_demo?: boolean;
  offset_km?: { x: number; y: number };
  bot?: DemoProfile['bot'];
  banned?: boolean;
  flagged?: boolean;
}

interface Like {
  id: string;
  from_id: string;
  to_id: string;
  target_type: LikeTargetType;
  target_id: string;
  comment: string | null;
  created_at: string;
}

interface Match {
  id: string;
  user_a: string;
  user_b: string;
  connect_a: boolean;
  connect_b: boolean;
  /** when a bot's pending connect becomes visible */
  connect_at_a?: string;
  connect_at_b?: string;
  compatibility: CompatibilityBreakdown | null;
  created_at: string;
}

interface Report {
  id: string;
  reporter_id: string;
  target_id: string;
  note_id: string | null;
  note_body: string | null;
  reason: string;
  details: string | null;
  status: ReportStatus;
  created_at: string;
}

interface MockDB {
  version: number;
  demo_revision?: number;
  users: SessionUser[];
  session: string | null;
  profiles: Record<string, StoredProfile>;
  likes: Like[];
  /** created_at is set for passes from Discover; those stay visible (faded) for a day. */
  skips: { from_id: string; to_id: string; created_at?: string }[];
  matches: Match[];
  notes: Note[];
  blocks: { blocker_id: string; blocked_id: string }[];
  reports: Report[];
  /** day → user → counters, for daily limits */
  usage: Record<string, Record<string, { likes: number; notes: Record<string, number> }>>;
}

const store = createStore('linky-mock', 'kv');
const KEY = 'db';

const uid = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();
const today = () => new Date().toISOString().slice(0, 10);
const visible = (iso?: string | null) => !iso || new Date(iso).getTime() <= Date.now();

function demoToStored(d: DemoProfile, n: number): StoredProfile {
  const id = demoUuid(n + 1);
  const photos: Photo[] = Array.from({ length: 1 + d.scenes.length }, (_, i) => ({
    id: demoUuid(n + 1, 100 + i),
    url: `${import.meta.env.BASE_URL ?? '/'}demo/${d.id}-${i}.svg`,
    position: i,
    nsfw_score: 0,
  }));
  return {
    id,
    email: `${d.id}@demo.linky.app`,
    name: d.name,
    last_name: null,
    show_last_name: true,
    birthdate: d.birthdate,
    gender: d.gender,
    gender_custom: null,
    pronouns: d.pronouns,
    orientation: d.orientation,
    show_gender: true,
    show_pronouns: true,
    show_orientation: true,
    city: d.city,
    location: null, // resolved relative to the demo centre on read
    offset_km: d.offset_km,
    height_cm: d.height_cm,
    verified: d.verified,
    paused: false,
    is_admin: false,
    onboarding_complete: true,
    onboarding_step: 99,
    deletion_requested_at: null,
    last_active_at: new Date(Date.now() - d.last_active_hours * 3.6e6).toISOString(),
    photos,
    prompts: d.prompts.map((p, i) => ({ id: demoUuid(n + 1, 200 + i), prompt: p.prompt, answer: p.answer, position: i })),
    personality: { ...d.personality, visible: true },
    love_language: { receive: d.love_language.receive, give: d.love_language.give, visible: true },
    attributes: d.attributes,
    preferences: {
      age_min: d.age_min,
      age_max: d.age_max,
      distance_km: d.distance_km,
      genders_wanted: d.seeking,
    },
    kinks: d.kinks
      ? { ...d.kinks, filter_shared: false }
      : { opted_in: false, tags: [], visibility_level: 'hidden', filter_shared: false },
    handles: d.handles,
    verification: d.verified
      ? { passed: true, challenges: ['blink', 'turn-left'], liveness_score: 1, face_match_score: 0.9, created_at: nowIso() }
      : null,
    is_demo: true,
    bot: d.bot,
  };
}

function freshDb(): MockDB {
  const profiles: Record<string, StoredProfile> = {};
  generateDemoProfiles().forEach((d, n) => {
    const p = demoToStored(d, n);
    profiles[p.id] = p;
  });
  const ids = Object.keys(profiles);
  // A couple of example reports so the admin queue isn't empty in a demo.
  const reports: Report[] = [
    { id: uid(), reporter_id: ids[3], target_id: ids[17], note_id: null, note_body: null, reason: 'Fake profile or catfish', details: 'Photos look like they are from a stock site.', status: 'open', created_at: nowIso() },
    { id: uid(), reporter_id: ids[8], target_id: ids[17], note_id: null, note_body: 'hey send me $50 for a bus ticket and i will come see you', reason: 'Spam or scam', details: null, status: 'open', created_at: nowIso() },
  ];
  return {
    version: DB_VERSION,
    demo_revision: DEMO_REVISION,
    users: [],
    session: null,
    profiles,
    likes: [],
    skips: [],
    matches: [],
    notes: [],
    blocks: [],
    reports,
    usage: {},
  };
}

export function emptyProfile(id: string, email: string | null): MyProfile {
  return {
    id,
    email,
    name: '',
    last_name: null,
    show_last_name: true,
    birthdate: '',
    gender: 'woman',
    gender_custom: null,
    pronouns: null,
    orientation: null,
    show_gender: true,
    show_pronouns: true,
    show_orientation: true,
    city: null,
    location: null,
    height_cm: null,
    verified: false,
    paused: false,
    is_admin: false,
    onboarding_complete: false,
    onboarding_step: 0,
    deletion_requested_at: null,
    photos: [],
    prompts: [],
    personality: null,
    love_language: null,
    attributes: {},
    preferences: { age_min: 18, age_max: 99, distance_km: 50, genders_wanted: [] },
    kinks: { opted_in: false, tags: [], visibility_level: 'hidden', filter_shared: false },
    handles: [],
    verification: null,
  };
}

export class MockBackend implements Backend, DemoTools {
  readonly mode = 'mock' as const;
  private db: MockDB | null = null;
  private listeners = new Set<(u: SessionUser | null) => void>();

  // ---- persistence ---------------------------------------------------------
  private async load(): Promise<MockDB> {
    if (this.db) return this.db;
    const saved = await get<MockDB>(KEY, store).catch(() => undefined);
    this.db = saved && saved.version === DB_VERSION ? saved : freshDb();
    // Demo profiles added or changed in a later build join an existing demo without a
    // reset. Ids are stable, so likes, matches and notes with them carry over.
    const refresh = (this.db.demo_revision ?? 1) !== DEMO_REVISION;
    const changed = generateDemoProfiles()
      .map((d, n) => demoToStored(d, n))
      .filter((p) => refresh || !this.db!.profiles[p.id]);
    for (const p of changed) {
      const old = this.db.profiles[p.id];
      this.db.profiles[p.id] = old ? { ...p, banned: old.banned, photos: p.photos.map((ph) => ({ ...ph, removed_by_admin: old.photos.find((o) => o.id === ph.id)?.removed_by_admin })) } : p;
    }
    this.db.demo_revision = DEMO_REVISION;
    if (!saved || changed.length) await this.save();
    return this.db;
  }

  private async save() {
    if (this.db) await set(KEY, this.db, store);
  }

  private async mutate<T>(fn: (db: MockDB) => T): Promise<T> {
    const db = await this.load();
    const out = fn(db);
    await this.save();
    return out;
  }

  private me(db: MockDB): StoredProfile {
    if (!db.session) throw new Error('not signed in');
    const p = db.profiles[db.session];
    if (!p) throw new Error('profile missing');
    return p;
  }

  private center(db: MockDB): GeoPoint {
    return (db.session && db.profiles[db.session]?.location) || DEFAULT_CENTER;
  }

  /** Demo profiles are placed around wherever the tester is. */
  private resolved(db: MockDB, p: StoredProfile): StoredProfile {
    if (!p.is_demo || !p.offset_km) return p;
    return { ...p, location: offsetPoint(this.center(db), p.offset_km) };
  }

  private usage(db: MockDB, userId: string) {
    const day = (db.usage[today()] ??= {});
    return (day[userId] ??= { likes: 0, notes: {} });
  }

  private matchBetween(db: MockDB, a: string, b: string): Match | undefined {
    const [x, y] = a < b ? [a, b] : [b, a];
    return db.matches.find((m) => m.user_a === x && m.user_b === y);
  }

  private blocked(db: MockDB, a: string, b: string): boolean {
    return db.blocks.some(
      (k) => (k.blocker_id === a && k.blocked_id === b) || (k.blocker_id === b && k.blocked_id === a),
    );
  }

  private view(db: MockDB, target: StoredProfile): PublicProfile {
    const me = this.resolved(db, this.me(db));
    return publicView(me, this.resolved(db, target), { isMatch: Boolean(this.matchBetween(db, me.id, target.id)) });
  }

  private createMatch(db: MockDB, a: string, b: string): Match {
    const existing = this.matchBetween(db, a, b);
    if (existing) return existing;
    const [x, y] = a < b ? [a, b] : [b, a];
    const pa = this.resolved(db, db.profiles[a]);
    const pb = this.resolved(db, db.profiles[b]);
    const m: Match = {
      id: uid(),
      user_a: x,
      user_b: y,
      connect_a: false,
      connect_b: false,
      compatibility: compatibility(toMatchable(pa), toMatchable(pb)),
      created_at: nowIso(),
    };
    db.matches.push(m);
    return m;
  }

  /** When onboarding finishes, a few compatible demo bots "already" like you. */
  private seedIncomingLikes(db: MockDB, me: StoredProfile) {
    if (db.likes.some((l) => l.to_id === me.id)) return;
    const meM = toMatchable(this.resolved(db, me));
    const bots = Object.values(db.profiles)
      .filter((p) => p.is_demo)
      .map((p) => this.resolved(db, p));
    const ok = bots.filter((b) => !hardFilter(toMatchable(b), meM));
    const chosen = [...ok.filter((b) => b.bot?.likes_you), ...ok.filter((b) => !b.bot?.likes_you)].slice(0, 4);
    chosen.forEach((b, i) => {
      const usePrompt = me.prompts.length > 0 && i % 2 === 1;
      const target = usePrompt ? me.prompts[i % me.prompts.length] : me.photos[i % Math.max(1, me.photos.length)];
      if (!target) return;
      db.likes.push({
        id: uid(),
        from_id: b.id,
        to_id: me.id,
        target_type: usePrompt ? 'prompt' : 'photo',
        target_id: target.id,
        comment: BOT_LIKE_COMMENTS[i % BOT_LIKE_COMMENTS.length] || null,
        created_at: new Date(Date.now() - (i + 1) * 3.6e6).toISOString(),
      });
    });
  }

  // ---- auth ----------------------------------------------------------------
  async getSessionUser(): Promise<SessionUser | null> {
    const db = await this.load();
    return db.users.find((u) => u.id === db.session) ?? null;
  }

  onAuthChange(cb: (u: SessionUser | null) => void) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private async emit() {
    const u = await this.getSessionUser();
    this.listeners.forEach((l) => l(u));
  }

  async signInWithEmail(email: string) {
    await this.mutate((db) => {
      const e = email.trim().toLowerCase();
      let u = db.users.find((x) => x.email === e);
      if (!u) {
        u = { id: uid(), email: e };
        db.users.push(u);
      }
      db.session = u.id;
    });
    await this.emit();
    return { sentLink: false };
  }

  async signInWithProvider(provider: 'google' | 'apple') {
    await this.signInWithEmail(`${provider}-tester@demo.linky.app`);
  }

  async signOut() {
    await this.mutate((db) => {
      db.session = null;
    });
    await this.emit();
  }

  // ---- my profile ----------------------------------------------------------
  async getMyProfile(): Promise<MyProfile | null> {
    const db = await this.load();
    if (!db.session) return null;
    const p = db.profiles[db.session];
    const user = db.users.find((u) => u.id === db.session);
    return p ? structuredClone(p) : emptyProfile(db.session, user?.email ?? null);
  }

  private async patchMe(fn: (p: StoredProfile, db: MockDB) => void) {
    await this.mutate((db) => {
      if (!db.session) throw new Error('not signed in');
      const user = db.users.find((u) => u.id === db.session)!;
      const p = (db.profiles[db.session] ??= emptyProfile(db.session, user.email));
      fn(p, db);
      p.last_active_at = nowIso();
    });
  }

  async saveProfile(patch: Partial<ProfileCore>) {
    await this.patchMe((p, db) => {
      const finishing = patch.onboarding_complete && !p.onboarding_complete;
      Object.assign(p, patch);
      if (finishing) this.seedIncomingLikes(db, p);
    });
  }

  async savePrompts(prompts: Omit<PromptAnswer, 'id'>[]) {
    await this.patchMe((p) => {
      p.prompts = prompts.map((x) => ({
        ...x,
        id: p.prompts.find((o) => o.position === x.position && o.prompt === x.prompt)?.id ?? uid(),
      }));
    });
  }

  async savePersonality(v: Personality) {
    await this.patchMe((p) => void (p.personality = v));
  }
  async saveLoveLanguage(v: LoveLanguageProfile) {
    await this.patchMe((p) => void (p.love_language = v));
  }
  async saveAttributes(v: Attributes) {
    await this.patchMe((p) => void (p.attributes = v));
  }
  async savePreferences(v: Preferences) {
    await this.patchMe((p) => void (p.preferences = v));
  }
  async saveKinks(v: Kinks) {
    await this.patchMe((p) => void (p.kinks = v));
  }
  async saveHandles(v: Handle[]) {
    await this.patchMe((p) => void (p.handles = v));
  }

  async addPhoto(blob: Blob, nsfwScore: number | null): Promise<Photo> {
    const url = await blobToDataUrl(blob);
    let photo!: Photo;
    await this.patchMe((p) => {
      if (p.photos.length >= 6) throw new LimitError('You can add up to 6 photos');
      photo = { id: uid(), url, position: p.photos.length, nsfw_score: nsfwScore };
      p.photos.push(photo);
    });
    return photo;
  }

  async removePhoto(photoId: string) {
    await this.patchMe((p) => {
      p.photos = p.photos.filter((x) => x.id !== photoId).map((x, i) => ({ ...x, position: i }));
    });
  }

  async reorderPhotos(ids: string[]) {
    await this.patchMe((p) => {
      p.photos = ids
        .map((id) => p.photos.find((x) => x.id === id))
        .filter((x): x is Photo => Boolean(x))
        .map((x, i) => ({ ...x, position: i }));
    });
  }

  async submitVerification(r: VerificationResult) {
    await this.patchMe((p) => {
      p.verification = { ...r, created_at: nowIso() };
      p.verified = r.passed;
    });
  }

  // ---- discover ------------------------------------------------------------
  async explainFeed(): Promise<FeedExplanation> {
    const db = await this.load();
    const me = this.resolved(db, this.me(db));
    const meM = toMatchable(me);
    const out: FeedExplanation = { total: 0, seen: 0, available: 0, filtered: {} };
    for (const p of Object.values(db.profiles)) {
      if (p.id === me.id || !p.onboarding_complete || p.banned || p.deletion_requested_at || p.paused) continue;
      out.total++;
      const acted = db.likes.some((l) => l.from_id === me.id && l.to_id === p.id) || db.skips.some((s) => s.from_id === me.id && s.to_id === p.id);
      if (acted || this.matchBetween(db, me.id, p.id) || this.blocked(db, me.id, p.id)) {
        out.seen++;
        continue;
      }
      const why = hardFilter(meM, toMatchable(this.resolved(db, p)));
      if (why) out.filtered[why] = (out.filtered[why] ?? 0) + 1;
      else out.available++;
    }
    return out;
  }

  async getFeed(): Promise<FeedItem[]> {
    const db = await this.load();
    const me = this.resolved(db, this.me(db));
    const passedSince = Date.now() - PASS_VISIBLE_MS;
    const recentPasses = new Map(
      db.skips
        .filter((s) => s.from_id === me.id && s.created_at && Date.parse(s.created_at) > passedSince)
        .map((s) => [s.to_id, s.created_at!]),
    );
    const acted = new Set([
      ...db.likes.filter((l) => l.from_id === me.id).map((l) => l.to_id),
      ...db.skips.filter((s) => s.from_id === me.id && !recentPasses.has(s.to_id)).map((s) => s.to_id),
    ]);
    const candidates = Object.values(db.profiles)
      .filter(
        (p) =>
          p.id !== me.id &&
          p.onboarding_complete &&
          !p.banned &&
          !p.deletion_requested_at &&
          !acted.has(p.id) &&
          !this.matchBetween(db, me.id, p.id) &&
          !this.blocked(db, me.id, p.id),
      )
      .map((p) => this.resolved(db, p));
    const byId = new Map(candidates.map((c) => [c.id, c]));
    return buildFeed(toMatchable(me), candidates.map(toMatchable)).map((r) => ({
      profile: this.view(db, byId.get(r.profile.id)!),
      compatibility: r.compatibility,
      passed_at: recentPasses.get(r.profile.id) ?? null,
    }));
  }

  async getPublicProfile(id: string) {
    const db = await this.load();
    const p = db.profiles[id];
    if (!p || this.blocked(db, db.session!, id)) return null;
    return this.view(db, p);
  }

  async likesRemaining() {
    const db = await this.load();
    return Math.max(0, DAILY_LIKES - this.usage(db, this.me(db).id).likes);
  }

  async like(toId: string, targetType: LikeTargetType, targetId: string, comment: string): Promise<LikeResult> {
    const res = await this.mutate((db) => {
      const me = this.me(db);
      if (!me.verified) throw new Error('Verify your profile before liking');
      const u = this.usage(db, me.id);
      if (u.likes >= DAILY_LIKES) throw new LimitError(`You've used your ${DAILY_LIKES} likes for today`);
      const target = db.profiles[toId];
      if (!target || target.banned || this.blocked(db, me.id, toId)) throw new Error('Profile unavailable');
      if (!db.likes.some((l) => l.from_id === me.id && l.to_id === toId)) {
        db.likes.push({
          id: uid(),
          from_id: me.id,
          to_id: toId,
          target_type: targetType,
          target_id: targetId,
          comment: comment.trim() || null,
          created_at: nowIso(),
        });
        u.likes++;
      }
      const theyLiked = db.likes.some((l) => l.from_id === toId && l.to_id === me.id);
      const botLikesBack = target.is_demo && target.bot?.likes_back;
      let match: Match | null = null;
      if (theyLiked || botLikesBack) {
        if (!theyLiked) {
          db.likes.push({
            id: uid(),
            from_id: toId,
            to_id: me.id,
            target_type: 'photo',
            target_id: me.photos[0]?.id ?? '',
            comment: null,
            created_at: nowIso(),
          });
        }
        match = this.createMatch(db, me.id, toId);
      }
      return { matched: Boolean(match), match_id: match?.id ?? null, likes_remaining: DAILY_LIKES - u.likes };
    });
    return res;
  }

  async skip(toId: string) {
    await this.mutate((db) => {
      db.skips.push({ from_id: this.me(db).id, to_id: toId, created_at: new Date().toISOString() });
    });
  }

  async getLikesYou(): Promise<LikeYou[]> {
    const db = await this.load();
    const me = this.me(db);
    return db.likes
      .filter(
        (l) =>
          l.to_id === me.id &&
          !this.matchBetween(db, me.id, l.from_id) &&
          !this.blocked(db, me.id, l.from_id) &&
          !db.profiles[l.from_id]?.banned &&
          !db.skips.some((s) => s.from_id === me.id && s.to_id === l.from_id),
      )
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((l) => {
        const photo = me.photos.find((p) => p.id === l.target_id);
        const prompt = me.prompts.find((p) => p.id === l.target_id);
        return {
          like: { id: l.id, target_type: l.target_type, target_id: l.target_id, comment: l.comment, created_at: l.created_at },
          target: photo ? { url: photo.url } : prompt ? { prompt: prompt.prompt, answer: prompt.answer } : null,
          profile: this.view(db, db.profiles[l.from_id]),
        };
      });
  }

  // ---- matches -------------------------------------------------------------
  async getMatches(): Promise<MatchSummary[]> {
    const db = await this.load();
    const me = this.me(db);
    return db.matches
      .filter((m) => m.user_a === me.id || m.user_b === me.id)
      .filter((m) => !db.profiles[m.user_a === me.id ? m.user_b : m.user_a]?.banned)
      .map((m) => {
        const otherId = m.user_a === me.id ? m.user_b : m.user_a;
        const notes = db.notes.filter((n) => n.match_id === m.id && visible(n.created_at));
        const last = notes[notes.length - 1] ?? null;
        return {
          match_id: m.id,
          created_at: m.created_at,
          compatibility: m.compatibility,
          ...this.connectState(m, me.id),
          profile: this.view(db, db.profiles[otherId]),
          last_note: last && { body: last.body, sender_id: last.sender_id, created_at: last.created_at },
          _activity: last?.created_at ?? m.created_at,
        };
      })
      .sort((a, b) => b._activity.localeCompare(a._activity))
      .map(({ _activity, ...rest }) => rest);
  }

  private connectState(m: Match, me: string) {
    const mine = m.user_a === me;
    const them = mine ? m.connect_b && visible(m.connect_at_b) : m.connect_a && visible(m.connect_at_a);
    return { connect_me: mine ? m.connect_a : m.connect_b, connect_them: them };
  }

  private myMatch(db: MockDB, matchId: string): Match {
    const me = this.me(db).id;
    const m = db.matches.find((x) => x.id === matchId && (x.user_a === me || x.user_b === me));
    if (!m) throw new Error('Match not found');
    return m;
  }

  async getNotes(matchId: string): Promise<Note[]> {
    const db = await this.load();
    this.myMatch(db, matchId);
    return db.notes.filter((n) => n.match_id === matchId && visible(n.created_at));
  }

  async notesRemaining(matchId: string) {
    const db = await this.load();
    return Math.max(0, DAILY_NOTES - (this.usage(db, this.me(db).id).notes[matchId] ?? 0));
  }

  async sendNote(matchId: string, body: string): Promise<Note> {
    return this.mutate((db) => {
      const me = this.me(db);
      const m = this.myMatch(db, matchId);
      const u = this.usage(db, me.id);
      if ((u.notes[matchId] ?? 0) >= DAILY_NOTES) {
        throw new LimitError(`You can send ${DAILY_NOTES} notes per match per day`);
      }
      const text = body.trim().slice(0, 500);
      if (!text) throw new Error('Write something first');
      const note: Note = { id: uid(), match_id: matchId, sender_id: me.id, body: text, created_at: nowIso() };
      db.notes.push(note);
      u.notes[matchId] = (u.notes[matchId] ?? 0) + 1;

      const otherId = m.user_a === me.id ? m.user_b : m.user_a;
      const other = db.profiles[otherId];
      if (other?.is_demo && other.bot) {
        const already = db.notes.filter((n) => n.match_id === matchId && n.sender_id === otherId).length;
        const lines = BOT_REPLIES[other.bot.reply_style % BOT_REPLIES.length];
        if (already < lines.length) {
          db.notes.push({
            id: uid(),
            match_id: matchId,
            sender_id: otherId,
            body: lines[already],
            created_at: new Date(Date.now() + BOT_DELAY_MS).toISOString(),
          });
        }
      }
      return note;
    });
  }

  async setConnect(matchId: string, value: boolean) {
    return this.mutate((db) => {
      const me = this.me(db).id;
      const m = this.myMatch(db, matchId);
      const mine = m.user_a === me;
      if (mine) m.connect_a = value;
      else m.connect_b = value;
      const otherId = mine ? m.user_b : m.user_a;
      if (value && db.profiles[otherId]?.is_demo) {
        const at = new Date(Date.now() + BOT_DELAY_MS / 2).toISOString();
        if (mine && !m.connect_b) Object.assign(m, { connect_b: true, connect_at_b: at });
        if (!mine && !m.connect_a) Object.assign(m, { connect_a: true, connect_at_a: at });
      }
      const s = this.connectState(m, me);
      return { both: s.connect_me && s.connect_them };
    });
  }

  async getSharedHandles(matchId: string): Promise<SharedHandle[] | null> {
    const db = await this.load();
    const me = this.me(db);
    const m = this.myMatch(db, matchId);
    const s = this.connectState(m, me.id);
    if (!(s.connect_me && s.connect_them)) return null;
    const other = db.profiles[m.user_a === me.id ? m.user_b : m.user_a];
    return [...other.handles]
      .sort((a, b) => Number(b.preferred) - Number(a.preferred))
      .map((h) => ({ ...h, shared: me.handles.some((x) => x.app === h.app) }));
  }

  async unmatch(matchId: string) {
    await this.mutate((db) => this.unmatchIn(db, matchId));
  }

  private unmatchIn(db: MockDB, matchId: string) {
    const me = this.me(db).id;
    const m = this.myMatch(db, matchId);
    const other = m.user_a === me ? m.user_b : m.user_a;
    db.matches = db.matches.filter((x) => x.id !== matchId);
    db.notes = db.notes.filter((n) => n.match_id !== matchId);
    db.likes = db.likes.filter(
      (l) => !((l.from_id === me && l.to_id === other) || (l.from_id === other && l.to_id === me)),
    );
    db.skips.push({ from_id: me, to_id: other }, { from_id: other, to_id: me });
  }

  // ---- safety --------------------------------------------------------------
  async block(targetId: string) {
    await this.mutate((db) => {
      const me = this.me(db).id;
      db.blocks.push({ blocker_id: me, blocked_id: targetId });
      const m = this.matchBetween(db, me, targetId);
      if (m) this.unmatchIn(db, m.id);
    });
  }

  async report(targetId: string, reason: string, details: string, noteId?: string) {
    await this.mutate((db) => {
      const me = this.me(db).id;
      const note = noteId ? db.notes.find((n) => n.id === noteId && n.sender_id === targetId) : undefined;
      db.reports.push({
        id: uid(),
        reporter_id: me,
        target_id: targetId,
        note_id: note?.id ?? null,
        note_body: note?.body ?? null,
        reason,
        details: details.trim() || null,
        status: 'open',
        created_at: nowIso(),
      });
      const reporters = new Set(db.reports.filter((r) => r.target_id === targetId).map((r) => r.reporter_id));
      if (reporters.size >= 3 && db.profiles[targetId]) db.profiles[targetId].flagged = true;
    });
  }

  // ---- admin ---------------------------------------------------------------
  private requireAdmin(db: MockDB) {
    if (!this.me(db).is_admin) throw new Error('Admins only. Turn on admin in Settings → Demo tools.');
  }

  async adminReportQueue(status: ReportStatus | 'all'): Promise<AdminReport[]> {
    const db = await this.load();
    this.requireAdmin(db);
    return db.reports
      .filter((r) => status === 'all' || r.status === status)
      .map((r) => {
        const t = db.profiles[r.target_id];
        return {
          id: r.id,
          reason: r.reason,
          details: r.details,
          status: r.status,
          note_body: r.note_body,
          created_at: r.created_at,
          reporter: { id: r.reporter_id, name: db.profiles[r.reporter_id]?.name ?? 'Unknown' },
          target: {
            id: t.id,
            name: t.name,
            banned: Boolean(t.banned),
            flagged: Boolean(t.flagged),
            verified: t.verified,
            report_count: db.reports.filter((x) => x.target_id === t.id).length,
            photos: t.photos.map((p) => ({ id: p.id, url: p.url, removed: Boolean(p.removed_by_admin), nsfw_score: p.nsfw_score })),
            prompts: t.prompts.map(({ prompt, answer }) => ({ prompt, answer })),
          },
        };
      })
      .sort((a, b) => Number(b.target.flagged) - Number(a.target.flagged) || a.created_at.localeCompare(b.created_at));
  }

  async adminSetBanned(profileId: string, banned: boolean) {
    await this.mutate((db) => {
      this.requireAdmin(db);
      const p = db.profiles[profileId];
      p.banned = banned;
      if (!banned) p.flagged = false;
    });
  }

  async adminRemovePhoto(photoId: string) {
    await this.mutate((db) => {
      this.requireAdmin(db);
      for (const p of Object.values(db.profiles)) {
        const ph = p.photos.find((x) => x.id === photoId);
        if (ph) ph.removed_by_admin = true;
      }
    });
  }

  async adminResolveReport(reportId: string, status: ReportStatus) {
    await this.mutate((db) => {
      this.requireAdmin(db);
      const r = db.reports.find((x) => x.id === reportId);
      if (r) r.status = status;
    });
  }

  // ---- account -------------------------------------------------------------
  async requestDeletion() {
    await this.patchMe((p) => {
      p.deletion_requested_at = nowIso();
      p.paused = true;
    });
  }

  async cancelDeletion() {
    await this.patchMe((p) => void (p.deletion_requested_at = null));
  }

  async exportData() {
    const db = await this.load();
    const me = this.me(db);
    return {
      exported_at: nowIso(),
      backend: 'mock (this device only)',
      profile: me,
      likes_sent: db.likes.filter((l) => l.from_id === me.id),
      matches: db.matches.filter((m) => m.user_a === me.id || m.user_b === me.id),
      notes_sent: db.notes.filter((n) => n.sender_id === me.id),
      blocks: db.blocks.filter((b) => b.blocker_id === me.id),
      reports_filed: db.reports.filter((r) => r.reporter_id === me.id),
    };
  }

  // ---- demo tools ----------------------------------------------------------
  async resetDemo() {
    await del(KEY, store);
    this.db = null;
    await this.load();
    await this.emit();
  }

  async resetLimits() {
    await this.mutate((db) => {
      delete db.usage[today()];
    });
  }

  async setAdmin(on: boolean) {
    await this.patchMe((p) => void (p.is_admin = on));
  }
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${blob.type};base64,${btoa(bin)}`;
}
