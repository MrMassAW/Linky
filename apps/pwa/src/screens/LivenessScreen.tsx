import { useNavigate } from 'react-router-dom';
import { LivenessCheck } from '../components/editors/LivenessCheck';
import { Header } from '../components/ui';

export default function LivenessScreen() {
  const nav = useNavigate();
  return (
    <div className="mx-auto max-w-md pb-12">
      <Header title="Face check" back="/me" />
      <div className="px-4">
        <LivenessCheck onDone={() => nav('/me')} cta="Back to profile" />
      </div>
    </div>
  );
}
