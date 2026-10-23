import { useEffect, useState } from 'react';
import { ATTRIBUTE_LABELS } from '@linky/content';
import type { FeedExplanation } from '../lib/backend';
import { useSession } from '../state/session';

const REASONS: Record<string, string> = {
  gender: 'aren’t who you want to see, or don’t want to see someone like you',
  age: 'are outside your age range, or you’re outside theirs',
  distance: 'are farther than your distance limit or theirs',
  kinks: 'are hidden by the shared-kinks filter',
};

function reasonLabel(key: string) {
  if (key.startsWith('dealbreaker:')) {
    const attr = key.slice('dealbreaker:'.length);
    return `are ruled out by a dealbreaker on ${(ATTRIBUTE_LABELS[attr] ?? attr).toLowerCase()} (yours or theirs; an unanswered question counts as a mismatch)`;
  }
  return REASONS[key] ?? key;
}

/** Shown when Discover is empty: where everyone went, so filters can be widened knowingly. */
export function FeedExplainer() {
  const { backend } = useSession();
  const [x, setX] = useState<FeedExplanation | null>(null);
  useEffect(() => {
    void backend.explainFeed?.().then(setX).catch(() => setX(null));
  }, [backend]);
  if (!x || x.total === 0) return null;
  const rows = Object.entries(x.filtered).sort((a, b) => b[1] - a[1]);
  return (
    <div className="mx-auto mt-5 max-w-sm rounded-2xl bg-white p-4 text-left text-sm shadow-sm ring-1 ring-plum-100/60">
      <p className="font-semibold text-plum-700">Where everyone is ({x.total} people)</p>
      <ul className="mt-2 space-y-1.5 text-muted">
        {x.seen > 0 && (
          <li>
            <b className="tabular-nums text-ink">{x.seen}</b> you’ve already liked, skipped or matched
          </li>
        )}
        {rows.map(([k, n]) => (
          <li key={k}>
            <b className="tabular-nums text-ink">{n}</b> {reasonLabel(k)}
          </li>
        ))}
      </ul>
    </div>
  );
}
