import { describe, expect, it } from 'vitest';
import { PERSONALITY_QUESTIONS, RECEIVE_QUESTIONS, scoreLoveLanguage, scorePersonality, topLanguages, vectorFromPicks } from './scoring';
import { fitWithin } from '../lib/image';
import { pickChallenges, signatureSimilarity, stepChallenge, type FrameSignals } from '../lib/liveness';
import { scoreFromPredictions } from '../lib/nsfw';

describe('personality scoring', () => {
  it('all neutral is 50/50 and resolves to the first letters', () => {
    const r = scorePersonality({});
    expect([r.e_i, r.s_n, r.t_f, r.j_p]).toEqual([50, 50, 50, 50]);
    expect(r.type).toBe('ESTJ');
  });

  it('strongly agreeing with every I/N/F/P statement yields INFP at the extremes', () => {
    const answers: Record<string, number> = {};
    for (const q of PERSONALITY_QUESTIONS) answers[q.id] = 'INFP'.includes(q.pole) ? 5 : 1;
    const r = scorePersonality(answers);
    expect(r.type).toBe('INFP');
    expect([r.e_i, r.s_n, r.t_f, r.j_p]).toEqual([0, 0, 0, 0]);
  });
});

describe('love language scoring', () => {
  it('counts picks into shares', () => {
    const picks = Object.fromEntries(RECEIVE_QUESTIONS.map((q) => [q.id, q.a.lang]));
    const v = scoreLoveLanguage(RECEIVE_QUESTIONS, picks);
    expect(v.reduce((s, n) => s + n, 0)).toBe(100);
    expect(topLanguages(v, 1)[0]).toBe('words');
  });
});

describe('image sizing', () => {
  it('fits the long edge to 1080 and never upscales', () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: 1080, height: 810 });
    expect(fitWithin(3000, 4000)).toEqual({ width: 810, height: 1080 });
    expect(fitWithin(640, 480)).toEqual({ width: 640, height: 480 });
  });
});

describe('liveness', () => {
  const frame = (o: Partial<FrameSignals>): FrameSignals => ({ faces: 1, blink: 0, smile: 0, yaw: 0.5, landmarks: null, ...o });

  it('picks a blink and at least one head turn', () => {
    for (let i = 0; i < 20; i++) {
      const c = pickChallenges();
      expect(c).toHaveLength(3);
      expect(c).toContain('blink');
      expect(c.some((x) => x.startsWith('turn'))).toBe(true);
      expect(new Set(c).size).toBe(3);
    }
  });

  it('blink requires open then closed eyes', () => {
    const st = { armed: false };
    expect(stepChallenge('blink', frame({ blink: 0.8 }), st)).toBe(false); // already closed: not armed
    expect(stepChallenge('blink', frame({ blink: 0.1 }), st)).toBe(false);
    expect(stepChallenge('blink', frame({ blink: 0.8 }), st)).toBe(true);
  });

  it('head turns are directional and need a neutral start', () => {
    const st = { armed: false };
    expect(stepChallenge('turn-left', frame({ yaw: 0.8 }), st)).toBe(false);
    expect(stepChallenge('turn-left', frame({ yaw: 0.5 }), st)).toBe(false);
    expect(stepChallenge('turn-left', frame({ yaw: 0.25 }), st)).toBe(false); // wrong way
    expect(stepChallenge('turn-left', frame({ yaw: 0.78 }), st)).toBe(true);
  });

  it('rejects frames with zero or multiple faces', () => {
    expect(stepChallenge('smile', frame({ faces: 2, smile: 0.9 }), { armed: true })).toBe(false);
  });

  it('signature similarity is 1 for identical and lower for different', () => {
    expect(signatureSimilarity([1, 2, 3], [1, 2, 3])).toBe(1);
    expect(signatureSimilarity([1, 2, 3], [1.5, 1, 4])).toBeLessThan(0.5);
  });
});

describe('nsfw score', () => {
  it('weights explicit classes fully and suggestive by half', () => {
    expect(scoreFromPredictions([{ className: 'Neutral', probability: 0.9 }, { className: 'Sexy', probability: 0.1 }])).toBeCloseTo(0.05);
    expect(scoreFromPredictions([{ className: 'Porn', probability: 0.8 }])).toBeCloseTo(0.8);
  });
});

describe('picked love languages', () => {
  it('weights the main and second picks and sums to 100', () => {
    const v = vectorFromPicks('touch', 'time');
    expect(v.reduce((a, b) => a + b, 0)).toBe(100);
    expect(topLanguages(v)).toEqual(['touch', 'time']);
    const solo = vectorFromPicks('gifts');
    expect(solo).toEqual([15, 15, 40, 15, 15]);
  });
});
