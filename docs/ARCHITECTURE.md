# Architecture & design notes

## Two backends, one interface

`apps/pwa/src/lib/backend.ts` defines everything the screens need. `getBackend()` picks:

- **SupabaseBackend** when `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set: Supabase Auth, PostgREST + RPCs, Edge Functions, R2 or Supabase Storage.
- **MockBackend** otherwise: the whole "server" lives in IndexedDB on the device, seeded with the same 50 demo profiles as `supabase/seed.sql`. Its rules (limits, visibility, filters, auto-flag) mirror the SQL so the demo behaves like production.

Both produce the same JSON shapes (`lib/types.ts`), matching the SQL function `public_profile_json()`.

## Privacy model (spec §11)

- **Clients never read other people's rows.** RLS on every table restricts direct access to your own data. Everything about someone else comes from `SECURITY DEFINER` RPCs (`get_feed`, `get_public_profile`, `get_likes_you`, `get_matches`) that:
  - return **age**, never birthdate;
  - return a **rounded distance label** ("about 5 km away"), never coordinates. Locations are also snapped to a ~1 km grid before storage (`set_my_location`, and client-side in `BasicsForm`);
  - honour every visibility toggle (gender, pronouns, orientation, type, love languages, each lifestyle answer);
  - apply the kink visibility levels: hidden / matches only / opted-in viewers / public.
- **Messenger handles** are only returned by `get_shared_handles()` once both people tapped Connect.
- **Moderation columns** (`verified`, `banned`, `flagged`, `is_admin`, `supporter`) can't be self-set: a trigger restores them unless the change comes from trusted server code or an admin.
- **Selfies never leave the device.** Only the verification outcome (passed, challenges, scores) is stored.
- **Export and deletion:** `export_my_data()` returns everything about you; deletion hides you immediately and `purge_deleted_accounts()` (daily cron) erases the account and photos after 30 days.

## Matching (spec §5, §6, §8)

All scoring lives in `shared/matching` and is shared by the PWA (mock backend) and the `feed` edge function (copied to `supabase/functions/_shared/matching` by `pnpm sync:shared`; a test guards drift).

1. **Hard filters** (`hardFilter`): mutual "show me" preferences (gender buckets: men / women / non-binary & gender-diverse), both age ranges, the smaller of both distance limits, every dealbreaker of either person (unanswered fields fail a dealbreaker), and the kink filter. The kink filter only considers people who opted in **and** share tags pre-match (visibility opted-in or public).
2. **Score 0–100**: personality 35%, love language 35%, lifestyle 20%, shared languages/interests 10%. Missing parts are dropped and weights renormalised.
   - *Personality*: 16×16 table seeded from common "ideal pair" charts (e.g. INFP–ENFJ, ENFP–INTJ = 95) plus a rule-based base for the rest, then nudged by raw percentages: closeness on S/N and J/P up to ±5 each, complementarity on E/I and T/F up to +3 each.
   - *Love language*: cosine similarity of A's giving vs B's receiving and B's giving vs A's receiving, averaged. Because share vectors are all positive, cosine is stretched from [0.5, 1] to [0, 100]. +4 bonuses when top languages line up.
   - *Lifestyle*: ordinal closeness for drinking/cannabis/smoking, similarity tables for goal, kids and pets.
3. **Feed order**: score + 5 if verified + up to 5 for recent activity + a small per-day random jitter (stable within a day).
4. In production the `feed` function pre-filters in SQL (`feed_prefilter`, PostGIS `ST_DWithin`), scores in TS, and caches results in `feed_cache` for the day.

## Quizzes

- **16-type personality**: 20 original statements, 5 per axis, balanced so agreeing points to each pole equally often (reduces "agree with everything" bias). 5-point scale → percent toward E/S/T/J. Users can enter a known type instead (stored with `self_reported = true` and moderate 70/30 percentages).
- **Love languages**: 15 forced-choice "receiving" pairs (each language appears 6 times) and 10 "giving" pairs (each pair once). Shares sum to 100.

## Photos

`lib/image.ts` resizes to 1080 px on the long edge and encodes **AVIF** where the browser supports encoding it, else **WebP**, else JPEG, stepping quality down until the file is ≤ 80 KB (typically 30–70 KB). Not every browser can encode AVIF from a canvas (headless Chromium in our tests fell back to WebP, ~36 KB for a 12 MP photo); the encoder is probed once and the best available format is used.

`lib/nsfw.ts` runs **NSFWJS (MobileNetV2)** on device before upload; photos scoring ≥ 0.7 (porn + hentai + ½ sexy) are rejected. If the model can't load, the photo is accepted with `nsfw_score = null`, which the admin queue labels "unscored".

## Liveness (spec §3, §10)

`lib/liveness.ts` uses **MediaPipe Face Landmarker** (WASM self-hosted at `/mediapipe/`, model from Google's CDN, cached by the service worker):

- 3 random challenges in random order: always a blink and a head turn, plus a smile or the other turn.
- Each challenge needs a neutral pose first (so holding a pose or a photo can't pass), exactly one face in frame, and must finish within 60 s.
- A frontal, eyes-open frame produces a **face-geometry signature** (normalised distances between 11 landmarks) that is compared with faces found in the profile photos.

**Known limitations, to address before launch:**
- The geometry signature is a weak identity signal, not a biometric embedding. It catches "no face in your photos" and very different faces; it won't stop a determined impersonator. For v1 the score is advisory (shown to moderators), not a hard gate. Phase 2 should use a proper on-device face-embedding model (e.g. MobileFaceNet via TFLite / ML Kit) with a calibrated threshold.
- The head-turn direction and thresholds (`THRESHOLDS` in `liveness.ts`) were unit-tested on synthetic signals and on a fake camera, **not yet tuned on real faces and phones**. Please try it on a couple of devices; if "turn left" feels reversed, swap the sign in `stepChallenge`.
- `submit_verification()` trusts the client. A modified client could mark itself verified. Phase 2 native apps should send a signed attestation (Play Integrity / App Attest) that the server checks.

## Limits & safety (spec §4.2, §4.4, §10)

- 10 likes per day (supporters unlimited), 20 notes per person per match per day, 500 characters per note, 200 per like comment. Enforced in SQL (`like_profile`, `enforce_note_limit` trigger) and mirrored in the mock.
- Report + block on every profile and every received note. Reports snapshot the note text so evidence survives an unmatch. Profiles reported by 3+ different people are auto-flagged and sorted to the top of the admin queue.
- Admin page: open/actioned/dismissed/all, view reported profile photos and prompts, remove a photo, ban/unban, resolve/reopen.

## Push

`notify` edge function ← Supabase database webhooks (likes, matches, connect, notes) → FCM HTTP v1. The PWA registers an FCM token (`lib/push.ts`, `public/firebase-messaging-sw.js`); the Flutter apps will use the same function.

## Offline / install

`vite-plugin-pwa` precaches the app shell (~1 MB including the 200 demo illustrations) so the app opens offline and is installable. ML code and weights (TensorFlow.js, NSFW model, MediaPipe) are excluded from the precache and cached at runtime on first use.

## Scale notes (10k → 100k users)

- Feed scoring is O(candidates) per user per day, capped at 500 pre-filtered candidates; cached in `feed_cache`. At 100k users, run the feed computation as a nightly batch (pg_cron → edge function) instead of on first open.
- Indexes: GiST on `profiles.location`, likes by recipient, notes by match, reports by status.
- Photos are served from R2 through Cloudflare's CDN with no egress fees.

## Not in Phase 1

Supporter tier payments, Flutter apps (Phase 2), store listings, privacy policy/terms text, email templates, rate limiting beyond likes/notes (e.g. sign-up abuse), and image moderation beyond NSFW (e.g. face-in-photo requirement).
