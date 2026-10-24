# Linky

A prompt-based dating app for verified humans that matches on **16-type personality** and **love languages**, then hands the conversation off to the messenger people already use. This repo holds **Phase 1: the installable PWA demo**, built to the v1 product spec.

## Try the demo in 1 minute

```bash
pnpm install
pnpm dev            # http://localhost:5173
```

With no environment variables set, the app runs on an **in-browser demo backend** (IndexedDB) with **70 seeded demo profiles**. Nothing leaves your device. The demo profiles act as simple bots, so one person can walk the whole flow:

- a few of them already **like you** once you finish onboarding,
- most **like you back**, so a like becomes a match,
- they **reply to notes** a few seconds later, and **accept Connect**.

Settings → **Demo tools** lets you turn on admin mode (report queue), reset daily limits, or wipe the demo.

> No camera, or testing on a desktop? The face check has a "Simulate a pass (demo only)" link in demo mode.

## What's in Phase 1

| Spec milestone (§15) | Where |
| --- | --- |
| Sign up (email / Google / Apple, 18+ gate), liveness check, full profile with compressed photos | `screens/Welcome`, `screens/onboarding`, `components/editors/*` |
| Both quizzes with results | `components/editors/PersonalityQuiz`, `LoveQuiz`, `quiz/scoring.ts` |
| Discover as a pixel space map (you at the center, faces orbit by compatibility; pinch/swipe, quick card, Open for the full profile; passes fade for a day) plus a list view, over ~70 seeded profiles | `screens/Discover`, `components/SpaceMap`, `shared/matching` |
| Like a photo/prompt with a comment → match → async note → mutual Connect → WhatsApp/Telegram | `screens/LikesYou`, `screens/Matches`, `screens/MatchDetail` |
| Filters and visibility toggles, including the opt-in kink section | `screens/Filters`, `components/editors/LifestyleForm`, `KinksForm` |
| Report/block shows up in the admin queue | `components/SafetySheet`, `screens/Admin` |

## Repo layout

```
apps/pwa/            React + Vite + TypeScript + Tailwind PWA
  src/screens/       one file per screen (spec §13)
  src/components/    UI kit, profile card, sheets, onboarding/profile editors
  src/lib/           backends (mock + Supabase), image compression, liveness, nsfw, push
  src/quiz/          personality + love-language scoring
shared/matching/     scoring + 16x16 table + hard filters + feed ranking (used by PWA and edge functions)
shared/content/      prompts, original quiz questions, option labels, demo profile generator
supabase/migrations/ schema, RLS policies, RPCs, storage bucket
supabase/functions/  feed (scoring), r2-upload (signed uploads + purge), notify (FCM push)
supabase/seed.sql    70 demo profiles (generated: `pnpm gen:seed-sql`)
docs/                SETUP.md (real services), ARCHITECTURE.md (design notes, limits)
scripts/             seed generator, DB tests, end-to-end demo test
```

## Commands

| Command | What it does |
| --- | --- |
| `pnpm dev` / `pnpm build` / `pnpm preview` | Run, build, or serve the PWA |
| `pnpm test` | Unit tests (matching, quiz scoring, mock backend flows, liveness/NSFW helpers) |
| `scripts/test-db.sh` | Applies migrations + seed to a local Postgres+PostGIS and runs RLS/RPC flow assertions |
| `node scripts/e2e-demo.mjs` | Drives the whole demo milestone in headless Chromium against `pnpm preview` |
| `pnpm gen:seed-sql [--lat --lng]` | Regenerates `supabase/seed.sql` and `apps/pwa/public/demo/*.svg` |
| `pnpm sync:shared` | Copies `shared/matching` into the edge functions (a test fails if they drift) |

## Going live with real services

See **[docs/SETUP.md](docs/SETUP.md)**: Supabase (auth, database, edge functions), Cloudflare R2 (photos), Firebase (push), and Cloudflare Pages (hosting). The same build switches to the real backend as soon as `VITE_SUPABASE_URL` is set.

Design notes, privacy model and known limitations are in **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.

City search uses place data from [GeoNames](https://www.geonames.org/) (CC BY 4.0), bundled offline (`pnpm gen:cities`).

The personality quiz is an original 16-type question set. It is not affiliated with the Myers-Briggs Company or the MBTI® assessment. The love-language quiz is likewise original and not affiliated with The 5 Love Languages®. See [docs/IP-REVIEW.md](docs/IP-REVIEW.md) for the full IP review.
