import { useState } from 'react';
import { KINK_TAGS, KINK_VISIBILITY } from '@linky/content';
import type { Kinks } from '@linky/matching';
import { useMe, useSession } from '../../state/session';
import { Button, Chip, Toggle } from '../ui';

/** Opt-in, 18+ section. Off by default; nothing is shown or filtered until opted in. */
export function KinksForm({ onSaved }: { onSaved?: () => void }) {
  const { backend, refresh } = useSession();
  const me = useMe();
  const [k, setK] = useState<Kinks>(me.kinks);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save(next: Kinks = k) {
    setBusy(true);
    await backend.saveKinks(next);
    await refresh();
    setBusy(false);
    setSaved(true);
    onSaved?.();
  }

  const toggleTag = (t: string) =>
    setK((x) => ({ ...x, tags: x.tags.includes(t) ? x.tags.filter((y) => y !== t) : [...x.tags, t] }));

  return (
    <section className="rounded-3xl bg-surface p-4 shadow-sm ring-1 ring-plum-100/60">
      <h3 className="text-lg font-semibold">Kinks &amp; BDSM <span className="text-xs font-normal text-muted">(optional, 18+)</span></h3>
      <Toggle
        checked={k.opted_in}
        onChange={(v) => {
          const next = { ...k, opted_in: v, ...(v ? {} : { filter_shared: false }) };
          setK(next);
          if (!v) void save(next);
        }}
        label="Opt in to this section"
        hint="Off by default. Until you opt in, you won’t see anyone’s tags and yours aren’t used."
      />
      {k.opted_in && (
        <div className="space-y-3 pt-2">
          <div className="flex flex-wrap gap-1.5">
            {KINK_TAGS.map((t) => (
              <Chip key={t} small selected={k.tags.includes(t)} onClick={() => toggleTag(t)}>
                {t}
              </Chip>
            ))}
          </div>
          <div>
            <p className="text-sm font-medium text-plum-700">Who can see my tags</p>
            <div className="mt-1 space-y-1">
              {KINK_VISIBILITY.map((v) => (
                <label key={v.value} className="flex items-start gap-2 rounded-xl px-2 py-1.5 font-normal hover:bg-plum-50">
                  <input type="radio" name="kv" className="mt-1" checked={k.visibility_level === v.value} onChange={() => setK({ ...k, visibility_level: v.value })} />
                  <span>
                    <span className="block text-sm font-medium text-ink">{v.label}</span>
                    <span className="block text-xs text-muted">{v.help}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
          <Toggle
            checked={Boolean(k.filter_shared)}
            onChange={(v) => setK({ ...k, filter_shared: v })}
            label="Only show me people who share a tag"
            hint="Only matches people who opted in and share their tags before matching (opted-in or public)."
          />
          <Button variant="secondary" className="w-full" busy={busy} onClick={() => save()}>
            {saved ? 'Saved ✓' : 'Save kink preferences'}
          </Button>
        </div>
      )}
    </section>
  );
}
