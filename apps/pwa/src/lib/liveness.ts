// On-device liveness check with MediaPipe Face Landmarker.
// A random sequence of challenges (blink, turn head left/right, smile) must be
// completed in order on a live camera feed. Then a frontal frame is compared with
// the profile photos using a face-geometry signature. No image ever leaves the device.
//
// The geometry signature is a lightweight stand-in for a real face-embedding model:
// good enough to catch "no face in these photos" or very different faces, not a
// biometric match. The score is stored for moderators; see docs/ARCHITECTURE.md.
import type { FaceLandmarker, NormalizedLandmark } from '@mediapipe/tasks-vision';

export const MEDIAPIPE_VERSION = '1.1.1';
const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

export type Challenge = 'blink' | 'turn-left' | 'turn-right' | 'smile';

export const CHALLENGE_TEXT: Record<Challenge, string> = {
  blink: 'Blink slowly',
  'turn-left': 'Turn your head to your left',
  'turn-right': 'Turn your head to your right',
  smile: 'Give us a big smile',
};

/** Always one blink and one head turn, plus a random third, in random order. */
export function pickChallenges(rng: () => number = Math.random): Challenge[] {
  const turn: Challenge = rng() < 0.5 ? 'turn-left' : 'turn-right';
  const extra: Challenge[] = (['smile', turn === 'turn-left' ? 'turn-right' : 'turn-left'] as Challenge[]);
  const list: Challenge[] = ['blink', turn, extra[Math.floor(rng() * extra.length)]];
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

export interface FrameSignals {
  faces: number;
  blink: number; // 0..1 average eye closure
  smile: number; // 0..1
  /**
   * Horizontal nose position between the cheeks in the raw (unmirrored) camera image:
   * ~0.5 facing the camera; grows as the person turns to THEIR left.
   */
  yaw: number;
  landmarks: NormalizedLandmark[] | null;
}

export interface ChallengeState {
  armed: boolean; // saw a neutral pose first, so a held pose can't pass instantly
}

export const THRESHOLDS = {
  blinkOpen: 0.3,
  blinkClosed: 0.55,
  smile: 0.6,
  smileNeutral: 0.35,
  yawNeutral: 0.12, // |yaw-0.5| below this counts as facing forward
  yawTurned: 0.2, // |yaw-0.5| above this counts as turned
};

/** Pure step function: returns true once the challenge is satisfied. */
export function stepChallenge(ch: Challenge, s: FrameSignals, st: ChallengeState): boolean {
  if (s.faces !== 1) return false;
  const off = s.yaw - 0.5;
  switch (ch) {
    case 'blink':
      if (s.blink < THRESHOLDS.blinkOpen) st.armed = true;
      return st.armed && s.blink > THRESHOLDS.blinkClosed;
    case 'smile':
      if (s.smile < THRESHOLDS.smileNeutral) st.armed = true;
      return st.armed && s.smile > THRESHOLDS.smile;
    case 'turn-left':
    case 'turn-right': {
      if (Math.abs(off) < THRESHOLDS.yawNeutral) st.armed = true;
      const dir = ch === 'turn-left' ? off : -off;
      return st.armed && dir > THRESHOLDS.yawTurned;
    }
  }
}

const L = { leftCheek: 234, rightCheek: 454, nose: 1 };

export function yawFromLandmarks(lm: NormalizedLandmark[]): number {
  const a = lm[L.leftCheek].x;
  const b = lm[L.rightCheek].x;
  const n = lm[L.nose].x;
  return b === a ? 0.5 : (n - a) / (b - a);
}

// Landmarks used for the geometry signature: eye corners, nose, mouth corners, chin, brow.
const SIG_POINTS = [33, 133, 362, 263, 1, 61, 291, 152, 10, 234, 454];

export function faceSignature(lm: NormalizedLandmark[]): number[] {
  const pts = SIG_POINTS.map((i) => lm[i]);
  const eye = Math.hypot(lm[33].x - lm[263].x, lm[33].y - lm[263].y) || 1;
  const sig: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      sig.push(Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y) / eye);
    }
  }
  return sig;
}

/** 0..1, 1 = identical geometry. */
export function signatureSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff += Math.abs(a[i] - b[i]) / Math.max(a[i], b[i], 1e-6);
  return Math.exp(-4 * (diff / a.length));
}

export const FACE_MATCH_THRESHOLD = 0.6;

// ---------------------------------------------------------------------------
// MediaPipe wiring (browser only)
// ---------------------------------------------------------------------------
let videoLandmarker: Promise<FaceLandmarker> | null = null;
let imageLandmarker: Promise<FaceLandmarker> | null = null;

async function create(mode: 'VIDEO' | 'IMAGE'): Promise<FaceLandmarker> {
  const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');
  const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
  return FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
    runningMode: mode,
    numFaces: 2,
    outputFaceBlendshapes: true,
  });
}

export function loadVideoLandmarker() {
  videoLandmarker ??= create('VIDEO').catch((e) => {
    videoLandmarker = null;
    throw e;
  });
  return videoLandmarker;
}

function loadImageLandmarker() {
  imageLandmarker ??= create('IMAGE').catch((e) => {
    imageLandmarker = null;
    throw e;
  });
  return imageLandmarker;
}

function blend(cats: { categoryName: string; score: number }[] | undefined, name: string) {
  return cats?.find((c) => c.categoryName === name)?.score ?? 0;
}

export function readFrame(lm: FaceLandmarker, video: HTMLVideoElement, ts: number): FrameSignals {
  const r = lm.detectForVideo(video, ts);
  const faces = r.faceLandmarks.length;
  const landmarks = r.faceLandmarks[0] ?? null;
  const cats = r.faceBlendshapes[0]?.categories;
  return {
    faces,
    blink: (blend(cats, 'eyeBlinkLeft') + blend(cats, 'eyeBlinkRight')) / 2,
    smile: (blend(cats, 'mouthSmileLeft') + blend(cats, 'mouthSmileRight')) / 2,
    yaw: landmarks ? yawFromLandmarks(landmarks) : 0.5,
    landmarks,
  };
}

/** Best similarity between the live signature and any photo that contains a face. */
export async function compareWithPhotos(
  live: number[],
  photoUrls: string[],
): Promise<{ score: number | null; facesFound: number }> {
  const lm = await loadImageLandmarker();
  let best: number | null = null;
  let facesFound = 0;
  for (const url of photoUrls) {
    const img = await new Promise<HTMLImageElement | null>((resolve) => {
      const i = new Image();
      i.crossOrigin = 'anonymous';
      i.onload = () => resolve(i);
      i.onerror = () => resolve(null);
      i.src = url;
    });
    if (!img) continue;
    const r = lm.detect(img);
    const face = r.faceLandmarks[0];
    if (!face) continue;
    facesFound++;
    const s = signatureSimilarity(live, faceSignature(face));
    best = best === null ? s : Math.max(best, s);
  }
  return { score: best, facesFound };
}
