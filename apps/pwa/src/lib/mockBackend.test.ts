import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { MockBackend } from './mockBackend';
import { scoresFromType } from '@linky/matching';

async function onboard(b: MockBackend) {
  await b.signInWithEmail('tester@example.com');
  await b.saveProfile({ name: 'Tess', birthdate: '1994-06-01', gender: 'woman', location: { lat: 45.52, lng: -73.58 } });
  await b.savePreferences({ age_min: 21, age_max: 45, distance_km: 100, genders_wanted: ['men', 'women', 'nonbinary'] });
  await b.savePersonality({ type: 'INFP', ...scoresFromType('INFP'), visible: true });
  await b.saveLoveLanguage({ receive: [30, 30, 10, 10, 20], give: [20, 30, 10, 20, 20], visible: true });
  await b.savePrompts([{ prompt: 'A perfect Sunday looks like…', answer: 'Pancakes', position: 0 }]);
  await b.addPhoto(new Blob(['x'], { type: 'image/webp' }), 0.01);
  await b.saveHandles([{ app: 'telegram', handle: 'tess', preferred: true }]);
  await b.submitVerification({ passed: true, challenges: ['blink'], liveness_score: 1, face_match_score: 0.8 });
  await b.saveProfile({ onboarding_complete: true });
}

describe('MockBackend demo flow', () => {
  it('feed → like → match → note → bot reply → connect → handles → unmatch', async () => {
    const b = new MockBackend();
    await b.resetDemo();
    await onboard(b);

    const likesYou = await b.getLikesYou();
    expect(likesYou.length).toBeGreaterThan(0);

    const feed = await b.getFeed();
    expect(feed.length).toBeGreaterThan(10);
    for (const f of feed) {
      expect(f.profile).not.toHaveProperty('birthdate');
      expect(f.profile).not.toHaveProperty('location');
      expect(f.compatibility.total).toBeGreaterThanOrEqual(0);
    }

    // like profiles until one of the bots likes back
    let matchId: string | null = null;
    for (const item of feed) {
      const r = await b.like(item.profile.id, 'prompt', item.profile.prompts[0].id, 'hi!');
      if (r.matched) {
        matchId = r.match_id;
        break;
      }
    }
    expect(matchId).not.toBeNull();
    const matches = await b.getMatches();
    expect(matches[0].match_id).toBe(matchId);

    vi.useFakeTimers({ toFake: ['Date'] });
    await b.sendNote(matchId!, 'Hello there');
    expect(await b.getNotes(matchId!)).toHaveLength(1);
    vi.setSystemTime(Date.now() + 10_000);
    expect(await b.getNotes(matchId!)).toHaveLength(2); // bot replied

    expect(await b.getSharedHandles(matchId!)).toBeNull();
    await b.setConnect(matchId!, true);
    vi.setSystemTime(Date.now() + 10_000);
    const handles = await b.getSharedHandles(matchId!);
    expect(handles!.length).toBeGreaterThan(0);
    expect(handles!.some((h) => h.app === 'telegram' && h.shared)).toBe(true);
    vi.useRealTimers();

    await b.unmatch(matchId!);
    expect(await b.getMatches()).toHaveLength(0);
  });

  it('enforces the daily like limit and resets it in demo tools', async () => {
    const b = new MockBackend();
    await b.resetDemo();
    await onboard(b);
    const feed = await b.getFeed();
    for (const item of feed.slice(0, 10)) await b.like(item.profile.id, 'photo', item.profile.photos[0].id, '');
    expect(await b.likesRemaining()).toBe(0);
    await expect(b.like(feed[10].profile.id, 'photo', feed[10].profile.photos[0].id, '')).rejects.toThrow(/likes/);
    await b.resetLimits();
    expect(await b.likesRemaining()).toBe(10);
  });

  it('a pass stays in the feed, marked, for a day and then drops out', async () => {
    const b = new MockBackend();
    await b.resetDemo();
    await onboard(b);
    const [first] = await b.getFeed();
    expect(first.passed_at ?? null).toBeNull();
    await b.skip(first.profile.id);
    const again = (await b.getFeed()).find((f) => f.profile.id === first.profile.id);
    expect(again?.passed_at).toBeTruthy();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 25 * 60 * 60 * 1000);
    try {
      expect((await b.getFeed()).some((f) => f.profile.id === first.profile.id)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('report and block show up in the admin queue and hide the profile', async () => {
    const b = new MockBackend();
    await b.resetDemo();
    await onboard(b);
    const [first] = await b.getFeed();
    await b.report(first.profile.id, 'Spam or scam', 'test');
    await b.block(first.profile.id);
    expect((await b.getFeed()).some((f) => f.profile.id === first.profile.id)).toBe(false);
    await expect(b.adminReportQueue('open')).rejects.toThrow(/Admins only/);
    await b.setAdmin(true);
    const q = await b.adminReportQueue('open');
    expect(q.some((r) => r.target.id === first.profile.id && r.reason === 'Spam or scam')).toBe(true);
    await b.adminSetBanned(first.profile.id, true);
    await b.adminResolveReport(q[0].id, 'actioned');
    expect((await b.adminReportQueue('open')).length).toBe(q.length - 1);
  });

  it('kink tags are hidden unless both opted in (opted_in visibility)', async () => {
    const b = new MockBackend();
    await b.resetDemo();
    await onboard(b);
    const feed = await b.getFeed();
    expect(feed.every((f) => f.profile.kinks === null || f.profile.kinks.length > 0)).toBe(true);
    const before = feed.filter((f) => f.profile.kinks).length;
    await b.saveKinks({ opted_in: true, tags: ['curious'], visibility_level: 'opted_in', filter_shared: false });
    const after = (await b.getFeed()).filter((f) => f.profile.kinks).length;
    expect(after).toBeGreaterThan(before);
  });
});

describe('MockBackend upgrades', () => {
  it('adds newly generated demo profiles to an existing demo without losing the tester', async () => {
    const { get, set, createStore } = await import('idb-keyval');
    const b = new MockBackend();
    await b.resetDemo();
    await onboard(b);
    const store = createStore('linky-mock', 'kv');
    const db = (await get('db', store)) as { profiles: Record<string, { is_demo?: boolean }>; session: string };
    const demoIds = Object.keys(db.profiles).filter((id) => db.profiles[id].is_demo);
    expect(demoIds).toHaveLength(70);
    for (const id of demoIds.slice(50)) delete db.profiles[id]; // an older 50-profile demo
    await set('db', db, store);

    const upgraded = new MockBackend();
    expect((await upgraded.getMyProfile())?.name).toBe('Tess');
    const after = (await get('db', store)) as typeof db;
    expect(Object.values(after.profiles).filter((p) => p.is_demo)).toHaveLength(70);
  });
});

describe('MockBackend feed explanation', () => {
  it('accounts for everyone: seen + filtered + available = total', async () => {
    const b = new MockBackend();
    await b.resetDemo();
    await onboard(b);
    await b.savePreferences({ age_min: 30, age_max: 32, distance_km: 5, genders_wanted: ['men'] });
    const feed = await b.getFeed();
    const x = await b.explainFeed();
    const filtered = Object.values(x.filtered).reduce((a, n) => a + n, 0);
    expect(x.seen + filtered + x.available).toBe(x.total);
    expect(x.available).toBe(feed.length);
    expect(x.filtered.gender).toBeGreaterThan(0);
  });
});
