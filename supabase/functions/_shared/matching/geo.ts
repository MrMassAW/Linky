import type { GeoPoint } from './types.ts';

const EARTH_RADIUS_KM = 6371;
const rad = (d: number) => (d * Math.PI) / 180;

export function distanceKm(a: GeoPoint, b: GeoPoint): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/** Rounded, privacy-preserving distance label. Never exposes exact distance. */
export function distanceLabel(km: number): string {
  if (km < 2) return 'less than 2 km away';
  if (km < 10) return `about ${Math.round(km)} km away`;
  if (km < 100) return `about ${Math.round(km / 5) * 5} km away`;
  return `about ${Math.round(km / 50) * 50} km away`;
}

/**
 * Snap a point to a ~1 km grid so the exact location is never stored client-visible.
 * 0.01° latitude ≈ 1.1 km.
 */
export function approximate(p: GeoPoint, step = 0.01): GeoPoint {
  const snap = (n: number) => Math.round(n / step) * step;
  return { lat: Number(snap(p.lat).toFixed(4)), lng: Number(snap(p.lng).toFixed(4)) };
}

export function ageFrom(birthdate: string, now: Date = new Date()): number {
  const b = new Date(birthdate + 'T00:00:00Z');
  let age = now.getUTCFullYear() - b.getUTCFullYear();
  const m = now.getUTCMonth() - b.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < b.getUTCDate())) age--;
  return age;
}
