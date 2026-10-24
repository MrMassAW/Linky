import { useState } from 'react';
import { ATTRIBUTE_LABELS, INTERESTS, LANGUAGES, OPTION_LABELS } from '@linky/content';
import type { AttributeKey, AttributeSetting, Attributes, Preferences } from '@linky/matching';
import { useMe, useSession } from '../../state/session';
import { Button, Chip, ErrorText, Toggle } from '../ui';

const SINGLE: AttributeKey[] = ['goal', 'drinking', 'cannabis', 'smoking', 'pets', 'kids_have', 'kids_want', 'religion', 'politics'];
const OPTIONAL = new Set<AttributeKey>(['religion', 'politics']);
/** Questions where more than one answer can be true at once. */
const MULTI = new Set<AttributeKey>(['goal']);

const blank = (): AttributeSetting => ({ value: null, visible: true, is_dealbreaker: false });

export function LifestyleForm({
  onDone,
  cta = 'Continue',
  showPreferences = true,
}: {
  onDone: () => void;
  cta?: string;
  showPreferences?: boolean;
}) {
  const { backend, refresh } = useSession();
  const me = useMe();
  const [attrs, setAttrs] = useState<Attributes>(me.attributes);
  const [prefs, setPrefs] = useState<Preferences>(me.preferences);
  const [height, setHeight] = useState(me.height_cm ? String(me.height_cm) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const get = (k: AttributeKey) => attrs[k] ?? blank();
  const put = (k: AttributeKey, patch: Partial<AttributeSetting>) =>
    setAttrs((a) => ({ ...a, [k]: { ...(a[k] ?? blank()), ...patch } }));

  async function save() {
    if (prefs.age_min > prefs.age_max) return setError('Minimum age must be below maximum age.');
    const h = height ? Number(height) : null;
    if (h !== null && (h < 90 || h > 250)) return setError('Height should be in centimetres (90–250).');
    setBusy(true);
    setError(null);
    try {
      await backend.saveAttributes(attrs);
      if (h !== me.height_cm) await backend.saveProfile({ height_cm: h });
      if (showPreferences) await backend.savePreferences(prefs);
      await refresh();
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      {showPreferences && (
        <PreferenceFields prefs={prefs} onChange={setPrefs} />
      )}

      <div>
        <label htmlFor="height">Height in cm (optional)</label>
        <input id="height" inputMode="numeric" value={height} onChange={(e) => setHeight(e.target.value.replace(/\D/g, '').slice(0, 3))} placeholder="170" />
      </div>

      {SINGLE.map((k) => (
        <AttributeField key={k} k={k} s={get(k)} onChange={(p) => put(k, p)} optional={OPTIONAL.has(k)} multi={MULTI.has(k)} />
      ))}

      <MultiField
        k="languages"
        options={LANGUAGES}
        s={get('languages')}
        onChange={(p) => put('languages', p)}
        dealbreakerHint="Only show people who speak at least one of my languages"
      />
      <MultiField k="interests" options={INTERESTS} s={get('interests')} onChange={(p) => put('interests', p)} />

      <ErrorText>{error}</ErrorText>
      <Button className="w-full" onClick={save} busy={busy}>
        {cta}
      </Button>
    </div>
  );
}

export function PreferenceFields({ prefs, onChange }: { prefs: Preferences; onChange: (p: Preferences) => void }) {
  const anywhere = prefs.distance_km === null;
  return (
    <section className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-plum-100/60">
      <h3 className="text-lg font-semibold">Who I’m looking for</h3>
      <div className="mt-3">
        <label>
          Age: {prefs.age_min}–{prefs.age_max}
        </label>
        <div className="mt-1 flex items-center gap-3">
          <input
            type="range" min={18} max={99} value={prefs.age_min} aria-label="Minimum age"
            onChange={(e) => onChange({ ...prefs, age_min: Math.min(Number(e.target.value), prefs.age_max) })}
          />
          <input
            type="range" min={18} max={99} value={prefs.age_max} aria-label="Maximum age"
            onChange={(e) => onChange({ ...prefs, age_max: Math.max(Number(e.target.value), prefs.age_min) })}
          />
        </div>
      </div>
      <div className="mt-3">
        <label>Distance: {anywhere ? 'Anywhere' : `up to ${prefs.distance_km} km`}</label>
        <input
          type="range" min={1} max={200} disabled={anywhere} value={prefs.distance_km ?? 200} aria-label="Maximum distance"
          onChange={(e) => onChange({ ...prefs, distance_km: Number(e.target.value) })}
        />
        <Toggle checked={anywhere} onChange={(v) => onChange({ ...prefs, distance_km: v ? null : 50 })} label="Anywhere" />
      </div>
    </section>
  );
}

function AttributeField({
  k,
  s,
  onChange,
  optional,
  multi,
}: {
  k: AttributeKey;
  s: AttributeSetting;
  onChange: (p: Partial<AttributeSetting>) => void;
  optional?: boolean;
  multi?: boolean;
}) {
  const options = OPTION_LABELS[k];
  const values = Array.isArray(s.value) ? s.value : typeof s.value === 'string' ? [s.value] : [];
  const accept = s.accept ?? values;
  const pick = (v: string) => {
    if (multi) {
      const next = values.includes(v) ? values.filter((x) => x !== v) : [...values, v];
      return onChange({ value: next.length ? next : null });
    }
    onChange({ value: values.includes(v) ? null : v });
  };
  return (
    <section className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-plum-100/60">
      <h3 className="text-base font-semibold">
        {ATTRIBUTE_LABELS[k]} {optional && <span className="text-xs font-normal text-muted">(optional)</span>}
        {multi && <span className="text-xs font-normal text-muted"> (pick all that apply)</span>}
      </h3>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {Object.entries(options).map(([v, label]) => (
          <Chip key={v} small selected={values.includes(v)} onClick={() => pick(v)}>
            {label}
          </Chip>
        ))}
      </div>
      <div className="mt-2 border-t border-plum-50 pt-1">
        <Toggle checked={s.visible} onChange={(v) => onChange({ visible: v })} label="Show on profile" />
        <Toggle
          checked={s.is_dealbreaker}
          onChange={(v) => onChange({ is_dealbreaker: v, accept: v ? accept : undefined })}
          label="Dealbreaker"
          hint="Only show people whose answer is one of the ones you pick. People who skipped this are hidden too."
        />
        {s.is_dealbreaker && (
          <div className="flex flex-wrap gap-1.5 pb-1">
            {Object.entries(options).map(([v, label]) => (
              <Chip
                key={v}
                small
                selected={accept.includes(v)}
                onClick={() => onChange({ accept: accept.includes(v) ? accept.filter((x) => x !== v) : [...accept, v] })}
              >
                {label}
              </Chip>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function MultiField({
  k,
  options,
  s,
  onChange,
  dealbreakerHint,
}: {
  k: AttributeKey;
  options: string[];
  s: AttributeSetting;
  onChange: (p: Partial<AttributeSetting>) => void;
  dealbreakerHint?: string;
}) {
  const value = Array.isArray(s.value) ? s.value : [];
  const toggle = (o: string) => onChange({ value: value.includes(o) ? value.filter((x) => x !== o) : [...value, o] });
  return (
    <section className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-plum-100/60">
      <h3 className="text-base font-semibold">{ATTRIBUTE_LABELS[k]}</h3>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {options.map((o) => (
          <Chip key={o} small selected={value.includes(o)} onClick={() => toggle(o)}>
            {o}
          </Chip>
        ))}
      </div>
      <div className="mt-2 border-t border-plum-50 pt-1">
        <Toggle checked={s.visible} onChange={(v) => onChange({ visible: v })} label="Show on profile" />
        {dealbreakerHint && (
          <Toggle checked={s.is_dealbreaker} onChange={(v) => onChange({ is_dealbreaker: v, accept: undefined })} label="Dealbreaker" hint={dealbreakerHint} />
        )}
      </div>
    </section>
  );
}
