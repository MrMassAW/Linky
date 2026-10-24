import { useRef, useState } from 'react';
import { blobToImage, compressImage } from '../../lib/image';
import { checkNsfw, warmUpNsfw } from '../../lib/nsfw';
import { hasDemoTools } from '../../lib/backend';
import { useMe, useSession } from '../../state/session';
import { Button, ErrorText, Sheet, Spinner, XIcon } from '../ui';

export const MIN_PHOTOS = 3;
export const MAX_PHOTOS = 6;

export function PhotoManager({ onDone, cta = 'Continue' }: { onDone?: () => void; cta?: string }) {
  const { backend, refresh } = useSession();
  const me = useMe();
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<string | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const photos = [...me.photos].sort((a, b) => a.position - b.position);

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    void warmUpNsfw();
    try {
      for (const file of Array.from(files).slice(0, MAX_PHOTOS - photos.length)) {
        setStatus('Compressing…');
        const c = await compressImage(file);
        setStatus('Checking photo on your device…');
        const img = await blobToImage(c.blob);
        const nsfw = await checkNsfw(img);
        URL.revokeObjectURL(img.src);
        if (nsfw.blocked) {
          setError('That photo looks like it may contain nudity, so it wasn’t added. Please choose another.');
          continue;
        }
        setStatus('Uploading…');
        await backend.addPhoto(c.blob, nsfw.score);
        setLast(
          `${c.type.replace('image/', '').toUpperCase()} · ${c.width}×${c.height} · ${Math.round(c.blob.size / 1024)} KB` +
            (nsfw.error ? ' · nudity check unavailable, flagged for review' : ''),
        );
        await refresh();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setStatus(null);
      if (input.current) input.current.value = '';
    }
  }

  /** Demo only: illustrated stand-in photos, for devices or embedded views where the photo picker can't open. */
  async function addSamples() {
    setError(null);
    setStatus('Adding sample photos…');
    try {
      const scenes = ['🌿', '☕', '🎨', '🚲', '🎧', '🌅'];
      for (let i = photos.length; i < MIN_PHOTOS; i++) {
        const c = document.createElement('canvas');
        c.width = 1080;
        c.height = 1350;
        const g = c.getContext('2d')!;
        const hue = (i * 70 + 10) % 360;
        const grad = g.createLinearGradient(0, 0, 0, c.height);
        grad.addColorStop(0, `hsl(${hue},70%,72%)`);
        grad.addColorStop(1, `hsl(${hue + 40},55%,42%)`);
        g.fillStyle = grad;
        g.fillRect(0, 0, c.width, c.height);
        g.font = '420px system-ui, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(scenes[i % scenes.length], c.width / 2, c.height / 2 - 60);
        g.font = '600 64px system-ui, sans-serif';
        g.fillStyle = 'rgba(255,255,255,.95)';
        g.fillText('Sample photo', c.width / 2, c.height - 160);
        const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not draw the sample photo'))), 'image/jpeg', 0.8));
        await backend.addPhoto(blob, 0);
      }
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setStatus(null);
    }
  }

  async function remove(id: string) {
    await backend.removePhoto(id);
    await refresh();
  }

  async function makeFirst(id: string) {
    await backend.reorderPhotos([id, ...photos.filter((p) => p.id !== id).map((p) => p.id)]);
    await refresh();
  }

  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        {Array.from({ length: MAX_PHOTOS }).map((_, i) => {
          const p = photos[i];
          if (p) {
            return (
              <div key={p.id} className="group relative aspect-[4/5] overflow-hidden rounded-2xl bg-plum-50">
                <button type="button" className="block h-full w-full" onClick={() => setViewing(p.url)} aria-label={`View photo ${i + 1}`}>
                  <img src={p.url} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" />
                </button>
                <button
                  onClick={() => remove(p.id)}
                  className="absolute right-1.5 top-1.5 rounded-full bg-surface/90 p-1 text-plum-700 shadow"
                  aria-label={`Remove photo ${i + 1}`}
                >
                  <XIcon className="h-4 w-4" />
                </button>
                {i === 0 ? (
                  <span className="absolute bottom-1.5 left-1.5 rounded-full bg-coral-500 px-2 py-0.5 text-[10px] font-semibold text-white">
                    Main
                  </span>
                ) : (
                  <button
                    onClick={() => makeFirst(p.id)}
                    className="absolute bottom-1.5 left-1.5 rounded-full bg-surface/90 px-2 py-0.5 text-[10px] font-semibold text-plum-700"
                  >
                    Make main
                  </button>
                )}
              </div>
            );
          }
          const next = i === photos.length;
          const busy = Boolean(status);
          // A <label> around the file input opens the picker natively on every phone;
          // calling .click() on a hidden input is unreliable on iOS and in embedded views.
          if (next && !busy) {
            return (
              <label
                key={i}
                className="flex aspect-[4/5] cursor-pointer items-center justify-center rounded-2xl border-2 border-dashed border-coral-200 bg-coral-50 text-3xl text-coral-400 focus-within:ring-2 focus-within:ring-coral-300"
              >
                +
                <input
                  ref={input}
                  type="file"
                  accept="image/*"
                  multiple
                  className="sr-only"
                  aria-label="Add photo"
                  onChange={(e) => onFiles(e.target.files)}
                />
              </label>
            );
          }
          return (
            <div
              key={i}
              aria-hidden={!next}
              className={`flex aspect-[4/5] items-center justify-center rounded-2xl border-2 border-dashed text-3xl ${
                next ? 'border-coral-200 bg-coral-50 text-coral-400' : 'border-plum-100 text-plum-100'
              }`}
            >
              {next && busy ? <Spinner small /> : '+'}
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-muted">
        {status ??
          `Add ${MIN_PHOTOS}–${MAX_PHOTOS} photos. They’re resized and compressed on your device, and checked for nudity before upload.`}
      </p>
      {last && <p className="mt-1 text-xs text-emerald-700">Last upload: {last}</p>}
      {hasDemoTools(backend) && photos.length < MIN_PHOTOS && !status && (
        <button type="button" onClick={addSamples} className="mt-2 text-xs font-semibold text-coral-500 underline">
          Photo picker won’t open? Use sample photos (demo only)
        </button>
      )}
      <Sheet open={Boolean(viewing)} onClose={() => setViewing(null)}>
        {viewing && <img src={viewing} alt="" className="mx-auto max-h-[75vh] rounded-2xl object-contain" />}
      </Sheet>
      <ErrorText>{error}</ErrorText>
      {onDone && (
        <Button className="mt-5 w-full" disabled={photos.length < MIN_PHOTOS || Boolean(status)} onClick={onDone}>
          {photos.length < MIN_PHOTOS ? `Add ${MIN_PHOTOS - photos.length} more` : cta}
        </Button>
      )}
    </div>
  );
}
