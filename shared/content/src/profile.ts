import type { Gender, KinkVisibility, SeekingBucket } from '../../matching/src/types.ts';

export const PROMPTS: string[] = [
  'My ideal lazy day includes…',
  "An oddly specific thing I find charming…",
  "We should probably meet if you…",
  'Small things that make my day…',
  'Impress me by…',
  'I could talk for hours about…',
  'A fear I know makes no sense…',
  'Guess which one is false…',
  'I will never say no to…',
  "Bonus points if you…",
  'Someday I want to…',
  'How I show I care…',
  'The quickest way to make me smile…',
  "A hill I will gladly die on…",
  'Signs we will click…',
  'My Friday nights usually involve…',
  'Dating me comes with…',
  'Try to change my opinion on…',
  'A trip I still think about…',
  'My friends come to me for…',
];

export const GENDERS: { value: Gender; label: string }[] = [
  { value: 'man', label: 'Man' },
  { value: 'woman', label: 'Woman' },
  { value: 'non-binary', label: 'Non-binary' },
  { value: 'trans man', label: 'Trans man' },
  { value: 'trans woman', label: 'Trans woman' },
  { value: 'genderfluid', label: 'Genderfluid' },
  { value: 'other', label: 'Other' },
];

export const PRONOUNS = ['she/her', 'he/him', 'they/them', 'she/they', 'he/they', 'any', 'ask me'];

export const ORIENTATIONS = [
  'straight',
  'gay',
  'lesbian',
  'bisexual',
  'pansexual',
  'queer',
  'asexual',
  'other',
] as const;

export const SEEKING: { value: SeekingBucket; label: string }[] = [
  { value: 'men', label: 'Men' },
  { value: 'women', label: 'Women' },
  { value: 'nonbinary', label: 'Non-binary & gender-diverse people' },
];

export const OPTION_LABELS: Record<string, Record<string, string>> = {
  goal: {
    'long-term': 'Long-term relationship',
    'short-term': 'Short-term fun',
    'figuring-it-out': 'Figuring it out',
    friends: 'New friends',
    'open-enm': 'Open / ENM',
  },
  drinking: { never: 'Never', rarely: 'Rarely', sometimes: 'Sometimes', often: 'Often' },
  cannabis: { never: 'Never', sometimes: 'Sometimes', often: 'Often' },
  smoking: { never: 'Never', sometimes: 'Sometimes', often: 'Often' },
  pets: {
    'have-dog': 'Have a dog',
    'have-cat': 'Have a cat',
    'have-other': 'Have another pet',
    'like-pets': 'Like pets',
    allergic: 'Allergic',
    'no-pets': "Don't want pets",
  },
  kids_have: { 'have-kids': 'Have kids', 'no-kids': "Don't have kids" },
  kids_want: { 'want-kids': 'Want kids', 'dont-want-kids': "Don't want kids", open: 'Open to kids' },
  religion: {
    agnostic: 'Agnostic',
    atheist: 'Atheist',
    buddhist: 'Buddhist',
    christian: 'Christian',
    hindu: 'Hindu',
    jewish: 'Jewish',
    muslim: 'Muslim',
    spiritual: 'Spiritual',
    other: 'Other',
  },
  politics: {
    liberal: 'Liberal',
    moderate: 'Moderate',
    conservative: 'Conservative',
    apolitical: 'Not political',
    other: 'Other',
  },
};

export const ATTRIBUTE_LABELS: Record<string, string> = {
  goal: 'Relationship goal',
  drinking: 'Drinking',
  cannabis: 'Cannabis',
  smoking: 'Smoking / vaping',
  pets: 'Pets',
  kids_have: 'Have kids',
  kids_want: 'Want kids',
  religion: 'Religion',
  politics: 'Politics',
  languages: 'Languages',
  interests: 'Interests',
  height_cm: 'Height',
};

export const LANGUAGES = [
  'English', 'French', 'Spanish', 'Portuguese', 'German', 'Italian', 'Arabic', 'Mandarin',
  'Cantonese', 'Hindi', 'Punjabi', 'Tagalog', 'Vietnamese', 'Korean', 'Japanese', 'Russian',
  'Ukrainian', 'Polish', 'Greek', 'Turkish', 'Persian', 'Haitian Creole',
];

export const INTERESTS = [
  'Hiking', 'Climbing', 'Cycling', 'Running', 'Yoga', 'Board games', 'Video games', 'Cooking',
  'Baking', 'Coffee', 'Wine', 'Craft beer', 'Live music', 'Concerts', 'Festivals', 'Theatre',
  'Film', 'Anime', 'Reading', 'Writing', 'Poetry', 'Photography', 'Painting', 'Pottery',
  'Dancing', 'Travel', 'Camping', 'Gardening', 'Tech', 'Startups', 'Science', 'Volunteering',
  'Dogs', 'Cats', 'Thrifting', 'Fashion', 'Podcasts', 'Skiing', 'Swimming', 'Soccer',
];

export const KINK_TAGS = [
  'vanilla', 'curious', 'dominant', 'submissive', 'switch', 'rope', 'roleplay', 'praise',
  'sensory play', 'impact play', 'voyeurism', 'exhibitionism', 'toys', 'aftercare-focused',
  'kink-friendly', 'polyamorous',
];

export const KINK_VISIBILITY: { value: KinkVisibility; label: string; help: string }[] = [
  { value: 'hidden', label: 'Hidden', help: 'Nobody sees your tags. They are never used for filtering.' },
  { value: 'matches', label: 'Matches only', help: 'Only people you match with can see your tags.' },
  { value: 'opted_in', label: 'Opted-in people', help: 'Only people who also opted in can see them.' },
  { value: 'public', label: 'Everyone (18+)', help: 'Shown on your profile to everyone.' },
];

export const MESSENGERS = [
  { app: 'whatsapp', label: 'WhatsApp', placeholder: '+1 514 555 0100', link: (h: string) => `https://wa.me/${h.replace(/[^\d]/g, '')}` },
  { app: 'telegram', label: 'Telegram', placeholder: 'username', link: (h: string) => `https://t.me/${h.replace(/^@/, '')}` },
  { app: 'signal', label: 'Signal', placeholder: '+1 514 555 0100', link: (h: string) => `https://signal.me/#p/${h.replace(/[^\d+]/g, '')}` },
  { app: 'instagram', label: 'Instagram', placeholder: 'username', link: (h: string) => `https://instagram.com/${h.replace(/^@/, '')}` },
] as const;
export type MessengerApp = (typeof MESSENGERS)[number]['app'];

export const REPORT_REASONS = [
  'Fake profile or catfish',
  'Inappropriate photos',
  'Harassment or hate',
  'Underage',
  'Spam or scam',
  'Something else',
];
