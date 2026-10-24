import type {
  Attributes,
  CompatibilityBreakdown,
  Gender,
  GeoPoint,
  Kinks,
  LoveLanguageProfile,
  Personality,
  Preferences,
} from '@linky/matching';
import type { MessengerApp } from '@linky/content';

export interface Photo {
  id: string;
  url: string;
  position: number;
  nsfw_score: number | null;
  r2_key?: string;
  removed_by_admin?: boolean;
}

export interface PromptAnswer {
  id: string;
  prompt: string;
  answer: string;
  position: number;
}

export interface Handle {
  app: MessengerApp;
  handle: string;
  preferred: boolean;
}

export interface Verification {
  passed: boolean;
  challenges: string[];
  liveness_score: number | null;
  face_match_score: number | null;
  created_at: string;
}

/** Everything about the signed-in user (their own data, never shown to others as-is). */
export interface MyProfile {
  id: string;
  email: string | null;
  name: string;
  /** Optional; only shown to matches, and only if show_last_name. */
  last_name: string | null;
  show_last_name: boolean;
  birthdate: string;
  gender: Gender;
  gender_custom: string | null;
  pronouns: string | null;
  orientation: string | null;
  show_gender: boolean;
  show_pronouns: boolean;
  show_orientation: boolean;
  city: string | null;
  location: GeoPoint | null;
  height_cm: number | null;
  verified: boolean;
  paused: boolean;
  is_admin: boolean;
  onboarding_complete: boolean;
  onboarding_step: number;
  deletion_requested_at: string | null;
  last_active_at?: string;
  photos: Photo[];
  prompts: PromptAnswer[];
  personality: Personality | null;
  love_language: LoveLanguageProfile | null;
  attributes: Attributes;
  preferences: Preferences;
  kinks: Kinks;
  handles: Handle[];
  verification: Verification | null;
}

export type ProfileCore = Pick<
  MyProfile,
  | 'name'
  | 'last_name'
  | 'show_last_name'
  | 'birthdate'
  | 'gender'
  | 'gender_custom'
  | 'pronouns'
  | 'orientation'
  | 'show_gender'
  | 'show_pronouns'
  | 'show_orientation'
  | 'city'
  | 'location'
  | 'height_cm'
  | 'paused'
  | 'onboarding_complete'
  | 'onboarding_step'
>;

/** What other people see. Mirrors public_profile_json() in SQL. */
export interface PublicProfile {
  id: string;
  name: string;
  /** Only present for matches who chose to show it. */
  last_name: string | null;
  age: number;
  gender: string | null;
  pronouns: string | null;
  orientation: string | null;
  city: string | null;
  height_cm: number | null;
  verified: boolean;
  distance: string | null;
  is_match: boolean;
  photos: { id: string; url: string; position: number }[];
  prompts: { id: string; prompt: string; answer: string; position: number }[];
  personality: { type: string; e_i: number; s_n: number; t_f: number; j_p: number } | null;
  love_language: { receive: number[]; give: number[] } | null;
  attributes: Record<string, unknown>;
  kinks: string[] | null;
}

export interface FeedItem {
  profile: PublicProfile;
  compatibility: CompatibilityBreakdown;
  /** Set when you passed on this person less than a day ago: Discover shows them faded until it expires. */
  passed_at?: string | null;
}

export type LikeTargetType = 'photo' | 'prompt';

export interface LikeYou {
  like: { id: string; target_type: LikeTargetType; target_id: string; comment: string | null; created_at: string };
  target: { url?: string; prompt?: string; answer?: string } | null;
  profile: PublicProfile;
}

export interface Note {
  id: string;
  match_id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

export interface MatchSummary {
  match_id: string;
  created_at: string;
  compatibility: CompatibilityBreakdown | null;
  connect_me: boolean;
  connect_them: boolean;
  profile: PublicProfile;
  last_note: Pick<Note, 'body' | 'sender_id' | 'created_at'> | null;
}

export interface SharedHandle extends Handle {
  shared: boolean;
}

export type ReportStatus = 'open' | 'actioned' | 'dismissed';

export interface AdminReport {
  id: string;
  reason: string;
  details: string | null;
  status: ReportStatus;
  note_body: string | null;
  created_at: string;
  reporter: { id: string; name: string };
  target: {
    id: string;
    name: string;
    banned: boolean;
    flagged: boolean;
    verified: boolean;
    report_count: number;
    photos: { id: string; url: string; removed: boolean; nsfw_score: number | null }[];
    prompts: { prompt: string; answer: string }[];
  };
}

export interface LikeResult {
  matched: boolean;
  match_id: string | null;
  likes_remaining: number;
}

export interface VerificationResult {
  passed: boolean;
  challenges: string[];
  liveness_score: number | null;
  face_match_score: number | null;
}

export class LimitError extends Error {}
