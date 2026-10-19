# Hosting Harbor on the internet

This is how Harbor's own instance runs: the API on Railway, the app on Vercel, Postgres on Neon, and GitHub sign-in limited to a list of people. Any Docker host and any Postgres work the same way. The design is in [docs/design/deploy-and-auth.md](../design/deploy-and-auth.md).

| Piece | Where | Address |
|---|---|---|
| API and worker | Railway, from the repo's `Dockerfile` | `https://api.example.com` |
| App | Vercel, root directory `apps/web` | `https://app.example.com` |
| Database | Neon (or any Postgres) | `DATABASE_URL` |
| Media | A Railway volume at `/data/media` | served from the API's `/media/*` |

## 1. Secrets

Generate two random values, and keep your existing `HARBOR_SECRET_KEY`:

```sh
openssl rand -base64 32   # HARBOR_INTERNAL_TOKEN: the same value on Railway and Vercel
openssl rand -base64 32   # HARBOR_SESSION_SECRET: Vercel only
```

`HARBOR_SECRET_KEY` encrypts connected-account tokens. If you're moving an existing database, use the same key, or the copied connections won't decrypt.

## 2. Postgres

Create a database and copy its connection string (the pooled one is fine). Harbor's worker checks for due posts every 15 seconds, so the database never sleeps. On Neon's free plan that can use up the month's compute hours; check the plan's limits, or use Railway's Postgres instead.

## 3. The API on Railway

1. **Create the service:** a new project, then deploy from the GitHub repo. Railway detects the monorepo and offers a service per app; keep only the API (the app goes on Vercel). It builds the root `Dockerfile`.
   - Give Railway's GitHub app access to the repo. If it can't see an organization's repos, install the app on that organization.
   - In the service's **Settings**: set **Healthcheck Path** to `/health`, and add **Watch Paths** `/packages/**`, `/Dockerfile` and `/pnpm-lock.yaml` next to `/apps/api/**`, so changes to the shared packages redeploy the API too.
   - Postgres: add a database to the same project (**Add → Database → PostgreSQL**) and set `DATABASE_URL` to `${{Postgres.DATABASE_URL}}`.
2. **Add a volume** mounted at `/data/media`.
3. **Set variables:**

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}`, or your Postgres connection string |
   | `HARBOR_SECRET_KEY` | your existing key |
   | `HARBOR_INTERNAL_TOKEN` | from step 1 |
   | `HARBOR_PUBLISH_MODE` | `live` |
   | `HARBOR_MODEL` | `simulated` (or `anthropic` with `ANTHROPIC_API_KEY`) |
   | `HARBOR_API_URL` | `https://api.example.com` |
   | `HARBOR_WEB_URL` | `https://app.example.com` |
   | `HARBOR_TIMEZONE` | your timezone, e.g. `America/Chicago` (best times, posting slots and schedules; Railway runs in UTC) |
   | `RAILWAY_RUN_UID` | `0` (Railway mounts volumes as root; without it, uploads fail) |
   | `X_CLIENT_ID`, `X_CLIENT_SECRET`, `LINKEDIN_*`, `INSTAGRAM_*`, `THREADS_*` | your platform apps |
   | `HARBOR_CONTACT_EMAIL` | optional: the address shown on Meta data deletion status pages |

   Don't set `HARBOR_API_PORT`: Railway sets `PORT`, and `HARBOR_API_PORT` would override it.
4. **Add the custom domain** (target port `8080`, which is the `PORT` Railway sets) and create the CNAME and `_railway-verify` TXT records it shows at your DNS provider.
5. **Check it:** `https://api.example.com/health` answers `{"ok":true,"db":"postgres"}`, and `https://api.example.com/v1/brands` answers 401. A POST to `https://api.example.com/v1/channels/instagram/data-deletion` with no body answers 400 (it reached the route and wants Meta's `signed_request`), not 401.

## 4. GitHub sign-in

Create an OAuth app at [github.com/settings/developers](https://github.com/settings/developers) (or under your organization):

- **Homepage URL:** `https://app.example.com`
- **Authorization callback URL:** `https://app.example.com/auth/github/callback`

Copy the client ID and generate a client secret. Harbor asks for no scopes; it only reads your login.

## 5. The app on Vercel

1. **Create the project:** import the same repo and set the root directory to `apps/web`.
2. **Set variables:**

   | Variable | Value |
   |---|---|
   | `HARBOR_API_INTERNAL_URL` | `https://api.example.com` |
   | `HARBOR_API_URL` | `https://api.example.com` |
   | `HARBOR_API_BROWSER_URL` | `https://api.example.com` (uploads and media previews) |
   | `HARBOR_WEB_URL` | `https://app.example.com` |
   | `NEXT_PUBLIC_HARBOR_TIMEZONE` | the same zone as `HARBOR_TIMEZONE` on Railway |
   | `HARBOR_INTERNAL_TOKEN` | the same value as on Railway |
   | `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | from step 4 |
   | `HARBOR_SESSION_SECRET` | from step 1 |
   | `HARBOR_ALLOWED_GITHUB_USERS` | comma-separated GitHub logins |
3. **Add the custom domain.**
4. **Check it:** signing out sends you to `/login`, and an account that isn't on the list is turned away.

## 6. Move your data (optional)

Stop the local API first; scheduled posts publish from whichever API is running. Then:

```sh
pnpm --filter @harbor/api db:copy -- --from .pglite --to "postgres://…"
```

The paths are relative to `apps/api`. `db:copy` migrates the target, refuses one that already has data (pass `--force` to replace it), and prints the row counts on both sides.

Media files aren't in the database. Copy `apps/api/.media` into the volume, or upload the files again from the Media page.

## 7. Point the platforms at the new address

In each platform's developer app, set the redirect URL to `https://api.example.com/v1/channels/{platform}/callback`: `x`, `linkedin`, `instagram` and `threads`. Accounts you already connected keep working; the new URL is only for connecting.

Instagram and Threads also need Meta's two callbacks, which must be public (they pass the internal token check because Meta signs them):

| Platform | Deauthorize / uninstall callback | Data deletion / delete callback |
|---|---|---|
| Instagram (Business login settings) | `https://api.example.com/v1/channels/instagram/deauthorize` | `https://api.example.com/v1/channels/instagram/data-deletion` |
| Threads (Threads use case settings) | `https://api.example.com/v1/channels/threads/deauthorize` | `https://api.example.com/v1/channels/threads/data-deletion` |

Data deletion answers Meta with a confirmation code and a status page at `https://api.example.com/data-deletion/{code}`. Letting people outside your app's roles connect needs Meta App Review: [meta-app-review.md](meta-app-review.md).
