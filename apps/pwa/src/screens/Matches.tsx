import { Link } from 'react-router-dom';
import { Empty, ErrorText, FullPageSpinner, Header, VerifiedBadge } from '../components/ui';
import { useLoader, useMe, useSession } from '../state/session';

export default function Matches() {
  const { backend } = useSession();
  const me = useMe();
  const matches = useLoader(() => backend.getMatches(), [backend]);

  if (matches.loading) return <FullPageSpinner />;
  return (
    <div>
      <Header title="Matches" />
      <div className="space-y-2 px-4">
        <ErrorText>{matches.error}</ErrorText>
        {matches.data?.length === 0 && (
          <Empty icon="✨" title="No matches yet">
            When someone you liked likes you back, they’ll appear here.
          </Empty>
        )}
        {matches.data?.map((m) => (
          <Link
            key={m.match_id}
            to={`/matches/${m.match_id}`}
            className="flex items-center gap-3 rounded-3xl bg-surface p-3 shadow-sm ring-1 ring-plum-100/60 transition active:scale-[0.99]"
          >
            <img src={m.profile.photos[0]?.url} alt="" className="h-16 w-16 rounded-2xl object-cover" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1">
                <span className="text-lg font-semibold">{m.profile.name}</span>
                {m.profile.verified && <VerifiedBadge />}
                {m.compatibility && (
                  <span className="ml-auto rounded-full bg-coral-50 px-2 py-0.5 text-xs font-semibold text-coral-600">
                    {m.compatibility.total}%
                  </span>
                )}
              </div>
              <p className="truncate text-sm text-muted">
                {m.last_note
                  ? `${m.last_note.sender_id === me.id ? 'You: ' : ''}${m.last_note.body}`
                  : 'New match. Send the first note!'}
              </p>
              {m.connect_me && m.connect_them && <p className="text-xs font-semibold text-emerald-700">Connected ✓</p>}
              {m.connect_them && !m.connect_me && <p className="text-xs font-semibold text-coral-600">Wants to connect</p>}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
