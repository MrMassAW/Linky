// Deterministic generator for ~50 demo profiles. Used by the mock backend in the
// PWA and by scripts/gen-seed-sql.ts to produce supabase/seed.sql.
import {
  CANNABIS,
  DRINKING,
  GOALS,
  KIDS_HAVE,
  KIDS_WANT,
  PETS,
  SMOKING,
} from '../../matching/src/options.ts';
import { TYPES } from '../../matching/src/personality.ts';
import { toShares } from '../../matching/src/loveLanguage.ts';
import type {
  Attributes,
  Gender,
  KinkVisibility,
  LoveVector,
  SeekingBucket,
} from '../../matching/src/types.ts';
import { INTERESTS, KINK_TAGS } from './profile.ts';

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rng = () => number;
const pick = <T,>(r: Rng, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
const sample = <T,>(r: Rng, xs: readonly T[], n: number): T[] => {
  const copy = [...xs];
  const out: T[] = [];
  while (out.length < n && copy.length) out.push(copy.splice(Math.floor(r() * copy.length), 1)[0]);
  return out;
};

export interface DemoAvatar {
  skin: string;
  hair: string;
  hairStyle: 'short' | 'long' | 'bun' | 'curly' | 'buzz' | 'bob';
  bg: [string, string];
  glasses: boolean;
  beard: boolean;
}

export interface DemoProfile {
  id: string;
  name: string;
  birthdate: string;
  gender: Gender;
  pronouns: string;
  orientation: string;
  seeking: SeekingBucket[];
  /** Offset from the demo centre in km (east, north). */
  offset_km: { x: number; y: number };
  city: string;
  height_cm: number | null;
  verified: boolean;
  last_active_hours: number;
  avatar: DemoAvatar;
  /** Emoji scenes for photos 2..n */
  scenes: { emoji: string; caption: string }[];
  prompts: { prompt: string; answer: string }[];
  personality: { type: string; e_i: number; s_n: number; t_f: number; j_p: number };
  love_language: { receive: LoveVector; give: LoveVector };
  attributes: Attributes;
  age_min: number;
  age_max: number;
  distance_km: number | null;
  kinks: { opted_in: boolean; tags: string[]; visibility_level: KinkVisibility } | null;
  handles: { app: 'whatsapp' | 'telegram' | 'signal' | 'instagram'; handle: string; preferred: boolean }[];
  /** Mock-only bot behaviour */
  bot: { likes_back: boolean; likes_you: boolean; reply_style: number };
}

const PEOPLE: Array<[string, Gender, string, string, SeekingBucket[]]> = [
  // name, gender, pronouns, orientation, seeking
  ['Amélie', 'woman', 'she/her', 'straight', ['men']],
  ['Noah', 'man', 'he/him', 'straight', ['women']],
  ['Priya', 'woman', 'she/her', 'bisexual', ['men', 'women', 'nonbinary']],
  ['Kai', 'non-binary', 'they/them', 'queer', ['men', 'women', 'nonbinary']],
  ['Lucas', 'man', 'he/him', 'gay', ['men']],
  ['Sofia', 'woman', 'she/her', 'straight', ['men']],
  ['Malik', 'man', 'he/him', 'straight', ['women']],
  ['Jade', 'woman', 'she/they', 'pansexual', ['men', 'women', 'nonbinary']],
  ['Olivier', 'man', 'he/him', 'bisexual', ['men', 'women', 'nonbinary']],
  ['Maya', 'trans woman', 'she/her', 'straight', ['men']],
  ['Rowan', 'genderfluid', 'they/them', 'pansexual', ['men', 'women', 'nonbinary']],
  ['Chloé', 'woman', 'she/her', 'lesbian', ['women', 'nonbinary']],
  ['Ethan', 'man', 'he/him', 'straight', ['women']],
  ['Yasmine', 'woman', 'she/her', 'straight', ['men']],
  ['Théo', 'man', 'he/him', 'straight', ['women']],
  ['Ava', 'woman', 'she/her', 'bisexual', ['men', 'women']],
  ['Jonah', 'trans man', 'he/him', 'queer', ['men', 'women', 'nonbinary']],
  ['Léa', 'woman', 'she/her', 'straight', ['men']],
  ['Diego', 'man', 'he/him', 'straight', ['women']],
  ['Nina', 'woman', 'she/her', 'pansexual', ['men', 'women', 'nonbinary']],
  ['Sam', 'non-binary', 'they/them', 'bisexual', ['men', 'women', 'nonbinary']],
  ['Gabriel', 'man', 'he/him', 'gay', ['men', 'nonbinary']],
  ['Hana', 'woman', 'she/her', 'straight', ['men']],
  ['Marcus', 'man', 'he/him', 'bisexual', ['men', 'women', 'nonbinary']],
  ['Inès', 'woman', 'she/her', 'lesbian', ['women']],
  ['Félix', 'man', 'he/him', 'straight', ['women']],
  ['Zoé', 'woman', 'she/her', 'queer', ['men', 'women', 'nonbinary']],
  ['Arjun', 'man', 'he/him', 'straight', ['women']],
  ['Camille', 'non-binary', 'they/she', 'queer', ['women', 'nonbinary']],
  ['Isabella', 'woman', 'she/her', 'straight', ['men']],
  ['Omar', 'man', 'he/him', 'straight', ['women']],
  ['Elena', 'woman', 'she/her', 'bisexual', ['men', 'women', 'nonbinary']],
  ['River', 'genderfluid', 'any', 'pansexual', ['men', 'women', 'nonbinary']],
  ['Antoine', 'man', 'he/him', 'straight', ['women']],
  ['Mei', 'woman', 'she/her', 'straight', ['men']],
  ['Julien', 'man', 'he/him', 'pansexual', ['men', 'women', 'nonbinary']],
  ['Aisha', 'woman', 'she/her', 'straight', ['men']],
  ['Leo', 'trans man', 'he/they', 'straight', ['women']],
  ['Clara', 'woman', 'she/her', 'bisexual', ['men', 'women', 'nonbinary']],
  ['Mateo', 'man', 'he/him', 'gay', ['men']],
  ['Rosalie', 'woman', 'she/her', 'straight', ['men']],
  ['Ben', 'man', 'he/him', 'straight', ['women']],
  ['Alex', 'non-binary', 'they/them', 'pansexual', ['men', 'women', 'nonbinary']],
  ['Laila', 'woman', 'she/her', 'pansexual', ['men', 'women', 'nonbinary']],
  ['Samuel', 'man', 'he/him', 'bisexual', ['men', 'women', 'nonbinary']],
  ['Tessa', 'trans woman', 'she/her', 'lesbian', ['women', 'nonbinary']],
  ['Hugo', 'man', 'he/him', 'straight', ['women']],
  ['Naomi', 'woman', 'she/her', 'straight', ['men']],
  ['Ezra', 'non-binary', 'they/them', 'queer', ['men', 'women', 'nonbinary']],
  ['Victor', 'man', 'he/him', 'straight', ['women']],
];

const NEIGHBOURHOODS = [
  'Plateau', 'Mile End', 'Old Port', 'Verdun', 'Rosemont', 'Villeray', 'Griffintown',
  'Outremont', 'Saint-Henri', 'NDG', 'Hochelaga', 'Westmount', 'Laval', 'Longueuil',
];

const ANSWERS: Record<string, string[]> = {
  'A perfect Sunday looks like…': [
    'Farmers market, an ambitious brunch recipe, and a nap I will deny taking.',
    'Long run, longer breakfast, and a museum I have been meaning to visit for a year.',
    'Coffee on the balcony, a crossword in pen, and dinner with friends who stay too late.',
    'Thrifting in the morning, cooking something slow in the afternoon.',
  ],
  "I'm weirdly attracted to…": [
    'People who can explain their niche hobby for 20 minutes with total sincerity.',
    'Good handwriting. Unreasonably so.',
    'Anyone who returns their shopping cart.',
    'Competence. Watching someone parallel park perfectly does something to me.',
  ],
  "We'll get along if…": [
    'You think pineapple on pizza is fine and debating it is more fun than winning.',
    'You are up for spontaneous road trips with a carefully curated playlist.',
    'You laugh at your own jokes. I will too.',
    'You like dogs more than you like most people.',
  ],
  'My simple pleasures are…': [
    'Fresh sheets, the first sip of coffee, and a perfectly ripe avocado.',
    'Walking home after a concert with my ears still ringing.',
    'Reading on the metro and missing my stop because the chapter got good.',
  ],
  'The way to win me over is…': [
    'Remember the small things I mention. Bonus points for snacks.',
    'Bring me to your favourite hole-in-the-wall restaurant.',
    'Be curious. Ask me a second question.',
  ],
  'I geek out on…': [
    'Bouldering grades, coffee extraction ratios, and 90s sci-fi.',
    'Urban planning. Ask me about bike lanes at your own risk.',
    'Fermentation. My fridge is 40% jars.',
    'Board game rulebooks. I read them for fun.',
  ],
  'My most irrational fear is…': [
    'Geese. They know what they did.',
    'Leaving a voicemail.',
    'The deep end of a lake where you cannot see the bottom.',
  ],
  'Two truths and a lie…': [
    'I have met a famous chef, I can juggle, I have never seen Star Wars.',
    'I speak three languages, I was a child actor, I hate cilantro.',
    'I ran a marathon, I own 40 plants, I have never been on a plane.',
  ],
  'I go crazy for…': [
    'Dumplings in any form, from any country.',
    'Thunderstorms when I am already inside.',
    'Live jazz in tiny basements.',
  ],
  "I'll fall for you if…": [
    'You send me songs that remind you of me.',
    'You can make me laugh when I am hangry.',
    'You show up on time. I know, low bar, but here we are.',
  ],
  'A life goal of mine is…': [
    'Open a tiny bakery that only sells three things, all perfect.',
    'Hike the full length of a long-distance trail.',
    'Learn to sail and disappear for a summer.',
  ],
  'The key to my heart is…': [
    'Inside jokes and outside adventures.',
    'Patience and a good cheese plate.',
    'Kindness to waiters.',
  ],
  "I'm convinced that…": [
    'Breakfast for dinner is the best kind of dinner.',
    'Every city has one perfect bench, and I have found it here.',
    'Cats understand everything and simply choose not to care.',
  ],
  'Green flags I look for…': [
    'Has a close friend group, calls their grandma, tips well.',
    'Says sorry without a "but" after it.',
    'Gets excited about other people’s wins.',
  ],
  'Typical Friday night…': [
    'Pizza, a horror movie, and covering my eyes at the good parts.',
    'Dinner with friends that turns into karaoke against my will.',
    'Climbing gym, then tacos.',
  ],
  'Dating me is like…': [
    'A group project where I do the snacks and the spreadsheet.',
    'A playlist on shuffle: mostly bangers, occasional jazz.',
    'A golden retriever with a planner.',
  ],
};

const SCENES: Record<string, { emoji: string; caption: string }> = {
  Hiking: { emoji: '🥾', caption: 'Summit selfie' },
  Climbing: { emoji: '🧗', caption: 'Project day' },
  Cycling: { emoji: '🚲', caption: 'Lachine canal loop' },
  Running: { emoji: '🏃', caption: 'Morning 10k' },
  Yoga: { emoji: '🧘', caption: 'Sunrise flow' },
  'Board games': { emoji: '🎲', caption: 'Game night champion' },
  'Video games': { emoji: '🎮', caption: 'Co-op partner wanted' },
  Cooking: { emoji: '🍝', caption: 'Homemade pasta' },
  Baking: { emoji: '🥐', caption: 'Croissant attempt #4' },
  Coffee: { emoji: '☕', caption: 'Third café this week' },
  Wine: { emoji: '🍷', caption: 'Vineyard trip' },
  'Craft beer': { emoji: '🍺', caption: 'Brewery crawl' },
  'Live music': { emoji: '🎸', caption: 'Front row' },
  Concerts: { emoji: '🎤', caption: 'Lost my voice' },
  Festivals: { emoji: '🎪', caption: 'Jazz fest' },
  Theatre: { emoji: '🎭', caption: 'Opening night' },
  Film: { emoji: '🎬', caption: 'Cinema date?' },
  Anime: { emoji: '🍥', caption: 'Rewatching a classic' },
  Reading: { emoji: '📚', caption: 'Current stack' },
  Writing: { emoji: '✍️', caption: 'Notebook #12' },
  Poetry: { emoji: '📝', caption: 'Open mic night' },
  Photography: { emoji: '📷', caption: 'Golden hour' },
  Painting: { emoji: '🎨', caption: 'Work in progress' },
  Pottery: { emoji: '🏺', caption: 'Lopsided but mine' },
  Dancing: { emoji: '💃', caption: 'Salsa Thursdays' },
  Travel: { emoji: '✈️', caption: 'Lisbon last spring' },
  Camping: { emoji: '🏕️', caption: 'No signal, no problem' },
  Gardening: { emoji: '🌱', caption: 'Tomato season' },
  Tech: { emoji: '💻', caption: 'Side project' },
  Startups: { emoji: '🚀', caption: 'Pitch day' },
  Science: { emoji: '🔭', caption: 'Meteor shower' },
  Volunteering: { emoji: '🤲', caption: 'Food bank Saturdays' },
  Dogs: { emoji: '🐕', caption: 'My best friend' },
  Cats: { emoji: '🐈', caption: 'The boss' },
  Thrifting: { emoji: '🧥', caption: 'Five-dollar find' },
  Fashion: { emoji: '👗', caption: 'Fit check' },
  Podcasts: { emoji: '🎧', caption: 'Ask me for recs' },
  Skiing: { emoji: '⛷️', caption: 'Mont-Tremblant' },
  Swimming: { emoji: '🏊', caption: 'Lake day' },
  Soccer: { emoji: '⚽', caption: 'Sunday league' },
};

const SKIN = ['#f6d7c3', '#eac0a1', '#d9a07b', '#b97b56', '#8d5a3b', '#5e3a24'];
const HAIR = ['#1f1a17', '#3b2a20', '#6b4423', '#a0703f', '#d9b26f', '#b5482f', '#8a8a8a', '#3d3d6b'];
const BGS: [string, string][] = [
  ['#ffd3b6', '#ff8c94'], ['#c9e4ff', '#8fb8ff'], ['#d4f5dd', '#7ccf9f'], ['#fde7a9', '#f7b267'],
  ['#e5d4ff', '#a98bff'], ['#ffe0f0', '#ff9ec7'], ['#d6f3f5', '#69c2cf'], ['#f1e3d3', '#c99f7a'],
];
const LANG_POOL = ['English', 'French', 'Spanish', 'Arabic', 'Mandarin', 'Portuguese', 'Hindi', 'Italian'];
const RELIGION = ['agnostic', 'atheist', 'christian', 'jewish', 'muslim', 'spiritual', 'buddhist', 'hindu'];
const POLITICS = ['liberal', 'moderate', 'apolitical', 'liberal', 'moderate'];

const setting = <T,>(value: T, visible = true): { value: T; visible: boolean; is_dealbreaker: boolean } => ({
  value,
  visible,
  is_dealbreaker: false,
});

function loveVector(r: Rng, n: number): LoveVector {
  // Simulate quiz picks: draw a latent preference vector, then pick n times.
  const w = [r(), r(), r(), r(), r()].map((x) => x ** 2 + 0.05);
  const counts = [0, 0, 0, 0, 0];
  for (let i = 0; i < n; i++) {
    const a = Math.floor(r() * 5);
    let b = Math.floor(r() * 4);
    if (b >= a) b++;
    counts[r() < w[a] / (w[a] + w[b]) ? a : b]++;
  }
  return toShares(counts);
}

function dimPct(r: Rng, letter: string, first: string): number {
  const strength = 52 + Math.round(r() * 40); // 52..92 toward the chosen pole
  return letter === first ? strength : 100 - strength;
}

/** Demo reference date so ages are stable regardless of when the seed runs. */
export const DEMO_YEAR = 2026;

export function generateDemoProfiles(count = 50, seed = 20261023): DemoProfile[] {
  const r = mulberry32(seed);
  const out: DemoProfile[] = [];
  for (let i = 0; i < count; i++) {
    const [name, gender, pronouns, orientation, seeking] = PEOPLE[i % PEOPLE.length];
    const age = 21 + Math.floor(r() * 22); // 21..42
    const month = 1 + Math.floor(r() * 12);
    const day = 1 + Math.floor(r() * 28);
    const birthdate = `${DEMO_YEAR - age}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const angle = r() * Math.PI * 2;
    const dist = 0.8 + r() ** 1.6 * 45;
    const type = pick(r, TYPES);
    const interests = sample(r, INTERESTS, 4 + Math.floor(r() * 4));
    const promptKeys = sample(r, Object.keys(ANSWERS), 3);
    const languages = ['English', ...sample(r, LANG_POOL.slice(1), Math.floor(r() * 3))];
    if (r() < 0.55 && !languages.includes('French')) languages.push('French');
    const kinkOpt = r() < 0.3;
    const id = `demo-${String(i + 1).padStart(2, '0')}`;
    const slug = name.toLowerCase().normalize('NFD').replace(/[^a-z]/g, '');
    const phone = `+1514555${String(1000 + i).slice(-4)}`;
    out.push({
      id,
      name,
      birthdate,
      gender,
      pronouns,
      orientation,
      seeking,
      offset_km: { x: Math.cos(angle) * dist, y: Math.sin(angle) * dist },
      city: `Montréal · ${pick(r, NEIGHBOURHOODS)}`,
      height_cm: r() < 0.8 ? 155 + Math.floor(r() * 40) : null,
      verified: r() < 0.85,
      last_active_hours: Math.floor(r() ** 2 * 200),
      avatar: {
        skin: pick(r, SKIN),
        hair: pick(r, HAIR),
        hairStyle: pick(r, ['short', 'long', 'bun', 'curly', 'buzz', 'bob'] as const),
        bg: pick(r, BGS),
        glasses: r() < 0.3,
        beard: (gender === 'man' || gender === 'trans man') && r() < 0.4,
      },
      scenes: interests.slice(0, 3).map((x) => SCENES[x] ?? { emoji: '✨', caption: x }),
      prompts: promptKeys.map((p) => ({ prompt: p, answer: pick(r, ANSWERS[p]) })),
      personality: {
        type,
        e_i: dimPct(r, type[0], 'E'),
        s_n: dimPct(r, type[1], 'S'),
        t_f: dimPct(r, type[2], 'T'),
        j_p: dimPct(r, type[3], 'J'),
      },
      love_language: { receive: loveVector(r, 15), give: loveVector(r, 10) },
      attributes: {
        goal: setting(pick(r, ['long-term', 'long-term', 'figuring-it-out', 'short-term', 'friends', 'open-enm', 'long-term'] as const satisfies readonly (typeof GOALS)[number][])),
        drinking: setting(pick(r, DRINKING)),
        cannabis: setting(pick(r, [...CANNABIS, 'never', 'never'])),
        smoking: setting(pick(r, [...SMOKING, 'never', 'never', 'never'])),
        pets: setting(pick(r, PETS)),
        kids_have: setting(pick(r, [...KIDS_HAVE, 'no-kids', 'no-kids'])),
        kids_want: setting(pick(r, KIDS_WANT)),
        religion: setting(pick(r, RELIGION), r() < 0.5),
        politics: setting(pick(r, POLITICS), r() < 0.4),
        languages: setting(languages),
        interests: setting(interests),
      },
      age_min: Math.max(18, age - 6 - Math.floor(r() * 4)),
      age_max: age + 6 + Math.floor(r() * 8),
      distance_km: pick(r, [25, 50, 50, 100, null]),
      kinks: kinkOpt
        ? {
            opted_in: true,
            tags: sample(r, KINK_TAGS, 2 + Math.floor(r() * 3)),
            visibility_level: pick(r, ['matches', 'opted_in', 'opted_in', 'public'] as const),
          }
        : null,
      handles: [
        { app: 'whatsapp', handle: phone, preferred: r() < 0.6 },
        { app: 'telegram', handle: `${slug}_${i + 1}`, preferred: false },
        ...(r() < 0.4 ? [{ app: 'instagram' as const, handle: `${slug}.demo`, preferred: false }] : []),
      ],
      bot: { likes_back: r() < 0.6, likes_you: r() < 0.25, reply_style: Math.floor(r() * 4) },
    });
  }
  return out;
}

export const BOT_REPLIES = [
  ['Haha, okay you have my attention 😄', 'What are you up to this weekend?'],
  ['That is such a good question. Honestly? Tacos.', 'Your turn: what is your go-to comfort food?'],
  ['I was hoping you would write first!', 'Want to swap numbers? Tap Connect when you are ready.'],
  ['Love that. Tell me more 👀', 'Also, coffee or tea person? This matters.'],
];

export const BOT_LIKE_COMMENTS = [
  'Okay this prompt made me laugh out loud',
  'Need to know more about this',
  'Same!! We should compare notes',
  '',
  'Your photos have great energy',
  'Bold claim. I respect it.',
];

/** SVG illustration for demo photos (portrait for index 0, interest scenes after). */
export function demoPhotoSvg(p: Pick<DemoProfile, 'avatar' | 'scenes' | 'name'>, index: number): string {
  const { skin, hair, hairStyle, bg, glasses, beard } = p.avatar;
  const grad = `<defs><linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${bg[0]}"/><stop offset="1" stop-color="${bg[1]}"/></linearGradient></defs>`;
  if (index > 0 && p.scenes[index - 1]) {
    const s = p.scenes[index - 1];
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500">${grad}<rect width="400" height="500" fill="url(#b)"/><circle cx="320" cy="90" r="46" fill="#fff" opacity=".35"/><text x="200" y="290" font-size="170" text-anchor="middle">${s.emoji}</text><text x="200" y="440" font-family="system-ui,sans-serif" font-size="28" font-weight="600" fill="#fff" text-anchor="middle" opacity=".95">${escapeXml(s.caption)}</text></svg>`;
  }
  const hairBack: Record<DemoAvatar['hairStyle'], string> = {
    short: '',
    buzz: '',
    long: `<path d="M110 210 Q100 360 130 420 L270 420 Q300 360 290 210 Z" fill="${hair}"/>`,
    bun: `<circle cx="200" cy="105" r="38" fill="${hair}"/>`,
    curly: `<g fill="${hair}"><circle cx="130" cy="190" r="40"/><circle cx="270" cy="190" r="40"/><circle cx="140" cy="250" r="34"/><circle cx="260" cy="250" r="34"/></g>`,
    bob: `<path d="M118 200 Q110 300 140 320 L260 320 Q290 300 282 200 Z" fill="${hair}"/>`,
  };
  const hairTop: Record<DemoAvatar['hairStyle'], string> = {
    short: `<path d="M130 200 Q130 120 200 118 Q270 120 270 200 Q250 160 200 158 Q150 160 130 200 Z" fill="${hair}"/>`,
    buzz: `<path d="M136 190 Q140 132 200 130 Q260 132 264 190 Q240 165 200 164 Q160 165 136 190 Z" fill="${hair}" opacity=".85"/>`,
    long: `<path d="M126 215 Q120 118 200 115 Q280 118 274 215 Q255 165 200 162 Q145 165 126 215 Z" fill="${hair}"/>`,
    bun: `<path d="M130 200 Q132 128 200 126 Q268 128 270 200 Q250 162 200 160 Q150 162 130 200 Z" fill="${hair}"/>`,
    curly: `<g fill="${hair}"><circle cx="150" cy="150" r="34"/><circle cx="200" cy="130" r="38"/><circle cx="250" cy="150" r="34"/><circle cx="128" cy="190" r="26"/><circle cx="272" cy="190" r="26"/></g>`,
    bob: `<path d="M124 210 Q122 120 200 116 Q278 120 276 210 Q256 160 200 158 Q144 160 124 210 Z" fill="${hair}"/>`,
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500">${grad}<rect width="400" height="500" fill="url(#b)"/>${hairBack[hairStyle]}<path d="M80 500 Q90 380 200 370 Q310 380 320 500 Z" fill="${shade(bg[1], -30)}"/><rect x="178" y="300" width="44" height="60" rx="18" fill="${shade(skin, -12)}"/><ellipse cx="200" cy="225" rx="72" ry="88" fill="${skin}"/>${beard ? `<path d="M135 245 Q140 320 200 322 Q260 320 265 245 Q240 290 200 290 Q160 290 135 245 Z" fill="${hair}" opacity=".9"/>` : ''}<circle cx="173" cy="225" r="7" fill="#2b2b2b"/><circle cx="227" cy="225" r="7" fill="#2b2b2b"/><path d="M178 268 Q200 284 222 268" stroke="#7a3b3b" stroke-width="5" fill="none" stroke-linecap="round"/><circle cx="158" cy="252" r="11" fill="#ff8c94" opacity=".35"/><circle cx="242" cy="252" r="11" fill="#ff8c94" opacity=".35"/>${glasses ? `<g fill="none" stroke="#2b2b2b" stroke-width="5"><circle cx="173" cy="225" r="20"/><circle cx="227" cy="225" r="20"/><path d="M193 225 H207"/></g>` : ''}${hairTop[hairStyle]}</svg>`;
}

function escapeXml(s: string) {
  return s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]!);
}

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, v + amt));
  const r = c(n >> 16);
  const g = c((n >> 8) & 255);
  const b = c(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

export function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
