import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BasicsForm } from '../components/editors/BasicsForm';
import { IdentityForm } from '../components/editors/IdentityForm';
import { MessengersForm } from '../components/editors/MessengersForm';
import { PhotoManager } from '../components/editors/PhotoManager';
import { PromptsEditor } from '../components/editors/PromptsEditor';
import { Header } from '../components/ui';

export default function ProfileEditor() {
  const [open, setOpen] = useState<string | null>('photos');
  const [saved, setSaved] = useState<string | null>(null);
  const done = (key: string) => () => {
    setSaved(key);
    setOpen(null);
    setTimeout(() => setSaved(null), 2000);
  };

  const Section = ({ id, title, children }: { id: string; title: string; children: ReactNode }) => (
    <section className="rounded-3xl bg-white shadow-sm ring-1 ring-plum-100/60">
      <button onClick={() => setOpen(open === id ? null : id)} className="flex w-full items-center justify-between p-4 text-left">
        <span className="text-lg font-semibold">{title}</span>
        <span className="text-sm text-muted">{saved === id ? 'Saved ✓' : open === id ? '▲' : '▼'}</span>
      </button>
      {open === id && <div className="border-t border-plum-50 p-4">{children}</div>}
    </section>
  );

  return (
    <div className="mx-auto max-w-md pb-12">
      <Header title="Edit profile" back="/me" />
      <div className="space-y-3 px-4">
        <Section id="photos" title="Photos">
          <PhotoManager />
        </Section>
        <Section id="prompts" title="Prompts">
          <PromptsEditor onDone={done('prompts')} cta="Save prompts" />
        </Section>
        <Section id="basics" title="Basics">
          <BasicsForm onDone={done('basics')} cta="Save" />
        </Section>
        <Section id="identity" title="Gender, pronouns & orientation">
          <IdentityForm onDone={done('identity')} cta="Save" />
        </Section>
        <Section id="messengers" title="Messenger handles">
          <MessengersForm onDone={done('messengers')} cta="Save" />
        </Section>
        <div className="grid grid-cols-2 gap-2">
          <Link to="/me/quiz/personality" className="rounded-2xl bg-plum-50 p-4 text-center text-sm font-semibold text-plum-700">
            Retake personality quiz
          </Link>
          <Link to="/me/quiz/love" className="rounded-2xl bg-coral-50 p-4 text-center text-sm font-semibold text-coral-600">
            Retake love-language quiz
          </Link>
        </div>
        <Link to="/me/filters" className="block rounded-2xl bg-white p-4 text-center text-sm font-semibold text-plum-700 shadow-sm">
          Lifestyle answers & visibility →
        </Link>
      </div>
    </div>
  );
}
