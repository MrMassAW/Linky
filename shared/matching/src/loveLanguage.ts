import type { LoveLanguageProfile, LoveVector } from './types.ts';

export function cosine(a: readonly number[], b: readonly number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / Math.sqrt(na * nb);
}

export function topIndex(v: readonly number[]): number {
  let best = 0;
  for (let i = 1; i < v.length; i++) if (v[i] > v[best]) best = i;
  return best;
}

/**
 * Share vectors are all non-negative, so raw cosine rarely drops below ~0.5.
 * We stretch [COSINE_FLOOR, 1] onto [0, 100] so the score actually discriminates.
 */
export const COSINE_FLOOR = 0.5;

/**
 * How well A's giving matches B's receiving and vice versa (averaged), scaled
 * 0–100, plus a bonus when top languages line up.
 */
export function loveLanguageScore(a: LoveLanguageProfile, b: LoveLanguageProfile): number {
  const ab = cosine(a.give, b.receive);
  const ba = cosine(b.give, a.receive);
  const avg = (ab + ba) / 2;
  let score = Math.max(0, (avg - COSINE_FLOOR) / (1 - COSINE_FLOOR)) * 100;
  if (topIndex(a.give) === topIndex(b.receive)) score += 4;
  if (topIndex(b.give) === topIndex(a.receive)) score += 4;
  if (topIndex(a.receive) === topIndex(b.receive)) score += 4;
  return Math.round(Math.min(100, score));
}

/** Convert raw pick counts into percentage shares summing to 100. */
export function toShares(counts: readonly number[]): LoveVector {
  const total = counts.reduce((s, n) => s + n, 0);
  if (total === 0) return [20, 20, 20, 20, 20];
  const raw = counts.map((n) => (n / total) * 100);
  const rounded = raw.map(Math.round);
  // keep the sum at exactly 100 by nudging the largest share
  const diff = 100 - rounded.reduce((s, n) => s + n, 0);
  rounded[topIndex(raw)] += diff;
  return rounded as LoveVector;
}
