import {
  LOVE_LANGUAGES,
  toShares,
  typeFromScores,
  type LoveLanguage,
  type LoveVector,
  type PersonalityScores,
} from '@linky/matching';
import { PERSONALITY_QUESTIONS, type ForcedChoice } from '@linky/content';

export { PERSONALITY_QUESTIONS, RECEIVE_QUESTIONS, GIVE_QUESTIONS } from '@linky/content';

const FIRST = { EI: 'E', SN: 'S', TF: 'T', JP: 'J' } as const;
const KEY = { EI: 'e_i', SN: 's_n', TF: 't_f', JP: 'j_p' } as const;

/**
 * answers: question id → 1..5 (strongly disagree … strongly agree).
 * Each dimension: sum of centred answers (±2 each, 5 questions) → 0..100 toward the
 * first letter (E, S, T, J). Unanswered questions count as neutral.
 */
export function scorePersonality(answers: Record<string, number>): PersonalityScores & { type: string } {
  const sums = { EI: 0, SN: 0, TF: 0, JP: 0 };
  const counts = { EI: 0, SN: 0, TF: 0, JP: 0 };
  for (const q of PERSONALITY_QUESTIONS) {
    counts[q.dim]++;
    const a = answers[q.id];
    if (!a) continue;
    const centred = a - 3;
    sums[q.dim] += q.pole === FIRST[q.dim] ? centred : -centred;
  }
  const scores = {} as PersonalityScores;
  for (const dim of Object.keys(sums) as (keyof typeof sums)[]) {
    const max = counts[dim] * 2;
    scores[KEY[dim]] = Math.round(50 + (sums[dim] / max) * 50);
  }
  return { ...scores, type: typeFromScores(scores) };
}

/** picks: question id → chosen language. Returns 0–100 shares in LOVE_LANGUAGES order. */
export function scoreLoveLanguage(questions: ForcedChoice[], picks: Record<string, LoveLanguage>): LoveVector {
  const counts = [0, 0, 0, 0, 0];
  for (const q of questions) {
    const p = picks[q.id];
    if (p) counts[LOVE_LANGUAGES.indexOf(p)]++;
  }
  return toShares(counts);
}

export function topLanguages(v: readonly number[], n = 2): LoveLanguage[] {
  return LOVE_LANGUAGES.map((l, i) => [l, v[i]] as const)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([l]) => l);
}

/**
 * Shares for someone who picks their love languages instead of taking the quiz:
 * the main one gets 40%, an optional second 25%, the rest split what's left.
 */
export function vectorFromPicks(main: LoveLanguage, second?: LoveLanguage | null): LoveVector {
  const rest = LOVE_LANGUAGES.filter((l) => l !== main && l !== second);
  const left = second ? 35 : 60;
  const v = LOVE_LANGUAGES.map((l) => {
    if (l === main) return 40;
    if (l === second) return 25;
    const i = rest.indexOf(l);
    return Math.floor(left / rest.length) + (i < left % rest.length ? 1 : 0);
  });
  return v as LoveVector;
}
