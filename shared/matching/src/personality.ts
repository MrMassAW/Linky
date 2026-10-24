import type { Personality, PersonalityScores } from './types.ts';

export const TYPES = [
  'INTJ', 'INTP', 'ENTJ', 'ENTP',
  'INFJ', 'INFP', 'ENFJ', 'ENFP',
  'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ',
  'ISTP', 'ISFP', 'ESTP', 'ESFP',
] as const;
export type PersonalityType = (typeof TYPES)[number];

export function isPersonalityType(s: string): s is PersonalityType {
  return (TYPES as readonly string[]).includes(s.toUpperCase());
}

/**
 * "Ideal" pairings, seeded from the pairing charts commonly shared online
 * (complementary E/I and judging style with a shared S/N lens).
 * These are a starting point for a dating app, not a scientific claim.
 */
const IDEAL_PAIRS: Array<[PersonalityType, PersonalityType]> = [
  ['INFP', 'ENFJ'], ['INFP', 'ENTJ'],
  ['ENFP', 'INFJ'], ['ENFP', 'INTJ'],
  ['INFJ', 'ENTP'], ['INTJ', 'ENTP'],
  ['ENFJ', 'ISFP'], ['ENTJ', 'INTP'],
  ['INTP', 'ESTJ'], ['ISFP', 'ESFJ'],
  ['ISFP', 'ESTJ'], ['ESFP', 'ISFJ'],
  ['ESFP', 'ISTJ'], ['ISTP', 'ESFJ'],
  ['ISTP', 'ESTJ'], ['ESTP', 'ISFJ'],
  ['ESTP', 'ISTJ'],
];

function temperament(t: string): 'NF' | 'NT' | 'SJ' | 'SP' {
  if (t[1] === 'N') return t[2] === 'F' ? 'NF' : 'NT';
  return t[3] === 'J' ? 'SJ' : 'SP';
}

/** Rule-based base score for pairs that are not listed as ideal. */
function ruleScore(a: string, b: string): number {
  let s = 50;
  if (a[1] === b[1]) s += 18; // shared way of taking in the world (S/N) matters most
  else s -= 8;
  if (temperament(a) === temperament(b)) s += 8;
  if (a[0] !== b[0]) s += 5; // introvert/extravert balance is mildly positive
  if (a[2] !== b[2]) s += 2; // thinking/feeling complement, roughly neutral
  if (a[3] === b[3]) s += 4; // similar planning style eases day-to-day life
  if (a === b) s -= 4; // identical types can lack friction *and* spark
  return Math.max(20, Math.min(85, s));
}

function buildTable(): Record<PersonalityType, Record<PersonalityType, number>> {
  const table = {} as Record<PersonalityType, Record<PersonalityType, number>>;
  for (const a of TYPES) {
    table[a] = {} as Record<PersonalityType, number>;
    for (const b of TYPES) table[a][b] = ruleScore(a, b);
  }
  for (const [a, b] of IDEAL_PAIRS) {
    table[a][b] = 95;
    table[b][a] = 95;
  }
  return table;
}

/** Symmetric 16x16 compatibility table, values 0–100. */
export const COMPATIBILITY_TABLE = buildTable();

export function typeFromScores(s: PersonalityScores): PersonalityType {
  return ((s.e_i >= 50 ? 'E' : 'I') +
    (s.s_n >= 50 ? 'S' : 'N') +
    (s.t_f >= 50 ? 'T' : 'F') +
    (s.j_p >= 50 ? 'J' : 'P')) as PersonalityType;
}

/** Scores implied by a self-reported type (moderate preference on each axis). */
export function scoresFromType(type: PersonalityType): PersonalityScores {
  const pick = (letter: string, first: string) => (letter === first ? 70 : 30);
  return {
    e_i: pick(type[0], 'E'),
    s_n: pick(type[1], 'S'),
    t_f: pick(type[2], 'T'),
    j_p: pick(type[3], 'J'),
  };
}

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

/**
 * Personality score 0–100: table base, nudged by how close the raw dimension
 * percentages are. Similar on S/N and J/P adds up to +5 each; complementary on
 * E/I and T/F adds up to +3 each (neutral to slightly positive).
 */
export function personalityScore(a: Personality, b: Personality): number {
  const ta = a.type.toUpperCase() as PersonalityType;
  const tb = b.type.toUpperCase() as PersonalityType;
  const base = COMPATIBILITY_TABLE[ta]?.[tb] ?? 50;
  const closeness = (x: number, y: number) => 1 - Math.abs(x - y) / 100; // 0..1
  let adj = 0;
  adj += (closeness(a.s_n, b.s_n) - 0.5) * 10;
  adj += (closeness(a.j_p, b.j_p) - 0.5) * 10;
  adj += (1 - closeness(a.e_i, b.e_i)) * 3;
  adj += (1 - closeness(a.t_f, b.t_f)) * 3;
  return Math.round(clamp(base + adj));
}
