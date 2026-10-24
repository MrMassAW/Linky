// Builds apps/pwa/src/data/cities.json: every place with 15k+ people (GeoNames, via the
// all-the-cities and cities.json packages), largest first, for the offline city search.
// Coordinates are rounded to 0.01° (~1 km), the same precision the app stores.
//   node scripts/gen-cities.mjs
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const cities = require('all-the-cities');
const admin1 = require('cities.json/admin1.json');

const MIN_POPULATION = 15000;
const adminName = new Map(admin1.map((a) => [a.code, a.name]));
const regions = [];
const regionIndex = new Map();
const region = (country, code) => {
  const key = `${country}|${adminName.get(`${country}.${code}`) ?? ''}`;
  if (!regionIndex.has(key)) {
    regionIndex.set(key, regions.length);
    regions.push(key);
  }
  return regionIndex.get(key);
};

const rows = cities
  .filter((c) => c.population >= MIN_POPULATION)
  .sort((a, b) => b.population - a.population)
  .map((c) => {
    const [lng, lat] = c.loc.coordinates;
    return [c.name, region(c.country, c.adminCode), Math.round(lat * 100), Math.round(lng * 100)];
  });

writeFileSync(new URL('../apps/pwa/src/data/cities.json', import.meta.url), JSON.stringify({ regions, cities: rows }));
console.log(`${rows.length} places, ${regions.length} regions`);
