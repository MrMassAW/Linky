import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { KinksForm } from '../components/editors/KinksForm';
import { LifestyleForm } from '../components/editors/LifestyleForm';
import { Header } from '../components/ui';

export default function Filters() {
  const nav = useNavigate();
  const [saved, setSaved] = useState(false);
  return (
    <div className="mx-auto max-w-md pb-12">
      <Header title="Filters & visibility" back="/me" />
      <div className="space-y-4 px-4">
        <p className="text-sm text-muted">
          Every answer has three settings: the value, whether it’s shown on your profile, and whether it’s a
          dealbreaker. Dealbreakers work both ways: you won’t see them and they won’t see you.
        </p>
        <KinksForm />
        <LifestyleForm
          cta={saved ? 'Saved ✓' : 'Save filters'}
          onDone={() => {
            setSaved(true);
            setTimeout(() => nav('/discover'), 600);
          }}
        />
      </div>
    </div>
  );
}
