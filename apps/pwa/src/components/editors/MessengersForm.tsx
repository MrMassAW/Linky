import { useState } from 'react';
import { MESSENGERS, type MessengerApp } from '@linky/content';
import type { Handle } from '../../lib/types';
import { useMe, useSession } from '../../state/session';
import { Button, ErrorText } from '../ui';

export function MessengersForm({ onDone, cta = 'Continue' }: { onDone: () => void; cta?: string }) {
  const { backend, refresh } = useSession();
  const me = useMe();
  const [values, setValues] = useState<Record<MessengerApp, string>>(
    () => Object.fromEntries(MESSENGERS.map((m) => [m.app, me.handles.find((h) => h.app === m.app)?.handle ?? ''])) as Record<MessengerApp, string>,
  );
  const [preferred, setPreferred] = useState<MessengerApp | null>(me.handles.find((h) => h.preferred)?.app ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const handles: Handle[] = MESSENGERS.filter((m) => values[m.app].trim()).map((m) => ({
      app: m.app,
      handle: values[m.app].trim(),
      preferred: false,
    }));
    // Optional: people without (or not wanting to share) a messenger keep talking with notes in Linky.
    const pref = handles.find((h) => h.app === preferred) ?? handles[0];
    if (pref) pref.preferred = true;
    setBusy(true);
    setError(null);
    try {
      await backend.saveHandles(handles);
      await refresh();
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        You can always message your matches with notes here in Linky. If you’d rather move to a messenger, add it
        below: when you and a match both tap <b>Connect</b>, you’ll see each other’s handles. Handles are never
        public. This step is optional.
      </p>
      {MESSENGERS.map((m) => (
        <div key={m.app} className="rounded-2xl bg-surface p-3 shadow-sm ring-1 ring-plum-100/60">
          <div className="flex items-center justify-between">
            <label htmlFor={`h-${m.app}`}>{m.label}</label>
            <label className="flex items-center gap-1.5 text-xs font-normal text-muted">
              <input type="radio" name="preferred" checked={preferred === m.app} onChange={() => setPreferred(m.app)} disabled={!values[m.app].trim()} />
              Preferred
            </label>
          </div>
          <input
            id={`h-${m.app}`}
            className="mt-1"
            placeholder={m.placeholder}
            value={values[m.app]}
            onChange={(e) => setValues((v) => ({ ...v, [m.app]: e.target.value }))}
            maxLength={64}
          />
        </div>
      ))}
      <ErrorText>{error}</ErrorText>
      <Button className="w-full" onClick={save} busy={busy}>
        {MESSENGERS.some((m) => values[m.app].trim()) ? cta : 'Skip, I’ll use notes in Linky'}
      </Button>
    </div>
  );
}
