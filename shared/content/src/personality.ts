import type { Dimension } from '../../matching/src/types.ts';

/**
 * Original 20-item "16-type personality" question set (5 per dimension).
 * Not derived from any official MBTI instrument.
 *
 * `pole` is the letter that AGREEING with the statement points toward.
 * Answers use a 5-point scale: 1 strongly disagree … 5 strongly agree.
 */
export interface PersonalityQuestion {
  id: string;
  dim: Dimension;
  pole: 'E' | 'I' | 'S' | 'N' | 'T' | 'F' | 'J' | 'P';
  text: string;
}

export const PERSONALITY_QUESTIONS: PersonalityQuestion[] = [
  // E / I
  { id: 'ei1', dim: 'EI', pole: 'E', text: 'After a long week, a lively night out recharges me.' },
  { id: 'ei2', dim: 'EI', pole: 'I', text: 'I usually think things through quietly before I share an opinion.' },
  { id: 'ei3', dim: 'EI', pole: 'E', text: 'I strike up conversations with strangers without much effort.' },
  { id: 'ei4', dim: 'EI', pole: 'I', text: 'A free evening alone at home sounds like a treat, not a waste.' },
  { id: 'ei5', dim: 'EI', pole: 'E', text: 'In a group, I tend to be one of the people keeping the energy up.' },
  // S / N
  { id: 'sn1', dim: 'SN', pole: 'N', text: 'I often get lost imagining how things could be rather than how they are.' },
  { id: 'sn2', dim: 'SN', pole: 'S', text: 'I trust what I can see and test more than hunches.' },
  { id: 'sn3', dim: 'SN', pole: 'N', text: 'I enjoy conversations about big ideas, theories and "what ifs".' },
  { id: 'sn4', dim: 'SN', pole: 'S', text: 'I notice small practical details that other people miss.' },
  { id: 'sn5', dim: 'SN', pole: 'S', text: 'Step-by-step instructions suit me better than a rough overview.' },
  // T / F
  { id: 'tf1', dim: 'TF', pole: 'T', text: 'When friends vent, my first instinct is to help them solve the problem.' },
  { id: 'tf2', dim: 'TF', pole: 'F', text: 'I weigh how a decision will make people feel as much as whether it is logical.' },
  { id: 'tf3', dim: 'TF', pole: 'T', text: 'I would rather hear an honest critique than a kind half-truth.' },
  { id: 'tf4', dim: 'TF', pole: 'F', text: 'Keeping the peace in a group matters a lot to me.' },
  { id: 'tf5', dim: 'TF', pole: 'T', text: 'In a disagreement, I focus on facts more than on feelings.' },
  // J / P
  { id: 'jp1', dim: 'JP', pole: 'J', text: 'I like having weekend plans locked in by Thursday.' },
  { id: 'jp2', dim: 'JP', pole: 'P', text: 'Some of my best days happened because I dropped the plan.' },
  { id: 'jp3', dim: 'JP', pole: 'J', text: 'I feel calmer once my to-do list is written down.' },
  { id: 'jp4', dim: 'JP', pole: 'P', text: 'I tend to pack for a trip at the last minute, and it works out.' },
  { id: 'jp5', dim: 'JP', pole: 'J', text: 'I would rather finish a task early than rush near the deadline.' },
];

export const LIKERT_LABELS = [
  'Strongly disagree',
  'Disagree',
  'Neutral',
  'Agree',
  'Strongly agree',
] as const;

export const TYPE_NICKNAMES: Record<string, string> = {
  INTJ: 'The Strategist', INTP: 'The Tinkerer', ENTJ: 'The Captain', ENTP: 'The Sparring Partner',
  INFJ: 'The Confidant', INFP: 'The Dreamer', ENFJ: 'The Mentor', ENFP: 'The Spark',
  ISTJ: 'The Anchor', ISFJ: 'The Caretaker', ESTJ: 'The Organizer', ESFJ: 'The Host',
  ISTP: 'The Fixer', ISFP: 'The Artist', ESTP: 'The Thrill-Seeker', ESFP: 'The Life of the Party',
};
