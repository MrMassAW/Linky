-- Minimal stand-in for the parts of Supabase the migrations rely on, so the schema,
-- RLS and RPCs can be tested on a plain Postgres + PostGIS (scripts/test-db.sh).
-- NOT used in a real Supabase project.
create schema if not exists auth;
create schema if not exists extensions;
do $$ begin
  create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin
  create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin
  create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;

create table if not exists auth.users (
  instance_id uuid, id uuid primary key, aud text, role text, email text unique,
  encrypted_password text, email_confirmed_at timestamptz, created_at timestamptz,
  updated_at timestamptz, raw_app_meta_data jsonb, raw_user_meta_data jsonb
);

create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

grant usage on schema public, auth, extensions to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;
