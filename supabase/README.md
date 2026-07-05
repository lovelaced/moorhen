# Moorhen community backend (Supabase)

The community layer — facility status reports, mooring reviews, shared
moorings, signal samples, flags + moderation. The app works fully without it;
every community feature quietly disappears until the env vars below are set.

## Local validation (no Docker, no Supabase CLI)

```sh
./scripts/test-supabase-local.sh
```

Spins a throwaway Postgres cluster (`brew install postgresql@18`), applies a
stub of the Supabase environment (`supabase/tests/local-stub.sql`), runs every
migration, then `supabase/tests/rls.test.sql` — RLS, guard triggers, 3-flag
auto-hide, daily caps, bans, trust escalation. Green means the migration is
safe to ship.

## Deploying to a real project

1. Create a project at [supabase.com](https://supabase.com) (free tier).
2. **Auth → Sign In / Up → enable "Anonymous sign-ins"** (the app is
   anonymous-first; magic-link upgrade comes later and keeps the same id).
3. Apply `migrations/0001_community.sql` in the SQL editor (or
   `supabase db push` with the CLI). Do **not** apply anything in `tests/`.
4. Give the mobile app its keys (Project Settings → API):

   ```sh
   # apps/mobile/.env
   EXPO_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon public key>
   ```

5. Promote the first moderator (yourself) in the SQL editor:

   ```sql
   update public.profiles set trust_level = 2 where id = '<your auth user id>';
   ```

## Moderation model

- New contributors' reviews/shares land `pending` (visible only to them)
  until a moderator bumps them to `trust_level 1` (autoconfirmed → publish
  immediately). `status_reports` and `signal_samples` publish instantly — they
  are low-abuse, high-value freshness signals.
- Flags from **3 distinct users** auto-hide a review/share; moderators
  (`trust_level 2`) see flags and can publish/hide anything.
- Per-author daily caps (20 status reports, 10 reviews, 10 shares, 50 signal
  samples, 20 flags) blunt spam; `banned` blocks all writes.

## Privacy invariants

Rows attach to **places** (facility ids, lon/lat) — never boats, never
tracks. Flag authors are visible to moderators only. Photos are EXIF-stripped
on-device before they ever reach a server (upload pipeline still to come —
`photo_url` columns are ready).
