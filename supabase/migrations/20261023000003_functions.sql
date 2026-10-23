-- Linky RPCs. Clients call these with supabase.rpc(...).
-- Functions that touch other people's data are SECURITY DEFINER and do their own
-- authorization checks; helpers that expose raw data are restricted to service_role.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.gender_bucket(g text) returns text
language sql immutable as $$
  select case when g in ('man', 'trans man') then 'men'
              when g in ('woman', 'trans woman') then 'women'
              else 'nonbinary' end;
$$;

create or replace function public.age_of(b date) returns int
language sql stable as $$ select date_part('year', age(current_date, b))::int; $$;

create or replace function public.distance_label(km double precision) returns text
language sql immutable as $$
  select case
    when km is null then null
    when km < 2 then 'less than 2 km away'
    when km < 10 then format('about %s km away', round(km))
    when km < 100 then format('about %s km away', round(km / 5) * 5)
    else format('about %s km away', round(km / 50) * 50)
  end;
$$;

create or replace function public.is_blocked(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from blocks where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a));
$$;

create or replace function public.match_between(a uuid, b uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select id from matches where user_a = least(a, b) and user_b = greatest(a, b);
$$;

create or replace function public.require_uid() returns uuid
language plpgsql stable as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  return uid;
end $$;

-- ---------------------------------------------------------------------------
-- Public view of a profile, as seen by p_viewer
-- ---------------------------------------------------------------------------
create or replace function public.public_profile_json(p_viewer uuid, p_target uuid) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare
  p profiles;
  v profiles;
  k kinks;
  viewer_opted boolean;
  matched boolean;
  show_kinks boolean := false;
begin
  select * into p from profiles where id = p_target;
  if not found then return null; end if;
  select * into v from profiles where id = p_viewer;
  select * into k from kinks where profile_id = p_target;
  matched := public.match_between(p_viewer, p_target) is not null;
  select coalesce(opted_in, false) into viewer_opted from kinks where profile_id = p_viewer;
  if k.opted_in then
    show_kinks := case k.visibility_level
      when 'public' then true
      when 'opted_in' then coalesce(viewer_opted, false)
      when 'matches' then matched
      else false end;
  end if;

  return jsonb_build_object(
    'id', p.id,
    'name', p.name,
    'age', public.age_of(p.birthdate),
    'gender', case when p.show_gender then coalesce(p.gender_custom, p.gender) end,
    'pronouns', case when p.show_pronouns then p.pronouns end,
    'orientation', case when p.show_orientation then p.orientation end,
    'city', p.city,
    'height_cm', p.height_cm,
    'verified', p.verified,
    'distance', public.distance_label(
      case when v.location is not null and p.location is not null
        then st_distance(v.location, p.location) / 1000 end),
    'is_match', matched,
    'photos', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'url', url, 'position', position) order by position)
      from photos where profile_id = p.id and not removed_by_admin), '[]'::jsonb),
    'prompts', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'prompt', prompt, 'answer', answer, 'position', position) order by position)
      from prompt_answers where profile_id = p.id), '[]'::jsonb),
    'personality', (
      select jsonb_build_object('type', type, 'e_i', e_i, 's_n', s_n, 't_f', t_f, 'j_p', j_p)
      from personality where profile_id = p.id and visible),
    'love_language', (
      select jsonb_build_object('receive', receive, 'give', give)
      from love_language where profile_id = p.id and visible),
    'attributes', coalesce((
      select jsonb_object_agg(key, value) from attributes
      where profile_id = p.id and visible and value is not null), '{}'::jsonb),
    'kinks', case when show_kinks then to_jsonb(k.tags) end
  );
end $$;
revoke execute on function public.public_profile_json(uuid, uuid) from public, anon, authenticated;

create or replace function public.get_public_profile(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := public.require_uid();
begin
  if public.is_blocked(uid, p_id) then return null; end if;
  if exists (select 1 from profiles where id = p_id and banned) and not public.is_admin() then return null; end if;
  return public.public_profile_json(uid, p_id);
end $$;

-- Full scoring input (for the feed edge function only).
create or replace function public.matchable_json(p_id uuid) returns jsonb
language sql stable security definer set search_path = public, extensions as $$
  select jsonb_build_object(
    'id', p.id,
    'birthdate', p.birthdate,
    'gender', p.gender,
    'verified', p.verified,
    'paused', p.paused,
    'last_active_at', p.last_active_at,
    'location', case when p.location is not null then jsonb_build_object(
      'lat', st_y(p.location::geometry), 'lng', st_x(p.location::geometry)) end,
    'personality', (select to_jsonb(x) - 'profile_id' from personality x where x.profile_id = p.id),
    'love_language', (select to_jsonb(x) - 'profile_id' from love_language x where x.profile_id = p.id),
    'attributes', coalesce((select jsonb_object_agg(key, jsonb_build_object(
        'value', value, 'visible', visible, 'is_dealbreaker', is_dealbreaker, 'accept', accept))
      from attributes where profile_id = p.id), '{}'::jsonb),
    'preferences', (select to_jsonb(x) - 'profile_id' from preferences x where x.profile_id = p.id),
    'kinks', (select to_jsonb(x) - 'profile_id' from kinks x where x.profile_id = p.id)
  ) from profiles p where p.id = p_id;
$$;
revoke execute on function public.matchable_json(uuid) from public, anon, authenticated;

-- Cheap SQL pre-filter: mutual gender, mutual age, distance, availability, history.
-- Dealbreakers and kink filters are applied by the shared TS matcher afterwards.
create or replace function public.feed_prefilter(p_viewer uuid, p_limit int default 500)
returns setof uuid
language sql stable security definer set search_path = public, extensions as $$
  with me as (
    select p.*, pr.age_min, pr.age_max, pr.distance_km, pr.genders_wanted
    from profiles p join preferences pr on pr.profile_id = p.id where p.id = p_viewer
  )
  select c.id
  from profiles c
  join preferences cp on cp.profile_id = c.id
  cross join me
  where c.id <> me.id
    and c.onboarding_complete and not c.paused and not c.banned and c.deletion_requested_at is null
    and public.gender_bucket(c.gender) = any (me.genders_wanted)
    and public.gender_bucket(me.gender) = any (cp.genders_wanted)
    and public.age_of(c.birthdate) between me.age_min and me.age_max
    and public.age_of(me.birthdate) between cp.age_min and cp.age_max
    and (
      (me.distance_km is null and cp.distance_km is null)
      or (me.location is not null and c.location is not null and st_dwithin(
            me.location, c.location,
            1000 * least(coalesce(me.distance_km, 32767), coalesce(cp.distance_km, 32767))))
    )
    and not public.is_blocked(me.id, c.id)
    and not exists (select 1 from likes l where l.from_id = me.id and l.to_id = c.id)
    and not exists (select 1 from skips s where s.from_id = me.id and s.to_id = c.id)
    and public.match_between(me.id, c.id) is null
  order by c.last_active_at desc
  limit p_limit;
$$;
revoke execute on function public.feed_prefilter(uuid, int) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Discover feed
-- ---------------------------------------------------------------------------
create or replace function public.get_feed(p_limit int default 20) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'profile', public.public_profile_json(f.viewer_id, f.candidate_id),
      'compatibility', f.breakdown) order by f.rank desc), '[]'::jsonb)
  from (
    select f.* from feed_cache f
    join profiles c on c.id = f.candidate_id
    where f.viewer_id = auth.uid() and f.computed_on = current_date
      and not c.paused and not c.banned
      and not public.is_blocked(f.viewer_id, f.candidate_id)
      and not exists (select 1 from likes l where l.from_id = f.viewer_id and l.to_id = f.candidate_id)
      and not exists (select 1 from skips s where s.from_id = f.viewer_id and s.to_id = f.candidate_id)
      and public.match_between(f.viewer_id, f.candidate_id) is null
    order by f.rank desc
    limit p_limit
  ) f;
$$;

create or replace function public.daily_like_limit() returns int language sql immutable as $$ select 10 $$;
create or replace function public.daily_note_limit() returns int language sql immutable as $$ select 5 $$;

create or replace function public.likes_remaining() returns int
language sql stable security definer set search_path = public as $$
  select case when (select supporter from profiles where id = auth.uid()) then 9999
    else greatest(0, public.daily_like_limit() - (
      select count(*)::int from likes where from_id = auth.uid() and created_at >= date_trunc('day', now())))
  end;
$$;

create or replace function public.like_profile(
  p_to uuid, p_target_type text, p_target_id uuid, p_comment text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := public.require_uid();
  target profiles;
  mid uuid;
  compat jsonb;
begin
  if (select not verified from profiles where id = uid) then
    raise exception 'verify your profile before liking' using errcode = 'P0001';
  end if;
  select * into target from profiles where id = p_to;
  if not found or target.banned or target.paused or public.is_blocked(uid, p_to) then
    raise exception 'profile unavailable' using errcode = 'P0002';
  end if;
  if public.likes_remaining() <= 0 then
    raise exception 'daily like limit reached' using errcode = 'P0003';
  end if;
  if p_target_type = 'photo' and not exists (select 1 from photos where id = p_target_id and profile_id = p_to) then
    raise exception 'invalid like target';
  elsif p_target_type = 'prompt' and not exists (select 1 from prompt_answers where id = p_target_id and profile_id = p_to) then
    raise exception 'invalid like target';
  end if;

  insert into likes (from_id, to_id, target_type, target_id, comment)
  values (uid, p_to, p_target_type, p_target_id, nullif(trim(p_comment), ''))
  on conflict (from_id, to_id) do nothing;

  if exists (select 1 from likes where from_id = p_to and to_id = uid) then
    select breakdown into compat from feed_cache
      where (viewer_id = uid and candidate_id = p_to) or (viewer_id = p_to and candidate_id = uid)
      order by computed_on desc limit 1;
    insert into matches (user_a, user_b, compatibility)
    values (least(uid, p_to), greatest(uid, p_to), compat)
    on conflict (user_a, user_b) do nothing
    returning id into mid;
    mid := coalesce(mid, public.match_between(uid, p_to));
  end if;
  return jsonb_build_object('matched', mid is not null, 'match_id', mid, 'likes_remaining', public.likes_remaining());
end $$;

create or replace function public.skip_profile(p_to uuid) returns void
language sql security definer set search_path = public as $$
  insert into skips (from_id, to_id) values (public.require_uid(), p_to) on conflict do nothing;
$$;

-- ---------------------------------------------------------------------------
-- Likes You & Matches
-- ---------------------------------------------------------------------------
create or replace function public.get_likes_you() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'like', jsonb_build_object('id', l.id, 'target_type', l.target_type, 'target_id', l.target_id,
                                 'comment', l.comment, 'created_at', l.created_at),
      'target', case l.target_type
        when 'photo' then (select jsonb_build_object('url', url) from photos where id = l.target_id)
        else (select jsonb_build_object('prompt', prompt, 'answer', answer) from prompt_answers where id = l.target_id)
      end,
      'profile', public.public_profile_json(auth.uid(), l.from_id)
    ) order by l.created_at desc), '[]'::jsonb)
  from likes l join profiles f on f.id = l.from_id
  where l.to_id = auth.uid()
    and not f.banned
    and not public.is_blocked(auth.uid(), l.from_id)
    and public.match_between(auth.uid(), l.from_id) is null
    and not exists (select 1 from skips s where s.from_id = auth.uid() and s.to_id = l.from_id);
$$;

create or replace function public.get_matches() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(row order by (row->>'last_activity') desc), '[]'::jsonb) from (
    select jsonb_build_object(
      'match_id', m.id,
      'created_at', m.created_at,
      'compatibility', m.compatibility,
      'connect_me', case when m.user_a = auth.uid() then m.connect_a else m.connect_b end,
      'connect_them', case when m.user_a = auth.uid() then m.connect_b else m.connect_a end,
      'profile', public.public_profile_json(auth.uid(), other.id),
      'last_note', (select jsonb_build_object('body', body, 'sender_id', sender_id, 'created_at', created_at)
                    from notes where match_id = m.id order by created_at desc limit 1),
      'last_activity', greatest(m.created_at, (select max(created_at) from notes where match_id = m.id))
    ) as row
    from matches m
    join profiles other on other.id = case when m.user_a = auth.uid() then m.user_b else m.user_a end
    where auth.uid() in (m.user_a, m.user_b) and not other.banned
  ) t;
$$;

create or replace function public.notes_remaining(p_match uuid) returns int
language sql stable security definer set search_path = public as $$
  select greatest(0, public.daily_note_limit() - (
    select count(*)::int from notes where match_id = p_match and sender_id = auth.uid()
      and created_at >= date_trunc('day', now())));
$$;

create or replace function public.enforce_note_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from notes where match_id = new.match_id and sender_id = new.sender_id
        and created_at >= date_trunc('day', now())) >= public.daily_note_limit() then
    raise exception 'daily note limit reached for this match' using errcode = 'P0004';
  end if;
  return new;
end $$;
create trigger notes_limit before insert on public.notes
  for each row execute function public.enforce_note_limit();

create or replace function public.set_connect(p_match uuid, p_value boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_uid(); m matches;
begin
  update matches set
    connect_a = case when user_a = uid then p_value else connect_a end,
    connect_b = case when user_b = uid then p_value else connect_b end
  where id = p_match and uid in (user_a, user_b)
  returning * into m;
  if not found then raise exception 'match not found'; end if;
  return jsonb_build_object('both', m.connect_a and m.connect_b);
end $$;

-- Handles are revealed only when both people tapped Connect.
create or replace function public.get_shared_handles(p_match uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := public.require_uid(); m matches; other uuid;
begin
  select * into m from matches where id = p_match and uid in (user_a, user_b);
  if not found or not (m.connect_a and m.connect_b) then return null; end if;
  other := case when m.user_a = uid then m.user_b else m.user_a end;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'app', h.app, 'handle', h.handle, 'preferred', h.preferred,
      'shared', exists (select 1 from messenger_handles mine where mine.profile_id = uid and mine.app = h.app))
      order by h.preferred desc, h.app)
    from messenger_handles h where h.profile_id = other), '[]'::jsonb);
end $$;

-- Unmatch removes the match (and its notes via cascade) and prevents re-matching.
create or replace function public.unmatch(p_match uuid) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_uid(); m matches; other uuid;
begin
  delete from matches where id = p_match and uid in (user_a, user_b) returning * into m;
  if not found then return; end if;
  other := case when m.user_a = uid then m.user_b else m.user_a end;
  delete from likes where (from_id = uid and to_id = other) or (from_id = other and to_id = uid);
  insert into skips (from_id, to_id) values (uid, other), (other, uid) on conflict do nothing;
end $$;

-- ---------------------------------------------------------------------------
-- Safety
-- ---------------------------------------------------------------------------
create or replace function public.block_profile(p_target uuid) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_uid(); mid uuid;
begin
  insert into blocks (blocker_id, blocked_id) values (uid, p_target) on conflict do nothing;
  mid := public.match_between(uid, p_target);
  if mid is not null then perform public.unmatch(mid); end if;
end $$;

create or replace function public.report_profile(
  p_target uuid, p_reason text, p_details text default null, p_note_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_uid(); rid uuid; body text;
begin
  if p_note_id is not null then
    select n.body into body from notes n join matches m on m.id = n.match_id
    where n.id = p_note_id and n.sender_id = p_target and uid in (m.user_a, m.user_b);
  end if;
  insert into reports (reporter_id, target_id, note_id, note_body, reason, details)
  values (uid, p_target, case when body is not null then p_note_id end, body, p_reason, p_details)
  returning id into rid;
  return rid;
end $$;

-- Auto-flag accounts reported by 3+ different people.
create or replace function public.auto_flag_reported() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(distinct reporter_id) from reports where target_id = new.target_id) >= 3 then
    update profiles set flagged = true where id = new.target_id;
  end if;
  return new;
end $$;
create trigger reports_auto_flag after insert on public.reports
  for each row execute function public.auto_flag_reported();

-- The on-device liveness check posts its outcome here. The selfie never leaves the device.
-- NOTE: a determined attacker can call this directly; Phase 2 should verify server-side
-- (e.g. signed attestation from the native app) before trusting the badge.
create or replace function public.submit_verification(
  p_passed boolean, p_challenges text[], p_liveness real default null, p_face real default null
) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := public.require_uid();
begin
  insert into verifications (profile_id, passed, challenges, liveness_score, face_match_score)
  values (uid, p_passed, p_challenges, p_liveness, p_face)
  on conflict (profile_id) do update set passed = excluded.passed, challenges = excluded.challenges,
    liveness_score = excluded.liveness_score, face_match_score = excluded.face_match_score, created_at = now();
  update profiles set verified = p_passed, verified_at = case when p_passed then now() end where id = uid;
end $$;

-- ---------------------------------------------------------------------------
-- Admin
-- ---------------------------------------------------------------------------
create or replace function public.require_admin() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
end $$;

create or replace function public.admin_report_queue(p_status text default 'open') returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 'reason', r.reason, 'details', r.details, 'status', r.status,
      'note_body', r.note_body, 'created_at', r.created_at,
      'reporter', jsonb_build_object('id', rp.id, 'name', rp.name),
      'target', jsonb_build_object(
        'id', t.id, 'name', t.name, 'banned', t.banned, 'flagged', t.flagged, 'verified', t.verified,
        'report_count', (select count(*) from reports x where x.target_id = t.id),
        'photos', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'url', url, 'removed', removed_by_admin,
                    'nsfw_score', nsfw_score) order by position) from photos where profile_id = t.id), '[]'::jsonb),
        'prompts', coalesce((select jsonb_agg(jsonb_build_object('prompt', prompt, 'answer', answer) order by position)
                    from prompt_answers where profile_id = t.id), '[]'::jsonb))
    ) order by t.flagged desc, r.created_at)
    from reports r join profiles rp on rp.id = r.reporter_id join profiles t on t.id = r.target_id
    where p_status = 'all' or r.status = p_status), '[]'::jsonb);
end $$;

create or replace function public.admin_set_banned(p_target uuid, p_banned boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  update profiles set banned = p_banned, flagged = case when p_banned then flagged else false end where id = p_target;
end $$;

create or replace function public.admin_remove_photo(p_photo uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  update photos set removed_by_admin = true where id = p_photo;
end $$;

create or replace function public.admin_resolve_report(p_report uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_admin();
  update reports set status = p_status, resolved_by = auth.uid(), resolved_at = now() where id = p_report;
end $$;

-- ---------------------------------------------------------------------------
-- Account lifecycle & privacy
-- ---------------------------------------------------------------------------
create or replace function public.touch_last_active() returns void
language sql security definer set search_path = public as $$
  update profiles set last_active_at = now() where id = auth.uid();
$$;

create or replace function public.request_account_deletion() returns void
language sql security definer set search_path = public as $$
  update profiles set deletion_requested_at = now(), paused = true where id = public.require_uid();
$$;

create or replace function public.cancel_account_deletion() returns void
language sql security definer set search_path = public as $$
  update profiles set deletion_requested_at = null where id = public.require_uid();
$$;

-- Run daily (pg_cron, see docs/SETUP.md). Deleting the auth user cascades to every table.
-- R2 objects are removed by the r2-upload function's "purge" action.
create or replace function public.purge_deleted_accounts() returns int
language plpgsql security definer set search_path = public, auth as $$
declare n int;
begin
  with gone as (
    delete from auth.users u using public.profiles p
    where p.id = u.id and p.deletion_requested_at < now() - interval '30 days'
    returning u.id
  ) select count(*) into n from gone;
  return n;
end $$;
revoke execute on function public.purge_deleted_accounts() from public, anon, authenticated;

create or replace function public.export_my_data() returns jsonb
language sql stable security definer set search_path = public, extensions as $$
  select jsonb_build_object(
    'exported_at', now(),
    'profile', (select to_jsonb(p) - 'location' || jsonb_build_object('location_approx',
        case when p.location is not null then jsonb_build_object('lat', st_y(p.location::geometry), 'lng', st_x(p.location::geometry)) end)
      from profiles p where id = auth.uid()),
    'photos', (select jsonb_agg(to_jsonb(x)) from photos x where profile_id = auth.uid()),
    'prompts', (select jsonb_agg(to_jsonb(x)) from prompt_answers x where profile_id = auth.uid()),
    'personality', (select to_jsonb(x) from personality x where profile_id = auth.uid()),
    'love_language', (select to_jsonb(x) from love_language x where profile_id = auth.uid()),
    'attributes', (select jsonb_agg(to_jsonb(x)) from attributes x where profile_id = auth.uid()),
    'preferences', (select to_jsonb(x) from preferences x where profile_id = auth.uid()),
    'kinks', (select to_jsonb(x) from kinks x where profile_id = auth.uid()),
    'messenger_handles', (select jsonb_agg(to_jsonb(x)) from messenger_handles x where profile_id = auth.uid()),
    'verification', (select to_jsonb(x) from verifications x where profile_id = auth.uid()),
    'likes_sent', (select jsonb_agg(to_jsonb(x)) from likes x where from_id = auth.uid()),
    'matches', (select jsonb_agg(to_jsonb(x)) from matches x where auth.uid() in (user_a, user_b)),
    'notes_sent', (select jsonb_agg(to_jsonb(x)) from notes x where sender_id = auth.uid()),
    'blocks', (select jsonb_agg(to_jsonb(x)) from blocks x where blocker_id = auth.uid()),
    'reports_filed', (select jsonb_agg(to_jsonb(x) - 'resolved_by') from reports x where reporter_id = auth.uid())
  );
$$;

-- Location helper so clients never construct WKT by hand.
create or replace function public.set_my_location(p_lat double precision, p_lng double precision) returns void
language sql security definer set search_path = public, extensions as $$
  -- snap to ~1 km grid before storing
  update profiles set location = st_setsrid(st_makepoint(round(p_lng::numeric, 2)::float8, round(p_lat::numeric, 2)::float8), 4326)::geography
  where id = public.require_uid();
$$;

-- Batch variant for the feed edge function.
create or replace function public.matchable_json_many(p_ids uuid[]) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(public.matchable_json(id)), '[]'::jsonb) from unnest(p_ids) as id;
$$;
revoke execute on function public.matchable_json_many(uuid[]) from public, anon, authenticated;
