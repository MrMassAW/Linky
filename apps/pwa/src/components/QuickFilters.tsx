import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ATTRIBUTE_LABELS, OPTION_LABELS } from '@linky/content';
import type { AttributeKey, Attributes, Preferences, SeekingBucket } from '@linky/matching';
import { useMe, useSession } from '../state/session';

/** Lifestyle answers that can be flipped into a dealbreaker from Discover, most decisive first. */
const KEYS: AttributeKey[] = ['goal', 'kids_want', 'kids_have', 'religion', 'smoking', 'drinking', 'cannabis', 'pets', 'politics', 'languages'];
/** Answers that read oddly alone ("Never") get their question in front. */
const PREFIXED = new Set<AttributeKey>(['drinking', 'cannabis', 'smoking', 'religion', 'politics']);
const DISTANCES: (number | null)[] = [10, 25, 50, 100, null];
const GENDERS: [SeekingBucket, string][] = [
  ['women', 'Women'],
  ['men', 'Men'],
  ['nonbinary', 'Nonbinary'],
];
export const STRONG_MATCH = 80;

/** Filters that only change what the map shows; nothing is saved to the profile. */
export interface ViewFilters {
  verified: boolean;
  strong: boolean;
  hidePassed: boolean;
}
export const NO_VIEW_FILTERS: ViewFilters = { verified: false, strong: false, hidePassed: false };

const asList = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : v == null || v === '' ? [] : [String(v)]);

function chipLabel(k: AttributeKey, value: unknown) {
  if (k === 'languages') return 'Speaks my language';
  const text = asList(value)
    .map((v) => OPTION_LABELS[k]?.[v] ?? v)
    .join(' or ');
  return PREFIXED.has(k) ? `${ATTRIBUTE_LABELS[k] ?? k}: ${text}` : text;
}

const kmLabel = (km: number | null) => (km === null ? 'ANYWHERE' : `≤${km} KM`);

function Pix({
  on,
  onClick,
  disabled,
  label,
  children,
}: {
  on?: boolean;
  onClick: () => void;
  disabled?: boolean;
  label?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="px-frame shrink-0 whitespace-nowrap px-2 text-lg leading-6 transition-colors active:translate-y-px disabled:opacity-60"
      style={{
        ['--pf' as string]: on ? '#ffe49a' : '#5b3a8a',
        background: on ? '#ffe49a' : '#1a1033',
        color: on ? '#0c0720' : '#e3d6ff',
      }}
    >
      {children}
    </button>
  );
}

/**
 * Filters drawn inside the space card. The top row toggles the common ones in one tap; FILTERS opens
 * a panel with the rest. Profile filters are the same mutual settings as the Filters screen.
 */
export function QuickFilters({
  view,
  onView,
  onChanged,
  inline = false,
}: {
  /** Laid out in the page (list view) instead of floating over the sky. */
  inline?: boolean;
  view: ViewFilters;
  onView: (v: ViewFilters) => void;
  onChanged: () => Promise<void>;
}) {
  const { backend, refresh } = useSession();
  const me = useMe();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const save = async (prefs: Preferences | null, attrs: Attributes | null) => {
    setBusy(true);
    try {
      if (prefs) await backend.savePreferences(prefs);
      if (attrs) await backend.saveAttributes(attrs);
      await refresh();
      await onChanged();
    } finally {
      setBusy(false);
    }
  };

  const prefs = me.preferences;
  const answered = KEYS.filter((k) => asList(me.attributes[k]?.value).length > 0);
  const nextKm = DISTANCES[(DISTANCES.indexOf(prefs.distance_km) + 1) % DISTANCES.length] ?? null;
  const flip = (k: AttributeKey): Attributes => ({
    ...me.attributes,
    [k]: { ...me.attributes[k]!, is_dealbreaker: !me.attributes[k]!.is_dealbreaker },
  });
  const active =
    answered.filter((k) => me.attributes[k]?.is_dealbreaker).length + Object.values(view).filter(Boolean).length;

  return (
    <div className={inline ? 'relative p-3' : 'absolute inset-x-3 top-3 z-20'} onPointerDown={(e) => e.stopPropagation()}>
      <div
        role="group"
        aria-label="Quick filters"
        className="flex max-h-[166px] touch-pan-y flex-wrap gap-x-3 gap-y-2.5 overflow-y-auto p-[3px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <Pix on={open} onClick={() => setOpen(!open)} label="All filters">
          <span className="font-pixel text-[9px]">FILTERS{active ? ` ${active}` : ''}</span>
        </Pix>
        <Pix
          on={prefs.distance_km !== null}
          disabled={busy}
          label={`Distance: ${kmLabel(prefs.distance_km)}, tap for ${kmLabel(nextKm)}`}
          onClick={() => void save({ ...prefs, distance_km: nextKm }, null)}
        >
          {kmLabel(prefs.distance_km)}
        </Pix>
        <Pix on onClick={() => setOpen(true)} label="Age range">
          AGE {prefs.age_min}-{prefs.age_max}
        </Pix>
        <Pix on={view.verified} onClick={() => onView({ ...view, verified: !view.verified })}>
          ✓ VERIFIED
        </Pix>
        <Pix on={view.strong} onClick={() => onView({ ...view, strong: !view.strong })}>
          ★ {STRONG_MATCH}%+
        </Pix>
        {answered.map((k) => (
          <Pix key={k} on={Boolean(me.attributes[k]?.is_dealbreaker)} disabled={busy} onClick={() => void save(null, flip(k))}>
            {chipLabel(k, me.attributes[k]?.value)}
          </Pix>
        ))}
      </div>
      {open && (
        <FilterPanel
          key={JSON.stringify(prefs)}
          busy={busy}
          view={view}
          answered={answered}
          onClose={() => setOpen(false)}
          onApply={async (p, a, v) => {
            onView(v);
            const prefsChanged = JSON.stringify(p) !== JSON.stringify(prefs);
            const attrsChanged = JSON.stringify(a) !== JSON.stringify(me.attributes);
            if (prefsChanged || attrsChanged) await save(prefsChanged ? p : null, attrsChanged ? a : null);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="font-pixel text-[9px] leading-4 text-[#9d8fc0]">{title}</h3>
      <div className="mt-2 flex flex-wrap gap-3 p-[3px]">{children}</div>
    </section>
  );
}

function FilterPanel({
  busy,
  view,
  answered,
  onClose,
  onApply,
}: {
  busy: boolean;
  view: ViewFilters;
  answered: AttributeKey[];
  onClose: () => void;
  onApply: (p: Preferences, a: Attributes, v: ViewFilters) => Promise<void>;
}) {
  const me = useMe();
  const [p, setP] = useState<Preferences>(me.preferences);
  const [a, setA] = useState<Attributes>(me.attributes);
  const [v, setV] = useState<ViewFilters>(view);
  const age = (k: 'age_min' | 'age_max', d: number) =>
    setP((x) => {
      const n = Math.max(18, Math.min(99, x[k] + d));
      return k === 'age_min' ? { ...x, age_min: Math.min(n, x.age_max) } : { ...x, age_max: Math.max(n, x.age_min) };
    });
  const gender = (g: SeekingBucket) =>
    setP((x) => {
      const has = x.genders_wanted.includes(g);
      // At least one has to stay on, or nobody would ever show up.
      if (has && x.genders_wanted.length === 1) return x;
      return { ...x, genders_wanted: has ? x.genders_wanted.filter((y) => y !== g) : [...x.genders_wanted, g] };
    });
  const Step = ({ k, label }: { k: 'age_min' | 'age_max'; label: string }) => (
    <div className="flex items-center gap-2">
      <Pix onClick={() => age(k, -1)} label={`${label} down`}>
        -
      </Pix>
      <span className="w-16 text-center text-xl leading-6" aria-live="polite">
        {label} {p[k]}
      </span>
      <Pix onClick={() => age(k, 1)} label={`${label} up`}>
        +
      </Pix>
    </div>
  );

  return (
    <div
      role="dialog"
      aria-label="Filters"
      className="animate-fade-in px-frame mt-3 flex max-h-[min(70vh,520px)] flex-col gap-4 overflow-y-auto bg-[#120a26] p-4"
      style={{ ['--pf' as string]: '#8e4fa6' }}
    >
      <Section title="AGE">
        <Step k="age_min" label="from" />
        <Step k="age_max" label="to" />
      </Section>
      <Section title="DISTANCE">
        {DISTANCES.map((km) => (
          <Pix key={String(km)} on={p.distance_km === km} onClick={() => setP({ ...p, distance_km: km })}>
            {kmLabel(km)}
          </Pix>
        ))}
      </Section>
      <Section title="SHOW ME">
        {GENDERS.map(([g, label]) => (
          <Pix key={g} on={p.genders_wanted.includes(g)} onClick={() => gender(g)}>
            {label}
          </Pix>
        ))}
      </Section>
      <Section title="ON THE MAP">
        <Pix on={v.verified} onClick={() => setV({ ...v, verified: !v.verified })}>
          ✓ Verified only
        </Pix>
        <Pix on={v.strong} onClick={() => setV({ ...v, strong: !v.strong })}>
          ★ {STRONG_MATCH}%+ matches
        </Pix>
        <Pix on={v.hidePassed} onClick={() => setV({ ...v, hidePassed: !v.hidePassed })}>
          Hide passes
        </Pix>
      </Section>
      {answered.length > 0 && (
        <Section title="MUST MATCH ME">
          {answered.map((k) => (
            <Pix
              key={k}
              on={Boolean(a[k]?.is_dealbreaker)}
              onClick={() => setA({ ...a, [k]: { ...a[k]!, is_dealbreaker: !a[k]!.is_dealbreaker } })}
            >
              {chipLabel(k, a[k]?.value)}
            </Pix>
          ))}
        </Section>
      )}
      <p className="text-lg leading-5 text-[#9d8fc0]">
        Must-match filters work both ways: you won’t see them and they won’t see you.{' '}
        <Link to="/me/filters" className="text-[#ffe49a] underline">
          More settings
        </Link>
      </p>
      <div className="flex gap-3 p-[3px]">
        <Pix onClick={onClose}>CANCEL</Pix>
        <Pix on disabled={busy} onClick={() => void onApply(p, a, v)}>
          APPLY
        </Pix>
      </div>
    </div>
  );
}
