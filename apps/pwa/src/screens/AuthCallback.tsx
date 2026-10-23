import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FullPageSpinner } from '../components/ui';
import { useSession } from '../state/session';

/** Landing page for magic links and OAuth redirects (Supabase parses the URL itself). */
export function AuthCallback() {
  const { backend, refresh } = useSession();
  const nav = useNavigate();
  useEffect(() => {
    let tries = 0;
    const t = setInterval(async () => {
      tries++;
      const u = await backend.getSessionUser();
      if (u || tries > 20) {
        clearInterval(t);
        await refresh();
        nav(u ? '/discover' : '/welcome', { replace: true });
      }
    }, 250);
    return () => clearInterval(t);
  }, [backend, refresh, nav]);
  return <FullPageSpinner />;
}
