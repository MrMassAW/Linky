import { useEffect, useRef, useState } from 'react';
import type { FaceLandmarker } from '@mediapipe/tasks-vision';
import {
  CHALLENGE_TEXT,
  FACE_MATCH_THRESHOLD,
  compareWithPhotos,
  faceSignature,
  loadVideoLandmarker,
  pickChallenges,
  readFrame,
  stepChallenge,
  type Challenge,
  type ChallengeState,
} from '../../lib/liveness';
import { useMe, useSession } from '../../state/session';
import { Button, ErrorText, Spinner, VerifiedBadge } from '../ui';

type Phase = 'intro' | 'loading' | 'running' | 'comparing' | 'done' | 'error';
const TIME_LIMIT_MS = 60_000;

export function LivenessCheck({ onDone, cta = 'Continue' }: { onDone: () => void; cta?: string }) {
  const { backend, refresh } = useSession();
  const me = useMe();
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const raf = useRef<number>(0);
  const [phase, setPhase] = useState<Phase>(me.verified ? 'done' : 'intro');
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [index, setIndex] = useState(0);
  const [hint, setHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [faceNote, setFaceNote] = useState<string | null>(null);

  const stop = () => {
    cancelAnimationFrame(raf.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  };
  useEffect(() => stop, []);

  async function finish(signature: number[] | null, done: Challenge[]) {
    stop();
    setPhase('comparing');
    let face: number | null = null;
    let note: string | null = null;
    try {
      if (signature) {
        const r = await compareWithPhotos(signature, me.photos.map((p) => p.url));
        face = r.score;
        if (r.facesFound === 0) note = 'We couldn’t find a face in your photos, so a moderator may review them.';
        else if ((face ?? 0) < FACE_MATCH_THRESHOLD) note = 'Your selfie and photos look different, so a moderator may review them.';
      }
    } catch {
      note = 'Photo comparison was unavailable on this device.';
    }
    // The selfie frames were only ever in memory; only the outcome is saved.
    await backend.submitVerification({ passed: true, challenges: done, liveness_score: 1, face_match_score: face });
    await refresh();
    setFaceNote(note);
    setPhase('done');
  }

  async function start() {
    setError(null);
    setPhase('loading');
    const list = pickChallenges();
    setChallenges(list);
    setIndex(0);
    let lm: FaceLandmarker;
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      const v = video.current!;
      v.srcObject = stream.current;
      await v.play();
      lm = await loadVideoLandmarker();
    } catch (e) {
      stop();
      const msg = (e as Error).name === 'NotAllowedError'
        ? 'Camera permission was denied. Allow camera access and try again.'
        : `Couldn’t start the face check: ${(e as Error)?.message ?? String(e)}`;
      setError(msg);
      setPhase('error');
      return;
    }
    setPhase('running');

    const started = performance.now();
    let current = 0;
    let state: ChallengeState = { armed: false };
    let signature: number[] | null = null;
    let lastTs = 0;

    const tick = () => {
      const v = video.current;
      if (!v || !stream.current) return;
      const ts = performance.now();
      if (ts - started > TIME_LIMIT_MS) {
        stop();
        setError('Time’s up. Make sure your face is well lit and try again.');
        setPhase('error');
        return;
      }
      if (v.readyState >= 2 && ts > lastTs) {
        lastTs = ts;
        const s = readFrame(lm, v, ts);
        setHint(s.faces === 0 ? 'We can’t see your face' : s.faces > 1 ? 'Only one person in frame, please' : null);
        if (s.faces === 1 && s.landmarks && Math.abs(s.yaw - 0.5) < 0.06 && s.blink < 0.3) {
          signature = faceSignature(s.landmarks); // keep the latest frontal, eyes-open frame
        }
        if (stepChallenge(list[current], s, state)) {
          current++;
          state = { armed: false };
          setIndex(current);
          if (current >= list.length) {
            void finish(signature, list);
            return;
          }
        }
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  }

  async function simulate() {
    stop();
    await backend.submitVerification({ passed: true, challenges: ['simulated'], liveness_score: null, face_match_score: null });
    await refresh();
    setPhase('done');
  }

  if (phase === 'done') {
    return (
      <div className="text-center">
        <div className="animate-pop mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-sky-50">
          <VerifiedBadge className="scale-[2.2]" />
        </div>
        <h3 className="mt-4 text-2xl font-semibold">You’re verified</h3>
        <p className="mt-1 text-sm text-muted">Your profile now shows the verified badge. Your selfie was never stored.</p>
        {faceNote && <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">{faceNote}</p>}
        <Button className="mt-6 w-full" onClick={onDone}>
          {cta}
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div className="relative mx-auto aspect-[3/4] w-full max-w-xs overflow-hidden rounded-[2rem] bg-plum-900">
        <video ref={video} playsInline muted className="h-full w-full -scale-x-100 object-cover" />
        <div className="pointer-events-none absolute inset-6 rounded-[50%] border-4 border-surface/70" />
        {(phase === 'loading' || phase === 'comparing') && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-plum-900/70 text-white">
            <Spinner />
            <span className="text-sm">{phase === 'loading' ? 'Starting camera…' : 'Comparing with your photos…'}</span>
          </div>
        )}
        {phase === 'intro' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center text-white">
            <div className="text-5xl">🤳</div>
            <p className="mt-3 text-sm">A quick live check proves you’re a real person and that your photos are you.</p>
          </div>
        )}
        {phase === 'running' && (
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-plum-900/90 p-4 text-center text-white">
            <div className="text-lg font-semibold">{CHALLENGE_TEXT[challenges[index]]}</div>
            {hint && <div className="text-xs text-coral-200">{hint}</div>}
            <div className="mt-2 flex justify-center gap-1.5">
              {challenges.map((c, i) => (
                <span key={c} className={`h-2 w-8 rounded-full ${i < index ? 'bg-emerald-400' : i === index ? 'bg-surface' : 'bg-surface/30'}`} />
              ))}
            </div>
          </div>
        )}
      </div>

      <ul className="mt-4 space-y-1 text-xs text-muted">
        <li>• Runs entirely on your device with MediaPipe. Nothing is uploaded.</li>
        <li>• We keep the result (passed + which challenges), not the images.</li>
      </ul>
      <ErrorText>{error}</ErrorText>

      {(phase === 'intro' || phase === 'error') && (
        <Button className="mt-5 w-full" onClick={start}>
          {phase === 'error' ? 'Try again' : 'Start face check'}
        </Button>
      )}
      {backend.mode === 'mock' && phase !== 'comparing' && (
        <button onClick={simulate} className="mt-3 w-full text-center text-sm font-medium text-plum-500 underline">
          No camera? Simulate a pass (demo only)
        </button>
      )}
    </div>
  );
}
