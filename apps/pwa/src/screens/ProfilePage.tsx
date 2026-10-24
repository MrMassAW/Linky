import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ProfileCard } from '../components/ProfileCard';
import { SafetySheet } from '../components/SafetySheet';
import { FullPageSpinner, Header } from '../components/ui';
import { useLoader, useSession } from '../state/session';

/** Someone else's profile (from Likes You or a match). */
export default function ProfilePage() {
  const { id = '' } = useParams();
  const { backend } = useSession();
  const nav = useNavigate();
  const profile = useLoader(() => backend.getPublicProfile(id), [backend, id]);
  const [safety, setSafety] = useState(false);

  if (profile.loading) return <FullPageSpinner />;
  return (
    <div className="mx-auto max-w-md pb-10">
      <Header title="" back={() => nav(-1)} />
      <div className="px-4">
        {!profile.data ? (
          <p className="text-muted">This profile isn’t available.</p>
        ) : (
          <ProfileCard
            p={profile.data}
            footer={
              <button onClick={() => setSafety(true)} className="w-full py-4 text-center text-sm font-medium text-muted underline">
                Report or block {profile.data.name}
              </button>
            }
          />
        )}
      </div>
      {profile.data && (
        <SafetySheet
          open={safety}
          onClose={() => setSafety(false)}
          targetId={profile.data.id}
          targetName={profile.data.name}
          onBlocked={() => nav(-1)}
        />
      )}
    </div>
  );
}
