import type { LoveLanguage } from '../../matching/src/types.ts';

export const LOVE_LANGUAGE_LABELS: Record<LoveLanguage, string> = {
  words: 'Words of Affirmation',
  time: 'Quality Time',
  gifts: 'Receiving Gifts',
  service: 'Acts of Service',
  touch: 'Physical Touch',
};

export const LOVE_LANGUAGE_EMOJI: Record<LoveLanguage, string> = {
  words: '💬',
  time: '⏳',
  gifts: '🎁',
  service: '🛠️',
  touch: '🤝',
};

export interface ForcedChoice {
  id: string;
  a: { lang: LoveLanguage; text: string };
  b: { lang: LoveLanguage; text: string };
}

/**
 * "How I like to receive love": 15 original forced-choice pairs.
 * All 10 language pairs once, plus 5 more so each language appears exactly 6 times.
 */
export const RECEIVE_QUESTIONS: ForcedChoice[] = [
  { id: 'r1', a: { lang: 'words', text: 'They tell me out of the blue why they are proud of me' }, b: { lang: 'time', text: 'They put their phone away and give me a whole evening' } },
  { id: 'r2', a: { lang: 'words', text: 'A sweet text in the middle of my workday' }, b: { lang: 'gifts', text: 'A small surprise they picked up because it reminded them of me' } },
  { id: 'r3', a: { lang: 'words', text: 'They compliment something I worked hard on' }, b: { lang: 'service', text: 'They handle a chore I have been dreading' } },
  { id: 'r4', a: { lang: 'words', text: 'Hearing "I love being around you"' }, b: { lang: 'touch', text: 'A long hug when I walk through the door' } },
  { id: 'r5', a: { lang: 'time', text: 'A slow walk together with nowhere to be' }, b: { lang: 'gifts', text: 'A thoughtful gift on an ordinary day' } },
  { id: 'r6', a: { lang: 'time', text: 'Cooking dinner side by side' }, b: { lang: 'service', text: 'Coming home to dinner already made for me' } },
  { id: 'r7', a: { lang: 'time', text: 'A weekend trip with just the two of us' }, b: { lang: 'touch', text: 'Holding hands while we are out' } },
  { id: 'r8', a: { lang: 'gifts', text: 'A souvenir they brought back from a trip' }, b: { lang: 'service', text: 'They fix the thing in my place that has been broken for months' } },
  { id: 'r9', a: { lang: 'gifts', text: 'Flowers, a book, or a snack I mentioned once' }, b: { lang: 'touch', text: 'A back rub after a long day' } },
  { id: 'r10', a: { lang: 'service', text: 'They run an errand so I can rest' }, b: { lang: 'touch', text: 'Cuddling on the couch during a movie' } },
  { id: 'r11', a: { lang: 'words', text: 'A handwritten note left where I will find it' }, b: { lang: 'time', text: 'An uninterrupted, deep conversation' } },
  { id: 'r12', a: { lang: 'gifts', text: 'A gift that shows they really listen to me' }, b: { lang: 'service', text: 'They plan the logistics so I do not have to' } },
  { id: 'r13', a: { lang: 'touch', text: 'A hand on my shoulder when I am stressed' }, b: { lang: 'words', text: 'Them saying "you have got this" before a big moment' } },
  { id: 'r14', a: { lang: 'time', text: 'They show up to the thing that matters to me' }, b: { lang: 'gifts', text: 'A little gift waiting for me after a hard week' } },
  { id: 'r15', a: { lang: 'service', text: 'They take care of me when I am sick' }, b: { lang: 'touch', text: 'Falling asleep close to them' } },
];

/** "How I naturally give love": 10 original forced-choice pairs (each pair once). */
export const GIVE_QUESTIONS: ForcedChoice[] = [
  { id: 'g1', a: { lang: 'words', text: 'Tell them exactly what I admire about them' }, b: { lang: 'time', text: 'Clear my schedule to hang out' } },
  { id: 'g2', a: { lang: 'words', text: 'Send an encouraging message before their big day' }, b: { lang: 'gifts', text: 'Pick up a treat they love on my way over' } },
  { id: 'g3', a: { lang: 'words', text: 'Hype them up in front of friends' }, b: { lang: 'service', text: 'Help them move, assemble, or fix something' } },
  { id: 'g4', a: { lang: 'words', text: 'Write them a card' }, b: { lang: 'touch', text: 'Give them a big hug' } },
  { id: 'g5', a: { lang: 'time', text: 'Plan a day doing their favourite thing' }, b: { lang: 'gifts', text: 'Find the perfect present' } },
  { id: 'g6', a: { lang: 'time', text: 'Keep them company while they work on something' }, b: { lang: 'service', text: 'Take a task off their plate' } },
  { id: 'g7', a: { lang: 'time', text: 'Go on a long drive and talk' }, b: { lang: 'touch', text: 'Hold their hand or sit close' } },
  { id: 'g8', a: { lang: 'gifts', text: 'Surprise them with something small' }, b: { lang: 'service', text: 'Cook them a meal' } },
  { id: 'g9', a: { lang: 'gifts', text: 'Bring back a souvenir from my travels' }, b: { lang: 'touch', text: 'Offer a shoulder massage' } },
  { id: 'g10', a: { lang: 'service', text: 'Drive them to the airport at 5am' }, b: { lang: 'touch', text: 'Snuggle up when they are down' } },
];
