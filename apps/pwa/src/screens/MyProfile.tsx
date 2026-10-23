import { Link } from 'react-router-dom';
import { ProfileCard } from '../components/ProfileCard';
import { PersonalityResult } from '../components/editors/PersonalityQuiz';
import { LoveResult } from '../components/editors/LoveQuiz';
import { Card, Header } from '../components/ui';
import { publicView } from '../lib/profileView';
import { useMe } from '../state/session';

export default function MyProfile() {
  const me = useMe();
  const preview = publicView(me, me, { isMatch: false });

  const links = [
    { to: '/me/edit', label: 'Edit profile', sub: 'Photos, prompts, basics, messengers', icon: '✏️' },
    { to: '/me/filters', label: 'Filters & visibility', sub: 'Lifestyle, dealbreakers, who you see, kinks', icon: '🎛️' },
    { to: '/me/settings', label: 'Settings', sub: 'Pause, privacy, export, delete', icon: '⚙️' },
    ...(!me.verified ? [{ to: '/me/verify', label: 'Verify your profile', sub: 'Required to like and be seen', icon: '🤳' }] : []),
    ...(me.is_admin ? [{ to: '/admin', label: 'Admin · report queue', sub: 'Moderate reports', icon: '🛡️' }] : []),
  ];

  return (
    <div>
      <Header title="Profile" />
      <div className="space-y-3 px-4">
        <div className="grid gap-2">
          {links.map((l) => (
            <Link key={l.to} to={l.to} className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-plum-100/60">
              <span className="text-2xl">{l.icon}</span>
              <span className="flex-1">
                <span className="block font-semibold">{l.label}</span>
                <span className="block text-xs text-muted">{l.sub}</span>
              </span>
              <span className="text-plum-100">›</span>
            </Link>
          ))}
        </div>

        {me.personality && (
          <Card>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Your type: {me.personality.type}</h3>
              <Link to="/me/quiz/personality" className="text-sm font-semibold text-coral-500">Retake</Link>
            </div>
            <PersonalityResult p={me.personality} compact />
            {!me.personality.visible && <p className="mt-2 text-xs text-muted">Hidden from your profile</p>}
          </Card>
        )}
        {me.love_language && (
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Love languages</h3>
              <Link to="/me/quiz/love" className="text-sm font-semibold text-coral-500">Retake</Link>
            </div>
            <LoveResult profile={me.love_language} />
          </Card>
        )}

        <h3 className="px-1 pt-4 text-lg font-semibold">How others see you</h3>
        <ProfileCard p={{ ...preview, distance: null }} />
      </div>
    </div>
  );
}
