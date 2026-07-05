-- Local-only stub of the Supabase environment, applied BEFORE migrations when
-- testing on stock Postgres (scripts/test-supabase-local.sh). Never apply to a
-- real Supabase project — these objects already exist there.

create role anon nologin;
create role authenticated nologin;

create schema auth;

create table auth.users (
  id uuid primary key,
  created_at timestamptz not null default now()
);

-- Mirrors Supabase's auth.uid(): the JWT subject of the current request.
create function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

-- storage stub (real Supabase provides the storage schema)
create schema storage;
create table storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text,
  owner uuid
);
alter table storage.objects enable row level security;
