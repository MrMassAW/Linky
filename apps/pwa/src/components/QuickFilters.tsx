import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ATTRIBUTE_LABELS, OPTION_LABELS } from '@linky/content';
import type { AttributeKey, Attributes } from '@linky/matching';
import { useMe, useSession } from '../state/session';

/** Lifestyle answers that can be flipped into a dealbreaker from Discover, most decisive first. */
const KEYS: AttributeKey[] = ['goal', 'kids_want', 'kids_have', 'religion', 'smoking', 'drinking', 'cannabis', 'pets', 'politics', 'languages'];
/** Answers that read oddly alone ("Never") get their question in front. */
const PREFIXED = new Set<AttributeKey>(['drinking', 'cannabis', 'smoking', 'religion', 'politics']);
const DISTANCE_KEY = 'linky-last-distance';
const DEFAULT_KM = 50;

const asList = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : v == null || v === '' ? [] : [String(v)]);

function chipLabel(k: AttributeKey, value: unknown) {
  if (k === 'languages') return 'Speaks my language';
  const text = asList(value)
    .map((v) => OPTION_LABELS[k]?.[v] ?? v)
    .join(' or ');
  return PREFIXED.has(k) ? `${ATTRIBUTE_LABELS[k] ?? k}: ${text}` : text;
}

function lastDistance() {
  try {
    return Number(localStorage.getItem(DISTANCE_KEY)) || DEFAULT_KM;
  } catch {
    return DEFAULT_KM;
  }
}

/**
 * A row of one-tap filters above Discover. Each chip turns one of my answers into a dealbreaker
 * (or back), using the same settings as the Filters screen, then reloads the feed.
 */
export function QuickFilters({ onChanged }: { onChanged: () => Promise<void> }) {
  const { backend, refresh } = useSession();
  const me = useMe();
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (key: string, save: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await save();
      await refresh();
      await onChanged();
    } finally {
      setBusy(null);
    }
  };

  const km = me.preferences.distance_km;
  const toggleDistance = () =>
    run('distance', () => {
      if (km !== null) {
        try {
          localStorage.setItem(DISTANCE_KEY, String(km));
        } catch {
          /* not remembered; falls back to the default */
        }
      }
      return backend.savePreferences({ ...me.preferences, distance_km: km === null ? lastDistance() : null });
    });

  const answered = KEYS.filter((k) => asList(me.attributes[k]?.value).length > 0);
  const toggle = (k: AttributeKey) =>
    run(k, () => {
      const s = me.attributes[k]!;
      const next: Attributes = { ...me.attributes, [k]: { ...s, is_dealbreaker: !s.is_dealbreaker } };
      return backend.saveAttributes(next);
    });

  const chip = (on: boolean) =>
    `shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-60 ${
      on ? 'border-plum-700 bg-plum-700 text-white' : 'border-plum-100 bg-white text-plum-700'
    }`;

  return (
    <div
      role="group"
      aria-label="Quick filters"
      className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <button type="button" aria-pressed={km !== null} disabled={busy !== null} onClick={toggleDistance} className={chip(km !== null)}>
        Within {km ?? lastDistance()} km
      </button>
      {answered.map((k) => {
        const on = Boolean(me.attributes[k]?.is_dealbreaker);
        return (
          <button
            key={k}
            type="button"
            aria-pressed={on}
            disabled={busy !== null}
            onClick={() => void toggle(k)}
            className={chip(on)}
          >
            {on && '✓ '}
            {chipLabel(k, me.attributes[k]?.value)}
          </button>
        );
      })}
      <Link to="/me/filters" className={`${chip(false)} border-dashed`}>
        All filters…
      </Link>
    </div>
  );
}
