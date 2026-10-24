import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BasicsForm } from '../../components/editors/BasicsForm';
import { IdentityForm } from '../../components/editors/IdentityForm';
import { LifestyleForm } from '../../components/editors/LifestyleForm';
import { LivenessCheck } from '../../components/editors/LivenessCheck';
import { LoveQuiz } from '../../components/editors/LoveQuiz';
import { MessengersForm } from '../../components/editors/MessengersForm';
import { PersonalityQuiz } from '../../components/editors/PersonalityQuiz';
import { PhotoManager } from '../../components/editors/PhotoManager';
import { PromptsEditor } from '../../components/editors/PromptsEditor';
import { Button, ChevronLeft } from '../../components/ui';
import { useMe, useSession } from '../../state/session';

// Photos come before the liveness check so the selfie can be compared with them.
const STEPS = [
  { key: 'basics', title: 'The basics', sub: 'Let’s start with your name and where you are.' },
  { key: 'identity', title: 'About you', sub: 'Be yourself. You control what’s shown.' },
  { key: 'photos', title: 'Your photos', sub: 'Show your face, your vibe and what you love.' },
  { key: 'verify', title: 'Prove you’re you', sub: 'Required before anyone can see your profile.' },
  { key: 'prompts', title: 'Your prompts', sub: 'Give people something to like and talk about.' },
  { key: 'personality', title: '16-type personality', sub: 'How you recharge, think, decide and plan.' },
  { key: 'love', title: 'Love languages', sub: 'How you like to receive love, and how you give it.' },
  { key: 'lifestyle', title: 'Lifestyle & preferences', sub: 'Each answer can be shown, hidden or made a dealbreaker.' },
  { key: 'messengers', title: 'Where to reach you', sub: 'Optional. Revealed only after you both tap Connect.' },
  { key: 'done', title: 'You’re all set', sub: '' },
] as const;

export default function Onboarding() {
  const { backend, refresh } = useSession();
  const me = useMe();
  const nav = useNavigate();
  const [step, setStep] = useState(Math.min(me.onboarding_step, STEPS.length - 1));
  const [finishing, setFinishing] = useState(false);

  useEffect(() => {
    if (me.onboarding_complete) nav('/discover', { replace: true });
  }, [me.onboarding_complete, nav]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [step]);

  async function go(n: number) {
    setStep(n);
    await backend.saveProfile({ onboarding_step: n });
  }
  const next = () => void go(step + 1);

  async function finish() {
    setFinishing(true);
    await backend.saveProfile({ onboarding_complete: true, onboarding_step: 99 });
    await refresh();
    nav('/discover', { replace: true });
  }

  const s = STEPS[step];
  const body = {
    basics: <BasicsForm onDone={next} />,
    identity: <IdentityForm onDone={next} />,
    photos: <PhotoManager onDone={next} />,
    verify: <LivenessCheck onDone={next} />,
    prompts: <PromptsEditor onDone={next} />,
    personality: <PersonalityQuiz onDone={next} />,
    love: <LoveQuiz onDone={next} />,
    lifestyle: <LifestyleForm onDone={next} />,
    messengers: <MessengersForm onDone={next} />,
    done: (
      <div className="text-center">
        <div className="animate-pop text-7xl">🎉</div>
        <p className="mt-4 text-[15px] text-muted">
          Your profile is live. You get {10} likes a day, so make them count: like a specific photo or prompt and add a
          comment.
        </p>
        <Button className="mt-8 w-full" onClick={finish} busy={finishing}>
          Start discovering
        </Button>
      </div>
    ),
  }[s.key];

  return (
    <div className="mx-auto min-h-full max-w-md px-5 pb-12 pt-4">
      <div className="flex items-center gap-2">
        <button
          onClick={() => step > 0 && go(step - 1)}
          disabled={step === 0}
          className="-ml-2 rounded-full p-2 text-plum-700 disabled:invisible"
          aria-label="Previous step"
        >
          <ChevronLeft />
        </button>
        <div className="flex flex-1 gap-1">
          {STEPS.slice(0, -1).map((x, i) => (
            <span key={x.key} className={`h-1.5 flex-1 rounded-full ${i < step ? 'bg-coral-400' : i === step ? 'bg-coral-200' : 'bg-plum-50'}`} />
          ))}
        </div>
      </div>
      <h1 className="mt-6 text-3xl font-semibold">{s.title}</h1>
      {s.sub && <p className="mt-1 text-[15px] text-muted">{s.sub}</p>}
      <div className="mt-6">{body}</div>
    </div>
  );
}
