import { useState } from 'react';
import { GENDERS, ORIENTATIONS, PRONOUNS, SEEKING } from '@linky/content';
import type { Gender, SeekingBucket } from '@linky/matching';
import { Button, Chip, ErrorText, Toggle } from '../ui';
import { useMe, useSession } from '../../state/session';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function IdentityForm({ onDone, cta = 'Continue' }: { onDone: () => void; cta?: string }) {
  const { backend, refresh } = useSession();
  const me = useMe();
  const [gender, setGender] = useState<Gender | null>(me.name && me.onboarding_step > 1 ? me.gender : null);
  const [custom, setCustom] = useState(me.gender_custom ?? '');
  const [pronouns, setPronouns] = useState(me.pronouns ?? '');
  const [orientation, setOrientation] = useState(me.orientation ?? '');
  const [seeking, setSeeking] = useState<SeekingBucket[]>(me.preferences.genders_wanted);
  const [showGender, setShowGender] = useState(me.show_gender);
  const [showPronouns, setShowPronouns] = useState(me.show_pronouns);
  const [showOrientation, setShowOrientation] = useState(me.show_orientation);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!gender) return setError('Choose the gender that fits you best.');
    if (seeking.length === 0) return setError('Choose who you want to see.');
    setBusy(true);
    setError(null);
    try {
      await backend.saveProfile({
        gender,
        gender_custom: gender === 'other' ? custom.trim() || null : null,
        pronouns: pronouns || null,
        orientation: orientation || null,
        show_gender: showGender,
        show_pronouns: showPronouns,
        show_orientation: showOrientation,
      });
      await backend.savePreferences({ ...me.preferences, genders_wanted: seeking });
      await refresh();
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const toggleSeek = (v: SeekingBucket) =>
    setSeeking((s) => (s.includes(v) ? s.filter((x) => x !== v) : [...s, v]));

  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-2 text-lg font-semibold">I am</h3>
        <div className="flex flex-wrap gap-2">
          {GENDERS.map((g) => (
            <Chip key={g.value} selected={gender === g.value} onClick={() => setGender(g.value)}>
              {g.label}
            </Chip>
          ))}
        </div>
        {gender === 'other' && (
          <input className="mt-2" placeholder="Describe your gender (optional)" value={custom} onChange={(e) => setCustom(e.target.value)} maxLength={40} />
        )}
        <Toggle checked={showGender} onChange={setShowGender} label="Show my gender on my profile" />
      </section>

      <section>
        <h3 className="mb-2 text-lg font-semibold">Pronouns</h3>
        <div className="flex flex-wrap gap-2">
          {PRONOUNS.map((p) => (
            <Chip key={p} small selected={pronouns === p} onClick={() => setPronouns(pronouns === p ? '' : p)}>
              {p}
            </Chip>
          ))}
        </div>
        <Toggle checked={showPronouns} onChange={setShowPronouns} label="Show my pronouns" />
      </section>

      <section>
        <h3 className="mb-2 text-lg font-semibold">Orientation</h3>
        <div className="flex flex-wrap gap-2">
          {ORIENTATIONS.map((o) => (
            <Chip key={o} small selected={orientation === o} onClick={() => setOrientation(orientation === o ? '' : o)}>
              {cap(o)}
            </Chip>
          ))}
        </div>
        <Toggle checked={showOrientation} onChange={setShowOrientation} label="Show my orientation" />
      </section>

      <section>
        <h3 className="mb-1 text-lg font-semibold">Show me</h3>
        <p className="mb-2 text-xs text-muted">You’ll only see people who also want to see someone like you.</p>
        <div className="flex flex-wrap gap-2">
          {SEEKING.map((s) => (
            <Chip key={s.value} selected={seeking.includes(s.value)} onClick={() => toggleSeek(s.value)}>
              {s.label}
            </Chip>
          ))}
        </div>
      </section>

      <ErrorText>{error}</ErrorText>
      <Button className="w-full" onClick={save} busy={busy}>
        {cta}
      </Button>
    </div>
  );
}
