import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { MESSENGERS } from '@linky/content';
import { CompatBadge } from '../components/ProfileCard';
import { SafetySheet } from '../components/SafetySheet';
import { Button, ErrorText, FullPageSpinner, Header, Sheet, VerifiedBadge, ConfirmButton } from '../components/ui';
import { DAILY_NOTES, NOTE_MAX } from '../lib/backend';
import type { MatchSummary, Note, SharedHandle } from '../lib/types';
import { useMe, useSession } from '../state/session';

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });

export default function MatchDetail() {
  const { id = '' } = useParams();
  const { backend } = useSession();
  const me = useMe();
  const nav = useNavigate();
  const [match, setMatch] = useState<MatchSummary | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [handles, setHandles] = useState<SharedHandle[] | null>(null);
  const [left, setLeft] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [safety, setSafety] = useState<{ noteId?: string } | null>(null);

  const load = useCallback(async () => {
    const all = await backend.getMatches();
    const m = all.find((x) => x.match_id === id) ?? null;
    setMatch(m);
    if (m) {
      const [n, h, l] = await Promise.all([backend.getNotes(id), backend.getSharedHandles(id), backend.notesRemaining(id)]);
      setNotes(n);
      setHandles(h);
      setLeft(l);
    }
    setLoading(false);
  }, [backend, id]);

  useEffect(() => {
    void load();
    // Notes are async by design (no typing or read receipts); we just refresh periodically.
    const t = setInterval(load, backend.mode === 'mock' ? 2500 : 30000);
    return () => clearInterval(t);
  }, [load, backend.mode]);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      await backend.sendNote(id, draft);
      setDraft('');
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function connect(v: boolean) {
    setBusy(true);
    await backend.setConnect(id, v);
    await load();
    setBusy(false);
  }

  async function unmatch() {
    await backend.unmatch(id);
    nav('/matches', { replace: true });
  }

  if (loading) return <FullPageSpinner />;
  if (!match) {
    return (
      <div className="mx-auto max-w-md">
        <Header title="Match" back="/matches" />
        <p className="px-4 text-muted">This match is no longer available.</p>
      </div>
    );
  }

  const p = match.profile;
  const both = match.connect_me && match.connect_them;

  return (
    <div className="mx-auto max-w-md pb-10">
      <Header
        title={
          <Link to={`/u/${p.id}`} className="flex items-center gap-2">
            <img src={p.photos[0]?.url} alt="" className="h-9 w-9 rounded-full object-cover" />
            {p.name}
            {p.last_name && ` ${p.last_name}`}
            {p.verified && <VerifiedBadge />}
          </Link>
        }
        back="/matches"
        right={
          <button onClick={() => setMenu(true)} className="rounded-full p-2 text-xl text-plum-700 hover:bg-plum-50" aria-label="More options">
            ⋯
          </button>
        }
      />

      <div className="space-y-4 px-4">
        {match.compatibility && <CompatBadge c={match.compatibility} />}

        {/* Connect */}
        <section className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-plum-100/60">
          <h3 className="text-lg font-semibold">Move to your messenger</h3>
          {both ? (
            <div className="mt-2 space-y-2">
              <p className="text-sm text-emerald-700">You’re connected. Here’s how to reach {p.name}:</p>
              {handles?.length === 0 && (
                <p className="text-sm text-muted">{p.name} hasn’t added a messenger. Keep talking with notes below.</p>
              )}
              {handles?.map((h) => {
                const m = MESSENGERS.find((x) => x.app === h.app)!;
                return (
                  <a
                    key={h.app}
                    href={m.link(h.handle)}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between rounded-2xl border border-plum-100 px-4 py-3 hover:border-coral-300"
                  >
                    <span>
                      <span className="font-semibold">{m.label}</span>
                      {h.preferred && <span className="ml-2 text-xs text-coral-600">preferred</span>}
                      {h.shared && <span className="ml-2 text-xs text-emerald-700">you both use it</span>}
                      <span className="block text-xs text-muted">{h.handle}</span>
                    </span>
                    <span className="text-sm font-semibold text-coral-500">Open →</span>
                  </a>
                );
              })}
            </div>
          ) : (
            <div className="mt-2">
              <p className="text-sm text-muted">
                {match.connect_me
                  ? `Waiting for ${p.name} to tap Connect too. Handles stay hidden until you both do.`
                  : match.connect_them
                    ? `${p.name} wants to connect! Tap Connect to swap messenger handles.`
                    : 'When you both tap Connect, you’ll see each other’s WhatsApp, Telegram, Signal or Instagram.'}
              </p>
              <Button className="mt-3 w-full" variant={match.connect_me ? 'secondary' : 'primary'} busy={busy} onClick={() => connect(!match.connect_me)}>
                {match.connect_me ? 'Cancel Connect request' : '🔗 Connect'}
              </Button>
            </div>
          )}
        </section>

        {/* Notes */}
        <section>
          <h3 className="px-1 text-lg font-semibold">Notes</h3>
          <p className="px-1 text-xs text-muted">
            Short notes, not a chat: up to {NOTE_MAX} characters and {DAILY_NOTES} per day each. No typing or read receipts.
          </p>
          <div className="mt-3 space-y-2">
            {notes.length === 0 && <p className="px-1 text-sm text-muted">No notes yet. Say something about what you liked!</p>}
            {notes.map((n) => {
              const mine = n.sender_id === me.id;
              return (
                <div key={n.id} className={`animate-fade-in flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-3xl px-4 py-3 ${mine ? 'bg-coral-500 text-white' : 'bg-white shadow-sm ring-1 ring-plum-100/60'}`}>
                    <p className="whitespace-pre-wrap text-[15px]">{n.body}</p>
                    <p className={`mt-1 text-[10px] ${mine ? 'text-coral-100' : 'text-muted'}`}>
                      {when(n.created_at)}
                      {!mine && (
                        <button onClick={() => setSafety({ noteId: n.id })} className="ml-2 underline">
                          Report
                        </button>
                      )}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 rounded-3xl bg-white p-3 shadow-sm ring-1 ring-plum-100/60">
            <textarea
              className="min-h-20 resize-none border-0 !ring-0"
              placeholder={`Write a note to ${p.name}…`}
              maxLength={NOTE_MAX}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              aria-label="Note"
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted">
                {draft.length}/{NOTE_MAX} · {left ?? '…'} left today
              </span>
              <Button className="!px-4 !py-2" busy={busy} disabled={!draft.trim() || left === 0} onClick={send}>
                Send note
              </Button>
            </div>
          </div>
          <ErrorText>{error}</ErrorText>
        </section>
      </div>

      <Sheet open={menu} onClose={() => setMenu(false)}>
        <div className="space-y-2">
          <Button variant="secondary" className="w-full" onClick={() => nav(`/u/${p.id}`)}>
            View profile
          </Button>
          <ConfirmButton
            variant="secondary"
            className="w-full"
            prompt={`Unmatch ${p.name}? Notes and handles will be removed.`}
            confirmLabel="Unmatch"
            onConfirm={unmatch}
          >
            Unmatch
          </ConfirmButton>
          <Button variant="danger" className="w-full" onClick={() => { setMenu(false); setSafety({}); }}>
            Report or block
          </Button>
        </div>
      </Sheet>
      <SafetySheet
        open={Boolean(safety)}
        onClose={() => setSafety(null)}
        targetId={p.id}
        targetName={p.name}
        noteId={safety?.noteId}
        onBlocked={() => nav('/matches', { replace: true })}
      />
    </div>
  );
}
