import { describe, expect, it } from 'vitest';
import { nearestPlace, searchPlaces } from './cities';

describe('city search', () => {
  it('matches without accents, largest first', async () => {
    const [first] = await searchPlaces('montre');
    expect(first.label).toBe('Montréal, Quebec, Canada');
    expect(first.point.lat).toBeCloseTo(45.51, 1);
  });

  it('matches later words and ignores text after a comma', async () => {
    expect((await searchPlaces('york, NY')).some((p) => p.name === 'New York City')).toBe(true);
    expect(await searchPlaces('m')).toEqual([]);
  });

  it('finds the nearest place to a point', async () => {
    expect((await nearestPlace({ lat: 48.86, lng: 2.35 }))?.name).toBe('Paris');
  });
});
