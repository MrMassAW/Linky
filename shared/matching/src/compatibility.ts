import { ageFrom, distanceKm } from './geo.ts';
import { loveLanguageScore } from './loveLanguage.ts';
import {
  GOAL_SIMILARITY,
  KIDS_WANT_SIMILARITY,
  ORDINAL,
  lookupSymmetric,
  petSimilarity,
} from './options.ts';
import { personalityScore } from './personality.ts';
import type {
  AttributeKey,
  Attributes,
  CompatibilityBreakdown,
  Gender,
  MatchableProfile,
  SeekingBucket,
} from './types.ts';

export const WEIGHTS = {
  personality: 0.35,
  love_language: 0.35,
  lifestyle: 0.2,
  shared: 0.1,
} as const;

export function genderBucket(g: Gender): SeekingBucket {
  if (g === 'man' || g === 'trans man') return 'men';
  if (g === 'woman' || g === 'trans woman') return 'women';
  return 'nonbinary';
}

const str = (a: Attributes, k: AttributeKey): string | null => {
  const v = a[k]?.value;
  return typeof v === 'string' ? v : null;
};
const list = (a: Attributes, k: AttributeKey): string[] => {
  const v = a[k]?.value;
  return Array.isArray(v) ? v : typeof v === 'string' ? [v] : [];
};

/** Lifestyle similarity 0–100 over drinking, cannabis, smoking, kids, pets and goal. */
export function lifestyleScore(a: Attributes, b: Attributes): number | null {
  const parts: number[] = [];
  for (const key of ['drinking', 'cannabis', 'smoking'] as const) {
    const scale = ORDINAL[key];
    const x = str(a, key);
    const y = str(b, key);
    if (!x || !y) continue;
    const i = scale.indexOf(x);
    const j = scale.indexOf(y);
    if (i < 0 || j < 0) continue;
    parts.push(1 - Math.abs(i - j) / (scale.length - 1));
  }
  const goalA = str(a, 'goal');
  const goalB = str(b, 'goal');
  if (goalA && goalB) parts.push(lookupSymmetric(GOAL_SIMILARITY, goalA, goalB));
  const kidsA = str(a, 'kids_want');
  const kidsB = str(b, 'kids_want');
  if (kidsA && kidsB) parts.push(lookupSymmetric(KIDS_WANT_SIMILARITY, kidsA, kidsB));
  const petsA = str(a, 'pets');
  const petsB = str(b, 'pets');
  if (petsA && petsB) parts.push(petSimilarity(petsA, petsB));
  if (parts.length === 0) return null;
  return Math.round((parts.reduce((s, n) => s + n, 0) / parts.length) * 100);
}

/** Overlap coefficient |A∩B| / min(|A|,|B|), 0..1. */
function overlap(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const sb = new Set(b);
  const common = a.filter((x) => sb.has(x)).length;
  return common / Math.min(a.length, b.length);
}

/** Shared languages (half) and interests (half), 0–100. */
export function sharedScore(a: Attributes, b: Attributes): number | null {
  const la = list(a, 'languages');
  const lb = list(b, 'languages');
  const ia = list(a, 'interests');
  const ib = list(b, 'interests');
  const hasLang = la.length > 0 && lb.length > 0;
  const hasInt = ia.length > 0 && ib.length > 0;
  if (!hasLang && !hasInt) return null;
  const langPart = hasLang ? (overlap(la, lb) > 0 ? 0.6 + 0.4 * overlap(la, lb) : 0) : null;
  const intPart = hasInt ? overlap(ia, ib) : null;
  const vals = [langPart, intPart].filter((v): v is number => v !== null);
  return Math.round((vals.reduce((s, n) => s + n, 0) / vals.length) * 100);
}

/** Weighted total; missing components are dropped and the weights renormalized. */
export function compatibility(a: MatchableProfile, b: MatchableProfile): CompatibilityBreakdown {
  const personality =
    a.personality && b.personality ? personalityScore(a.personality, b.personality) : null;
  const love_language =
    a.love_language && b.love_language ? loveLanguageScore(a.love_language, b.love_language) : null;
  const lifestyle = lifestyleScore(a.attributes, b.attributes);
  const shared = sharedScore(a.attributes, b.attributes);
  const parts: Array<[number | null, number]> = [
    [personality, WEIGHTS.personality],
    [love_language, WEIGHTS.love_language],
    [lifestyle, WEIGHTS.lifestyle],
    [shared, WEIGHTS.shared],
  ];
  let sum = 0;
  let weight = 0;
  for (const [v, w] of parts) {
    if (v === null) continue;
    sum += v * w;
    weight += w;
  }
  const total = weight === 0 ? 50 : Math.round(sum / weight);
  return { total, personality, love_language, lifestyle, shared };
}

// ---------------------------------------------------------------------------
// Hard filters
// ---------------------------------------------------------------------------

export type FilterFailure =
  | 'paused'
  | 'self'
  | 'gender'
  | 'age'
  | 'distance'
  | `dealbreaker:${string}`
  | 'kinks';

/** True when `viewer` would accept `other` on one attribute dealbreaker. */
function acceptsAttribute(viewer: Attributes, other: Attributes, key: AttributeKey): boolean {
  const mine = viewer[key];
  if (!mine?.is_dealbreaker) return true;
  const theirs = other[key]?.value;
  // Unanswered fields fail a dealbreaker: the viewer asked to be strict.
  if (theirs === null || theirs === undefined || (Array.isArray(theirs) && theirs.length === 0)) {
    return false;
  }
  const accepted =
    mine.accept && mine.accept.length > 0
      ? mine.accept
      : Array.isArray(mine.value)
        ? mine.value
        : mine.value !== null
          ? [mine.value]
          : [];
  if (accepted.length === 0) return true;
  const values = Array.isArray(theirs) ? theirs : [theirs];
  return values.some((v) => accepted.includes(v));
}

/** One direction of the kink filter: does `viewer` require shared tags that `other` lacks? */
function acceptsKinks(viewer: MatchableProfile, other: MatchableProfile): boolean {
  const k = viewer.kinks;
  if (!k?.opted_in || !k.filter_shared || k.tags.length === 0) return true;
  const o = other.kinks;
  // Filtering only uses tags the other person opted in to share pre-match.
  if (!o?.opted_in || o.visibility_level === 'hidden' || o.visibility_level === 'matches') return false;
  return o.tags.some((t) => k.tags.includes(t));
}

export function hardFilter(
  a: MatchableProfile,
  b: MatchableProfile,
  now: Date = new Date(),
): FilterFailure | null {
  if (a.id === b.id) return 'self';
  if (b.paused) return 'paused';
  if (!a.preferences.genders_wanted.includes(genderBucket(b.gender))) return 'gender';
  if (!b.preferences.genders_wanted.includes(genderBucket(a.gender))) return 'gender';
  const ageA = ageFrom(a.birthdate, now);
  const ageB = ageFrom(b.birthdate, now);
  if (ageB < a.preferences.age_min || ageB > a.preferences.age_max) return 'age';
  if (ageA < b.preferences.age_min || ageA > b.preferences.age_max) return 'age';
  const limits = [a.preferences.distance_km, b.preferences.distance_km].filter(
    (d): d is number => d !== null,
  );
  if (limits.length > 0) {
    if (!a.location || !b.location) return 'distance';
    if (distanceKm(a.location, b.location) > Math.min(...limits)) return 'distance';
  }
  const keys = new Set<AttributeKey>([
    ...(Object.keys(a.attributes) as AttributeKey[]),
    ...(Object.keys(b.attributes) as AttributeKey[]),
  ]);
  for (const key of keys) {
    if (!acceptsAttribute(a.attributes, b.attributes, key)) return `dealbreaker:${key}`;
    if (!acceptsAttribute(b.attributes, a.attributes, key)) return `dealbreaker:${key}`;
  }
  if (!acceptsKinks(a, b) || !acceptsKinks(b, a)) return 'kinks';
  return null;
}

// ---------------------------------------------------------------------------
// Feed ranking
// ---------------------------------------------------------------------------

/** Small deterministic PRNG so the daily feed is stable within a day. */
export function hashToUnit(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

export interface RankedCandidate<P extends MatchableProfile = MatchableProfile> {
  profile: P;
  compatibility: CompatibilityBreakdown;
  rank: number;
}

export function rankScore(
  viewer: MatchableProfile,
  candidate: MatchableProfile,
  compat: CompatibilityBreakdown,
  now: Date = new Date(),
): number {
  let rank = compat.total;
  if (candidate.verified) rank += 5;
  if (candidate.last_active_at) {
    const hours = (now.getTime() - new Date(candidate.last_active_at).getTime()) / 3.6e6;
    if (hours < 24) rank += 5;
    else if (hours < 24 * 7) rank += 2;
  }
  const day = now.toISOString().slice(0, 10);
  rank += hashToUnit(`${viewer.id}:${candidate.id}:${day}`) * 6;
  return rank;
}

/** Filter, score and order candidates for `viewer`'s discover feed. */
export function buildFeed<P extends MatchableProfile>(
  viewer: MatchableProfile,
  candidates: P[],
  now: Date = new Date(),
): RankedCandidate<P>[] {
  const out: RankedCandidate<P>[] = [];
  for (const c of candidates) {
    if (hardFilter(viewer, c, now)) continue;
    const compat = compatibility(viewer, c);
    out.push({ profile: c, compatibility: compat, rank: rankScore(viewer, c, compat, now) });
  }
  return out.sort((x, y) => y.rank - x.rank);
}
