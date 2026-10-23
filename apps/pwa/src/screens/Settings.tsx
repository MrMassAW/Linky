import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Card, ErrorText, Header, Toggle, VerifiedBadge } from '../components/ui';
import { hasDemoTools } from '../lib/backend';
import { useMe, useSession } from '../state/session';

export default function Settings() {
  const { backend, refresh } = useSession();
  const me = useMe();
  const nav = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const act = (fn: () => Promise<unknown>, done?: string) => async () => {
    setError(null);
    try {
      await fn();
      await refresh();
      if (done) setMsg(done);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  async function exportData() {
    const data = await backend.exportData();
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `linky-data-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto max-w-md pb-12">
      <Header title="Settings" back="/me" />
      <div className="space-y-3 px-4">
        <Card>
          <Toggle
            checked={me.paused}
            onChange={(v) => void act(() => backend.saveProfile({ paused: v }))()}
            label="Pause my profile"
            hint="You’re hidden from Discover. Existing matches stay."
            disabled={Boolean(me.deletion_requested_at)}
          />
        </Card>

        <Card>
          <h3 className="text-lg font-semibold">Verification</h3>
          {me.verified ? (
            <p className="mt-1 flex items-center gap-1 text-sm text-emerald-700">
              <VerifiedBadge /> Verified human
              {me.verification?.face_match_score != null && ` · photo match ${Math.round(me.verification.face_match_score * 100)}%`}
            </p>
          ) : (
            <Link to="/me/verify" className="mt-2 inline-block text-sm font-semibold text-coral-500">
              Verify now →
            </Link>
          )}
        </Card>

        <Card>
          <h3 className="text-lg font-semibold">Privacy</h3>
          <ul className="mt-2 space-y-1 text-sm text-muted">
            <li>• Your exact location is never shared. Others see “about 5 km away”.</li>
            <li>• Only your age is shown, not your birthday.</li>
            <li>• Selfies from the face check never leave your device.</li>
            <li>• Messenger handles are revealed only after you both tap Connect.</li>
          </ul>
          <Button variant="secondary" className="mt-4 w-full" onClick={exportData}>
            Download my data
          </Button>
        </Card>

        <Card>
          <h3 className="text-lg font-semibold">Delete account</h3>
          {me.deletion_requested_at ? (
            <>
              <p className="mt-1 text-sm text-coral-600">
                Deletion requested on {new Date(me.deletion_requested_at).toLocaleDateString()}. All your data will be
                permanently erased within 30 days. Your profile is hidden meanwhile.
              </p>
              <Button variant="secondary" className="mt-3 w-full" onClick={act(() => backend.cancelDeletion(), 'Deletion cancelled.')}>
                Cancel deletion
              </Button>
            </>
          ) : (
            <>
              <p className="mt-1 text-sm text-muted">Your profile is hidden right away and fully erased within 30 days.</p>
              <Button
                variant="danger"
                className="mt-3 w-full"
                onClick={() => confirm('Delete your Linky account? This can’t be undone after 30 days.') && void act(() => backend.requestDeletion(), 'Deletion scheduled.')()}
              >
                Delete my account
              </Button>
            </>
          )}
        </Card>

        {hasDemoTools(backend) && (
          <Card className="ring-amber-200">
            <h3 className="text-lg font-semibold">Demo tools</h3>
            <p className="mt-1 text-xs text-muted">Running on the in-browser demo backend. Data stays on this device.</p>
            <Toggle checked={me.is_admin} onChange={(v) => void act(() => backend.setAdmin(v))()} label="Admin mode" hint="Shows the report queue" />
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={act(() => backend.resetLimits(), 'Daily likes and notes reset.')}>
                Reset daily limits
              </Button>
              <Button
                variant="danger"
                onClick={async () => {
                  if (!confirm('Erase everything on this device and start over?')) return;
                  await backend.resetDemo();
                  await refresh();
                  nav('/welcome');
                }}
              >
                Reset demo
              </Button>
            </div>
          </Card>
        )}
        {me.is_admin && (
          <Link to="/admin" className="block rounded-2xl bg-plum-700 p-4 text-center font-semibold text-white">
            Open admin report queue
          </Link>
        )}

        {msg && <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{msg}</p>}
        <ErrorText>{error}</ErrorText>
        <Button
          variant="ghost"
          className="w-full"
          onClick={async () => {
            await backend.signOut();
            await refresh();
            nav('/welcome');
          }}
        >
          Sign out
        </Button>
        <p className="text-center text-xs text-muted">Linky {backend.mode === 'mock' ? 'demo' : ''} · v0.1</p>
      </div>
    </div>
  );
}
