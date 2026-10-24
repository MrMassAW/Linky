// Canonical option values for lifestyle attributes. Labels live in @linky/content.

export const GOALS = ['long-term', 'short-term', 'figuring-it-out', 'friends', 'open-enm'] as const;
export const DRINKING = ['never', 'rarely', 'sometimes', 'often'] as const;
export const CANNABIS = ['never', 'sometimes', 'often'] as const;
export const SMOKING = ['never', 'sometimes', 'often'] as const;
export const PETS = ['have-dog', 'have-cat', 'have-other', 'like-pets', 'allergic', 'no-pets'] as const;
export const KIDS_HAVE = ['have-kids', 'no-kids'] as const;
export const KIDS_WANT = ['want-kids', 'dont-want-kids', 'open'] as const;

export const ORDINAL: Record<string, readonly string[]> = {
  drinking: DRINKING,
  cannabis: CANNABIS,
  smoking: SMOKING,
};

/** Pairwise similarity 0..1 for categorical fields (symmetric; missing = 0.5). */
export const GOAL_SIMILARITY: Record<string, Record<string, number>> = {
  'long-term': { 'long-term': 1, 'short-term': 0.1, 'figuring-it-out': 0.6, friends: 0.3, 'open-enm': 0.2 },
  'short-term': { 'short-term': 1, 'figuring-it-out': 0.6, friends: 0.3, 'open-enm': 0.6 },
  'figuring-it-out': { 'figuring-it-out': 1, friends: 0.5, 'open-enm': 0.4 },
  friends: { friends: 1, 'open-enm': 0.3 },
  'open-enm': { 'open-enm': 1 },
};

export const KIDS_WANT_SIMILARITY: Record<string, Record<string, number>> = {
  'want-kids': { 'want-kids': 1, 'dont-want-kids': 0, open: 0.6 },
  'dont-want-kids': { 'dont-want-kids': 1, open: 0.6 },
  open: { open: 1 },
};

const PET_OWNER = new Set(['have-dog', 'have-cat', 'have-other']);
export function petSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const owner = (x: string) => PET_OWNER.has(x);
  const pair = (x: string, y: string) => (a === x && b === y) || (a === y && b === x);
  if (owner(a) && owner(b)) return 0.8;
  if ((owner(a) && b === 'like-pets') || (owner(b) && a === 'like-pets')) return 0.9;
  if ((owner(a) || a === 'like-pets') && (b === 'allergic' || b === 'no-pets')) return 0.1;
  if ((owner(b) || b === 'like-pets') && (a === 'allergic' || a === 'no-pets')) return 0.1;
  if (pair('allergic', 'no-pets')) return 0.9;
  return 0.5;
}

export function lookupSymmetric(
  table: Record<string, Record<string, number>>,
  a: string,
  b: string,
): number {
  return table[a]?.[b] ?? table[b]?.[a] ?? 0.5;
}
