import { LOVE_LANGUAGE_LABELS, OPTION_LABELS } from '@linky/content';
import { LOVE_LANGUAGES, type Attributes } from '@linky/matching';
import type { MyProfile, PublicProfile } from './types';

/** Something important two people have in common, used to draw the Discover constellation. */
export interface SharedThing {
  key: string;
  label: string;
  /** Higher = matters more (kids and goals beat a shared hobby). */
  weight: number;
}

const GOAL_SHORT: Record<string, string> = {
  'long-term': 'Long-term',
  'short-term': 'Short-term fun',
  'figuring-it-out': 'Figuring it out',
  friends: 'New friends',
  'open-enm': 'Open / ENM',
};
// Languages most people here share; not worth a star.
const COMMON_LANGUAGES = new Set(['English', 'French']);
const PET_OWNER = new Set(['have-dog', 'have-cat', 'have-other']);

const asList = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : typeof v === 'string' ? [v] : []);
const mine = (a: Attributes, k: string) => asList(a[k as keyof Attributes]?.value);

function topLanguage(v: number[] | undefined): string | null {
  if (!v || v.length !== LOVE_LANGUAGES.length) return null;
  const max = Math.max(...v);
  return max > 0 ? LOVE_LANGUAGES[v.indexOf(max)] : null;
}

/**
 * What I share with someone, most important first. Only uses what they chose to show
 * (PublicProfile already drops hidden answers).
 */
export function sharedThings(me: MyProfile, p: PublicProfile): SharedThing[] {
  const out: SharedThing[] = [];
  const theirs = (k: string) => asList(p.attributes[k]);
  const both = (k: string, v: string) => mine(me.attributes, k).includes(v) && theirs(k).includes(v);

  if (both('kids_want', 'want-kids')) out.push({ key: 'kids:want', label: 'Want kids', weight: 10 });
  if (both('kids_want', 'dont-want-kids')) out.push({ key: 'kids:no', label: 'No kids planned', weight: 10 });
  for (const g of mine(me.attributes, 'goal').filter((g) => theirs('goal').includes(g))) {
    out.push({ key: `goal:${g}`, label: GOAL_SHORT[g] ?? g, weight: 9 });
  }
  for (const r of mine(me.attributes, 'religion').filter((r) => theirs('religion').includes(r))) {
    out.push({ key: `faith:${r}`, label: OPTION_LABELS.religion?.[r] ?? r, weight: 8 });
  }
  if (both('smoking', 'never')) out.push({ key: 'smoke-free', label: 'Smoke-free', weight: 7 });
  if (both('drinking', 'never')) out.push({ key: 'sober', label: 'Sober', weight: 6 });

  const myLove = topLanguage(me.love_language?.receive);
  if (myLove && myLove === topLanguage(p.love_language?.receive)) {
    out.push({ key: `love:${myLove}`, label: LOVE_LANGUAGE_LABELS[myLove as keyof typeof LOVE_LANGUAGE_LABELS], weight: 6 });
  }
  if (both('pets', 'have-dog')) out.push({ key: 'pets:dog', label: 'Dog people', weight: 5 });
  else if (both('pets', 'have-cat')) out.push({ key: 'pets:cat', label: 'Cat people', weight: 5 });
  else {
    const fond = (l: string[]) => l.some((x) => PET_OWNER.has(x) || x === 'like-pets') && !l.includes('allergic');
    if (fond(mine(me.attributes, 'pets')) && fond(theirs('pets'))) out.push({ key: 'pets:love', label: 'Pet lovers', weight: 4 });
  }
  for (const v of mine(me.attributes, 'politics').filter((v) => theirs('politics').includes(v))) {
    out.push({ key: `politics:${v}`, label: OPTION_LABELS.politics?.[v] ?? v, weight: 5 });
  }
  if (me.personality && p.personality && me.personality.type === p.personality.type) {
    out.push({ key: `type:${me.personality.type}`, label: `Both ${me.personality.type}`, weight: 4 });
  }
  for (const i of mine(me.attributes, 'interests').filter((i) => theirs('interests').includes(i)).slice(0, 3)) {
    out.push({ key: `interest:${i}`, label: i, weight: 3 });
  }
  for (const l of mine(me.attributes, 'languages').filter((l) => !COMMON_LANGUAGES.has(l) && theirs('languages').includes(l))) {
    out.push({ key: `lang:${l}`, label: `Speak ${l}`, weight: 2 });
  }
  return out.sort((a, b) => b.weight - a.weight);
}

/**
 * The stars of the constellation: the shared things that matter most across everyone in view.
 * Score = how many people share it × how much it matters.
 */
export function pickHubs(all: SharedThing[][], max = 6): SharedThing[] {
  const tally = new Map<string, { thing: SharedThing; count: number }>();
  for (const list of all) {
    for (const t of list) {
      const e = tally.get(t.key) ?? { thing: t, count: 0 };
      e.count += 1;
      tally.set(t.key, e);
    }
  }
  return [...tally.values()]
    .filter((e) => e.count >= 2)
    .sort((a, b) => b.count * b.thing.weight - a.count * a.thing.weight)
    .slice(0, max)
    .map((e) => e.thing);
}
