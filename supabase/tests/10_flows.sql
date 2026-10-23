-- End-to-end checks of RLS and RPCs, run by scripts/test-db.sh.
\set ON_ERROR_STOP 1
\set me '''11111111-1111-4111-8111-111111111111'''
\set eve '''22222222-2222-4222-8222-222222222222'''

insert into auth.users (id, email) values (:me, 'me@test'), (:eve, 'eve@test');

-- ---- act as "me" -----------------------------------------------------------
set role authenticated;
select set_config('request.jwt.claim.sub', :me, false);

insert into profiles (id, name, birthdate, gender, onboarding_complete, verified, is_admin)
values (:me, 'Tester', '1994-04-04', 'woman', true, true, true);
do $$ begin
  assert (select not verified and not is_admin from profiles where id = auth.uid()), 'moderation columns must not be self-set';
end $$;
select set_my_location(45.5, -73.57);
insert into preferences (profile_id, age_min, age_max, distance_km, genders_wanted)
values (:me, 21, 45, 100, array['men', 'women', 'nonbinary']);
insert into personality values (:me, 'INFP', 30, 25, 30, 35, false, true);
insert into love_language values (:me, array[30, 20, 10, 20, 20]::smallint[], array[20, 30, 10, 20, 20]::smallint[], true);
insert into messenger_handles (profile_id, app, handle, preferred) values (:me, 'telegram', 'tester', true);
insert into photos (profile_id, r2_key, url, position) values (:me, 'k0', '/x.avif', 0);

do $$ begin
  assert (select count(*) from profiles) = 1, 'RLS: only own profile visible';
  assert (select count(*) from messenger_handles) = 1, 'RLS: only own handles visible';
  assert (select count(*) from photos) = 1, 'RLS: only own photos visible';
end $$;

-- liking requires verification
do $$ begin
  begin
    perform like_profile('00000000-0000-4000-8000-000000000001', 'prompt', '00000000-00c8-4000-8000-000000000001', 'hi');
    raise exception 'should have failed';
  exception when sqlstate 'P0001' then null; end;
end $$;

-- verify via the on-device check result
select submit_verification(true, array['blink', 'turn-left'], 0.9, 0.8);
do $$ begin assert (select verified from profiles where id = auth.uid()), 'verified after check'; end $$;

-- public profile hides birthdate/location, shows rounded distance
do $$
declare j jsonb := get_public_profile('00000000-0000-4000-8000-000000000001');
begin
  assert j ? 'age' and not j ? 'birthdate' and not j ? 'location', 'public profile shape';
  assert j->>'distance' like '%km away', 'distance label present';
end $$;

-- ---- feed (edge function runs as service_role) ------------------------------
reset role;
set role service_role;
do $$
declare n int;
begin
  select count(*) into n from feed_prefilter('11111111-1111-4111-8111-111111111111');
  assert n > 0, 'prefilter returns candidates';
  insert into feed_cache (viewer_id, candidate_id, score, breakdown, rank)
  select '11111111-1111-4111-8111-111111111111', c, 80, '{"total":80}', random() * 100
  from feed_prefilter('11111111-1111-4111-8111-111111111111') as c;
end $$;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', :me, false);
do $$ begin assert jsonb_array_length(get_feed(20)) > 0, 'feed has items'; end $$;

-- ---- like a demo bot that likes back -> match -------------------------------
do $$
declare
  bot uuid;
  target uuid;
  res jsonb;
  mid uuid;
begin
  reset role;
  select b.profile_id into bot from demo_bots b where likes_back order by profile_id limit 1;
  select id into target from prompt_answers where profile_id = bot order by position limit 1;
  set role authenticated;
  res := like_profile(bot, 'prompt', target, 'Love this answer');
  assert (res->>'matched')::boolean, 'bot likes back => match';
  assert (res->>'likes_remaining')::int = 9, 'like counted';
  mid := (res->>'match_id')::uuid;
  assert jsonb_array_length(get_matches()) = 1, 'match listed';

  -- notes: 20 per day per match
  for i in 1..20 loop insert into notes (match_id, sender_id, body) values (mid, auth.uid(), 'note ' || i); end loop;
  begin
    insert into notes (match_id, sender_id, body) values (mid, auth.uid(), 'one too many');
    raise exception 'note limit not enforced';
  exception when sqlstate 'P0004' then null; end;

  -- handles hidden until both connect; bot auto-connects in demo
  assert get_shared_handles(mid) is null, 'handles hidden before connect';
  assert (set_connect(mid, true)->>'both')::boolean, 'mutual connect with bot';
  assert jsonb_array_length(get_shared_handles(mid)) >= 1, 'handles revealed after mutual connect';

  -- unmatch deletes notes
  perform unmatch(mid);
  assert jsonb_array_length(get_matches()) = 0, 'unmatched';
  assert (select count(*) from notes) = 0, 'notes removed with match';
end $$;

-- ---- reports, auto-flag and admin -------------------------------------------
reset role;
insert into profiles (id, name, birthdate, gender, onboarding_complete) values (:eve, 'Eve', '1990-01-01', 'woman', true);
-- two more reporters so the target crosses the 3-report threshold
insert into auth.users (id, email) values ('33333333-3333-4333-8333-333333333333', 'r2@test'), ('44444444-4444-4444-8444-444444444444', 'r3@test');
insert into profiles (id, name, birthdate, gender) values
  ('33333333-3333-4333-8333-333333333333', 'R2', '1990-01-01', 'man'),
  ('44444444-4444-4444-8444-444444444444', 'R3', '1990-01-01', 'man');
insert into reports (reporter_id, target_id, reason) values
  ('33333333-3333-4333-8333-333333333333', :eve, 'Spam or scam'),
  ('44444444-4444-4444-8444-444444444444', :eve, 'Spam or scam');
update profiles set is_admin = true where id = :me;

set role authenticated;
select set_config('request.jwt.claim.sub', :me, false);
select report_profile(:eve, 'Fake profile or catfish', 'stock photos');
select block_profile(:eve);
do $$
declare q jsonb := admin_report_queue('open');
begin
  assert jsonb_array_length(q) = 3, 'admin sees open reports';
  assert (q->0->'target'->>'flagged')::boolean, 'auto-flagged after 3 reports';
  perform admin_set_banned('22222222-2222-4222-8222-222222222222', true);
  perform admin_resolve_report((q->0->>'id')::uuid, 'actioned');
  assert jsonb_array_length(admin_report_queue('open')) = 2, 'resolved report leaves queue';
  assert get_public_profile('22222222-2222-4222-8222-222222222222') is null, 'blocked profile hidden';
end $$;

-- non-admins are refused
select set_config('request.jwt.claim.sub', :eve, false);
do $$ begin
  begin perform admin_report_queue('open'); raise exception 'not refused';
  exception when sqlstate '42501' then null; end;
  assert (select count(*) from reports) = 0, 'reporters only see their own reports';
end $$;

-- export & deletion
select set_config('request.jwt.claim.sub', :me, false);
do $$ begin
  assert export_my_data() ? 'profile', 'export works';
end $$;
select request_account_deletion();
do $$ begin assert (select paused and deletion_requested_at is not null from profiles where id = auth.uid()), 'deletion scheduled'; end $$;

reset role;
\echo 'flows ok'
