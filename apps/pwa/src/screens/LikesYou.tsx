import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Empty, ErrorText, FullPageSpinner, Header, HeartIcon, VerifiedBadge } from '../components/ui';
import { useLoader, useSession } from '../state/session';
import type { LikeYou } from '../lib/types';

export default function LikesYou() {
  const { backend } = useSession();
  const nav = useNavigate();
  const likes = useLoader(() => backend.getLikesYou(), [backend]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function likeBack(l: LikeYou) {
    setBusy(l.like.id);
    setError(null);
    try {
      const p = l.profile;
      const target = p.prompts[0] ? { type: 'prompt' as const, id: p.prompts[0].id } : { type: 'photo' as const, id: p.photos[0].id };
      const r = await backend.like(p.id, target.type, target.id, '');
      if (r.matched && r.match_id) nav(`/matches/${r.match_id}`);
      else await likes.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function pass(l: LikeYou) {
    await backend.skip(l.profile.id);
    await likes.reload();
  }

  if (likes.loading) return <FullPageSpinner />;
  return (
    <div>
      <Header title="Likes You" />
      <div className="space-y-3 px-4">
        <ErrorText>{likes.error ?? error}</ErrorText>
        {likes.data?.length === 0 && (
          <Empty icon="💌" title="No likes yet">
            Likes on your photos and prompts will show up here. A great prompt answer helps!
          </Empty>
        )}
        {likes.data?.map((l) => (
          <div key={l.like.id} className="animate-fade-in overflow-hidden rounded-3xl bg-surface shadow-sm ring-1 ring-plum-100/60">
            <Link to={`/u/${l.profile.id}`} className="flex items-center gap-3 p-4">
              <img src={l.profile.photos[0]?.url} alt="" className="h-16 w-16 rounded-2xl object-cover" />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1 text-lg font-semibold">
                  {l.profile.name}, {l.profile.age} {l.profile.verified && <VerifiedBadge />}
                </p>
                <p className="truncate text-xs text-muted">
                  Liked your {l.like.target_type}
                  {l.profile.distance && ` · ${l.profile.distance}`}
                </p>
              </div>
            </Link>
            <div className="mx-4 rounded-2xl bg-plum-50 p-3">
              {l.target?.url ? (
                <img src={l.target.url} alt="Your liked photo" className="h-24 w-20 rounded-xl object-cover" />
              ) : (
                <>
                  <p className="text-xs font-semibold text-plum-700">{l.target?.prompt}</p>
                  <p className="font-display text-base">{l.target?.answer}</p>
                </>
              )}
              {l.like.comment && <p className="mt-2 rounded-xl bg-surface px-3 py-2 text-sm">“{l.like.comment}”</p>}
            </div>
            <div className="flex gap-2 p-4">
              <Button variant="secondary" className="flex-1" onClick={() => pass(l)}>
                Pass
              </Button>
              <Button className="flex-1" busy={busy === l.like.id} onClick={() => likeBack(l)}>
                <HeartIcon filled /> Like back
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
