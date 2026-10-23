import { useState } from 'react';
import { REPORT_REASONS } from '@linky/content';
import { useSession } from '../state/session';
import { Button, ErrorText, Sheet } from './ui';

/** Report and/or block, available on every profile and note (store requirement). */
export function SafetySheet({
  open,
  onClose,
  targetId,
  targetName,
  noteId,
  onBlocked,
}: {
  open: boolean;
  onClose: () => void;
  targetId: string;
  targetName: string;
  noteId?: string;
  onBlocked?: () => void;
}) {
  const { backend } = useSession();
  const [reason, setReason] = useState<string | null>(null);
  const [details, setDetails] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(true);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      if (reason) await backend.report(targetId, reason, details, noteId);
      if (alsoBlock || !reason) {
        await backend.block(targetId);
        setBlocked(true);
      }
      setDone(reason ? 'Thanks. Our moderators will review your report.' : `${targetName} is blocked.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function close() {
    setDone(null);
    setReason(null);
    setDetails('');
    onClose();
    // Tell the parent only after the confirmation was seen, so it can move on.
    if (blocked) {
      setBlocked(false);
      onBlocked?.();
    }
  }

  return (
    <Sheet open={open} onClose={close} title={done ? 'Done' : noteId ? 'Report this note' : `Report or block ${targetName}`}>
      {done ? (
        <div>
          <p className="text-[15px]">{done}</p>
          <Button className="mt-5 w-full" onClick={close}>
            Close
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="space-y-1.5">
            {REPORT_REASONS.map((r) => (
              <label key={r} className="flex items-center gap-3 rounded-xl px-2 py-2 font-normal text-ink hover:bg-plum-50">
                <input type="radio" name="reason" checked={reason === r} onChange={() => setReason(r)} />
                {r}
              </label>
            ))}
          </div>
          {reason && (
            <textarea
              className="min-h-20"
              placeholder="Anything else we should know? (optional)"
              value={details}
              maxLength={1000}
              onChange={(e) => setDetails(e.target.value)}
            />
          )}
          <label className="flex items-center gap-3 px-2 font-normal text-ink">
            <input type="checkbox" checked={alsoBlock} onChange={(e) => setAlsoBlock(e.target.checked)} />
            Also block {targetName} (you won’t see each other again)
          </label>
          <ErrorText>{error}</ErrorText>
          <Button className="w-full" variant={reason ? 'primary' : 'danger'} busy={busy} disabled={!reason && !alsoBlock} onClick={submit}>
            {reason ? 'Send report' : `Block ${targetName}`}
          </Button>
        </div>
      )}
    </Sheet>
  );
}
