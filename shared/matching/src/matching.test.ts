import { describe, expect, it } from 'vitest';
import {
  COMPATIBILITY_TABLE,
  TYPES,
  buildFeed,
  compatibility,
  distanceLabel,
  hardFilter,
  lifestyleScore,
  loveLanguageScore,
  personalityScore,
  scoresFromType,
  toShares,
  typeFromScores,
  type MatchableProfile,
} from './index.ts';

const now = new Date('2026-10-23T12:00:00Z');

function profile(over: Partial<MatchableProfile> = {}): MatchableProfile {
  return {
    id: 'a',
    birthdate: '1995-05-05',
    gender: 'woman',
    location: { lat: 45.5, lng: -73.57 },
    verified: true,
    personality: { type: 'INFP', ...scoresFromType('INFP'), visible: true },
    love_language: { receive: [40, 20, 10, 10, 20], give: [30, 30, 10, 10, 20], visible: true },
    attributes: {},
    preferences: { age_min: 25, age_max: 40, distance_km: 50, genders_wanted: ['men'] },
    kinks: null,
    ...over,
  };
}

describe('personality', () => {
  it('table is 16x16, symmetric and bounded', () => {
    for (const a of TYPES) {
      for (const b of TYPES) {
        const v = COMPATIBILITY_TABLE[a][b];
        expect(v).toBe(COMPATIBILITY_TABLE[b][a]);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });

  it('scores known ideal pairs high', () => {
    expect(COMPATIBILITY_TABLE.INFP.ENFJ).toBeGreaterThanOrEqual(90);
    expect(COMPATIBILITY_TABLE.ENFP.INTJ).toBeGreaterThanOrEqual(90);
    expect(COMPATIBILITY_TABLE.INFP.ESTJ).toBeLessThan(COMPATIBILITY_TABLE.INFP.ENFJ);
  });

  it('derives a type from percentages', () => {
    expect(typeFromScores({ e_i: 30, s_n: 20, t_f: 40, j_p: 45 })).toBe('INFP');
    expect(typeFromScores({ e_i: 80, s_n: 60, t_f: 70, j_p: 90 })).toBe('ESTJ');
  });

  it('closer S/N and J/P scores raise the score', () => {
    const a = { type: 'INFP', e_i: 30, s_n: 20, t_f: 30, j_p: 30, visible: true };
    const close = { type: 'ENFJ', e_i: 70, s_n: 22, t_f: 35, j_p: 55, visible: true };
    const far = { type: 'ENFJ', e_i: 70, s_n: 48, t_f: 35, j_p: 90, visible: true };
    expect(personalityScore(a, close)).toBeGreaterThan(personalityScore(a, far));
  });
});

describe('love language', () => {
  it('shares sum to 100', () => {
    expect(toShares([6, 3, 2, 3, 1]).reduce((s, n) => s + n, 0)).toBe(100);
    expect(toShares([0, 0, 0, 0, 0])).toEqual([20, 20, 20, 20, 20]);
  });

  it('matching giver/receiver beats a mismatch', () => {
    const wordsLover = { receive: [60, 10, 10, 10, 10], give: [60, 10, 10, 10, 10], visible: true } as const;
    const touchLover = { receive: [5, 5, 5, 5, 80], give: [5, 5, 5, 5, 80], visible: true } as const;
    const same = loveLanguageScore(
      { ...wordsLover, receive: [...wordsLover.receive], give: [...wordsLover.give] } as never,
      { ...wordsLover, receive: [...wordsLover.receive], give: [...wordsLover.give] } as never,
    );
    const diff = loveLanguageScore(wordsLover as never, touchLover as never);
    expect(same).toBe(100);
    expect(diff).toBeLessThan(30);
  });
});

describe('lifestyle', () => {
  it('rates similar habits higher', () => {
    const s = (v: string) => ({ value: v, visible: true, is_dealbreaker: false });
    const a = { drinking: s('never'), kids_want: s('want-kids'), goal: s('long-term') };
    const b = { drinking: s('rarely'), kids_want: s('want-kids'), goal: s('long-term') };
    const c = { drinking: s('often'), kids_want: s('dont-want-kids'), goal: s('short-term') };
    expect(lifestyleScore(a, b)!).toBeGreaterThan(lifestyleScore(a, c)!);
    expect(lifestyleScore({}, {})).toBeNull();
  });

  it('scores multi-select goals by their best-aligned pair', () => {
    const g = (v: string | string[]) => ({ goal: { value: v, visible: true, is_dealbreaker: false } });
    expect(lifestyleScore(g(['short-term', 'long-term']), g('long-term'))).toBe(100);
    expect(lifestyleScore(g(['short-term', 'friends']), g('long-term'))).toBe(30);
  });
});

describe('hard filters', () => {
  const man = profile({ id: 'b', gender: 'man', birthdate: '1993-01-01', preferences: { age_min: 25, age_max: 40, distance_km: 100, genders_wanted: ['women'] } });

  it('passes a mutual match', () => {
    expect(hardFilter(profile(), man, now)).toBeNull();
  });

  it('enforces mutual gender preference', () => {
    const notInto = { ...man, preferences: { ...man.preferences, genders_wanted: ['men' as const] } };
    expect(hardFilter(profile(), notInto, now)).toBe('gender');
  });

  it('enforces both age ranges', () => {
    const young = { ...man, birthdate: '2005-01-01' };
    expect(hardFilter(profile(), young, now)).toBe('age');
  });

  it('enforces the smaller distance', () => {
    const far = { ...man, location: { lat: 46.8, lng: -71.2 } }; // Quebec City ~230 km
    expect(hardFilter(profile(), far, now)).toBe('distance');
    expect(hardFilter(profile({ preferences: { ...profile().preferences, distance_km: null } }), { ...far, preferences: { ...far.preferences, distance_km: null } }, now)).toBeNull();
  });

  it('applies dealbreakers in both directions, failing unanswered fields', () => {
    const viewer = profile({ attributes: { smoking: { value: 'never', visible: true, is_dealbreaker: true } } });
    expect(hardFilter(viewer, man, now)).toBe('dealbreaker:smoking');
    const smoker = { ...man, attributes: { smoking: { value: 'often', visible: true, is_dealbreaker: false } } };
    expect(hardFilter(viewer, smoker, now)).toBe('dealbreaker:smoking');
    const nonSmoker = { ...man, attributes: { smoking: { value: 'never', visible: true, is_dealbreaker: false } } };
    expect(hardFilter(viewer, nonSmoker, now)).toBeNull();
  });

  it('kink filtering only sees people who opted in and share pre-match', () => {
    const viewer = profile({ kinks: { opted_in: true, tags: ['rope'], visibility_level: 'opted_in', filter_shared: true } });
    expect(hardFilter(viewer, man, now)).toBe('kinks');
    const hiddenMatch = { ...man, kinks: { opted_in: true, tags: ['rope'], visibility_level: 'hidden' as const } };
    expect(hardFilter(viewer, hiddenMatch, now)).toBe('kinks');
    const shared = { ...man, kinks: { opted_in: true, tags: ['rope'], visibility_level: 'opted_in' as const } };
    expect(hardFilter(viewer, shared, now)).toBeNull();
  });
});

describe('compatibility + feed', () => {
  it('produces a 0–100 total with breakdown', () => {
    const c = compatibility(profile(), profile({ id: 'b', personality: { type: 'ENFJ', ...scoresFromType('ENFJ'), visible: true } }));
    expect(c.total).toBeGreaterThanOrEqual(0);
    expect(c.total).toBeLessThanOrEqual(100);
    expect(c.personality).not.toBeNull();
    expect(c.lifestyle).toBeNull();
  });

  it('orders the feed and excludes filtered people', () => {
    const viewer = profile({ preferences: { age_min: 18, age_max: 99, distance_km: null, genders_wanted: ['men'] } });
    const base = { gender: 'man' as const, preferences: { age_min: 18, age_max: 99, distance_km: null, genders_wanted: ['women' as const] } };
    const good = profile({ id: 'good', ...base, personality: { type: 'ENFJ', ...scoresFromType('ENFJ'), visible: true } });
    const meh = profile({ id: 'meh', ...base, personality: { type: 'ESTJ', ...scoresFromType('ESTJ'), visible: true }, verified: false });
    const woman = profile({ id: 'w' });
    const feed = buildFeed(viewer, [meh, woman, good], now);
    expect(feed.map((f) => f.profile.id)).toEqual(['good', 'meh']);
  });

  it('rounds distances for privacy', () => {
    expect(distanceLabel(0.4)).toBe('less than 2 km away');
    expect(distanceLabel(4.6)).toBe('about 5 km away');
    expect(distanceLabel(23)).toBe('about 25 km away');
  });
});
