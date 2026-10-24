import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { TYPE_NICKNAMES } from '@linky/content';
import type { FeedItem } from '../lib/types';
import { VerifiedBadge } from './ui';

const RINGS = [90, 80, 70, 60, 50];
const MIN_ZOOM = 0.35;
const MAX_ZOOM = 2.6;
const STARS = `${import.meta.env.BASE_URL}space/stars.png`;

/** World-space distance from the center: the stronger the match, the closer the orbit. */
export const orbitRadius = (score: number) => 64 + (100 - Math.max(0, Math.min(100, score))) * 5.2;

export function tierColor(score: number) {
  return score >= 90 ? '#ffe49a' : score >= 80 ? '#ffa08e' : '#b9c6d6';
}

const clampZoom = (z: number) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
const angleOf = (i: number) => i * 2.399963 + 0.5; // golden angle keeps neighbours apart

/** Orbit speed in radians per second: inner orbits run faster (loosely Kepler), each face a little different. */
const orbitSpeed = (score: number, i: number) => {
  const wobble = 0.65 + ((i * 0.618034) % 1) * 0.7;
  return (0.05 / Math.sqrt(orbitRadius(score) / 100)) * wobble * (i % 5 === 0 ? -1 : 1);
};

// Twinkling stars laid over the starfield, spread wider than the view so panning reveals more.
const TWINKLES = Array.from({ length: 46 }, (_, i) => {
  const h = (n: number) => ((Math.sin(i * 127.1 + n * 311.7) * 43758.5453) % 1 + 1) % 1;
  return {
    left: `${-25 + h(1) * 150}%`,
    top: `${-25 + h(2) * 150}%`,
    size: h(3) < 0.75 ? 2 : 4,
    color: ['#ffffff', '#ffd6e0', '#b8e0ff', '#ffe49a'][Math.floor(h(4) * 4)],
    duration: `${2.2 + h(5) * 3.5}s`,
    delay: `${-h(6) * 6}s`,
    cross: h(7) > 0.82,
  };
});

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Discover as a starfield: you sit at the center and each person's face orbits at a distance
 * set by their compatibility score. Pinch, scroll or use the buttons to zoom; drag to pan.
 */
export function SpaceMap({
  items,
  myPhoto,
  pickedId,
  onPick,
  children,
}: {
  items: FeedItem[];
  myPhoto?: string;
  pickedId: string | null;
  onPick: (id: string | null) => void;
  children?: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 360, h: 560 });
  // z: null until the user zooms, so the map keeps fitting everyone. x/y: pan offset of the center.
  const [view, setView] = useState<{ z: number | null; x: number; y: number }>({ z: null, x: 0, y: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const moved = useRef(0);
  const velocity = useRef({ x: 0, y: 0, t: 0 });
  const fling = useRef(0);
  const [time, setTime] = useState(0);
  const [shooting, setShooting] = useState<{ id: number; left: string; top: string; angle: number } | null>(null);
  const [ufo, setUfo] = useState<{ id: number; top: string; rtl: boolean } | null>(null);
  const still = useRef(false);
  still.current = Boolean(pickedId);

  // Slow orbits. Paused while a face is picked or a finger is down so taps land where you aim.
  useEffect(() => {
    if (reducedMotion()) return;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const tick = (now: number) => {
      const dt = Math.min(100, now - last);
      last = now;
      if (!still.current && pointers.current.size === 0) acc += dt;
      setTime((t) => (Math.abs(acc / 1000 - t) > 0.03 ? acc / 1000 : t));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Now and then, a shooting star.
  useEffect(() => {
    if (reducedMotion()) return;
    let timer = 0;
    let n = 0;
    const schedule = () => {
      timer = window.setTimeout(() => {
        n += 1;
        // Any heading; start on the far side of the view so the streak crosses it.
        const angle = Math.random() * 360;
        const rad = (angle * Math.PI) / 180;
        const side = (Math.random() - 0.5) * 50;
        setShooting({
          id: n,
          left: `${50 - Math.cos(rad) * 40 - Math.sin(rad) * side}%`,
          top: `${50 - Math.sin(rad) * 40 + Math.cos(rad) * side}%`,
          angle,
        });
        schedule();
      }, 5000 + Math.random() * 9000);
    };
    schedule();
    return () => clearTimeout(timer);
  }, []);

  // Rarely, a little UFO wanders across.
  useEffect(() => {
    if (reducedMotion()) return;
    let timer = 0;
    let n = 0;
    const schedule = (wait: number) => {
      timer = window.setTimeout(() => {
        n += 1;
        setUfo({ id: n, top: `${12 + Math.random() * 60}%`, rtl: Math.random() < 0.5 });
        schedule(25000 + Math.random() * 35000);
      }, wait);
    };
    schedule(8000 + Math.random() * 10000);
    return () => clearTimeout(timer);
  }, []);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Start zoomed so the farthest person is just in view.
  const farthest = items.reduce((m, i) => Math.max(m, orbitRadius(i.compatibility.total)), orbitRadius(90));
  let fit = MAX_ZOOM;
  items.forEach((it, i) => {
    const r = orbitRadius(it.compatibility.total);
    const a = angleOf(i);
    fit = Math.min(fit, (size.w / 2 - 36) / Math.max(1, Math.abs(r * Math.cos(a))), (size.h / 2 - 48) / Math.max(1, Math.abs(r * Math.sin(a))));
  });
  fit = clampZoom(Math.min(fit, 1.2));
  const z = view.z ?? fit;
  const geom = useRef({ fit, size, farthest });
  geom.current = { fit, size, farthest };

  /** Zoom by `factor` keeping the screen point (mx, my) fixed, then pan by (dx, dy). */
  const zoomAt = useCallback((factor: number, mx: number, my: number, dx = 0, dy = 0) => {
    setView((v) => {
      const { fit: f, size: sz, farthest: far } = geom.current;
      const z0 = v.z ?? f;
      const z1 = clampZoom(z0 * factor);
      const k = z1 / z0;
      const cx = sz.w / 2 + v.x;
      const cy = sz.h / 2 + v.y;
      const limit = far * z1 + Math.max(sz.w, sz.h) / 2;
      const clamp = (n: number) => Math.max(-limit, Math.min(limit, n));
      return {
        z: z1,
        x: clamp(mx - (mx - cx) * k - sz.w / 2 + dx),
        y: clamp(my - (my - cy) * k - sz.h / 2 + dy),
      };
    });
  }, []);
  const panBy = useCallback((dx: number, dy: number) => zoomAt(1, 0, 0, dx, dy), [zoomAt]);

  const local = (clientX: number, clientY: number) => {
    const r = box.current!.getBoundingClientRect();
    return { x: clientX - r.left, y: clientY - r.top };
  };

  // Wheel / trackpad zoom around the cursor; needs a non-passive listener to stop page scroll.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  useEffect(() => () => cancelAnimationFrame(fling.current), []);

  const onPointerDown = (e: React.PointerEvent) => {
    cancelAnimationFrame(fling.current);
    if (pointers.current.size === 0) moved.current = 0;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    velocity.current = { x: 0, y: 0, t: e.timeStamp };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const pts = pointers.current;
    const prev = pts.get(e.pointerId);
    if (!prev) return;
    const next = { x: e.clientX, y: e.clientY };
    if (pts.size === 1) {
      const dx = next.x - prev.x;
      const dy = next.y - prev.y;
      moved.current += Math.abs(dx) + Math.abs(dy);
      const dt = Math.max(1, e.timeStamp - velocity.current.t);
      velocity.current = { x: 0.8 * (dx / dt) + 0.2 * velocity.current.x, y: 0.8 * (dy / dt) + 0.2 * velocity.current.y, t: e.timeStamp };
      panBy(dx, dy);
    } else if (pts.size >= 2) {
      // Pinch: zoom around the midpoint of the two fingers and follow it as it moves.
      const other = [...pts.entries()].find(([id]) => id !== e.pointerId)![1];
      const before = Math.hypot(prev.x - other.x, prev.y - other.y);
      const after = Math.hypot(next.x - other.x, next.y - other.y);
      const m0 = local((prev.x + other.x) / 2, (prev.y + other.y) / 2);
      const m1 = local((next.x + other.x) / 2, (next.y + other.y) / 2);
      if (before > 0) zoomAt(after / before, m0.x, m0.y, m1.x - m0.x, m1.y - m0.y);
      moved.current += 20;
      velocity.current = { x: 0, y: 0, t: e.timeStamp };
    }
    pts.set(e.pointerId, next);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const pts = pointers.current;
    pts.delete(e.pointerId);
    if (pts.size > 0) return;
    // Let a quick swipe glide to a stop.
    let { x: vx, y: vy } = velocity.current;
    if (e.timeStamp - velocity.current.t > 80 || Math.hypot(vx, vy) < 0.25) return;
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(32, now - last);
      last = now;
      panBy(vx * dt, vy * dt);
      const decay = Math.pow(0.994, dt);
      vx *= decay;
      vy *= decay;
      if (Math.hypot(vx, vy) > 0.02) fling.current = requestAnimationFrame(step);
    };
    fling.current = requestAnimationFrame(step);
  };

  const cx = size.w / 2 + view.x;
  const cy = size.h / 2 + view.y;
  const faceScale = Math.max(0.7, Math.min(1.45, Math.sqrt(z)));
  const youSize = Math.round(58 * faceScale);
  const showAllScores = z >= 0.75;
  const showNames = z >= 1.35;

  return (
    <div
      ref={box}
      data-testid="space-map"
      className="relative h-full touch-none select-none overflow-hidden rounded-3xl bg-[#0c0720] font-retro text-[#f1e8ff]"
      style={{
        backgroundImage: `url(${STARS})`,
        backgroundSize: `${Math.round(392 * (0.85 + z * 0.25))}px auto`,
        backgroundPosition: `calc(50% + ${view.x * 0.3}px) calc(50% + ${view.y * 0.3}px)`,
        imageRendering: 'pixelated',
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={(e) => e.pointerType === 'mouse' && onPointerUp(e)}
      onClickCapture={(e) => {
        // A drag that ends on a face is a pan, not a tap.
        if (moved.current > 10) {
          e.stopPropagation();
          e.preventDefault();
        }
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onPick(null);
      }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{ transform: `translate(${view.x * 0.3}px, ${view.y * 0.3}px)` }}
      >
        {TWINKLES.map((st, i) => (
          <span
            key={i}
            className="animate-twinkle absolute"
            style={{
              left: st.left,
              top: st.top,
              width: st.size,
              height: st.size,
              background: st.color,
              animationDuration: st.duration,
              animationDelay: st.delay,
              boxShadow: st.cross
                ? `${st.size}px 0 0 ${st.color}, -${st.size}px 0 0 ${st.color}, 0 ${st.size}px 0 ${st.color}, 0 -${st.size}px 0 ${st.color}`
                : undefined,
            }}
          />
        ))}
      </div>

      {shooting && (
        <div
          key={shooting.id}
          aria-hidden="true"
          className="pointer-events-none absolute"
          style={{ left: shooting.left, top: shooting.top, transform: `rotate(${shooting.angle}deg)`, transformOrigin: '0 0' }}
        >
          <div className="animate-shoot h-[3px] w-24 bg-[linear-gradient(270deg,#fff_0_12px,rgba(255,228,154,0.8)_12px_40px,rgba(255,228,154,0)_100%)]" onAnimationEnd={() => setShooting(null)} />
        </div>
      )}

      {ufo && (
        <div
          key={ufo.id}
          aria-hidden="true"
          data-testid="ufo"
          className={`pointer-events-none absolute ${ufo.rtl ? 'animate-ufo-rtl' : 'animate-ufo-ltr'}`}
          style={{ top: ufo.top }}
          onAnimationEnd={() => setUfo(null)}
        >
          <svg width="44" height="24" viewBox="0 0 22 12" shape-rendering="crispEdges" className="animate-ufo-bob">
            <path fill="#b8e0ff" d="M8 1h6v1h1v2H7V2h1z" />
            <path fill="#e8f6ff" d="M9 2h2v1H9z" />
            <path fill="#8e9bb5" d="M5 4h12v1h2v1h1v2h-1v1H3V8H2V6h1V5h2z" />
            <path fill="#5f6b85" d="M3 8h16v1H3z" />
            <path className="animate-ufo-blink" fill="#ffe49a" d="M5 6h2v1H5zm5 0h2v1h-2zm5 0h2v1h-2z" />
            <path fill="#9be3cf" fillOpacity="0.4" d="M8 9h6v1h1v1h1v1H6v-1h1v-1h1z" />
          </svg>
        </div>
      )}

      {RINGS.map((score) => {
        const r = orbitRadius(score) * z;
        return (
          <div key={score} aria-hidden="true">
            <div
              className="pointer-events-none absolute rounded-full border-2 border-dashed border-[#c99be0]/25"
              style={{ left: cx - r, top: cy - r, width: r * 2, height: r * 2 }}
            />
            <span
              className="pointer-events-none absolute bg-[#0c0720] px-1 font-pixel text-[8px] text-[#9d8fc0]"
              style={{ left: cx + r * 0.71 - 14, top: cy - r * 0.71 - 6 }}
            >
              {score}%
            </span>
          </div>
        );
      })}

      <div
        className="pointer-events-none absolute flex flex-col items-center"
        style={{ left: cx - youSize / 2, top: cy - youSize / 2, width: youSize }}
      >
        <div
          className="overflow-hidden rounded-full bg-[#2a1d48] ring-4 ring-[#ffa33a] shadow-[0_0_0_8px_rgba(255,163,58,0.25),0_0_28px_8px_rgba(255,163,58,0.35)]"
          style={{ width: youSize, height: youSize }}
        >
          {myPhoto && <img src={myPhoto} alt="" className="h-full w-full object-cover" draggable={false} />}
        </div>
        <span className="mt-2 bg-[#0c0720] px-1 font-pixel text-[8px] text-[#ffe49a]">YOU</span>
      </div>

      {items.map((it, i) => {
        const p = it.profile;
        const score = it.compatibility.total;
        const a = angleOf(i) + time * orbitSpeed(score, i);
        const r = orbitRadius(score) * z;
        const x = cx + r * Math.cos(a);
        const y = cy + r * Math.sin(a);
        const s = Math.round((30 + (score - 50) * 0.45) * faceScale);
        const picked = pickedId === p.id;
        const passed = Boolean(it.passed_at);
        const color = tierColor(score);
        return (
          <div
            key={p.id}
            className="absolute transition-opacity duration-700"
            style={{ left: x - s / 2, top: y - s / 2, zIndex: picked ? 5 : 1, opacity: passed && !picked ? 0.1 : 1 }}
          >
            <button
              type="button"
              data-face={p.id}
              aria-label={`${p.name}, ${score}% match${passed ? ', passed' : ''}`}
              aria-pressed={picked}
              onClick={() => onPick(p.id)}
              className="block overflow-hidden rounded-full bg-[#2a1d48] transition-transform active:scale-90"
              style={{
                width: s,
                height: s,
                boxShadow: picked
                  ? `0 0 0 3px #0c0720, 0 0 0 6px #ffe49a, 0 0 18px 6px rgba(255,228,154,0.45)`
                  : `0 0 0 2px #0c0720, 0 0 0 4px ${color}`,
              }}
            >
              {p.photos[0] && <img src={p.photos[0].url} alt="" className="h-full w-full object-cover" draggable={false} />}
            </button>
            {(showAllScores || score >= 85 || picked) && (!passed || picked) && (
              <div className="pointer-events-none absolute left-1/2 top-full mt-1.5 flex w-28 -translate-x-1/2 flex-col items-center">
                {(showNames || picked) && (
                  <span className="bg-[#0c0720]/80 px-1 text-lg leading-4">{p.name}</span>
                )}
                <span className="bg-[#0c0720]/80 px-1 font-pixel text-[8px] leading-3" style={{ color }}>
                  {score}%
                </span>
              </div>
            )}
          </div>
        );
      })}

      <div className="absolute right-3 top-3 z-10 flex flex-col items-center gap-2.5">
        <ZoomButton label="Zoom in" onClick={() => zoomAt(1.4, size.w / 2, size.h / 2)}>+</ZoomButton>
        <span className="font-pixel text-[8px] text-[#9d8fc0]">x{z.toFixed(1)}</span>
        <ZoomButton label="Zoom out" onClick={() => zoomAt(1 / 1.4, size.w / 2, size.h / 2)}>-</ZoomButton>
        <button
          type="button"
          onClick={() => setView({ z: null, x: 0, y: 0 })}
          className="mt-1 h-11 px-1 font-pixel text-[8px] text-[#c9b8ea] underline"
        >
          FIT
        </button>
      </div>

      {!pickedId && (
        <p className="pointer-events-none absolute bottom-3 left-4 right-16 text-lg leading-5 text-[#9d8fc0]">
          Closer orbit = stronger match. Pinch to zoom, tap a face.
        </p>
      )}

      {children}
    </div>
  );
}

function ZoomButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="px-frame h-11 w-11 bg-[#2a1d48] font-pixel text-base text-[#f1e8ff] active:translate-y-px"
    >
      {children}
    </button>
  );
}

const BAR_LABELS: [keyof FeedItem['compatibility'], string][] = [
  ['personality', 'Personality'],
  ['love_language', 'Love language'],
  ['lifestyle', 'Lifestyle'],
  ['shared', 'Shared'],
];

/** The quick look shown when a face is tapped. "Open" shows the full profile card. */
export function QuickCard({
  item,
  onClose,
  onPass,
  onOpen,
  onLike,
}: {
  item: FeedItem;
  onClose: () => void;
  onPass: () => void;
  onOpen: () => void;
  onLike: () => void;
}) {
  const p = item.profile;
  const c = item.compatibility;
  const prompt = [...p.prompts].sort((a, b) => a.position - b.position)[0];
  const nickname = p.personality ? TYPE_NICKNAMES[p.personality.type] : null;
  const bars = BAR_LABELS.map(([k, label]) => ({ label, value: c[k] as number | null })).filter(
    (b): b is { label: string; value: number } => typeof b.value === 'number',
  );
  return (
    <section
      aria-label={`${p.name} quick look`}
      className="animate-slide-up px-frame absolute inset-x-3 bottom-3 z-20 flex flex-col gap-3 bg-[#1a1033] p-4 font-retro"
      style={{ ['--pf' as string]: '#e8505b' }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-3">
        <img src={p.photos[0]?.url} alt="" className="px-frame h-16 w-16 bg-[#2a1d48] object-cover" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[26px] leading-6">
            <span className="truncate">
              {p.name}, {p.age}
            </span>
            {p.verified && <VerifiedBadge />}
          </div>
          <div className="truncate text-lg leading-5 text-[#c9b8ea]">
            {[p.city ?? p.distance, p.personality && `${p.personality.type}${nickname ? ` ${nickname}` : ''}`]
              .filter(Boolean)
              .join(' · ')}
          </div>
        </div>
        <div className="flex flex-col items-end">
          <span className="font-pixel text-lg" style={{ color: tierColor(c.total) }}>
            {c.total}%
          </span>
          <span className="text-base text-[#9d8fc0]">match</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close quick look"
          className="-mr-3 -mt-3 h-11 w-11 self-start font-pixel text-xs text-[#c9b8ea]"
        >
          X
        </button>
      </div>

      {bars.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {bars.map((b) => (
            <div key={b.label} className="flex items-center gap-2.5">
              <span className="w-28 text-lg leading-4 text-[#c9b8ea]">{b.label}</span>
              <div className="flex flex-1 gap-[3px]" role="img" aria-label={`${b.label} ${b.value}%`}>
                {Array.from({ length: 10 }, (_, j) => (
                  <div
                    key={j}
                    className="h-2.5 flex-1"
                    style={{ background: j < Math.round(b.value / 10) ? (j >= 8 ? '#ffe49a' : '#e8505b') : '#2a1d48' }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {prompt && (
        <div className="bg-[#120a26] px-2.5 py-2">
          <div className="text-base leading-4 text-[#9d8fc0]">{prompt.prompt}</div>
          <div className="mt-1 line-clamp-2 text-xl leading-5">{prompt.answer}</div>
        </div>
      )}

      {item.passed_at && (
        <p className="text-lg leading-5 text-[#9d8fc0]">You passed. {p.name} fades away within a day unless you change your mind.</p>
      )}

      <div className="flex gap-3">
        {!item.passed_at && (
          <PixelButton color="#5b2a6e" bg="#2a1d48" text="#c9b8ea" onClick={onPass} label={`Pass on ${p.name}`}>
            PASS
          </PixelButton>
        )}
        <PixelButton color="#8e4fa6" bg="#4a2a6e" text="#f1e8ff" onClick={onOpen} label={`Open ${p.name}'s profile`}>
          OPEN
        </PixelButton>
        <PixelButton color="#e8505b" bg="#e8505b" text="#ffffff" onClick={onLike} label={`Like ${p.name}`}>
          LIKE
        </PixelButton>
      </div>
    </section>
  );
}

function PixelButton({
  color,
  bg,
  text,
  onClick,
  label,
  children,
}: {
  color: string;
  bg: string;
  text: string;
  onClick: () => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="px-frame min-h-11 flex-1 font-pixel text-[10px] active:translate-y-px"
      style={{ background: bg, color: text, ['--pf' as string]: color }}
    >
      {children}
    </button>
  );
}
