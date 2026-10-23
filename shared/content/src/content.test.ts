import { describe, expect, it } from 'vitest';
import { LOVE_LANGUAGES } from '../../matching/src/types.ts';
import {
  GIVE_QUESTIONS,
  PERSONALITY_QUESTIONS,
  PROMPTS,
  RECEIVE_QUESTIONS,
  generateDemoProfiles,
} from './index.ts';

describe('quiz content', () => {
  it('has 20 personality questions, 5 per dimension, balanced poles', () => {
    expect(PERSONALITY_QUESTIONS).toHaveLength(20);
    for (const dim of ['EI', 'SN', 'TF', 'JP']) {
      const qs = PERSONALITY_QUESTIONS.filter((q) => q.dim === dim);
      expect(qs).toHaveLength(5);
      const poles = new Set(qs.map((q) => q.pole));
      expect(poles.size).toBe(2); // both directions asked, reduces agreement bias
    }
  });

  it('has 15 receive and 10 give forced-choice pairs, balanced per language', () => {
    expect(RECEIVE_QUESTIONS).toHaveLength(15);
    expect(GIVE_QUESTIONS).toHaveLength(10);
    for (const lang of LOVE_LANGUAGES) {
      const r = RECEIVE_QUESTIONS.filter((q) => q.a.lang === lang || q.b.lang === lang).length;
      const g = GIVE_QUESTIONS.filter((q) => q.a.lang === lang || q.b.lang === lang).length;
      expect(r).toBe(6);
      expect(g).toBe(4);
    }
    for (const q of [...RECEIVE_QUESTIONS, ...GIVE_QUESTIONS]) expect(q.a.lang).not.toBe(q.b.lang);
  });

  it('has enough prompts', () => {
    expect(PROMPTS.length).toBeGreaterThanOrEqual(10);
  });
});

describe('demo profiles', () => {
  const people = generateDemoProfiles();
  it('generates 70 deterministic, adult profiles', () => {
    expect(people).toHaveLength(70);
    expect(generateDemoProfiles()[7]).toEqual(people[7]);
    for (const p of people) {
      expect(2026 - Number(p.birthdate.slice(0, 4))).toBeGreaterThanOrEqual(19);
      expect(p.prompts).toHaveLength(3);
      expect(p.scenes.length).toBeGreaterThanOrEqual(2);
      expect(new Set(p.prompts.map((x) => x.prompt)).size).toBe(3);
    }
    expect(new Set(people.map((p) => p.id)).size).toBe(70);
  });
});
