// On-device nudity filter with NSFWJS (TensorFlow.js). Loaded lazily on first upload so
// the ~3 MB model never slows down the first paint. Nothing leaves the device.

export const NSFW_BLOCK_THRESHOLD = 0.7;

type Model = { classify(img: HTMLImageElement): Promise<{ className: string; probability: number }[]> };
let modelPromise: Promise<Model> | null = null;

async function loadModel(): Promise<Model> {
  // Import only the small MobileNetV2 model (~2.6 MB) instead of every bundled model.
  const [tf, core, mobilenet] = await Promise.all([
    import('@tensorflow/tfjs'),
    import('nsfwjs/core'),
    import('nsfwjs/models/mobilenet_v2'),
  ]);
  await tf.ready();
  return (await core.load('MobileNetV2', { modelDefinitions: [mobilenet.MobileNetV2Model] })) as unknown as Model;
}

export function warmUpNsfw() {
  modelPromise ??= loadModel();
  return modelPromise;
}

/** Explicit + suggestive score, 0..1. */
export function scoreFromPredictions(preds: { className: string; probability: number }[]): number {
  const p = (name: string) => preds.find((x) => x.className === name)?.probability ?? 0;
  return Math.min(1, p('Porn') + p('Hentai') + 0.5 * p('Sexy'));
}

export interface NsfwResult {
  score: number | null;
  blocked: boolean;
  /** Set when the model could not run; the photo is allowed but left unscored for moderators. */
  error?: string;
}

export async function checkNsfw(img: HTMLImageElement): Promise<NsfwResult> {
  try {
    const model = await warmUpNsfw();
    const score = scoreFromPredictions(await model.classify(img));
    return { score, blocked: score >= NSFW_BLOCK_THRESHOLD };
  } catch (e) {
    modelPromise = null;
    return { score: null, blocked: false, error: (e as Error).message };
  }
}
