# Setting up the real services

The demo runs without any accounts. Follow these steps to run Linky on real infrastructure. Everything here fits the free tiers for a test group; the spec's estimate for 10k users is about $25–50/month.

Order: **Supabase → (optional) R2 → (optional) Firebase → Cloudflare Pages**. Each step works without the later ones.

---

## 1. Supabase (auth, database, edge functions)

1. Create a project at [supabase.com](https://supabase.com). Note the **Project URL**, **anon key** and **service_role key** (Project Settings → API).
2. Install the CLI and link the repo:
   ```bash
   npm i -g supabase
   supabase login
   supabase link --project-ref <your-project-ref>
   ```
3. Apply the schema (PostGIS, tables, RLS, RPCs, storage bucket):
   ```bash
   supabase db push
   ```
4. **Demo profiles (optional, for a demo/staging project only):** run `supabase/seed.sql` in the SQL editor, or `psql "$DB_URL" -f supabase/seed.sql`. It creates 50 demo users around Montréal plus demo bots that like back and accept Connect. To centre them elsewhere: `pnpm gen:seed-sql --lat 48.8566 --lng 2.3522`. Don't load it into production.
5. **Auth providers** (Authentication → Providers):
   - **Email**: on by default (magic link). Set *Site URL* to your app URL and add `https://<your-app>/auth/callback` (and `http://localhost:5173/auth/callback`) to *Redirect URLs*.
   - **Google**: create an OAuth client in Google Cloud Console (Web application). Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`. Paste client ID/secret into Supabase.
   - **Apple**: needs an Apple Developer account ($99/yr). Create a Services ID + key, follow Supabase's Apple guide, same callback URL.
6. **Edge functions**:
   ```bash
   supabase functions deploy feed
   supabase functions deploy r2-upload
   supabase functions deploy notify --no-verify-jwt
   ```
7. **Make yourself an admin** (SQL editor), after signing up once in the app:
   ```sql
   update public.profiles set is_admin = true where id = (select id from auth.users where email = 'you@example.com');
   ```
8. **Account deletion purge** (30-day deletion from spec §4.5/§11). Enable the `pg_cron` and `pg_net` extensions (Database → Extensions), then:
   ```sql
   select cron.schedule('purge-deleted-accounts', '17 3 * * *', $$
     select net.http_post(
       url := 'https://<project-ref>.supabase.co/functions/v1/r2-upload',
       headers := jsonb_build_object('Authorization', 'Bearer <service_role key>', 'Content-Type', 'application/json'),
       body := '{"action":"purge"}'::jsonb);
   $$);
   ```
   This works with or without R2: the function deletes the user's photos from R2 (if configured) and from the Supabase Storage fallback bucket, then calls `purge_deleted_accounts()`, which removes every database row.
9. **App env**: copy `apps/pwa/.env.example` to `apps/pwa/.env.local` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. `pnpm dev` now uses Supabase.

Photos go to the public Supabase Storage bucket `photos` until R2 is configured.

## 2. Cloudflare R2 (photo storage, no egress fees)

1. Cloudflare dashboard → R2 → **Create bucket** `linky-photos`.
2. Bucket → Settings → **Public access**: connect a custom domain (e.g. `photos.yourdomain.com`) so photos are served through Cloudflare's CDN. (The `r2.dev` URL works for testing.)
3. Bucket → Settings → **CORS policy**:
   ```json
   [{ "AllowedOrigins": ["https://<your-app>", "http://localhost:5173"], "AllowedMethods": ["PUT", "GET"], "AllowedHeaders": ["content-type"], "MaxAgeSeconds": 3600 }]
   ```
4. R2 → **Manage API tokens** → create a token with *Object Read & Write* on the bucket. Note the Access Key ID, Secret, and your Account ID.
5. Give the edge function its secrets:
   ```bash
   supabase secrets set R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... \
     R2_BUCKET=linky-photos R2_PUBLIC_BASE_URL=https://photos.yourdomain.com
   ```
6. Set `VITE_R2_ENABLED=true` in the app env and rebuild.

## 3. Firebase Cloud Messaging (push)

1. Create a project at [console.firebase.google.com](https://console.firebase.google.com) and add a **Web app**. Copy its config object.
2. Project settings → Cloud Messaging → **Web Push certificates** → Generate key pair (the VAPID key).
3. Project settings → Service accounts → **Generate new private key** (JSON).
4. Secrets for the `notify` function:
   ```bash
   supabase secrets set FIREBASE_SERVICE_ACCOUNT="$(cat service-account.json)" WEBHOOK_SECRET=<random string>
   ```
5. Database → **Webhooks** → create three webhooks pointing to `https://<project-ref>.supabase.co/functions/v1/notify` (HTTP POST) with header `x-webhook-secret: <same random string>`:
   - `public.likes` on Insert
   - `public.matches` on Insert and Update
   - `public.notes` on Insert
6. App env: `VITE_FIREBASE_CONFIG` = the web config as one-line JSON, `VITE_FIREBASE_VAPID_KEY` = the key pair. Users enable push in Settings → Notifications. (On iPhone, web push works only after "Add to Home Screen", iOS 16.4+.)

The same FCM project and `notify` function will serve the Phase 2 Flutter apps.

## 4. Cloudflare Pages (hosting)

1. Cloudflare dashboard → Workers & Pages → **Create → Pages → Connect to Git** → pick this repo.
2. Build settings:
   - Build command: `pnpm install --frozen-lockfile && pnpm build`
   - Build output directory: `apps/pwa/dist`
   - Environment variable `NODE_VERSION` = `22`, plus the `VITE_*` variables above.
3. `apps/pwa/public/_redirects` already handles SPA routing; `_headers` sets caching for the service worker and assets.
4. Add your Pages URL to Supabase Auth redirect URLs and to the R2 CORS policy.

Leave the `VITE_SUPABASE_*` variables empty on a preview deployment to get a shareable demo that runs entirely in each visitor's browser.

---

## Checklist of values you'll collect

| Where it goes | Value |
| --- | --- |
| App env | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_R2_ENABLED`, `VITE_FIREBASE_CONFIG`, `VITE_FIREBASE_VAPID_KEY` |
| Supabase secrets | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_BASE_URL`, `FIREBASE_SERVICE_ACCOUNT`, `WEBHOOK_SECRET` |
| Supabase dashboard | Google/Apple OAuth credentials, redirect URLs, webhooks, pg_cron job |

Never commit any of these. `.env*` files are git-ignored.
