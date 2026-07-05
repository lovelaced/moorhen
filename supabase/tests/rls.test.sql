-- RLS + moderation behaviour tests for the community schema, runnable on
-- stock Postgres via scripts/test-supabase-local.sh. Each scenario is its own
-- transaction; helpers switch role/JWT the way PostgREST does. A failed
-- assertion raises, and ON_ERROR_STOP aborts the run.

\set ON_ERROR_STOP 1

-- Supabase-style grants (normally applied by the platform)
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;

-- test users -----------------------------------------------------------------
insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'), -- A: new user
  ('00000000-0000-0000-0000-00000000000b'), -- B: new user
  ('00000000-0000-0000-0000-00000000000c'), -- C: rate-limit / ban subject
  ('00000000-0000-0000-0000-0000000000f1'),
  ('00000000-0000-0000-0000-0000000000f2'),
  ('00000000-0000-0000-0000-0000000000f3'), -- F1–F3: flaggers
  ('00000000-0000-0000-0000-00000000000d'); -- M: moderator

update public.profiles set trust_level = 2
  where id = '00000000-0000-0000-0000-00000000000d';

\echo '-- profiles auto-created for auth users'
do $$
begin
  if (select count(*) from public.profiles) <> 7 then
    raise exception 'expected 7 profiles, got %', (select count(*) from public.profiles);
  end if;
end $$;

\echo '-- scenario: insert as self ok; forging author rejected'
begin;
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
insert into public.status_reports (facility_id, status, lon, lat, author)
  values ('crt:123', 'working', -1.2, 52.3, '00000000-0000-0000-0000-00000000000a');
do $$
begin
  begin
    insert into public.status_reports (facility_id, status, lon, lat, author)
      values ('crt:123', 'broken', -1.2, 52.3, '00000000-0000-0000-0000-00000000000b');
    raise exception 'forged author was accepted';
  exception when insufficient_privilege or check_violation then
    null; -- expected: RLS with-check rejects
  end;
end $$;
commit;

\echo '-- scenario: anon can read reports but not write'
begin;
select set_config('role', 'anon', true);
select set_config('request.jwt.claim.sub', '', true);
do $$
begin
  if (select count(*) from public.status_reports) <> 1 then
    raise exception 'anon should see 1 report';
  end if;
  begin
    insert into public.status_reports (facility_id, status, lon, lat, author)
      values ('crt:123', 'gone', -1.2, 52.3, '00000000-0000-0000-0000-00000000000a');
    raise exception 'anon insert was accepted';
  exception when insufficient_privilege or check_violation then
    null;
  end;
end $$;
rollback;

\echo '-- scenario: new-user review lands pending, invisible to others'
begin;
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
insert into public.mooring_reviews (mooring_key, lon, lat, stars, body, author)
  values ('osm:w1', -1.2, 52.3, 5, 'Lovely rings by the pub', '00000000-0000-0000-0000-00000000000a');
do $$
begin
  if (select status from public.mooring_reviews limit 1) <> 'pending' then
    raise exception 'new-user review should be pending';
  end if;
end $$;
-- switch to B: pending review invisible
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
do $$
begin
  if (select count(*) from public.mooring_reviews) <> 0 then
    raise exception 'pending review leaked to another user';
  end if;
end $$;
commit;

\echo '-- scenario: author edits body but cannot self-publish; stranger cannot touch it'
begin;
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
update public.mooring_reviews set body = 'Lovely rings, gets busy summer weekends';
do $$
begin
  begin
    update public.mooring_reviews set status = 'published';
    raise exception 'self-publish was accepted';
  exception when raise_exception or insufficient_privilege then
    null; -- guard trigger
  end;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
do $$
declare
  touched int;
begin
  update public.mooring_reviews set body = 'vandalism';
  get diagnostics touched = row_count;
  if touched <> 0 then
    raise exception 'stranger updated someone else''s review';
  end if;
end $$;
rollback;

\echo '-- scenario: moderator publishes; world can read'
begin;
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', true);
update public.mooring_reviews set status = 'published';
select set_config('role', 'anon', true);
select set_config('request.jwt.claim.sub', '', true);
do $$
begin
  if (select count(*) from public.mooring_reviews) <> 1 then
    raise exception 'published review should be world-readable';
  end if;
end $$;
commit;

\echo '-- scenario: three flags auto-hide'
do $$
declare
  review uuid := (select id from public.mooring_reviews limit 1);
  flagger text;
begin
  foreach flagger in array array[
    '00000000-0000-0000-0000-0000000000f1',
    '00000000-0000-0000-0000-0000000000f2',
    '00000000-0000-0000-0000-0000000000f3'
  ] loop
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claim.sub', flagger, true);
    insert into public.flags (target_table, target_id, reason, author)
      values ('mooring_reviews', review, 'spam', flagger::uuid);
  end loop;
  perform set_config('role', 'none', true);
  if (select status from public.mooring_reviews where id = review) <> 'hidden' then
    raise exception 'three flags should hide the review';
  end if;
end $$;

\echo '-- scenario: daily cap enforced'
begin;
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', true);
do $$
begin
  for i in 1..20 loop
    insert into public.status_reports (facility_id, status, lon, lat, author)
      values ('crt:cap-' || i, 'working', -1.2, 52.3, '00000000-0000-0000-0000-00000000000c');
  end loop;
  begin
    insert into public.status_reports (facility_id, status, lon, lat, author)
      values ('crt:cap-21', 'working', -1.2, 52.3, '00000000-0000-0000-0000-00000000000c');
    raise exception '21st report in a day was accepted';
  exception when raise_exception then
    null;
  end;
end $$;
rollback;

\echo '-- scenario: banned users cannot write anywhere'
update public.profiles set banned = true where id = '00000000-0000-0000-0000-00000000000c';
begin;
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', true);
do $$
begin
  begin
    insert into public.status_reports (facility_id, status, lon, lat, author)
      values ('crt:999', 'working', -1.2, 52.3, '00000000-0000-0000-0000-00000000000c');
    raise exception 'banned user write was accepted';
  exception when raise_exception then
    null;
  end;
end $$;
rollback;

\echo '-- scenario: users cannot grant themselves trust'
begin;
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
update public.profiles set display_name = 'Kingfisher' where id = '00000000-0000-0000-0000-00000000000a';
do $$
begin
  begin
    update public.profiles set trust_level = 2 where id = '00000000-0000-0000-0000-00000000000a';
    raise exception 'self-service trust escalation was accepted';
  exception when raise_exception then
    null;
  end;
end $$;
rollback;

\echo '-- scenario: flag authors stay private from regular users'
begin;
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
do $$
begin
  if (select count(*) from public.flags) <> 0 then
    raise exception 'flags visible to non-moderator';
  end if;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', true);
do $$
begin
  if (select count(*) from public.flags) <> 3 then
    raise exception 'moderator should see 3 flags';
  end if;
end $$;
rollback;

\echo 'ALL RLS TESTS PASSED'

\echo '-- scenario: contributed hours land pending, publish after moderation'
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
begin;
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
insert into public.place_edits (place_id, field, value, lon, lat, author)
  values ('osm:123', 'opening_hours', 'Mo-Su 12:00-23:00', -1.2, 52.3, '00000000-0000-0000-0000-00000000000a');
do $$
begin
  if (select status from public.place_edits limit 1) <> 'pending' then
    raise exception 'new-user edit should be pending';
  end if;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
do $$
begin
  if (select count(*) from public.place_edits) <> 0 then
    raise exception 'pending edit leaked';
  end if;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', true);
update public.place_edits set status = 'published';
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
do $$
begin
  if (select count(*) from public.place_edits) <> 1 then
    raise exception 'published edit should be visible';
  end if;
end $$;
rollback;

\echo 'ALL 0002 TESTS PASSED'
