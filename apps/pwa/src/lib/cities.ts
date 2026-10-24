import type { GeoPoint } from '@linky/matching';

export interface Place {
  label: string; // "Montréal, Quebec, Canada"
  name: string;
  point: GeoPoint;
}

interface CityData {
  regions: string[]; // "CA|Quebec"
  cities: [name: string, region: number, lat100: number, lng100: number][];
}

const fold = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

let index: Promise<{ data: CityData; folded: string[] }> | null = null;

/** The ~24k-place list (GeoNames, 15k+ people) loads on first use, as its own chunk. */
function load() {
  index ??= import('../data/cities.json').then((m) => {
    const data = (m.default ?? m) as CityData;
    return { data, folded: data.cities.map((c) => fold(c[0])) };
  });
  return index;
}

let countries: Intl.DisplayNames | null = null;
function countryName(code: string) {
  try {
    countries ??= new Intl.DisplayNames(['en'], { type: 'region' });
    return countries.of(code) ?? code;
  } catch {
    return code;
  }
}

/** Places whose name starts with the query (or has a word that does), largest first. */
export async function searchPlaces(query: string, limit = 8): Promise<Place[]> {
  const q = fold(query.split(',')[0]);
  if (q.length < 2) return [];
  const { data, folded } = await load();
  const starts: number[] = [];
  const words: number[] = [];
  for (let i = 0; i < folded.length && starts.length < limit; i++) {
    if (folded[i].startsWith(q)) starts.push(i);
    else if (words.length < limit && folded[i].includes(` ${q}`)) words.push(i);
  }
  return [...starts, ...words].slice(0, limit).map((i) => {
    const [name, r, lat, lng] = data.cities[i];
    return toPlace(name, data.regions[r], lat, lng);
  });
}

function toPlace(name: string, regionKey: string, lat: number, lng: number): Place {
  const [cc, region] = regionKey.split('|');
  return {
    name,
    label: [name, region && region !== name ? region : null, countryName(cc)].filter(Boolean).join(', '),
    point: { lat: lat / 100, lng: lng / 100 },
  };
}

/** The nearest listed place to a point (for filling the city after "use my location"). */
export async function nearestPlace(point: GeoPoint): Promise<Place | null> {
  const { data } = await load();
  let best = -1;
  let bestD = Infinity;
  const k = Math.cos((point.lat * Math.PI) / 180);
  data.cities.forEach(([, , lat, lng], i) => {
    const d = (lat / 100 - point.lat) ** 2 + ((lng / 100 - point.lng) * k) ** 2;
    if (d < bestD) [best, bestD] = [i, d];
  });
  if (best < 0) return null;
  const [name, r, lat, lng] = data.cities[best];
  return toPlace(name, data.regions[r], lat, lng);
}
