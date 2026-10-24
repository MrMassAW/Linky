import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { TYPE_NICKNAMES } from '@linky/content';
import { pickHubs, type SharedThing } from '../lib/sharedThings';
import type { FeedItem } from '../lib/types';
import { Button, VerifiedBadge, XIcon } from './ui';

const RINGS = [90, 80, 70, 60];
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 2.6;
/** The screen is tall, so the constellation is an ellipse stretched vertically. */
const EY = 1.35;

/** World-space distance beyond the ring of shared-thing stars: the stronger the match, the closer. */
export const orbitRadius = (score: number) => (100 - Math.max(0, Math.min(100, score))) * 4.6;

/** Match % bands along the logo gradient: orchid 90+, violet 80s, aqua 70s, muted below. */
export function tierColor(score: number) {
  return score >= 90
    ? 'var(--color-orchid-500)'
    : score >= 80
      ? 'var(--color-coral-500)'
      : score >= 70
        ? 'var(--color-aqua-500)'
        : 'var(--color-muted)';
}

const clampZoom = (z: number) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
const angleOf = (i: number) => i * 2.399963 + 0.5; // golden angle keeps neighbours apart

/** Each face sways a little around its spot, at its own pace. */
const sway = (i: number, t: number) => Math.sin(t * (0.25 + ((i * 0.618034) % 1) * 0.5) + i) * 0.05;

interface Node {
  it: FeedItem;
  angle: number;
  hubs: number[];
  shared: SharedThing[];
}

/**
 * Lay people out around the shared-thing stars: each person sits in the direction of the stars
 * they share with you (between them when there are several), and people who land in the same
 * direction fan out a little so faces don't stack.
 */
function layoutConstellation(items: FeedItem[], shared: Record<string, SharedThing[]>) {
  const hubs = pickHubs(items.map((i) => shared[i.profile.id] ?? []));
  const hubAngle = hubs.map((_, i) => -Math.PI / 2 + (i / Math.max(1, hubs.length)) * Math.PI * 2);
  const nodes: Node[] = items.map((it, i) => {
    const mine = shared[it.profile.id] ?? [];
    const idx = hubs.map((h, k) => (mine.some((m) => m.key === h.key) ? k : -1)).filter((k) => k >= 0);
    let angle = angleOf(i);
    if (idx.length) {
      const vx = idx.reduce((sum, k) => sum + Math.cos(hubAngle[k]), 0);
      const vy = idx.reduce((sum, k) => sum + Math.sin(hubAngle[k]), 0);
      angle = Math.hypot(vx, vy) < 1e-6 ? hubAngle[idx[0]] + 0.4 : Math.atan2(vy, vx);
    }
    const TAU = Math.PI * 2;
    return { it, angle: ((angle % TAU) + TAU) % TAU, hubs: idx, shared: mine };
  });
  // Spread faces evenly around the circle: keep everyone in the order of the direction they
  // lean (toward their stars), then give each the next of n equal slots, turning the whole ring
  // so slots sit as close as possible to where people lean.
  const n = nodes.length;
  if (n > 1) {
    const TAU = Math.PI * 2;
    const step = TAU / n;
    const ring = [...nodes].sort((a, b) => a.angle - b.angle);
    const ox = ring.reduce((sum, nd, k) => sum + Math.cos(nd.angle - k * step), 0);
    const oy = ring.reduce((sum, nd, k) => sum + Math.sin(nd.angle - k * step), 0);
    const offset = Math.atan2(oy, ox);
    ring.forEach((nd, k) => (nd.angle = offset + k * step));
  }
  return { hubs, hubAngle, nodes };
}

// Twinkling stars laid over the starfield, spread wider than the view so panning reveals more.
const TWINKLES = Array.from({ length: 46 }, (_, i) => {
  const h = (n: number) => ((Math.sin(i * 127.1 + n * 311.7) * 43758.5453) % 1 + 1) % 1;
  return {
    left: `${-25 + h(1) * 150}%`,
    top: `${-25 + h(2) * 150}%`,
    size: h(3) < 0.75 ? 2 : 4,
    color: ['var(--color-coral-200)', 'var(--color-aqua-200)', 'var(--color-orchid-200)', 'var(--color-plum-100)'][Math.floor(h(4) * 4)],
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
  nearIds,
  note,
  noteAlert,
  shared,
  myPhoto,
  pickedId,
  onPick,
  toolbar,
  onReset,
  children,
}: {
  items: FeedItem[];
  /** Near matches: shown faded. */
  nearIds?: Set<string>;
  /** Replaces the usual hint line at the bottom. */
  note?: string;
  /** Show the note as a bright callout (e.g. nobody fits the filters). */
  noteAlert?: boolean;
  /** What I share with each person, by profile id. */
  shared: Record<string, SharedThing[]>;
  myPhoto?: string;
  pickedId: string | null;
  onPick: (id: string | null) => void;
  /** Drawn across the top of the sky (the filters). */
  toolbar?: ReactNode;
  /** Called by RESET after the view is recentered, to clear the filters too. */
  onReset?: () => void;
  children?: ReactNode;
}) {
  // Stars you've tapped; faces light up when they share every one of them.
  const [hubPick, setHubPick] = useState<number[]>([]);
  const { hubs, hubAngle, nodes } = useMemo(() => layoutConstellation(items, shared), [items, shared]);
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 360, h: 560 });
  // Height the filters take at the top; the sky centers in the space left below them.
  const [topInset, setTopInset] = useState(0);
  const bar = useRef<HTMLDivElement>(null);
  // z: null until the user zooms, so the map keeps fitting everyone. x/y: pan offset of the center.
  const [view, setView] = useState<{ z: number | null; x: number; y: number }>({ z: null, x: 0, y: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const moved = useRef(0);
  const velocity = useRef({ x: 0, y: 0, t: 0 });
  const fling = useRef(0);
  const [time, setTime] = useState(0);
  const [shooting, setShooting] = useState<{ id: number; left: string; top: string; angle: number } | null>(null);
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

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useLayoutEffect(() => {
    const row = bar.current?.querySelector<HTMLElement>('[role=group]');
    if (!row) return setTopInset(0);
    const measure = () => setTopInset(row.getBoundingClientRect().bottom - box.current!.getBoundingClientRect().top + 8);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(row);
    return () => ro.disconnect();
  }, [toolbar !== undefined]);

  // The stage is the card minus the filters on top and the hint line at the bottom.
  const HINT = 56;
  const stage = { w: size.w, h: Math.max(200, size.h - topInset - HINT), top: topInset };

  // Start zoomed so most people (the closest three quarters) are in view; zoom out for the rest.
  const farthest = items.reduce((m, i) => Math.max(m, orbitRadius(i.compatibility.total)), orbitRadius(90)) + 140;
  const fitFor = (n: Node) => {
    const r = orbitRadius(n.it.compatibility.total);
    const room = (half: number) => half - 30 - 110; // star ring and face margin
    return Math.min(
      room(stage.w / 2) / Math.max(1, Math.abs(r * Math.cos(n.angle))),
      room(stage.h / 2) / Math.max(1, Math.abs(r * Math.sin(n.angle) * EY)),
    );
  };
  const fits = nodes.map(fitFor).sort((a, b) => b - a);
  const fit = clampZoom(Math.min(1.2, fits[Math.floor(fits.length * 0.75)] ?? 1));
  const z = view.z ?? fit;
  const geom = useRef({ fit, stage, farthest });
  geom.current = { fit, stage, farthest };

  /** Zoom by `factor` keeping the screen point (mx, my) fixed, then pan by (dx, dy). */
  const zoomAt = useCallback((factor: number, mx: number, my: number, dx = 0, dy = 0) => {
    setView((v) => {
      const { fit: f, stage: sz, farthest: far } = geom.current;
      const midY = sz.top + sz.h / 2;
      const z0 = v.z ?? f;
      const z1 = clampZoom(z0 * factor);
      const k = z1 / z0;
      const cx = sz.w / 2 + v.x;
      const cy = midY + v.y;
      // Pan only far enough to bring the outermost orbit to the edge, plus a little slack.
      const limitX = Math.max(0, far * z1 - sz.w / 2) + sz.w * 0.25;
      const limitY = Math.max(0, far * z1 - sz.h / 2) + sz.h * 0.25;
      const clamp = (n: number, limit: number) => Math.max(-limit, Math.min(limit, n));
      return {
        z: z1,
        x: clamp(mx - (mx - cx) * k - sz.w / 2 + dx, limitX),
        y: clamp(my - (my - cy) * k - midY + dy, limitY),
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
  const cy = stage.top + stage.h / 2 + view.y;
  const faceScale = Math.max(0.75, Math.min(1.45, Math.sqrt(z)));
  const youSize = Math.round(50 * faceScale);
  const showAllScores = z >= 0.75;
  const showNames = z >= 1.35;
  const rot = time * 0.01; // the whole constellation turns very slowly
  const hubR = 84 * Math.max(0.9, Math.min(1.4, Math.sqrt(z)));
  const ringR = (score: number) => hubR + 26 + orbitRadius(score) * z;
  const at = (angle: number, r: number) => ({ x: cx + r * Math.cos(angle + rot), y: cy + r * Math.sin(angle + rot) * EY });
  const hubPts = hubAngle.map((a) => at(a, hubR));
  const picked = nodes.find((n) => n.it.profile.id === pickedId);
  const placed = nodes.map((n, i) => ({ ...n, ...at(n.angle + sway(i, time), ringR(n.it.compatibility.total)) }));
  const lit = (n: Node) =>
    hubPick.length ? hubPick.every((k) => n.hubs.includes(k)) : picked ? n === picked : true;
  const sharingAll = hubPick.length ? nodes.filter(lit).length : 0;

  return (
    <div
      ref={box}
      data-testid="space-map"
      data-zoom={z.toFixed(2)}
      className="relative h-full touch-none select-none overflow-hidden rounded-3xl font-sans text-ink shadow-sm ring-1 ring-plum-100/60"
      style={{
        background: `radial-gradient(ellipse at calc(50% + ${view.x}px) calc(50% + ${view.y}px), var(--color-surface) 0%, var(--color-cream) 45%, var(--color-plum-50) 100%)`,
      }}
      // Children like the filters stop pointerdown from bubbling, so start each gesture's drag count here.
      // A primary pointer is the first finger of a new gesture, so drop anything a lost pointerup left behind.
      onPointerDownCapture={(e) => {
        if (!e.isPrimary) return;
        pointers.current.clear();
        moved.current = 0;
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={(e) => e.pointerType === 'mouse' && onPointerUp(e)}
      onClickCapture={(e) => {
        // A drag that ends on a face is a pan, not a tap.
        if (moved.current > 10 && (e.target as HTMLElement).closest('[data-face],[data-hub]')) {
          e.stopPropagation();
          e.preventDefault();
        }
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onPick(null);
          setHubPick([]);
        }
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
            className="animate-twinkle absolute rounded-full"
            style={{
              left: st.left,
              top: st.top,
              width: st.size + 1,
              height: st.size + 1,
              background: st.color,
              animationDuration: st.duration,
              animationDelay: st.delay,
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
          <div className="animate-shoot h-[2px] w-24 rounded-full bg-[linear-gradient(270deg,var(--color-aqua-400)_0_10px,transparent_100%)]" onAnimationEnd={() => setShooting(null)} />
        </div>
      )}

      {RINGS.map((score) => {
        const r = ringR(score);
        return (
          <div
            key={score}
            aria-hidden="true"
            className="pointer-events-none absolute rounded-[50%] border border-dashed border-plum-500/15"
            style={{ left: cx - r, top: cy - r * EY, width: r * 2, height: r * 2 * EY }}
          />
        );
      })}

      <svg aria-hidden="true" className="pointer-events-none absolute inset-0" width={size.w} height={size.h}>
        {hubPts.map((h, k) => (
          <line
            key={`h${k}`}
            x1={cx}
            y1={cy}
            x2={h.x}
            y2={h.y}
            style={{ stroke: 'var(--color-coral-400)' }}
            strokeWidth={2}
            opacity={!hubPick.length ? (picked ? (picked.hubs.includes(k) ? 0.9 : 0.15) : 0.7) : hubPick.includes(k) ? 0.95 : 0.12}
          />
        ))}
        {placed.map((n) => {
          const score = n.it.compatibility.total;
          const color = tierColor(score);
          const w = Math.max(1, (score - 50) / 14) * Math.min(1.3, faceScale);
          const op = (n.it.passed_at && !(picked === n) ? 0.12 : lit(n) ? 0.75 : 0.08) * (nearIds?.has(n.it.profile.id) && picked !== n ? 0.5 : 1);
          return n.hubs.length ? (
            n.hubs.map((k) => (
              <line key={`${n.it.profile.id}-${k}`} x1={hubPts[k].x} y1={hubPts[k].y} x2={n.x} y2={n.y} style={{ stroke: color }} strokeWidth={w} opacity={op} />
            ))
          ) : (
            <line key={n.it.profile.id} x1={cx} y1={cy} x2={n.x} y2={n.y} style={{ stroke: color }} strokeWidth={1} strokeDasharray="3 5" opacity={op * 0.8} />
          );
        })}
      </svg>

      <div
        className="pointer-events-none absolute flex flex-col items-center"
        style={{ left: cx - youSize / 2, top: cy - youSize / 2, width: youSize }}
      >
        <div
          className="overflow-hidden rounded-full bg-coral-100 ring-4 ring-coral-500 shadow-[0_0_0_9px_rgba(124,106,230,0.15),0_8px_24px_rgba(124,106,230,0.35)]"
          style={{ width: youSize, height: youSize }}
        >
          {myPhoto && <img src={myPhoto} alt="" className="h-full w-full object-cover" draggable={false} />}
        </div>
        <span className="mt-2 rounded-full bg-coral-500 px-2 py-0.5 text-[11px] font-semibold text-white shadow-sm">You</span>
      </div>

      {hubs.map((h, k) => {
        const on = hubPick.includes(k);
        const count = nodes.filter((n) => n.hubs.includes(k)).length;
        return (
          <button
            key={h.key}
            type="button"
            data-hub={h.label}
            aria-pressed={on}
            aria-label={`${h.label}: ${count} people share this with you`}
            onClick={() => {
              setHubPick(on ? hubPick.filter((x) => x !== k) : [...hubPick, k]);
              onPick(null);
            }}
            className={`absolute z-[3] -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full px-3 py-1 text-sm font-semibold shadow-sm transition active:scale-95 ${
              on ? 'bg-coral-500 text-white' : 'bg-surface text-plum-700 ring-1 ring-coral-200'
            }`}
            style={{ left: hubPts[k].x, top: hubPts[k].y, opacity: !hubPick.length || on ? 1 : 0.55 }}
          >
            {h.label} <span className={on ? 'text-white/80' : 'text-coral-500'}>{count}</span>
          </button>
        );
      })}

      {placed.map((n) => {
        const it = n.it;
        const p = it.profile;
        const score = it.compatibility.total;
        const { x, y } = n;
        const s = Math.round((30 + (score - 50) * 0.45) * faceScale);
        const picked = pickedId === p.id;
        const passed = Boolean(it.passed_at);
        const color = tierColor(score);
        const dim = !lit(n) && !picked;
        return (
          <div
            key={p.id}
            className="absolute transition-opacity duration-500"
            style={{
              left: x - s / 2,
              top: y - s / 2,
              zIndex: picked ? 5 : 1,
              opacity: passed && !picked ? 0.2 : dim ? 0.3 : nearIds?.has(p.id) && !picked ? 0.5 : 1,
            }}
          >
            <button
              type="button"
              data-face={p.id}
              data-near={nearIds?.has(p.id) || undefined}
              aria-label={`${p.name}, ${score}% match${passed ? ', passed' : nearIds?.has(p.id) ? ', near match' : ''}`}
              aria-pressed={picked}
              onClick={() => onPick(p.id)}
              className="block overflow-hidden rounded-full bg-plum-50 transition-transform active:scale-90"
              style={{
                width: s,
                height: s,
                boxShadow: picked
                  ? `0 0 0 3px var(--color-surface), 0 0 0 6px var(--color-coral-500), 0 8px 20px rgba(124,106,230,0.4)`
                  : `0 0 0 2px var(--color-surface), 0 0 0 4px ${color}, 0 4px 10px rgba(27,28,56,0.15)`,
              }}
            >
              {p.photos[0] && <img src={p.photos[0].url} alt="" className="h-full w-full object-cover" draggable={false} />}
            </button>
            {(showAllScores || score >= 85 || picked) && (!passed || picked) && !dim && (
              <div className="pointer-events-none absolute left-1/2 top-full mt-1.5 flex w-28 -translate-x-1/2 flex-col items-center">
                {(showNames || picked) && (
                  <span className="rounded-full bg-surface/90 px-1.5 text-xs font-semibold leading-4 text-ink">{p.name}</span>
                )}
                <span className="mt-0.5 rounded-full bg-surface/90 px-1.5 text-[11px] font-bold leading-4" style={{ color }}>
                  {score}%
                </span>
              </div>
            )}
          </div>
        );
      })}

      <button
        type="button"
        onClick={() => {
          setView({ z: null, x: 0, y: 0 });
          setHubPick([]);
          onPick(null);
          onReset?.();
        }}
        className="absolute bottom-3 right-3 z-10 rounded-full bg-surface px-4 py-2 text-sm font-semibold text-plum-700 shadow-sm ring-1 ring-plum-100 transition active:scale-95"
      >
        Reset
      </button>

      {!pickedId && noteAlert && note && !hubPick.length ? (
        <p
          role="status"
          className="pointer-events-none absolute bottom-3 left-3 right-24 z-10 rounded-2xl bg-coral-500 px-3.5 py-2.5 text-sm font-semibold leading-5 text-white shadow-lg shadow-coral-200"
        >
          {note}
        </p>
      ) : !pickedId && (
        <p className="pointer-events-none absolute bottom-3.5 left-4 right-24 text-xs leading-4 text-muted">
          {hubPick.length
            ? `${sharingAll} ${sharingAll === 1 ? 'person shares' : 'people share'} ${hubPick.length > 1 ? 'all of these' : 'this'}. Tap more stars to narrow down.`
            : (note ?? 'Stars = what you share. Closer = stronger match. Tap stars or a face.')}
        </p>
      )}

      {toolbar && <div ref={bar}>{toolbar}</div>}
      {children}
    </div>
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
  shared,
  onClose,
  onPass,
  onOpen,
  onLike,
}: {
  item: FeedItem;
  shared?: SharedThing[];
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
      className="animate-slide-up absolute inset-x-3 bottom-3 z-20 flex flex-col gap-3 rounded-3xl bg-surface p-4 shadow-xl shadow-plum-900/15 ring-1 ring-plum-100/60"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-3">
        <img src={p.photos[0]?.url} alt="" className="h-16 w-16 rounded-2xl bg-plum-50 object-cover" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 font-display text-xl font-semibold leading-6">
            <span className="truncate">
              {p.name}, {p.age}
            </span>
            {p.verified && <VerifiedBadge />}
          </div>
          <div className="truncate text-sm text-muted">
            {[p.city ?? p.distance, p.personality && `${p.personality.type}${nickname ? ` ${nickname}` : ''}`]
              .filter(Boolean)
              .join(' · ')}
          </div>
        </div>
        <div className="flex flex-col items-end leading-none">
          <span className="font-display text-2xl font-semibold" style={{ color: tierColor(c.total) }}>
            {c.total}%
          </span>
          <span className="mt-1 text-xs text-muted">match</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close quick look"
          className="-mr-2 -mt-2 flex h-9 w-9 items-center justify-center self-start rounded-full text-muted hover:bg-plum-50"
        >
          <XIcon className="h-5 w-5" />
        </button>
      </div>

      {bars.length > 0 && (
        <div className="flex flex-col gap-2">
          {bars.map((b) => (
            <div key={b.label} className="flex items-center gap-3">
              <span className="w-28 text-sm text-plum-700">{b.label}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-plum-50" role="img" aria-label={`${b.label} ${b.value}%`}>
                <div className="h-full rounded-full bg-coral-400" style={{ width: `${b.value}%` }} />
              </div>
              <span className="w-9 text-right text-xs font-semibold text-plum-700">{b.value}%</span>
            </div>
          ))}
        </div>
      )}

      {shared && shared.length > 0 && (
        <div>
          <div className="text-xs font-medium text-muted">What connects you</div>
          <ul className="mt-1.5 flex flex-wrap gap-1.5" aria-label="What connects you">
            {shared.slice(0, 5).map((t) => (
              <li key={t.key} className="rounded-full bg-coral-50 px-2.5 py-1 text-xs font-medium text-coral-600">
                {t.label}
              </li>
            ))}
          </ul>
        </div>
      )}

      {prompt && (
        <div className="rounded-2xl bg-plum-50 px-3.5 py-2.5">
          <div className="text-xs font-medium text-plum-500">{prompt.prompt}</div>
          <div className="mt-0.5 line-clamp-2 font-display text-[17px] font-semibold leading-snug">{prompt.answer}</div>
        </div>
      )}

      {item.passed_at && (
        <p className="text-sm text-muted">You passed. {p.name} fades away within a day unless you change your mind.</p>
      )}

      <div className="flex gap-2">
        {!item.passed_at && (
          <Button variant="secondary" className="flex-1 !px-3" onClick={onPass} aria-label={`Pass on ${p.name}`}>
            Pass
          </Button>
        )}
        <Button variant="secondary" className="flex-1 !px-3" onClick={onOpen} aria-label={`Open ${p.name}'s profile`}>
          Open
        </Button>
        <Button className="flex-1 !px-3" onClick={onLike} aria-label={`Like ${p.name}`}>
          Like
        </Button>
      </div>
    </section>
  );
}
