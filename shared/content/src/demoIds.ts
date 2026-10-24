import type { GeoPoint } from '../../matching/src/types.ts';

/** Deterministic UUID for demo rows: profile n, optional sub-row k. */
export function demoUuid(n: number, k = 0): string {
  const hex = (v: number, len: number) => v.toString(16).padStart(len, '0');
  return `00000000-${hex(k, 4)}-4000-8000-${hex(n, 12)}`;
}

/** Move a point by (x km east, y km north). */
export function offsetPoint(center: GeoPoint, offset: { x: number; y: number }): GeoPoint {
  const lat = center.lat + offset.y / 110.574;
  const lng = center.lng + offset.x / (111.32 * Math.cos((center.lat * Math.PI) / 180));
  return { lat, lng };
}
