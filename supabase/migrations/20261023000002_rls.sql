-- Row Level Security on every table.
-- Rule of thumb: you can read/write your own rows. Other people are only visible
-- through the SECURITY DEFINER functions in the next migration. Admins get
-- extra read/update access for moderation.

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

alter table public.profiles enable row level security;
alter table public.photos enable row level security;
alter table public.prompt_answers enable row level security;
alter table public.personality enable row level security;
alter table public.love_language enable row level security;
alter table public.attributes enable row level security;
alter table public.preferences enable row level security;
alter table public.kinks enable row level security;
alter table public.messenger_handles enable row level security;
alter table public.verifications enable row level security;
alter table public.likes enable row level security;
alter table public.skips enable row level security;
alter table public.matches enable row level security;
alter table public.notes enable row level security;
alter table public.blocks enable row level security;
alter table public.reports enable row level security;
alter table public.feed_cache enable row level security;
alter table public.push_tokens enable row level security;

-- profiles: own row; admins read all. Moderation columns can't be self-set.
create policy profiles_select_own on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy profiles_insert_own on public.profiles for insert with check (id = auth.uid());
create policy profiles_update_own on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_admin_update on public.profiles for update using (public.is_admin());

-- SECURITY INVOKER on purpose: inside our SECURITY DEFINER RPCs current_user is the
-- function owner, so trusted server-side code (submit_verification, admin_*) passes.
create or replace function public.protect_profile_columns() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user not in ('anon', 'authenticated') or public.is_admin() then return new; end if;
  if tg_op = 'INSERT' then
    new.verified := false; new.verified_at := null; new.banned := false; new.flagged := false;
    new.is_admin := false; new.supporter := false;
    return new;
  end if;
  new.verified := old.verified; new.verified_at := old.verified_at;
  new.banned := old.banned; new.flagged := old.flagged;
  new.is_admin := old.is_admin; new.supporter := old.supporter;
  return new;
end $$;
create trigger profiles_protect before insert or update on public.profiles
  for each row execute function public.protect_profile_columns();

-- Simple owner-only tables
do $$
declare t text;
begin
  foreach t in array array['prompt_answers', 'personality', 'love_language', 'attributes',
                           'preferences', 'kinks', 'messenger_handles', 'push_tokens'] loop
    execute format('create policy %1$s_own on public.%1$I for all using (profile_id = auth.uid()) with check (profile_id = auth.uid())', t);
  end loop;
end $$;

-- photos: owner manages; admins can read and flag/remove
create policy photos_own on public.photos for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy photos_admin on public.photos for select using (public.is_admin());
create policy photos_admin_delete on public.photos for delete using (public.is_admin());

-- verifications: owner can read their result; writes go through submit_verification()
create policy verifications_select_own on public.verifications for select using (profile_id = auth.uid());

-- likes: sender reads/deletes own; receivers read via get_likes_you(); writes via like_profile()
create policy likes_select_own on public.likes for select using (from_id = auth.uid());
create policy likes_delete_own on public.likes for delete using (from_id = auth.uid());

create policy skips_own on public.skips for all using (from_id = auth.uid()) with check (from_id = auth.uid());

-- matches: participants read; connect/unmatch through functions
create policy matches_select on public.matches for select using (auth.uid() in (user_a, user_b));

-- notes: participants read; inserts must come from a participant (limits enforced by trigger)
create policy notes_select on public.notes for select using (
  exists (select 1 from public.matches m where m.id = match_id and auth.uid() in (m.user_a, m.user_b))
);
create policy notes_insert on public.notes for insert with check (
  sender_id = auth.uid() and exists (
    select 1 from public.matches m where m.id = match_id and auth.uid() in (m.user_a, m.user_b)
  )
);

create policy blocks_own on public.blocks for all using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());

create policy reports_insert on public.reports for insert with check (reporter_id = auth.uid());
create policy reports_select on public.reports for select using (reporter_id = auth.uid() or public.is_admin());
create policy reports_admin_update on public.reports for update using (public.is_admin());

-- feed_cache is written by the feed edge function (service role) and read via get_feed()
create policy feed_cache_select_own on public.feed_cache for select using (viewer_id = auth.uid());
