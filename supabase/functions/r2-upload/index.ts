// POST /functions/v1/r2-upload
//   { action: "sign", contentType: "image/avif" | "image/webp" }  -> { uploadUrl, key, publicUrl }
//   { action: "delete", key }                                       -> { ok }
//   { action: "purge" }  (service role only; schedule daily, see docs/SETUP.md)
//       deletes R2 photos of accounts whose deletion was requested 30+ days ago,
//       then calls purge_deleted_accounts() which removes every database row.
//
// Photos are uploaded straight from the browser to Cloudflare R2 with a short-lived
// presigned PUT URL; the client then inserts the `photos` row (RLS: own rows only).
import { AwsClient } from 'npm:aws4fetch@1';
import { HttpError, handle, json, requireUser, serviceClient } from '../_shared/supabase.ts';

const ACCOUNT_ID = Deno.env.get('R2_ACCOUNT_ID');
const BUCKET = Deno.env.get('R2_BUCKET') ?? 'linky-photos';
const PUBLIC_BASE = Deno.env.get('R2_PUBLIC_BASE_URL'); // e.g. https://photos.linky.app
const R2_ENABLED = Boolean(ACCOUNT_ID && Deno.env.get('R2_ACCESS_KEY_ID'));
// Without R2 secrets the function still runs "purge" against Supabase Storage.
const r2 = R2_ENABLED
  ? new AwsClient({
      accessKeyId: Deno.env.get('R2_ACCESS_KEY_ID')!,
      secretAccessKey: Deno.env.get('R2_SECRET_ACCESS_KEY')!,
      service: 's3',
      region: 'auto',
    })
  : null;
const endpoint = `https://${ACCOUNT_ID}.r2.cloudflarestorage.com/${BUCKET}`;
const ALLOWED = new Set(['image/avif', 'image/webp', 'image/jpeg']);
const MAX_PHOTOS = 6;

Deno.serve(
  handle(async (req) => {
    const body = await req.json();

    if (body.action === 'purge') {
      const auth = req.headers.get('Authorization') ?? '';
      if (auth !== `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`) throw new HttpError(403, 'forbidden');
      const admin = serviceClient();
      const cutoff = new Date(Date.now() - 30 * 864e5).toISOString();
      const { data: doomed, error } = await admin
        .from('profiles')
        .select('id')
        .lt('deletion_requested_at', cutoff);
      if (error) throw error;
      let objects = 0;
      for (const { id } of doomed ?? []) {
        if (r2) objects += await deletePrefix(`photos/${id}/`);
        // Supabase Storage fallback bucket (used before R2 is configured)
        const { data: files } = await admin.storage.from('photos').list(id, { limit: 100 });
        if (files?.length) {
          await admin.storage.from('photos').remove(files.map((f) => `${id}/${f.name}`));
          objects += files.length;
        }
      }
      const { data: purged, error: e2 } = await admin.rpc('purge_deleted_accounts');
      if (e2) throw e2;
      return json({ ok: true, accounts: purged, objects });
    }

    const { id: uid, client } = await requireUser(req);
    if (!r2) throw new HttpError(501, 'R2 is not configured');

    if (body.action === 'sign') {
      if (!ALLOWED.has(body.contentType)) throw new HttpError(400, 'unsupported type');
      const { count } = await client.from('photos').select('id', { count: 'exact', head: true });
      if ((count ?? 0) >= MAX_PHOTOS) throw new HttpError(400, 'photo limit reached');
      const ext = body.contentType.split('/')[1];
      const key = `photos/${uid}/${crypto.randomUUID()}.${ext}`;
      const url = new URL(`${endpoint}/${key}`);
      url.searchParams.set('X-Amz-Expires', '300');
      const signed = await r2.sign(new Request(url, { method: 'PUT', headers: { 'Content-Type': body.contentType } }), {
        aws: { signQuery: true },
      });
      return json({ uploadUrl: signed.url, key, publicUrl: `${PUBLIC_BASE}/${key}` });
    }

    if (body.action === 'delete') {
      const key = String(body.key ?? '');
      if (!key.startsWith(`photos/${uid}/`)) throw new HttpError(403, 'not your photo');
      await r2.fetch(`${endpoint}/${key}`, { method: 'DELETE' });
      await serviceClient().from('photos').delete().eq('r2_key', key).eq('profile_id', uid);
      return json({ ok: true });
    }

    throw new HttpError(400, 'unknown action');
  }),
);

async function deletePrefix(prefix: string): Promise<number> {
  if (!r2) return 0;
  const res = await r2.fetch(`${endpoint}?list-type=2&prefix=${encodeURIComponent(prefix)}`);
  const xml = await res.text();
  const keys = [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) => m[1]);
  for (const key of keys) await r2.fetch(`${endpoint}/${key}`, { method: 'DELETE' });
  return keys.length;
}
