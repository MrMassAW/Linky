import type { ReactNode } from 'react';
import { ATTRIBUTE_LABELS, LOVE_LANGUAGE_EMOJI, LOVE_LANGUAGE_LABELS, OPTION_LABELS, TYPE_NICKNAMES } from '@linky/content';
import { LOVE_LANGUAGES, type CompatibilityBreakdown } from '@linky/matching';
import type { LikeTargetType, PublicProfile } from '../lib/types';
import { HeartIcon, Tag, VerifiedBadge } from './ui';

export interface LikeTarget {
  type: LikeTargetType;
  id: string;
  preview: { url?: string; prompt?: string; answer?: string };
}

const ATTR_EMOJI: Record<string, string> = {
  goal: '💞', drinking: '🍷', cannabis: '🌿', smoking: '🚬', pets: '🐾', kids_have: '👶', kids_want: '🍼',
  religion: '🕊️', politics: '🗳️',
};

function label(key: string, v: unknown): string {
  if (Array.isArray(v)) return v.join(', ');
  return OPTION_LABELS[key]?.[String(v)] ?? String(v);
}

export function CompatBadge({ c, large }: { c: CompatibilityBreakdown; large?: boolean }) {
  const parts = [
    ['Personality', c.personality],
    ['Love language', c.love_language],
    ['Lifestyle', c.lifestyle],
    ['Shared', c.shared],
  ].filter(([, v]) => v !== null) as [string, number][];
  return (
    <div className={`rounded-3xl bg-gradient-to-br from-coral-500 to-plum-500 text-white ${large ? 'p-5' : 'p-4'}`}>
      <div className="flex items-baseline gap-2">
        <span className="font-display text-4xl font-semibold">{c.total}%</span>
        <span className="text-sm opacity-90">compatible</span>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs opacity-95">
        {parts.map(([k, v]) => (
          <span key={k}>
            {k} {v}%
          </span>
        ))}
      </div>
    </div>
  );
}

export function ProfileCard({
  p,
  compat,
  onLike,
  liked,
  footer,
}: {
  p: PublicProfile;
  compat?: CompatibilityBreakdown | null;
  onLike?: (t: LikeTarget) => void;
  liked?: string | null;
  footer?: ReactNode;
}) {
  const photos = [...p.photos].sort((a, b) => a.position - b.position);
  const prompts = [...p.prompts].sort((a, b) => a.position - b.position);

  const photoBlock = (i: number) => {
    const ph = photos[i];
    if (!ph) return null;
    return (
      <div key={ph.id} className="relative overflow-hidden rounded-3xl bg-plum-50">
        <img src={ph.url} alt={`${p.name}, photo ${i + 1}`} className="aspect-[4/5] w-full object-cover" loading={i > 0 ? 'lazy' : 'eager'} />
        {onLike && (
          <LikeButton
            active={liked === ph.id}
            onClick={() => onLike({ type: 'photo', id: ph.id, preview: { url: ph.url } })}
            label={`Like ${p.name}'s photo ${i + 1}`}
          />
        )}
      </div>
    );
  };

  const promptBlock = (i: number) => {
    const pr = prompts[i];
    if (!pr) return null;
    return (
      <div key={pr.id} className="relative rounded-3xl bg-white px-5 pb-14 pt-5 shadow-sm ring-1 ring-plum-100/60">
        <p className="text-sm font-semibold text-plum-700">{pr.prompt}</p>
        <p className="mt-2 font-display text-[22px] leading-snug text-ink">{pr.answer}</p>
        {onLike && (
          <LikeButton
            active={liked === pr.id}
            onClick={() => onLike({ type: 'prompt', id: pr.id, preview: { prompt: pr.prompt, answer: pr.answer } })}
            label={`Like ${p.name}'s prompt: ${pr.prompt}`}
          />
        )}
      </div>
    );
  };

  const attrs = Object.entries(p.attributes).filter(([k]) => k !== 'interests' && k !== 'languages');
  const interests = (p.attributes.interests as string[] | undefined) ?? [];
  const languages = (p.attributes.languages as string[] | undefined) ?? [];

  const facts = (
    <div key="facts" className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-plum-100/60">
      <div className="flex flex-wrap gap-1.5">
        {p.gender && <Tag>{p.gender}</Tag>}
        {p.pronouns && <Tag>{p.pronouns}</Tag>}
        {p.orientation && <Tag>{p.orientation}</Tag>}
        {p.height_cm && <Tag>📏 {p.height_cm} cm</Tag>}
        {p.city && <Tag>📍 {p.city}</Tag>}
        {attrs.map(([k, v]) => (
          <Tag key={k}>
            {ATTR_EMOJI[k] ?? '•'} <span className="sr-only">{ATTRIBUTE_LABELS[k]}:</span> {label(k, v)}
          </Tag>
        ))}
      </div>
      {languages.length > 0 && <p className="mt-3 text-sm text-muted">🗣️ Speaks {languages.join(', ')}</p>}
      {interests.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {interests.map((i) => (
            <Tag key={i} tone="coral">
              {i}
            </Tag>
          ))}
        </div>
      )}
    </div>
  );

  const ll = p.love_language;
  const top = (v: number[]) => LOVE_LANGUAGES[v.indexOf(Math.max(...v))];
  const personality = (p.personality || ll) && (
    <div key="pers" className="grid grid-cols-2 gap-2">
      {p.personality && (
        <div className="rounded-3xl bg-plum-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-plum-500">Personality</p>
          <p className="mt-1 font-display text-3xl font-semibold text-plum-700">{p.personality.type}</p>
          <p className="text-xs text-plum-700">{TYPE_NICKNAMES[p.personality.type]}</p>
        </div>
      )}
      {ll && (
        <div className="rounded-3xl bg-coral-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-coral-600">Love language</p>
          <p className="mt-1 text-sm font-semibold text-ink">
            {LOVE_LANGUAGE_EMOJI[top(ll.receive)]} {LOVE_LANGUAGE_LABELS[top(ll.receive)]}
          </p>
          <p className="mt-1 text-xs text-muted">Gives: {LOVE_LANGUAGE_LABELS[top(ll.give)]}</p>
        </div>
      )}
    </div>
  );

  // Hinge-style interleaving of photos, prompts and facts.
  const blocks: ReactNode[] = [
    photoBlock(0),
    promptBlock(0),
    facts,
    photoBlock(1),
    personality,
    promptBlock(1),
    photoBlock(2),
    promptBlock(2),
    ...photos.slice(3).map((_, i) => photoBlock(i + 3)),
  ];

  return (
    <article className="space-y-3">
      <div className="flex items-end justify-between px-1">
        <div>
          <h2 className="flex items-center gap-1.5 text-3xl font-semibold">
            {p.name}
            {p.verified && <VerifiedBadge />}
          </h2>
          <p className="text-sm text-muted">
            {p.age}
            {p.distance && ` · ${p.distance}`}
          </p>
        </div>
      </div>
      {compat && <CompatBadge c={compat} />}
      {blocks}
      {p.kinks && p.kinks.length > 0 && (
        <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-plum-100/60">
          <p className="text-xs font-semibold uppercase tracking-wide text-plum-500">Into (18+)</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {p.kinks.map((k) => (
              <Tag key={k}>{k}</Tag>
            ))}
          </div>
        </div>
      )}
      {footer}
    </article>
  );
}

function LikeButton({ onClick, active, label }: { onClick: () => void; active?: boolean; label: string }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={`absolute bottom-3 right-3 flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition active:scale-90 ${
        active ? 'bg-coral-500 text-white' : 'bg-white text-coral-500'
      }`}
    >
      <HeartIcon filled={active} className="h-6 w-6" />
    </button>
  );
}
