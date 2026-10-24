import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { FeedExplainer } from '../components/FeedExplainer';
import { LikeSheet } from '../components/LikeSheet';
import { NO_VIEW_FILTERS, QuickFilters, STRONG_MATCH, type ViewFilters } from '../components/QuickFilters';
import { ProfileCard, type LikeTarget } from '../components/ProfileCard';
import { SafetySheet } from '../components/SafetySheet';
import { QuickCard, SpaceMap } from '../components/SpaceMap';
import { Button, ChevronLeft, Empty, ErrorText, FullPageSpinner, Logo, Sheet, XIcon } from '../components/ui';
import { sharedThings } from '../lib/sharedThings';
import type { FeedItem } from '../lib/types';

type Mode = 'space' | 'list';
const MODE_KEY = 'linky-discover-mode';

const VIEW_KEY = 'linky-discover-filters';

function savedView(): ViewFilters {
  try {
    return { ...NO_VIEW_FILTERS, ...JSON.parse(localStorage.getItem(VIEW_KEY) ?? '{}') };
  } catch {
    return NO_VIEW_FILTERS;
  }
}

function savedMode(): Mode {
  try {
    return localStorage.getItem(MODE_KEY) === 'list' ? 'list' : 'space';
  } catch {
    return 'space';
  }
}
import { useLoader, useMe, useSession } from '../state/session';

export default function Discover() {
  const { backend } = useSession();
  const me = useMe();
  const nav = useNavigate();
  const feed = useLoader(() => backend.getFeed(), [backend]);
  const [mode, setModeState] = useState<Mode>(savedMode);
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

  const setMode = (m: Mode) => {
    setModeState(m);
    setPickId(null);
    setOpenId(null);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {
      /* private mode: the choice just isn't remembered */
    }
  };

  const setView = (v: ViewFilters) => {
    setViewState(v);
    setPickId(null);
    try {
      localStorage.setItem(VIEW_KEY, JSON.stringify(v));
    } catch {
      /* not remembered */
    }
  };

  const items: FeedItem[] = useMemo(
    () =>
      (feed.data ?? [])
        .filter((i) => !done.has(i.profile.id))
        .map((i) => (passedNow[i.profile.id] ? { ...i, passed_at: passedNow[i.profile.id] } : i))
        .filter(
          (i) =>
            (!view.verified || i.profile.verified) &&
            (!view.strong || i.compatibility.total >= STRONG_MATCH) &&
            (!view.hidePassed || !i.passed_at),
        ),
    [feed.data, done, passedNow, view],
  );
  const shared = useMemo(
    () => Object.fromEntries((feed.data ?? []).map((i) => [i.profile.id, sharedThings(me, i.profile)])),
    [feed.data, me],
  );
  const queue = items.filter((i) => !i.passed_at);
  const focusId = mode === 'list' ? (queue[0]?.profile.id ?? null) : (openId ?? pickId);
  const item = items.find((i) => i.profile.id === focusId);
  const picked = items.find((i) => i.profile.id === pickId);
  const opened = mode === 'space' ? items.find((i) => i.profile.id === openId) : undefined;

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

  const filters = (
    <QuickFilters
      view={view}
      onView={setView}
      onChanged={async () => {
        setPickId(null);
        setOpenId(null);
        feed.setData(await backend.getFeed());
      }}
    />
  );

  return (
    <div className="px-4">
      <header className="flex items-center justify-between py-3">
        <Logo className="!text-2xl" />
        <div className="flex items-center gap-2">
          <div className="flex rounded-full bg-white p-0.5 text-xs font-semibold shadow-sm" role="group" aria-label="Discover view">
            {(['space', 'list'] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => setMode(m)}
                className={`min-h-8 rounded-full px-3 capitalize ${mode === m ? 'bg-plum-700 text-white' : 'text-plum-700'}`}
              >
                {m}
              </button>
            ))}
          </div>
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

      {(mode === 'list' || items.length === 0) && (
        <div className="relative z-20 mb-3 h-[52px] rounded-2xl bg-[#0c0720] font-retro text-[#f1e8ff]">{filters}</div>
      )}

      {(mode === 'space' ? items.length === 0 : queue.length === 0) ? (
        <Empty icon="🌙" title="You’re all caught up">
          New people show up every day. You can also widen your filters.
          <div className="mt-5 flex justify-center gap-2">
            <Button variant="secondary" onClick={() => nav('/me/filters')}>Adjust filters</Button>
            <Button variant="ghost" onClick={() => { setDone(new Set()); setPassedNow({}); void feed.reload(); }}>Refresh</Button>
          </div>
          <FeedExplainer key={done.size + Object.keys(passedNow).length} />
        </Empty>
      ) : mode === 'space' ? (
        <div className="h-[calc(100dvh-10.5rem)] min-h-[440px]">
          <SpaceMap items={items} shared={shared} myPhoto={me.photos[0]?.url} pickedId={pickId} onPick={setPickId} toolbar={filters}>
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
      ) : (
        item && (
          <div key={item.profile.id} className="animate-fade-in pb-20">
            {fullCard(item)}
          </div>
        )
      )}

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
