import { lazy, Suspense } from 'react';
import { Navigate, NavLink, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { FullPageSpinner, HeartIcon } from './components/ui';
import { useSession } from './state/session';
import { Welcome } from './screens/Welcome';
import { AuthCallback } from './screens/AuthCallback';

const Onboarding = lazy(() => import('./screens/onboarding/Onboarding'));
const Discover = lazy(() => import('./screens/Discover'));
const LikesYou = lazy(() => import('./screens/LikesYou'));
const Matches = lazy(() => import('./screens/Matches'));
const MatchDetail = lazy(() => import('./screens/MatchDetail'));
const MyProfileScreen = lazy(() => import('./screens/MyProfile'));
const ProfileEditor = lazy(() => import('./screens/ProfileEditor'));
const Filters = lazy(() => import('./screens/Filters'));
const Settings = lazy(() => import('./screens/Settings'));
const Admin = lazy(() => import('./screens/Admin'));
const LivenessScreen = lazy(() => import('./screens/LivenessScreen'));
const QuizScreen = lazy(() => import('./screens/QuizScreen'));
const ProfilePage = lazy(() => import('./screens/ProfilePage'));

export function App() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <Routes>
        <Route path="/welcome" element={<Welcome />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route element={<RequireUser />}>
          <Route path="/onboarding" element={<Onboarding />} />
          <Route element={<RequireProfile />}>
            <Route element={<TabShell />}>
              <Route path="/discover" element={<Discover />} />
              <Route path="/likes" element={<LikesYou />} />
              <Route path="/matches" element={<Matches />} />
              <Route path="/me" element={<MyProfileScreen />} />
            </Route>
            <Route path="/matches/:id" element={<MatchDetail />} />
            <Route path="/u/:id" element={<ProfilePage />} />
            <Route path="/me/edit" element={<ProfileEditor />} />
            <Route path="/me/filters" element={<Filters />} />
            <Route path="/me/settings" element={<Settings />} />
            <Route path="/me/verify" element={<LivenessScreen />} />
            <Route path="/me/quiz/:kind" element={<QuizScreen />} />
            <Route path="/admin" element={<Admin />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/discover" replace />} />
      </Routes>
    </Suspense>
  );
}

function RequireUser() {
  const { user } = useSession();
  const loc = useLocation();
  if (!user) return <Navigate to="/welcome" replace state={{ from: loc.pathname }} />;
  return <Outlet />;
}

function RequireProfile() {
  const { profile } = useSession();
  if (!profile?.onboarding_complete) return <Navigate to="/onboarding" replace />;
  return <Outlet />;
}

const TABS = [
  { to: '/discover', label: 'Discover', icon: (a: boolean) => <CompassIcon active={a} /> },
  { to: '/likes', label: 'Likes You', icon: (a: boolean) => <HeartIcon filled={a} className="h-6 w-6" /> },
  { to: '/matches', label: 'Matches', icon: (a: boolean) => <NoteIcon active={a} /> },
  { to: '/me', label: 'Profile', icon: (a: boolean) => <PersonIcon active={a} /> },
];

function TabShell() {
  return (
    <div className="mx-auto flex h-full max-w-md flex-col">
      <main className="flex-1 overflow-y-auto pb-24">
        <Outlet />
      </main>
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-plum-100 bg-white/95 backdrop-blur">
        <ul className="mx-auto flex max-w-md">
          {TABS.map((t) => (
            <li key={t.to} className="flex-1">
              <NavLink
                to={t.to}
                className={({ isActive }) =>
                  `flex flex-col items-center gap-0.5 pt-2 text-[11px] font-medium ${isActive ? 'text-coral-500' : 'text-muted'}`
                }
              >
                {({ isActive }) => (
                  <>
                    {t.icon(isActive)}
                    {t.label}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

function CompassIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="9" />
      <path d="M15.5 8.5l-2 5-5 2 2-5z" fill={active ? 'currentColor' : 'none'} strokeLinejoin="round" />
    </svg>
  );
}
function NoteIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2} strokeLinejoin="round">
      <path d="M4 5h16v11H9l-5 4z" />
    </svg>
  );
}
function PersonIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" strokeLinecap="round" />
    </svg>
  );
}
