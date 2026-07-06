-- Community-contributed facts about places — opening hours first.
-- (Public photo uploads were considered and deliberately not shipped:
-- image moderation burden isn't worth it yet. Private capture photos
-- never leave the device.)

create table public.place_edits (
  id uuid primary key default gen_random_uuid(),
  /** Stable place id — the osm feature id from the pois artifact. */
  place_id text not null,
  field text not null check (field in ('opening_hours')),
  value text not null check (char_length(value) <= 500),
  lon double precision not null check (lon between -9 and 3),
  lat double precision not null check (lat between 49 and 61),
  status text not null default 'pending' check (status in ('pending', 'published', 'hidden')),
  author uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index place_edits_place_idx on public.place_edits (place_id, field, created_at desc);

create trigger place_edits_cap before insert on public.place_edits
  for each row execute function public.enforce_daily_cap('20');
create trigger place_edits_initial_status before insert on public.place_edits
  for each row execute function public.initial_status();
create trigger place_edits_guard before update on public.place_edits
  for each row execute function public.guard_privileged_columns();

alter table public.place_edits enable row level security;

create policy place_edits_read on public.place_edits
  for select using (status = 'published' or author = auth.uid() or public.is_moderator());
create policy place_edits_insert on public.place_edits
  for insert to authenticated with check (author = auth.uid());
create policy place_edits_moderate on public.place_edits
  for update to authenticated using (public.is_moderator());
