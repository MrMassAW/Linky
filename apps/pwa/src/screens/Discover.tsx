import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FeedExplainer } from '../components/FeedExplainer';
import { LikeSheet } from '../components/LikeSheet';
import { ProfileCard, type LikeTarget } from '../components/ProfileCard';
import { SafetySheet } from '../components/SafetySheet';
import { Button, Empty, ErrorText, FullPageSpinner, Logo, Sheet, XIcon } from '../components/ui';
import { useLoader, useMe, useSession } from '../state/session';

export default function Discover() {
  const { backend } = useSession();
  const me = useMe();
  const nav = useNavigate();
  const feed = useLoader(() => backend.getFeed(), [backend]);
  const [index, setIndex] = useState(0);
  const [target, setTarget] = useState<LikeTarget | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [matched, setMatched] = useState<{ id: string; name: string; photo?: string } | null>(null);
  const [safety, setSafety] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void backend.likesRemaining().then(setRemaining);
  }, [backend]);

  const item = feed.data?.[index];
  const advance = () => {
    setTarget(null);
    setIndex((i) => i + 1);
    document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  async function skip() {
    if (!item) return;
    setError(null);
    await backend.skip(item.profile.id);
    advance();
  }

  async function sendLike(comment: string) {
    if (!item || !target) return;
    const r = await backend.like(item.profile.id, target.type, target.id, comment);
    setRemaining(r.likes_remaining);
    if (r.matched && r.match_id) {
      setMatched({ id: r.match_id, name: item.profile.name, photo: item.profile.photos[0]?.url });
    }
    advance();
  }

  if (feed.loading) return <FullPageSpinner />;

  return (
    <div className="px-4">
      <header className="flex items-center justify-between py-3">
        <Logo className="!text-2xl" />
        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-plum-700 shadow-sm">
          ♥ {remaining ?? '…'} left today
        </span>
      </header>

      {me.paused && (
        <div className="mb-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Your profile is paused, so nobody can see you. <Link to="/me/settings" className="font-semibold underline">Unpause</Link>
        </div>
      )}
      <ErrorText>{feed.error ?? error}</ErrorText>

      {!item ? (
        <Empty icon="🌙" title="You’re all caught up">
          New people show up every day. You can also widen your filters.
          <div className="mt-5 flex justify-center gap-2">
            <Button variant="secondary" onClick={() => nav('/me/filters')}>Adjust filters</Button>
            <Button variant="ghost" onClick={() => { setIndex(0); void feed.reload(); }}>Refresh</Button>
          </div>
          <FeedExplainer key={index} />
        </Empty>
      ) : (
        <div key={item.profile.id} className="animate-fade-in pb-20">
          <ProfileCard
            p={item.profile}
            compat={item.compatibility}
            onLike={(t) => (remaining === 0 ? setError('You’ve used all your likes for today. They reset at midnight.') : setTarget(t))}
            footer={
              <button onClick={() => setSafety(true)} className="w-full py-4 text-center text-sm font-medium text-muted underline">
                Report or block {item.profile.name}
              </button>
            }
          />
          <button
            onClick={skip}
            aria-label={`Skip ${item.profile.name}`}
            className="fixed bottom-24 left-[max(1rem,calc(50%-12rem))] z-20 flex h-14 w-14 items-center justify-center rounded-full bg-white text-plum-700 shadow-xl ring-1 ring-plum-100 active:scale-90"
          >
            <XIcon />
          </button>
          <SafetySheet
            open={safety}
            onClose={() => setSafety(false)}
            targetId={item.profile.id}
            targetName={item.profile.name}
            onBlocked={() => {
              setSafety(false);
              advance();
            }}
          />
        </div>
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
