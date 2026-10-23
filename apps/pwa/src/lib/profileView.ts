// Pure helpers shared by the mock backend (and unit tests) to mirror what the
// SQL functions do: build the matcher input and the privacy-safe public view.
import { ageFrom, distanceKm, distanceLabel, type MatchableProfile } from '@linky/matching';
import type { MyProfile, PublicProfile } from './types';

export function toMatchable(p: MyProfile): MatchableProfile {
  return {
    id: p.id,
    birthdate: p.birthdate,
    gender: p.gender,
    location: p.location,
    verified: p.verified,
    paused: p.paused,
    last_active_at: p.last_active_at,
    personality: p.personality,
    love_language: p.love_language,
    attributes: p.attributes,
    preferences: p.preferences,
    kinks: p.kinks,
  };
}

export function publicView(
  viewer: MyProfile | null,
  p: MyProfile,
  opts: { isMatch: boolean; now?: Date },
): PublicProfile {
  const k = p.kinks;
  let showKinks = false;
  if (k?.opted_in) {
    showKinks =
      k.visibility_level === 'public' ||
      (k.visibility_level === 'opted_in' && Boolean(viewer?.kinks?.opted_in)) ||
      (k.visibility_level === 'matches' && opts.isMatch);
  }
  const attributes: Record<string, unknown> = {};
  for (const [key, s] of Object.entries(p.attributes)) {
    if (s && s.visible && s.value !== null && !(Array.isArray(s.value) && s.value.length === 0)) {
      attributes[key] = s.value;
    }
  }
  return {
    id: p.id,
    name: p.name,
    last_name: opts.isMatch && p.show_last_name ? (p.last_name ?? null) : null,
    age: ageFrom(p.birthdate, opts.now),
    gender: p.show_gender ? (p.gender_custom ?? p.gender) : null,
    pronouns: p.show_pronouns ? p.pronouns : null,
    orientation: p.show_orientation ? p.orientation : null,
    city: p.city,
    height_cm: p.height_cm,
    verified: p.verified,
    distance:
      viewer?.location && p.location ? distanceLabel(distanceKm(viewer.location, p.location)) : null,
    is_match: opts.isMatch,
    photos: p.photos
      .filter((x) => !x.removed_by_admin)
      .sort((a, b) => a.position - b.position)
      .map(({ id, url, position }) => ({ id, url, position })),
    prompts: [...p.prompts].sort((a, b) => a.position - b.position),
    personality: p.personality?.visible
      ? {
          type: p.personality.type,
          e_i: p.personality.e_i,
          s_n: p.personality.s_n,
          t_f: p.personality.t_f,
          j_p: p.personality.j_p,
        }
      : null,
    love_language: p.love_language?.visible
      ? { receive: [...p.love_language.receive], give: [...p.love_language.give] }
      : null,
    attributes,
    kinks: showKinks ? [...k.tags] : null,
  };
}
