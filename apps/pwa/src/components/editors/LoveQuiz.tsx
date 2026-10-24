import { useState } from 'react';
import { LOVE_LANGUAGE_EMOJI, LOVE_LANGUAGE_LABELS, type ForcedChoice } from '@linky/content';
import { LOVE_LANGUAGES, type LoveLanguage, type LoveLanguageProfile, type LoveVector } from '@linky/matching';
import { GIVE_QUESTIONS, RECEIVE_QUESTIONS, scoreLoveLanguage, vectorFromPicks } from '../../quiz/scoring';
import { useMe, useSession } from '../../state/session';
import { Button, Chip, Toggle } from '../ui';

type Part = 'receive' | 'give';

export function LoveQuiz({ onDone, cta = 'Continue' }: { onDone: () => void; cta?: string }) {
  const { backend, refresh } = useSession();
  const me = useMe();
  const [stage, setStage] = useState<'start' | 'known' | Part | 'result'>(me.love_language ? 'result' : 'start');
  const [i, setI] = useState(0);
  const [picks, setPicks] = useState<Record<string, LoveLanguage>>({});
  const [receive, setReceive] = useState<LoveVector | null>(null);
  const [result, setResult] = useState<LoveLanguageProfile | null>(me.love_language);
  const [busy, setBusy] = useState(false);

  async function persist(p: LoveLanguageProfile) {
    setBusy(true);
    await backend.saveLoveLanguage(p);
    await refresh();
    setResult(p);
    setStage('result');
    setBusy(false);
  }

  if (stage === 'start') {
    return (
      <div className="space-y-4">
        <p className="text-[15px] text-muted">
          Two short rounds of “which means more to you?”: first how you like to <b>receive</b> love (15), then how
          you naturally <b>give</b> it (10). Matching compares your giving with their receiving, both ways.
        </p>
        <p className="text-xs text-muted">
          An original quiz inspired by the love languages idea. Not affiliated with or endorsed by The 5 Love Languages®.
        </p>
        <Button className="w-full" onClick={() => { setI(0); setPicks({}); setStage('receive'); }}>
          Start (≈2 min)
        </Button>
        <Button variant="secondary" className="w-full" onClick={() => setStage('known')}>
          I already know my love languages
        </Button>
      </div>
    );
  }

  if (stage === 'known') {
    return <KnownLoveLanguages busy={busy} onBack={() => setStage('start')} onSave={(p) => persist({ ...p, visible: result?.visible ?? true })} />;
  }

  if (stage === 'receive' || stage === 'give') {
    const qs: ForcedChoice[] = stage === 'receive' ? RECEIVE_QUESTIONS : GIVE_QUESTIONS;
    const q = qs[i];
    const choose = (lang: LoveLanguage) => {
      const next = { ...picks, [q.id]: lang };
      setPicks(next);
      if (i + 1 < qs.length) return setI(i + 1);
      if (stage === 'receive') {
        setReceive(scoreLoveLanguage(RECEIVE_QUESTIONS, next));
        setI(0);
        setStage('give');
      } else {
        void persist({ receive: receive!, give: scoreLoveLanguage(GIVE_QUESTIONS, next), visible: result?.visible ?? true });
      }
    };
    return (
      <div>
        <div className="mb-6 h-1.5 overflow-hidden rounded-full bg-plum-50">
          <div className="h-full rounded-full bg-coral-400 transition-all" style={{ width: `${(i / qs.length) * 100}%` }} />
        </div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          {stage === 'receive' ? 'Receiving' : 'Giving'} · {i + 1} of {qs.length}
        </p>
        <h3 className="mt-2 text-2xl font-semibold">{stage === 'receive' ? 'Which means more to you?' : 'Which are you more likely to do?'}</h3>
        <div key={q.id} className="animate-fade-in mt-6 space-y-3">
          {[q.a, q.b].map((o) => (
            <button
              key={o.text}
              onClick={() => choose(o.lang)}
              className="w-full rounded-3xl border border-plum-100 bg-white p-5 text-left text-[17px] font-medium shadow-sm transition hover:border-coral-300 active:scale-[0.99]"
            >
              {o.text}
            </button>
          ))}
        </div>
        {i > 0 && (
          <Button variant="ghost" className="mt-3 w-full" onClick={() => setI(i - 1)}>
            Back
          </Button>
        )}
      </div>
    );
  }

  return (
    <div>
      {result && <LoveResult profile={result} />}
      {result && (
        <Toggle
          checked={result.visible}
          onChange={(v) => persist({ ...result, visible: v })}
          label="Show my love languages on my profile"
          hint="Still used for matching when hidden."
        />
      )}
      <Button className="mt-4 w-full" onClick={onDone} busy={busy}>
        {cta}
      </Button>
      <Button variant="ghost" className="mt-2 w-full" onClick={() => setStage('start')}>
        Retake
      </Button>
    </div>
  );
}

type Picks = { main: LoveLanguage | null; second: LoveLanguage | null };

function LanguagePicker({ title, picks, onChange }: { title: string; picks: Picks; onChange: (p: Picks) => void }) {
  const tap = (l: LoveLanguage) => {
    if (picks.main === l) onChange({ main: picks.second, second: null });
    else if (picks.second === l) onChange({ ...picks, second: null });
    else if (!picks.main) onChange({ ...picks, main: l });
    else onChange({ ...picks, second: l });
  };
  return (
    <section>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mb-2 text-xs text-muted">Tap your main one, then optionally a second.</p>
      <div className="flex flex-wrap gap-2">
        {LOVE_LANGUAGES.map((l) => (
          <Chip key={l} selected={picks.main === l || picks.second === l} onClick={() => tap(l)}>
            {LOVE_LANGUAGE_EMOJI[l]} {LOVE_LANGUAGE_LABELS[l]}
            {picks.main === l && ' · 1st'}
            {picks.second === l && ' · 2nd'}
          </Chip>
        ))}
      </div>
    </section>
  );
}

function KnownLoveLanguages({
  busy,
  onBack,
  onSave,
}: {
  busy: boolean;
  onBack: () => void;
  onSave: (p: Pick<LoveLanguageProfile, 'receive' | 'give'>) => void;
}) {
  const [receive, setReceive] = useState<Picks>({ main: null, second: null });
  const [give, setGive] = useState<Picks>({ main: null, second: null });
  const [sameGive, setSameGive] = useState(true);
  const giving = sameGive ? receive : give;
  const ready = Boolean(receive.main && giving.main);
  return (
    <div className="space-y-6">
      <LanguagePicker title="How you like to receive love" picks={receive} onChange={setReceive} />
      <Toggle checked={sameGive} onChange={setSameGive} label="I give love the same way" />
      {!sameGive && <LanguagePicker title="How you naturally give love" picks={give} onChange={setGive} />}
      <Button
        className="w-full"
        disabled={!ready}
        busy={busy}
        onClick={() =>
          onSave({
            receive: vectorFromPicks(receive.main!, receive.second),
            give: vectorFromPicks(giving.main!, giving.second),
          })
        }
      >
        {ready ? 'Save' : 'Pick your main love language'}
      </Button>
      <Button variant="ghost" className="w-full" onClick={onBack}>
        Back
      </Button>
    </div>
  );
}

export function LoveBars({ v, title }: { v: readonly number[]; title: string }) {
  const order = LOVE_LANGUAGES.map((l, i) => ({ l, v: v[i] })).sort((a, b) => b.v - a.v);
  return (
    <div>
      <h4 className="mb-2 text-sm font-semibold text-plum-700">{title}</h4>
      <div className="space-y-1.5">
        {order.map(({ l, v: pct }, idx) => (
          <div key={l} className="flex items-center gap-2 text-xs">
            <span className="w-5">{LOVE_LANGUAGE_EMOJI[l]}</span>
            <span className={`w-36 ${idx === 0 ? 'font-semibold text-ink' : 'text-muted'}`}>{LOVE_LANGUAGE_LABELS[l]}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-plum-50">
              <div className={idx === 0 ? 'h-full bg-coral-400' : 'h-full bg-plum-100'} style={{ width: `${pct}%` }} />
            </div>
            <span className="w-8 text-right tabular-nums">{pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function LoveResult({ profile }: { profile: Pick<LoveLanguageProfile, 'receive' | 'give'> }) {
  return (
    <div className="space-y-5">
      <LoveBars v={profile.receive} title="How I like to receive love" />
      <LoveBars v={profile.give} title="How I naturally give love" />
    </div>
  );
}
