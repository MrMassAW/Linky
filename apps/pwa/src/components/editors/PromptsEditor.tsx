import { useState } from 'react';
import { PROMPTS } from '@linky/content';
import { Button, ErrorText, Sheet } from '../ui';
import { useMe, useSession } from '../../state/session';

export const PROMPT_COUNT = 3;
const MAX_ANSWER = 300;

export function PromptsEditor({ onDone, cta = 'Continue' }: { onDone: () => void; cta?: string }) {
  const { backend, refresh } = useSession();
  const me = useMe();
  const initial = Array.from({ length: PROMPT_COUNT }, (_, i) => {
    const p = me.prompts.find((x) => x.position === i);
    return { prompt: p?.prompt ?? '', answer: p?.answer ?? '' };
  });
  const [items, setItems] = useState(initial);
  const [picking, setPicking] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (i: number, patch: Partial<(typeof items)[number]>) =>
    setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  async function save() {
    if (items.some((x) => !x.prompt || !x.answer.trim())) return setError('Pick and answer all 3 prompts.');
    setBusy(true);
    setError(null);
    try {
      await backend.savePrompts(items.map((x, i) => ({ prompt: x.prompt, answer: x.answer.trim(), position: i })));
      await refresh();
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const used = new Set(items.map((x) => x.prompt));

  return (
    <div className="space-y-4">
      {items.map((it, i) => (
        <div key={i} className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-plum-100/60">
          <button onClick={() => setPicking(i)} className="w-full text-left font-display text-lg font-semibold text-plum-700">
            {it.prompt || <span className="text-coral-500">+ Choose prompt {i + 1}</span>}
          </button>
          {it.prompt && (
            <>
              <textarea
                className="mt-2 min-h-20 resize-none"
                value={it.answer}
                maxLength={MAX_ANSWER}
                placeholder="Your answer…"
                onChange={(e) => set(i, { answer: e.target.value })}
                aria-label={`Answer to ${it.prompt}`}
              />
              <p className="mt-1 text-right text-xs text-muted">
                {it.answer.length}/{MAX_ANSWER}
              </p>
            </>
          )}
        </div>
      ))}
      <ErrorText>{error}</ErrorText>
      <Button className="w-full" onClick={save} busy={busy}>
        {cta}
      </Button>

      <Sheet open={picking !== null} onClose={() => setPicking(null)} title="Choose a prompt">
        <ul className="divide-y divide-plum-50">
          {PROMPTS.map((p) => (
            <li key={p}>
              <button
                disabled={used.has(p) && items[picking ?? 0]?.prompt !== p}
                onClick={() => {
                  set(picking!, { prompt: p });
                  setPicking(null);
                }}
                className="w-full py-3 text-left text-[15px] disabled:text-plum-100"
              >
                {p}
              </button>
            </li>
          ))}
        </ul>
      </Sheet>
    </div>
  );
}
