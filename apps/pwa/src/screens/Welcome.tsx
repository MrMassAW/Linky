import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Button, ErrorText, Logo } from '../components/ui';
import { useSession } from '../state/session';

export function Welcome() {
  const { backend, user, refresh } = useSession();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [adult, setAdult] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  if (user) return <Navigate to="/discover" replace />;

  const guard = () => {
    if (!adult) {
      setError('Please confirm you are 18 or older.');
      return false;
    }
    return true;
  };

  async function withEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!guard()) return;
    setBusy('email');
    setError(null);
    try {
      const { sentLink } = await backend.signInWithEmail(email);
      if (sentLink) setSent(true);
      else {
        await refresh();
        nav('/discover');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function withProvider(p: 'google' | 'apple') {
    if (!guard()) return;
    setBusy(p);
    setError(null);
    try {
      await backend.signInWithProvider(p);
      if (backend.mode === 'mock') {
        await refresh();
        nav('/discover');
      }
    } catch (err) {
      setError((err as Error).message);
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col px-6 pb-10 pt-16">
      <div className="flex-1">
        <Logo />
        <h1 className="mt-10 text-4xl font-semibold leading-tight text-ink">
          Real people.
          <br />
          Real connection.
        </h1>
        <p className="mt-4 text-[17px] text-muted">
          Every profile is a verified human. Match on personality and love language, then take it to the
          messenger you already use.
        </p>
        <ul className="mt-6 space-y-2 text-sm text-plum-700">
          <li>✅ Liveness-verified profiles</li>
          <li>🧭 16-type personality + love-language matching</li>
          <li>💌 Async notes, no endless chat</li>
        </ul>
      </div>

      {sent ? (
        <div className="rounded-3xl bg-surface p-6 text-center shadow-sm">
          <div className="text-4xl">📬</div>
          <h2 className="mt-2 text-xl font-semibold">Check your inbox</h2>
          <p className="mt-1 text-sm text-muted">We sent a sign-in link to {email}.</p>
        </div>
      ) : (
        <form onSubmit={withEmail} className="mt-10 space-y-3">
          <label className="flex items-center gap-3 rounded-2xl bg-surface px-4 py-3 shadow-sm">
            <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} className="h-5 w-5" />
            <span className="text-sm text-ink">I confirm I am 18 or older</span>
          </label>
          <input
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-label="Email"
          />
          <Button type="submit" className="w-full" busy={busy === 'email'}>
            Continue with email
          </Button>
          <div className="grid grid-cols-2 gap-3">
            <Button type="button" variant="secondary" busy={busy === 'google'} onClick={() => withProvider('google')}>
              <GoogleG /> Google
            </Button>
            <Button type="button" variant="secondary" busy={busy === 'apple'} onClick={() => withProvider('apple')}>
              <AppleIcon /> Apple
            </Button>
          </div>
          <ErrorText>{error}</ErrorText>
          {backend.mode === 'mock' && (
            <p className="pt-2 text-center text-xs text-muted">
              Demo mode: no email is sent. Everything stays on this device.
            </p>
          )}
        </form>
      )}
    </div>
  );
}

function GoogleG() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4">
      <path fill="#4285F4" d="M23 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.2a5.3 5.3 0 0 1-2.3 3.5v2.9h3.7c2.2-2 3.4-5 3.4-8.5z" />
      <path fill="#34A853" d="M12 23.5c3.1 0 5.7-1 7.6-2.8l-3.7-2.9c-1 .7-2.3 1.1-3.9 1.1-3 0-5.5-2-6.4-4.7H1.8v3A11.5 11.5 0 0 0 12 23.5z" />
      <path fill="#FBBC05" d="M5.6 14.2a6.9 6.9 0 0 1 0-4.4v-3H1.8a11.5 11.5 0 0 0 0 10.4z" />
      <path fill="#EA4335" d="M12 5.1c1.7 0 3.2.6 4.4 1.7l3.3-3.3A11.5 11.5 0 0 0 1.8 6.8l3.8 3c.9-2.7 3.4-4.7 6.4-4.7z" />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
      <path d="M16.4 12.6c0-2.4 2-3.6 2.1-3.7a4.6 4.6 0 0 0-3.6-2c-1.5-.2-3 .9-3.7.9-.8 0-2-.9-3.2-.9a4.8 4.8 0 0 0-4 2.5c-1.7 3-.4 7.4 1.2 9.8.8 1.2 1.8 2.5 3 2.4 1.2 0 1.7-.8 3.1-.8s1.9.8 3.2.8c1.3 0 2.1-1.2 2.9-2.4a10 10 0 0 0 1.3-2.7 4.2 4.2 0 0 1-2.3-3.9zM14 5.3a4.3 4.3 0 0 0 1-3.1 4.4 4.4 0 0 0-2.9 1.5 4.1 4.1 0 0 0-1 3 3.6 3.6 0 0 0 2.9-1.4z" />
    </svg>
  );
}
