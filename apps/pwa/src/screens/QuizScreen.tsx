import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { LoveQuiz } from '../components/editors/LoveQuiz';
import { PersonalityQuiz } from '../components/editors/PersonalityQuiz';
import { Header } from '../components/ui';

export default function QuizScreen() {
  const { kind } = useParams();
  const nav = useNavigate();
  if (kind !== 'personality' && kind !== 'love') return <Navigate to="/me" replace />;
  return (
    <div className="mx-auto max-w-md pb-12">
      <Header title={kind === 'personality' ? '16-type personality' : 'Love languages'} back="/me" />
      <div className="px-4">
        {kind === 'personality' ? (
          <PersonalityQuiz onDone={() => nav('/me')} cta="Done" />
        ) : (
          <LoveQuiz onDone={() => nav('/me')} cta="Done" />
        )}
      </div>
    </div>
  );
}
