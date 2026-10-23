import { useState } from 'react';
import { LIKERT_LABELS, TYPE_NICKNAMES } from '@linky/content';
import { TYPES, scoresFromType, type Personality, type PersonalityType } from '@linky/matching';
import { PERSONALITY_QUESTIONS, scorePersonality } from '../../quiz/scoring';
import { useMe, useSession } from '../../state/session';
import { Button, Chip, Toggle } from '../ui';

export function PersonalityQuiz({ onDone, cta = 'Continue' }: { onDone: () => void; cta?: string }) {
  const { backend, refresh } = useSession();
  const me = useMe();
  const [mode, setMode] = useState<'start' | 'quiz' | 'known' | 'result'>(me.personality ? 'result' : 'start');
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [i, setI] = useState(0);
  const [result, setResult] = useState<Personality | null>(me.personality);
  const [busy, setBusy] = useState(false);

  async function persist(p: Personality) {
    setBusy(true);
    await backend.savePersonality(p);
    await refresh();
    setResult(p);
    setMode('result');
    setBusy(false);
  }

  function answer(v: number) {
    const q = PERSONALITY_QUESTIONS[i];
    const next = { ...answers, [q.id]: v };
    setAnswers(next);
    if (i + 1 < PERSONALITY_QUESTIONS.length) setI(i + 1);
    else {
      const s = scorePersonality(next);
      void persist({ ...s, visible: result?.visible ?? true, self_reported: false });
    }
  }

  if (mode === 'start') {
    return (
      <div className="space-y-4">
        <p className="text-[15px] text-muted">
          20 quick statements about how you recharge, think, decide and plan. There are no wrong answers. Linky
          stores your percentage on each axis, not just the four letters.
        </p>
        <Button className="w-full" onClick={() => setMode('quiz')}>
          Take the 16-type quiz (≈3 min)
        </Button>
        <Button variant="secondary" className="w-full" onClick={() => setMode('known')}>
          I already know my type
        </Button>
        <p className="text-center text-[11px] text-muted">
          An original 16-type personality quiz. Not affiliated with the Myers-Briggs Company or the MBTI® assessment.
        </p>
      </div>
    );
  }

  if (mode === 'known') {
    return (
      <div>
        <p className="mb-3 text-sm text-muted">Pick your type:</p>
        <div className="grid grid-cols-4 gap-2">
          {TYPES.map((t) => (
            <Chip
              key={t}
              onClick={() => persist({ type: t, ...scoresFromType(t as PersonalityType), visible: true, self_reported: true })}
            >
              {t}
            </Chip>
          ))}
        </div>
        <Button variant="ghost" className="mt-4 w-full" onClick={() => setMode('start')}>
          Back
        </Button>
      </div>
    );
  }

  if (mode === 'quiz') {
    const q = PERSONALITY_QUESTIONS[i];
    return (
      <div>
        <div className="mb-6 h-1.5 overflow-hidden rounded-full bg-plum-50">
          <div className="h-full rounded-full bg-coral-400 transition-all" style={{ width: `${(i / PERSONALITY_QUESTIONS.length) * 100}%` }} />
        </div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          {i + 1} of {PERSONALITY_QUESTIONS.length}
        </p>
        <h3 key={q.id} className="animate-fade-in mt-2 min-h-24 text-2xl font-semibold leading-snug">
          {q.text}
        </h3>
        <div className="mt-6 space-y-2">
          {LIKERT_LABELS.map((label, idx) => (
            <button
              key={label}
              onClick={() => answer(idx + 1)}
              className={`w-full rounded-2xl border px-4 py-3 text-left text-[15px] font-medium transition ${
                answers[q.id] === idx + 1 ? 'border-coral-500 bg-coral-50 text-coral-600' : 'border-plum-100 bg-white hover:border-coral-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {i > 0 && (
          <Button variant="ghost" className="mt-3 w-full" onClick={() => setI(i - 1)} disabled={busy}>
            Back
          </Button>
        )}
      </div>
    );
  }

  return (
    <div>
      {result && <PersonalityResult p={result} />}
      {result && (
        <Toggle
          checked={result.visible}
          onChange={(v) => persist({ ...result, visible: v })}
          label="Show my type on my profile"
          hint="It’s still used for matching when hidden."
        />
      )}
      <Button className="mt-4 w-full" onClick={onDone} busy={busy}>
        {cta}
      </Button>
      <Button variant="ghost" className="mt-2 w-full" onClick={() => { setAnswers({}); setI(0); setMode('start'); }}>
        Retake
      </Button>
    </div>
  );
}

const AXES: ['e_i' | 's_n' | 't_f' | 'j_p', string, string][] = [
  ['e_i', 'Extraverted', 'Introverted'],
  ['s_n', 'Sensing', 'Intuitive'],
  ['t_f', 'Thinking', 'Feeling'],
  ['j_p', 'Judging', 'Perceiving'],
];

export function PersonalityResult({ p, compact }: { p: Pick<Personality, 'type' | 'e_i' | 's_n' | 't_f' | 'j_p'>; compact?: boolean }) {
  return (
    <div>
      {!compact && (
        <div className="mb-4 text-center">
          <div className="font-display text-5xl font-semibold text-coral-500">{p.type}</div>
          <div className="mt-1 text-sm font-medium text-plum-700">{TYPE_NICKNAMES[p.type]}</div>
        </div>
      )}
      <div className="space-y-3">
        {AXES.map(([key, left, right]) => {
          const v = p[key];
          return (
            <div key={key}>
              <div className="flex justify-between text-xs">
                <span className={`text-coral-600 ${v >= 50 ? 'font-semibold' : 'opacity-70'}`}>{left} {v}%</span>
                <span className={`text-plum-500 ${v < 50 ? 'font-semibold' : 'opacity-70'}`}>{100 - v}% {right}</span>
              </div>
              {/* Two-sided gauge: each pole has its own colour, the tick marks the 50% midpoint. */}
              <div className="relative mt-1 flex h-2.5 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={`${left} ${v}%, ${right} ${100 - v}%`}>
                {v > 0 && <div className="rounded-l-full bg-coral-400" style={{ width: `${v}%` }} />}
                {v < 100 && <div className="flex-1 rounded-r-full bg-plum-500" />}
                <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-white/80" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
