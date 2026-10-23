// Shared domain types used by scoring, the PWA and the Supabase edge functions.
// Keep this file free of runtime imports so it can be copied into Deno functions.

export const DIMENSIONS = ['EI', 'SN', 'TF', 'JP'] as const;
export type Dimension = (typeof DIMENSIONS)[number];

/** Percent toward the FIRST letter of each dimension (E, S, T, J), 0–100. */
export interface PersonalityScores {
  e_i: number;
  s_n: number;
  t_f: number;
  j_p: number;
}

export interface Personality extends PersonalityScores {
  type: string; // e.g. "INFP"
  visible: boolean;
  /** true when the user typed a known type instead of taking the quiz */
  self_reported?: boolean;
}

export const LOVE_LANGUAGES = ['words', 'time', 'gifts', 'service', 'touch'] as const;
export type LoveLanguage = (typeof LOVE_LANGUAGES)[number];

/** Share per language, in LOVE_LANGUAGES order, each 0–100, summing to ~100. */
export type LoveVector = [number, number, number, number, number];

export interface LoveLanguageProfile {
  receive: LoveVector;
  give: LoveVector;
  visible: boolean;
}

export type Gender =
  | 'man'
  | 'woman'
  | 'non-binary'
  | 'trans man'
  | 'trans woman'
  | 'genderfluid'
  | 'other';

/** Coarse bucket used for "who I want to see" matching. */
export type SeekingBucket = 'men' | 'women' | 'nonbinary';

export interface AttributeSetting<T = string | string[]> {
  value: T | null;
  visible: boolean;
  is_dealbreaker: boolean;
  /** For dealbreakers: acceptable values on the OTHER person. Empty = must equal mine. */
  accept?: string[];
}

export type AttributeKey =
  | 'goal'
  | 'drinking'
  | 'cannabis'
  | 'smoking'
  | 'pets'
  | 'kids_have'
  | 'kids_want'
  | 'religion'
  | 'politics'
  | 'languages'
  | 'interests'
  | 'height_cm';

export type Attributes = Partial<Record<AttributeKey, AttributeSetting>>;

export type KinkVisibility = 'hidden' | 'matches' | 'opted_in' | 'public';

export interface Kinks {
  opted_in: boolean;
  tags: string[];
  visibility_level: KinkVisibility;
  /** When true, only show me people who share at least one tag (requires opted_in). */
  filter_shared?: boolean;
}

export interface Preferences {
  age_min: number;
  age_max: number;
  /** null = anywhere */
  distance_km: number | null;
  genders_wanted: SeekingBucket[];
}

export interface GeoPoint {
  lat: number;
  lng: number;
}

/** The minimum a candidate needs for filtering + scoring. */
export interface MatchableProfile {
  id: string;
  birthdate: string; // ISO yyyy-mm-dd
  gender: Gender;
  location: GeoPoint | null;
  verified: boolean;
  paused?: boolean;
  last_active_at?: string;
  personality: Personality | null;
  love_language: LoveLanguageProfile | null;
  attributes: Attributes;
  preferences: Preferences;
  kinks: Kinks | null;
}

export interface CompatibilityBreakdown {
  total: number;
  personality: number | null;
  love_language: number | null;
  lifestyle: number | null;
  shared: number | null;
}
