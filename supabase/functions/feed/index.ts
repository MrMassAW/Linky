// POST /functions/v1/feed  { limit?: number, refresh?: boolean }
// Builds (once per day) and returns the caller's discover feed.
// 1. SQL pre-filter (gender, age, distance via PostGIS, history, blocks)
// 2. Shared TS matcher re-checks dealbreakers/kink filters and scores 0–100
// 3. Results are cached in feed_cache for the day; get_feed() serves them with
//    public, privacy-safe profile JSON.
import { buildFeed, type MatchableProfile } from '../_shared/matching/index.ts';
import { handle, json, requireUser, serviceClient } from '../_shared/supabase.ts';

Deno.serve(
  handle(async (req) => {
    const { id: uid, client } = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Number(body.limit) || 20, 50);
    const admin = serviceClient();
    const today = new Date().toISOString().slice(0, 10);

    const { count } = await admin
      .from('feed_cache')
      .select('candidate_id', { count: 'exact', head: true })
      .eq('viewer_id', uid)
      .eq('computed_on', today);

    if (!count || body.refresh) {
      const { data: ids, error: e1 } = await admin.rpc('feed_prefilter', { p_viewer: uid, p_limit: 500 });
      if (e1) throw e1;
      const candidateIds = (ids as string[]) ?? [];
      const { data: rows, error: e2 } = await admin.rpc('matchable_json_many', {
        p_ids: [uid, ...candidateIds],
      });
      if (e2) throw e2;
      const [viewer, ...candidates] = rows as MatchableProfile[];
      const ranked = buildFeed(viewer, candidates);

      await admin.from('feed_cache').delete().eq('viewer_id', uid);
      if (ranked.length > 0) {
        const { error: e3 } = await admin.from('feed_cache').insert(
          ranked.map((r) => ({
            viewer_id: uid,
            candidate_id: r.profile.id,
            computed_on: today,
            score: r.compatibility.total,
            breakdown: r.compatibility,
            rank: r.rank,
          })),
        );
        if (e3) throw e3;
      }
    }

    await client.rpc('touch_last_active');
    const { data, error } = await client.rpc('get_feed', { p_limit: limit });
    if (error) throw error;
    return json({ items: data });
  }),
);
