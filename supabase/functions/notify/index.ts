// Database Webhook target (Supabase Dashboard → Database → Webhooks) for INSERTs on
// public.likes, public.matches and public.notes, and UPDATEs on public.matches.
// Sends a push through Firebase Cloud Messaging HTTP v1, which covers both the PWA
// (FCM web tokens) and the Phase 2 Flutter apps.
//
// Secrets: FIREBASE_SERVICE_ACCOUNT (the service-account JSON), WEBHOOK_SECRET.
import { HttpError, handle, json, serviceClient } from '../_shared/supabase.ts';

type Payload = {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  record: Record<string, unknown>;
  old_record?: Record<string, unknown> | null;
};

Deno.serve(
  handle(async (req) => {
    if (req.headers.get('x-webhook-secret') !== Deno.env.get('WEBHOOK_SECRET')) {
      throw new HttpError(403, 'forbidden');
    }
    const p = (await req.json()) as Payload;
    const db = serviceClient();
    const msgs: Array<{ to: string; title: string; body: string; url: string }> = [];
    const nameOf = async (id: unknown) =>
      (await db.from('profiles').select('name').eq('id', id).single()).data?.name ?? 'Someone';

    if (p.table === 'likes' && p.type === 'INSERT') {
      msgs.push({ to: String(p.record.to_id), title: 'New like', body: `${await nameOf(p.record.from_id)} liked your profile`, url: '/likes' });
    } else if (p.table === 'matches' && p.type === 'INSERT') {
      for (const [me, other] of [[p.record.user_a, p.record.user_b], [p.record.user_b, p.record.user_a]]) {
        msgs.push({ to: String(me), title: "It's a match!", body: `You and ${await nameOf(other)} liked each other`, url: '/matches' });
      }
    } else if (p.table === 'matches' && p.type === 'UPDATE') {
      const both = p.record.connect_a && p.record.connect_b;
      const was = p.old_record?.connect_a && p.old_record?.connect_b;
      if (both && !was) {
        for (const id of [p.record.user_a, p.record.user_b]) {
          msgs.push({ to: String(id), title: 'Connected 🎉', body: 'You can now see each other’s messenger handles', url: `/matches/${p.record.id}` });
        }
      }
    } else if (p.table === 'notes' && p.type === 'INSERT') {
      const { data: m } = await db.from('matches').select('user_a,user_b').eq('id', p.record.match_id).single();
      if (m) {
        const to = m.user_a === p.record.sender_id ? m.user_b : m.user_a;
        msgs.push({ to, title: `Note from ${await nameOf(p.record.sender_id)}`, body: String(p.record.body).slice(0, 120), url: `/matches/${p.record.match_id}` });
      }
    }

    if (msgs.length === 0) return json({ sent: 0 });
    const token = await googleAccessToken();
    const projectId = JSON.parse(Deno.env.get('FIREBASE_SERVICE_ACCOUNT')!).project_id;
    let sent = 0;
    for (const m of msgs) {
      const { data: tokens } = await db.from('push_tokens').select('token').eq('profile_id', m.to);
      for (const { token: t } of tokens ?? []) {
        const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: {
              token: t,
              notification: { title: m.title, body: m.body },
              webpush: { fcm_options: { link: m.url } },
              data: { url: m.url },
            },
          }),
        });
        if (res.ok) sent++;
        else if (res.status === 404 || res.status === 400) await db.from('push_tokens').delete().eq('token', t);
      }
    }
    return json({ sent });
  }),
);

// --- OAuth2 for the FCM HTTP v1 API using the service account (RS256 JWT) ---
let cached: { token: string; exp: number } | null = null;
async function googleAccessToken(): Promise<string> {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const sa = JSON.parse(Deno.env.get('FIREBASE_SERVICE_ACCOUNT')!);
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o: unknown) =>
    btoa(typeof o === 'string' ? o : JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })}`;
  const pem = sa.private_key.replace(/-----[^-]+-----/g, '').replace(/\s/g, '');
  const key = await crypto.subtle.importKey(
    'pkcs8',
    Uint8Array.from(atob(pem), (c) => c.charCodeAt(0)),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned)));
  const jwt = `${unsigned}.${b64(String.fromCharCode(...sig))}`;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`google oauth failed: ${JSON.stringify(data)}`);
  cached = { token: data.access_token, exp: Date.now() + data.expires_in * 1000 };
  return cached.token;
}
