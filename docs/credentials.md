# Credentials setup (one-time, all free tier)

Least-privilege by design. **The cleanest path: you run the four `login` commands
(browser OAuth, no keys change hands) and Claude does everything else via CLIs.**
Raw keys are only unavoidable for two GitHub Actions secrets and one FCM JSON.

## 1. Cloudflare (R2 storage + Workers + KV)

1. Sign up at dash.cloudflare.com (free). Note the **Account ID** (right sidebar).
2. Enable **R2** (asks for a payment card even on free tier; $0 under 10 GB storage / 10 M reads).
3. Create bucket: **`moorhen-data`**, location hint _Western Europe (WEUR)_.
4. **R2 API token** (for GitHub Actions uploads): R2 → _Manage R2 API Tokens_ → Create:
   - Permissions: **Object Read & Write**
   - Specificity: **Apply to specific buckets only → `moorhen-data`**
   - TTL: never expire
   - Yields _Access Key ID_ + _Secret Access Key_. Endpoint is `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`.
5. **Worker deploy auth**: just run `npx wrangler login` in the repo (browser OAuth). No API token needed.
   (If you'd rather use a token: _Create Token → "Edit Cloudflare Workers" template_, plus add
   **Account → Workers KV Storage → Edit** — but the login is simpler and revocable.)

After login, Claude runs: `wrangler kv namespace create SEEN_KV`, pastes ids into
`workers/notices/wrangler.toml`, uncomments the bindings, and deploys.

## 2. GitHub (repo + Actions secrets)

1. Run `gh auth login` (or create the repo by hand). Public repo recommended —
   unlimited Actions minutes and it's an open-source project.
2. Secrets/variables for the nightly workflow (Claude can set these via `gh secret set` once logged in):

| Where    | Name                   | Value                                           |
| -------- | ---------------------- | ----------------------------------------------- |
| Secret   | `R2_ACCESS_KEY_ID`     | from step 1.4                                   |
| Secret   | `R2_SECRET_ACCESS_KEY` | from step 1.4                                   |
| Secret   | `R2_ENDPOINT`          | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |
| Variable | `R2_BUCKET`            | `moorhen-data`                                  |

## 3. Firebase (push notifications)

1. console.firebase.google.com → **Add project** → name `moorhen` (Analytics: off is fine). No card.
2. Minimal-permission service account (do NOT use the default adminsdk key — it has project-Editor):
   - console.cloud.google.com → _IAM & Admin → Service Accounts_ → **Create service account**, name `moorhen-notices`.
   - Grant exactly one role: **Firebase Cloud Messaging API Admin** (`roles/firebasemessaging.admin`).
   - _Keys_ tab → _Add key_ → **JSON** → download.
3. Hand-off (no pasting into chat needed):
   - `cd workers/notices && wrangler secret put FCM_SERVICE_ACCOUNT < ~/Downloads/moorhen-notices-….json`
   - Set `FCM_PROJECT_ID` in `wrangler.toml` [vars] to the Firebase project id.
4. Client configs (needed later at app-build time; these are **not** secrets):
   - Firebase console → Add app → Android, package **`app.moorhen`** → `google-services.json`
   - Add app → iOS, bundle id **`app.moorhen`** → `GoogleService-Info.plist`
   - (Claude will set `android.package` / `ios.bundleIdentifier` to `app.moorhen` in `app.json` — say if you want a different id; it's hard to change after store launch.)

## 4. healthchecks.io (dead-man switch)

Free account → **Add Check**: name `moorhen-notices`, Period **15 min**, Grace **15 min**.
Copy the ping URL → `cd workers/notices && wrangler secret put HEALTHCHECK_URL` (paste URL).
No API key, no permissions.

## 5. Supabase (community layer — needed at Phase 4, not before)

1. supabase.com → New org + project, region **West EU (London)**, free tier, no card.
2. Run `supabase login` (CLI OAuth) — Claude handles linking + migrations from there.
3. From _Project Settings → API_, note:
   - **Project URL** + **anon key** → go in the app (public by design, guarded by RLS)
   - **service_role key** → server-side only, never in the app or repo

## 6. Expo EAS (dev builds / OTA — when we build for devices)

Run `npx eas login` (create the free expo.dev account first). No key hand-off.

## Later (store launch phase)

- Apple Developer Program — $99/yr (needs your Apple ID; also unlocks TestFlight)
- Google Play Console — $25 one-off
- Domain (e.g. moorhen.app) — ~£10/yr, any registrar

## Security notes

- Everything above is revocable independently; nothing has broader scope than its single job.
- The R2 token can only touch the `moorhen-data` bucket; the FCM account can only send messages;
  the healthcheck URL can only say "I'm alive".
- Never commit: FCM JSON, service_role key, R2 secret. (CI's licence/registry gates don't cover
  secrets — `.env*` and key files are already gitignored.)

---

## Status (2026-07-04)

| Item                                                               | State                                                         |
| ------------------------------------------------------------------ | ------------------------------------------------------------- |
| Cloudflare account + R2 `moorhen-data` bucket                      | ✅ done                                                       |
| KV namespace `SEEN_KV` (`dc5526e1…`)                               | ✅ created                                                    |
| Worker `moorhen-notices` deployed, cron */15                       | ✅ **live**                                                   |
| `FCM_SERVICE_ACCOUNT` secret (moorhen-notices@moorhen.iam)         | ✅ set                                                        |
| workers.dev subdomain (`moorhen.workers.dev`, worker unrouted)     | ✅ registered (API requirement for cron)                      |
| R2 dev CDN (`https://pub-e452fe7a39ba403e8c67f2140e5dd064.r2.dev`) | ✅ enabled; dev artifacts uploaded under `data/dev/`          |
| healthchecks.io                                                    | ⏭ skipped for now (binding optional)                          |
| GitHub: `gh auth login` + repo + Actions secrets (R2 keys)         | ⬜ pending                                                    |
| Supabase (Phase 4)                                                 | ⬜ pending (`brew install supabase/tap/supabase` when needed) |

Dev CDN URLs (Northamptonshire data until the GB nightly runs):

- `…r2.dev/data/dev/basemap.pmtiles` (46 MB, range requests OK)
- `…r2.dev/data/dev/overlay.pmtiles`, `waterways.geojson`, `graph.json`, `osm-pois.geojson`, `manifest.json`
- Worker will write live `data/latest/notices.json` every 15 min

## Supabase (community layer — Phase 4)

Schema + RLS live in `supabase/migrations/`, fully validated locally by
`./scripts/test-supabase-local.sh` (no Docker needed). To go live, follow
`supabase/README.md`: create the free project, enable anonymous sign-ins,
apply the migration, then set in `apps/mobile/.env`:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` (the public anon key — safe in the app)

Until those are set, the app hides all community features.
