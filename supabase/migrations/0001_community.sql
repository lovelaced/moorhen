-- Moorhen community layer: facility status reports, mooring reviews, shared
-- moorings, signal samples, flags + moderation.
--
-- Design notes
-- - Anonymous-first: Supabase anonymous sign-in issues a real auth.users row,
--   so every write has an author uuid without requiring an email. Magic-link
--   upgrade keeps the same id.
-- - Privacy: rows attach to PLACES (lon/lat, facility ids), never to boats.
--   No positions history, no tracks — those stay on-device.
-- - Geometry is plain lon/lat doubles: report volumes don't warrant PostGIS,
--   and this keeps the schema testable on stock Postgres. A PostGIS geography
--   column + GiST index is a later, additive migration if needed.
-- - Moderation (Apple 1.2 / Play UGC): new contributors' content lands
--   'pending' until they're autoconfirmed (trust_level >= 1); flags from 3
--   distinct users auto-hide; moderators can set any status. Post-moderation
--   ethos: publish fast, correct fast.

-- ---------------------------------------------------------------------------
-- profiles: one row per auth user, created by trigger
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 40),
  trust_level int not null default 0, -- 0 new, 1 autoconfirmed, 2 moderator
  banned boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- status_reports: "water point working / broken / gone / queue" — immutable
-- ---------------------------------------------------------------------------
create table public.status_reports (
  id uuid primary key default gen_random_uuid(),
  facility_id text not null, -- stable artifact id (CRT record or osm:...)
  status text not null check (status in ('working', 'broken', 'gone', 'queue')),
  note text check (char_length(note) <= 280),
  lon double precision not null check (lon between -9 and 3),
  lat double precision not null check (lat between 49 and 61),
  author uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index status_reports_facility_idx on public.status_reports (facility_id, created_at desc);
create index status_reports_geo_idx on public.status_reports (lon, lat);

-- ---------------------------------------------------------------------------
-- mooring_reviews: structured reviews attached to places
-- ---------------------------------------------------------------------------
create table public.mooring_reviews (
  id uuid primary key default gen_random_uuid(),
  mooring_key text not null, -- artifact mooring id, or geohash for ad-hoc spots
  lon double precision not null check (lon between -9 and 3),
  lat double precision not null check (lat between 49 and 61),
  stars int not null check (stars between 1 and 5),
  edge_type text check (edge_type in ('rings', 'armco', 'piling', 'pins', 'bank')),
  depth_ok boolean, -- could you get into the bank?
  noise int check (noise between 1 and 5),
  safety int check (safety between 1 and 5),
  body text check (char_length(body) <= 2000),
  photo_url text,
  status text not null default 'pending' check (status in ('pending', 'published', 'hidden')),
  author uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index mooring_reviews_key_idx on public.mooring_reviews (mooring_key, created_at desc);
create index mooring_reviews_geo_idx on public.mooring_reviews (lon, lat);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger mooring_reviews_touch
  before update on public.mooring_reviews
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- shared_moorings: opt-in shares from the private on-device mooring log
-- ---------------------------------------------------------------------------
create table public.shared_moorings (
  id uuid primary key default gen_random_uuid(),
  lon double precision not null check (lon between -9 and 3),
  lat double precision not null check (lat between 49 and 61),
  edge_type text check (edge_type in ('rings', 'armco', 'piling', 'pins', 'bank')),
  down_mbps real check (down_mbps >= 0),
  network_type text,
  photo_url text,
  status text not null default 'pending' check (status in ('pending', 'published', 'hidden')),
  author uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index shared_moorings_geo_idx on public.shared_moorings (lon, lat);

-- ---------------------------------------------------------------------------
-- signal_samples: auto-captured connectivity ground truth — insert-only
-- ---------------------------------------------------------------------------
create table public.signal_samples (
  id uuid primary key default gen_random_uuid(),
  lon double precision not null check (lon between -9 and 3),
  lat double precision not null check (lat between 49 and 61),
  network_type text not null, -- wifi / cellular / unknown
  down_mbps real check (down_mbps >= 0),
  latency_ms int check (latency_ms >= 0),
  author uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index signal_samples_geo_idx on public.signal_samples (lon, lat);

-- ---------------------------------------------------------------------------
-- flags: N distinct flaggers auto-hide the target
-- ---------------------------------------------------------------------------
create table public.flags (
  id uuid primary key default gen_random_uuid(),
  target_table text not null check (target_table in ('mooring_reviews', 'shared_moorings')),
  target_id uuid not null,
  reason text check (char_length(reason) <= 280),
  author uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (target_table, target_id, author)
);

create or replace function public.auto_hide_on_flags()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  flag_count int;
begin
  select count(distinct author) into flag_count
  from public.flags
  where target_table = new.target_table and target_id = new.target_id;

  if flag_count >= 3 then
    -- security definer: runs as the schema owner, so the guard trigger and
    -- RLS both let this status change through
    if new.target_table = 'mooring_reviews' then
      update public.mooring_reviews set status = 'hidden' where id = new.target_id;
    elsif new.target_table = 'shared_moorings' then
      update public.shared_moorings set status = 'hidden' where id = new.target_id;
    end if;
  end if;
  return new;
end;
$$;

create trigger flags_auto_hide
  after insert on public.flags
  for each row execute function public.auto_hide_on_flags();

-- ---------------------------------------------------------------------------
-- rate limiting: per-author daily caps (cheap trigger; volumes are small)
-- ---------------------------------------------------------------------------
create or replace function public.enforce_daily_cap()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  cap int := tg_argv[0]::int;
  recent int;
begin
  if coalesce((select banned from public.profiles where id = new.author), true) then
    raise exception 'account is banned' using errcode = 'P0001';
  end if;

  execute format(
    'select count(*) from public.%I where author = $1 and created_at > now() - interval ''24 hours''',
    tg_table_name
  ) into recent using new.author;

  if recent >= cap then
    raise exception 'daily limit reached for %', tg_table_name using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger status_reports_cap before insert on public.status_reports
  for each row execute function public.enforce_daily_cap('20');
create trigger mooring_reviews_cap before insert on public.mooring_reviews
  for each row execute function public.enforce_daily_cap('10');
create trigger shared_moorings_cap before insert on public.shared_moorings
  for each row execute function public.enforce_daily_cap('10');
create trigger signal_samples_cap before insert on public.signal_samples
  for each row execute function public.enforce_daily_cap('50');
create trigger flags_cap before insert on public.flags
  for each row execute function public.enforce_daily_cap('20');

-- ---------------------------------------------------------------------------
-- publish state on insert: autoconfirmed users publish immediately
-- ---------------------------------------------------------------------------
create or replace function public.initial_status()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  trust int;
begin
  select trust_level into trust from public.profiles where id = new.author;
  new.status := case when trust >= 1 then 'published' else 'pending' end;
  return new;
end;
$$;

create trigger mooring_reviews_initial_status before insert on public.mooring_reviews
  for each row execute function public.initial_status();
create trigger shared_moorings_initial_status before insert on public.shared_moorings
  for each row execute function public.initial_status();

-- ---------------------------------------------------------------------------
-- row-level security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.status_reports enable row level security;
alter table public.mooring_reviews enable row level security;
alter table public.shared_moorings enable row level security;
alter table public.signal_samples enable row level security;
alter table public.flags enable row level security;

create or replace function public.is_moderator()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select coalesce(
    (select trust_level >= 2 from public.profiles where id = auth.uid()),
    false
  )
$$;

-- Guard triggers keep privileged columns out of self-service updates. RLS
-- says WHO may update a row; these say WHICH transitions are allowed —
-- correlated-subquery WITH CHECK hacks on the same table are ambiguous and
-- unreadable by comparison. Only the PostgREST API roles are guarded:
-- migrations, the SQL editor, service_role and security-definer functions
-- (which run as their owner) pass through.
create or replace function public.guard_privileged_columns()
returns trigger
language plpgsql
as $$
begin
  if current_user not in ('anon', 'authenticated') or public.is_moderator() then
    return new;
  end if;
  if tg_table_name = 'profiles' then
    if new.trust_level is distinct from old.trust_level
       or new.banned is distinct from old.banned then
      raise exception 'cannot change trust or ban state' using errcode = 'P0001';
    end if;
  else
    if new.status is distinct from old.status then
      raise exception 'cannot change moderation status' using errcode = 'P0001';
    end if;
    if new.author is distinct from old.author then
      raise exception 'cannot reassign author' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_privileged_columns();
create trigger mooring_reviews_guard before update on public.mooring_reviews
  for each row execute function public.guard_privileged_columns();
create trigger shared_moorings_guard before update on public.shared_moorings
  for each row execute function public.guard_privileged_columns();

-- profiles: read own; moderators read all; users update own row (guard
-- trigger blocks trust/ban changes)
create policy profiles_select_own on public.profiles
  for select using (id = auth.uid() or public.is_moderator());
create policy profiles_update_own on public.profiles
  for update using (id = auth.uid())
  with check (id = auth.uid());

-- status_reports: world-readable, insert as self, immutable
create policy status_reports_read on public.status_reports
  for select using (true);
create policy status_reports_insert on public.status_reports
  for insert to authenticated with check (author = auth.uid());

-- mooring_reviews: read published + own; insert as self; edit own (the guard
-- trigger blocks status/author changes by non-moderators)
create policy mooring_reviews_read on public.mooring_reviews
  for select using (status = 'published' or author = auth.uid() or public.is_moderator());
create policy mooring_reviews_insert on public.mooring_reviews
  for insert to authenticated with check (author = auth.uid());
create policy mooring_reviews_update_own on public.mooring_reviews
  for update to authenticated using (author = auth.uid())
  with check (author = auth.uid());
create policy mooring_reviews_moderate on public.mooring_reviews
  for update to authenticated using (public.is_moderator());

-- shared_moorings: same shape as reviews, no self-edit (delete + re-share)
create policy shared_moorings_read on public.shared_moorings
  for select using (status = 'published' or author = auth.uid() or public.is_moderator());
create policy shared_moorings_insert on public.shared_moorings
  for insert to authenticated with check (author = auth.uid());
create policy shared_moorings_delete_own on public.shared_moorings
  for delete to authenticated using (author = auth.uid());
create policy shared_moorings_moderate on public.shared_moorings
  for update to authenticated using (public.is_moderator());

-- signal_samples: world-readable aggregate data, insert as self
create policy signal_samples_read on public.signal_samples
  for select using (true);
create policy signal_samples_insert on public.signal_samples
  for insert to authenticated with check (author = auth.uid());

-- flags: insert as self; only moderators read (flaggers stay private)
create policy flags_insert on public.flags
  for insert to authenticated with check (author = auth.uid());
create policy flags_read_moderator on public.flags
  for select using (public.is_moderator());
