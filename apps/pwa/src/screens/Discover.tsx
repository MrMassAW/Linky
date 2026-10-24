import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { LikeSheet } from '../components/LikeSheet';
import { NO_VIEW_FILTERS, QuickFilters, STRONG_MATCH, type ViewFilters } from '../components/QuickFilters';
import { ProfileCard, type LikeTarget } from '../components/ProfileCard';
import { SafetySheet } from '../components/SafetySheet';
import { QuickCard, SpaceMap } from '../components/SpaceMap';
import { Button, ChevronLeft, ErrorText, FullPageSpinner, Logo, Sheet, XIcon } from '../components/ui';
import { sharedThings } from '../lib/sharedThings';
import type { FeedItem } from '../lib/types';

const VIEW_KEY = 'linky-discover-filters';

function savedView(): ViewFilters {
  try {
    // Only known keys, so a filter from an older build (like `verified`) is dropped.
    const saved = JSON.parse(localStorage.getItem(VIEW_KEY) ?? '{}') as Partial<ViewFilters>;
    return { strong: saved.strong === true, hidePassed: saved.hidePassed === true };
  } catch {
    return NO_VIEW_FILTERS;
  }
}

import { useLoader, useMe, useSession } from '../state/session';

export default function Discover() {
  const { backend, refresh } = useSession();
  const me = useMe();
  const nav = useNavigate();
  const feed = useLoader(() => backend.getFeed(), [backend]);
  // People only my own filters keep out; they float on the map, faded.
  const near = useLoader(() => backend.getNearMatches?.() ?? Promise.resolve([]), [backend]);
  const [view, setViewState] = useState<ViewFilters>(savedView);
  // People you liked or blocked leave the map; people you passed on stay, faded, for a day.
  const [done, setDone] = useState<Set<string>>(() => new Set());
  const [passedNow, setPassedNow] = useState<Record<string, string>>({});
  const [pickId, setPickId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [target, setTarget] = useState<LikeTarget | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [matched, setMatched] = useState<{ id: string; name: string; photo?: string } | null>(null);
  const [safety, setSafety] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void backend.likesRemaining().then(setRemaining);
  }, [backend]);

  const setView = (v: ViewFilters) => {
    setViewState(v);
    setPickId(null);
    try {
      localStorage.setItem(VIEW_KEY, JSON.stringify(v));
    } catch {
      /* not remembered */
    }
  };

  // Everyone on the map: matches in full, plus near matches (outside a map filter or one of
  // my profile filters) faded.
  const { items, nearIds } = useMemo(() => {
    const fits = (i: FeedItem) =>
      (!view.strong || i.compatibility.total >= STRONG_MATCH) &&
      (!view.hidePassed || !i.passed_at);
    const all = [...(feed.data ?? []), ...(near.data ?? [])]
      .filter((i) => !done.has(i.profile.id))
      .map((i) => (passedNow[i.profile.id] ? { ...i, passed_at: passedNow[i.profile.id] } : i))
      .filter((i) => !(view.hidePassed && i.passed_at));
    const nearSet = new Set((near.data ?? []).map((i) => i.profile.id));
    for (const i of all) if (!fits(i)) nearSet.add(i.profile.id);
    return { items: all, nearIds: nearSet };
  }, [feed.data, near.data, done, passedNow, view]);
  const shared = useMemo(
    () => Object.fromEntries(items.map((i) => [i.profile.id, sharedThings(me, i.profile)])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [feed.data, near.data, me],
  );
  const matchCount = items.length - nearIds.size;
  const item = items.find((i) => i.profile.id === (openId ?? pickId));
  const picked = items.find((i) => i.profile.id === pickId);
  const opened = items.find((i) => i.profile.id === openId);

  const reset = () => {
    setTarget(null);
    setOpenId(null);
    setPickId(null);
    document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const finish = (id: string) => {
    setDone((d) => new Set(d).add(id));
    reset();
  };

  async function skip(it: FeedItem | undefined = item) {
    if (!it) return;
    setError(null);
    await backend.skip(it.profile.id);
    setPassedNow((m) => ({ ...m, [it.profile.id]: new Date().toISOString() }));
    reset();
  }

  const askLike = (t: LikeTarget) =>
    remaining === 0 ? setError('You’ve used all your likes for today. They reset at midnight.') : setTarget(t);

  async function sendLike(comment: string) {
    if (!item || !target) return;
    const r = await backend.like(item.profile.id, target.type, target.id, comment);
    setRemaining(r.likes_remaining);
    if (r.matched && r.match_id) {
      setMatched({ id: r.match_id, name: item.profile.name, photo: item.profile.photos[0]?.url });
    }
    finish(item.profile.id);
  }

  const fullCard = (it: FeedItem) => (
    <>
      <ProfileCard
        p={it.profile}
        compat={it.compatibility}
        onLike={askLike}
        footer={
          <button onClick={() => setSafety(true)} className="w-full py-4 text-center text-sm font-medium text-muted underline">
            Report or block {it.profile.name}
          </button>
        }
      />
      {!it.passed_at && (
        <button
          onClick={() => void skip(it)}
          aria-label={`Skip ${it.profile.name}`}
          className="fixed bottom-24 left-[max(1rem,calc(50%-12rem))] z-20 flex h-14 w-14 items-center justify-center rounded-full bg-white text-plum-700 shadow-xl ring-1 ring-plum-100 active:scale-90"
        >
          <XIcon />
        </button>
      )}
      <SafetySheet
        open={safety}
        onClose={() => setSafety(false)}
        targetId={it.profile.id}
        targetName={it.profile.name}
        onBlocked={() => {
          setSafety(false);
          finish(it.profile.id);
        }}
      />
    </>
  );

  if (feed.loading) return <FullPageSpinner />;

  const reloadPeople = async () => {
    const [f, n] = await Promise.all([backend.getFeed(), backend.getNearMatches?.() ?? Promise.resolve([])]);
    feed.setData(f);
    near.setData(n);
  };

  // RESET on the map: map-only filters off and every must-match answer back to a plain answer.
  const resetFilters = async () => {
    setView(NO_VIEW_FILTERS);
    const keys = Object.keys(me.attributes) as (keyof typeof me.attributes)[];
    if (!keys.some((k) => me.attributes[k]?.is_dealbreaker)) return;
    const attrs = Object.fromEntries(keys.map((k) => [k, { ...me.attributes[k]!, is_dealbreaker: false }]));
    await backend.saveAttributes(attrs);
    await refresh();
    await reloadPeople();
  };

  const filters = () => (
    <QuickFilters
      view={view}
      onView={setView}
      onChanged={async () => {
        setPickId(null);
        setOpenId(null);
        await reloadPeople();
      }}
    />
  );

  return (
    <div className="px-4">
      <header className="flex items-center justify-between py-3">
        <Logo className="!text-2xl" />
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-plum-700 shadow-sm">
            ♥ {remaining ?? '…'}
          </span>
        </div>
      </header>

      {me.paused && (
        <div className="mb-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Your profile is paused, so nobody can see you. <Link to="/me/settings" className="font-semibold underline">Unpause</Link>
        </div>
      )}
      <ErrorText>{feed.error ?? error}</ErrorText>

      <div className="h-[calc(100dvh-10.5rem)] min-h-[440px]">
        <SpaceMap
          items={items}
          nearIds={nearIds}
          shared={shared}
          myPhoto={me.photos[0]?.url}
          pickedId={pickId}
          onPick={setPickId}
          toolbar={filters()}
          onReset={() => void resetFilters()}
          noteAlert={matchCount === 0}
          note={
            matchCount === 0
              ? items.length
                ? 'Nobody fits all your filters right now. Faded faces are near matches.'
                : 'Nobody new nearby yet. Check back tomorrow or loosen your filters.'
              : undefined
          }
        >
          {picked && !opened && (
            <QuickCard
              key={picked.profile.id}
              item={picked}
              shared={shared[picked.profile.id]}
              onClose={() => setPickId(null)}
              onPass={() => void skip(picked)}
              onOpen={() => setOpenId(picked.profile.id)}
              onLike={() => {
                const ph = [...picked.profile.photos].sort((a, b) => a.position - b.position)[0];
                if (ph) askLike({ type: 'photo', id: ph.id, preview: { url: ph.url } });
                else setOpenId(picked.profile.id);
              }}
            />
          )}
        </SpaceMap>
      </div>

      {opened &&
        createPortal(
          <div className="fixed inset-0 z-40 overflow-y-auto bg-cream" role="dialog" aria-modal="true" aria-label={`${opened.profile.name}'s profile`}>
            <div className="mx-auto max-w-md px-4 pb-28">
              <div className="sticky top-0 z-10 -mx-4 bg-cream/95 px-2 py-2 backdrop-blur">
                <button
                  type="button"
                  onClick={() => setOpenId(null)}
                  className="flex min-h-11 items-center gap-1 rounded-full px-2 text-sm font-semibold text-plum-700"
                >
                  <ChevronLeft /> Back to space
                </button>
              </div>
              {fullCard(opened)}
            </div>
          </div>,
          document.body,
        )}

      <LikeSheet target={target} name={item?.profile.name ?? ''} onClose={() => setTarget(null)} onSend={sendLike} remaining={remaining} />

      <Sheet open={Boolean(matched)} onClose={() => setMatched(null)}>
        {matched && (
          <div className="text-center">
            <div className="animate-pop mx-auto flex justify-center -space-x-6">
              <img src={me.photos[0]?.url} alt="" className="h-24 w-24 rounded-full border-4 border-white object-cover shadow" />
              <img src={matched.photo} alt="" className="h-24 w-24 rounded-full border-4 border-white object-cover shadow" />
            </div>
            <h2 className="mt-4 text-3xl font-semibold text-coral-500">It’s a match!</h2>
            <p className="mt-1 text-muted">You and {matched.name} liked each other.</p>
            <Button className="mt-6 w-full" onClick={() => nav(`/matches/${matched.id}`)}>
              Send a note
            </Button>
            <Button variant="ghost" className="mt-2 w-full" onClick={() => setMatched(null)}>
              Keep discovering
            </Button>
          </div>
        )}
      </Sheet>
    </div>
  );
}
