-- Community photos on public moorings + contributed opening hours.
--
-- Photos attach to EXISTING public moorings (mooring_reviews.photo_url with a
-- mooring_key) rather than each boater dropping a new pin — that's what keeps
-- the map uncluttered. The image bytes live in a public-read storage bucket;
-- uploads go through the authenticated role.

-- ---------------------------------------------------------------------------
-- storage: public-read photos bucket, authenticated uploads
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('photos', 'photos', true)
on conflict (id) do nothing;

create policy photos_public_read on storage.objects
  for select using (bucket_id = 'photos');

create policy photos_authenticated_upload on storage.objects
  for insert to authenticated
  with check (bucket_id = 'photos' and owner = auth.uid());

create policy photos_owner_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'photos' and owner = auth.uid());

-- ---------------------------------------------------------------------------
-- place_edits: community-contributed facts about places (opening hours first)
-- ---------------------------------------------------------------------------
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
