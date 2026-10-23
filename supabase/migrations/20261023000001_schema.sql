-- Linky core schema.
-- Privacy model: other people's rows are NEVER selected directly by clients.
-- Everything about another person goes through SECURITY DEFINER functions
-- (see 20261023000003_functions.sql) that return age instead of birthdate and a
-- rounded distance instead of a location, and that respect visibility toggles.

create extension if not exists postgis with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  birthdate date not null check (birthdate <= (current_date - interval '18 years')),
  gender text not null,
  gender_custom text,
  pronouns text,
  orientation text,
  show_orientation boolean not null default true,
  show_pronouns boolean not null default true,
  show_gender boolean not null default true,
  city text,
  -- approximate (snapped ~1 km) point; never returned to other users
  location extensions.geography (point, 4326),
  height_cm smallint check (height_cm between 90 and 250),
  verified boolean not null default false,
  verified_at timestamptz,
  paused boolean not null default false,
  banned boolean not null default false,
  flagged boolean not null default false,
  is_admin boolean not null default false,
  supporter boolean not null default false,
  onboarding_complete boolean not null default false,
  last_active_at timestamptz not null default now(),
  deletion_requested_at timestamptz,
  created_at timestamptz not null default now()
);
create index profiles_location_idx on public.profiles using gist (location);
create index profiles_discoverable_idx on public.profiles (onboarding_complete, paused, banned);

create table public.photos (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  r2_key text not null,
  url text not null,
  position smallint not null check (position between 0 and 5),
  nsfw_score real,
  removed_by_admin boolean not null default false,
  created_at timestamptz not null default now(),
  unique (profile_id, position) deferrable initially deferred
);

create table public.prompt_answers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  prompt text not null,
  answer text not null check (char_length(answer) between 1 and 300),
  position smallint not null check (position between 0 and 2),
  unique (profile_id, position) deferrable initially deferred
);

create table public.personality (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  type char(4) not null check (type ~ '^[EI][SN][TF][JP]$'),
  e_i smallint not null check (e_i between 0 and 100),
  s_n smallint not null check (s_n between 0 and 100),
  t_f smallint not null check (t_f between 0 and 100),
  j_p smallint not null check (j_p between 0 and 100),
  self_reported boolean not null default false,
  visible boolean not null default true
);

-- order: words, time, gifts, service, touch
create table public.love_language (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  receive smallint[] not null check (array_length(receive, 1) = 5),
  give smallint[] not null check (array_length(give, 1) = 5),
  visible boolean not null default true
);

create table public.attributes (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  key text not null check (key in (
    'goal', 'drinking', 'cannabis', 'smoking', 'pets', 'kids_have', 'kids_want',
    'religion', 'politics', 'languages', 'interests', 'height_cm'
  )),
  value jsonb,
  visible boolean not null default true,
  is_dealbreaker boolean not null default false,
  accept jsonb,
  primary key (profile_id, key)
);

create table public.preferences (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  age_min smallint not null default 18 check (age_min >= 18),
  age_max smallint not null default 99 check (age_max <= 120),
  distance_km smallint check (distance_km between 1 and 200), -- null = anywhere
  genders_wanted text[] not null default '{}',
  check (age_min <= age_max)
);

create table public.kinks (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  opted_in boolean not null default false,
  tags text[] not null default '{}',
  visibility_level text not null default 'hidden'
    check (visibility_level in ('hidden', 'matches', 'opted_in', 'public')),
  filter_shared boolean not null default false
);

create table public.messenger_handles (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  app text not null check (app in ('whatsapp', 'telegram', 'signal', 'instagram')),
  handle text not null check (char_length(handle) between 1 and 64),
  preferred boolean not null default false,
  unique (profile_id, app)
);

-- Store the outcome of the face check, never the selfie itself.
create table public.verifications (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  passed boolean not null,
  method text not null default 'mediapipe-web',
  challenges text[] not null default '{}',
  liveness_score real,
  face_match_score real,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Interactions
-- ---------------------------------------------------------------------------
create table public.likes (
  id uuid primary key default gen_random_uuid(),
  from_id uuid not null references public.profiles (id) on delete cascade,
  to_id uuid not null references public.profiles (id) on delete cascade,
  target_type text not null check (target_type in ('photo', 'prompt')),
  target_id uuid not null,
  comment text check (char_length(comment) <= 200),
  created_at timestamptz not null default now(),
  unique (from_id, to_id),
  check (from_id <> to_id)
);
create index likes_to_idx on public.likes (to_id, created_at desc);

create table public.skips (
  from_id uuid not null references public.profiles (id) on delete cascade,
  to_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (from_id, to_id)
);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references public.profiles (id) on delete cascade,
  user_b uuid not null references public.profiles (id) on delete cascade,
  connect_a boolean not null default false,
  connect_b boolean not null default false,
  compatibility jsonb,
  created_at timestamptz not null default now(),
  check (user_a < user_b),
  unique (user_a, user_b)
);
create index matches_b_idx on public.matches (user_b);

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
create index notes_match_idx on public.notes (match_id, created_at);

create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  target_id uuid not null references public.profiles (id) on delete cascade,
  note_id uuid references public.notes (id) on delete set null,
  note_body text, -- snapshot so the evidence survives an unmatch
  reason text not null,
  details text check (char_length(details) <= 1000),
  status text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index reports_status_idx on public.reports (status, created_at);

-- ---------------------------------------------------------------------------
-- Caches & infrastructure
-- ---------------------------------------------------------------------------
create table public.feed_cache (
  viewer_id uuid not null references public.profiles (id) on delete cascade,
  candidate_id uuid not null references public.profiles (id) on delete cascade,
  computed_on date not null default current_date,
  score smallint not null,
  breakdown jsonb not null,
  rank real not null,
  primary key (viewer_id, candidate_id)
);
create index feed_cache_rank_idx on public.feed_cache (viewer_id, computed_on, rank desc);

create table public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  token text not null unique,
  platform text not null check (platform in ('web', 'ios', 'android')),
  created_at timestamptz not null default now()
);
