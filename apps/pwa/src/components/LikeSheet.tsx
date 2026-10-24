import { useState } from 'react';
import { LIKE_COMMENT_MAX } from '../lib/backend';
import { Button, ErrorText, HeartIcon, Sheet } from './ui';
import type { LikeTarget } from './ProfileCard';

export function LikeSheet({
  target,
  name,
  onClose,
  onSend,
  remaining,
}: {
  target: LikeTarget | null;
  name: string;
  onClose: () => void;
  onSend: (comment: string) => Promise<void>;
  remaining: number | null;
}) {
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      await onSend(comment);
      setComment('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={Boolean(target)} onClose={onClose} title={`Like ${name}`}>
      {target && (
        <div className="space-y-3">
          {target.preview.url ? (
            <img src={target.preview.url} alt="" className="h-40 w-32 rounded-2xl object-cover" />
          ) : (
            <div className="rounded-2xl bg-plum-50 p-4">
              <p className="text-xs font-semibold text-plum-700">{target.preview.prompt}</p>
              <p className="mt-1 font-display text-lg">{target.preview.answer}</p>
            </div>
          )}
          <textarea
            className="min-h-20"
            placeholder="Add a comment (optional, but it really helps)"
            maxLength={LIKE_COMMENT_MAX}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            aria-label="Comment"
          />
          <ErrorText>{error}</ErrorText>
          <Button className="w-full" busy={busy} onClick={send} disabled={remaining === 0}>
            <HeartIcon filled /> Send like
          </Button>
          {remaining !== null && (
            <p className="text-center text-xs text-muted">
              {remaining === 0 ? 'No likes left today. They reset at midnight.' : `${remaining} like${remaining === 1 ? '' : 's'} left today`}
            </p>
          )}
        </div>
      )}
    </Sheet>
  );
}
