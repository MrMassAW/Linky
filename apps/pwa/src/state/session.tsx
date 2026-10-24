import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { getBackend, type Backend, type SessionUser } from '../lib/backend';
import type { MyProfile } from '../lib/types';

interface SessionState {
  backend: Backend;
  user: SessionUser | null;
  profile: MyProfile | null;
  refresh: () => Promise<MyProfile | null>;
}

const Ctx = createContext<SessionState | null>(null);

export function SessionProvider({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const [backend, setBackend] = useState<Backend | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [ready, setReady] = useState(false);

  const load = useCallback(async (b: Backend) => {
    const u = await b.getSessionUser();
    setUser(u);
    const p = u ? await b.getMyProfile() : null;
    setProfile(p);
    return p;
  }, []);

  useEffect(() => {
    let off = () => {};
    getBackend().then(async (b) => {
      setBackend(b);
      await load(b).catch(() => null);
      setReady(true);
      off = b.onAuthChange(() => void load(b));
    });
    return () => off();
  }, [load]);

  const refresh = useCallback(async () => (backend ? load(backend) : null), [backend, load]);

  if (!ready || !backend) return <>{fallback}</>;
  return <Ctx.Provider value={{ backend, user, profile, refresh }}>{children}</Ctx.Provider>;
}

export function useSession(): SessionState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession outside SessionProvider');
  return v;
}

/** Profile is guaranteed inside the signed-in app shell. */
export function useMe(): MyProfile {
  const { profile } = useSession();
  if (!profile) throw new Error('no profile');
  return profile;
}

/** Small helper for "load on mount, reload on demand" data. */
export function useLoader<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const run = useCallback(async () => {
    setLoading(true);
    try {
      setData(await fn());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => {
    void run();
  }, [run]);
  return { data, error, loading, reload: run, setData };
}
