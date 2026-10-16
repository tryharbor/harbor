# Deploying Harbor, and signing in: contract

Status: build contract, 2026-10-16.

## Shape

| Piece | Where | Notes |
|---|---|---|
| Web app (`apps/web`) | Vercel, `app.useharbor.io` | GitHub sign-in with an allowlist; talks to the API server-side |
| API and worker (`apps/api`) | Railway (Docker), `api.useharbor.io` | Always on, so scheduled posts and snapshots happen on time |
| Postgres | Neon (free tier) | `DATABASE_URL` |
| Media | A Railway volume mounted at `HARBOR_MEDIA_DIR` | R2 later |

## API: who may call it

- **`HARBOR_INTERNAL_TOKEN` is set (production):**
  - Every `/v1` request needs `Authorization: Bearer <token>`, compared in constant time. Anything else gets 401 JSON.
  - These stay public: `GET /health`, `GET|HEAD /media/*`, `GET /v1/channels/:platform/callback` (protected by the OAuth state) and `/mcp` (`hbr_` API keys).
  - The tunnel-era public gate is replaced by this check.
- **Unset (local development, simple self-hosting):** today's behavior stays. `/v1` answers only local requests, and `HARBOR_PUBLIC_API=all` still turns that off.
- **CORS:** in production the browser never calls `/v1` directly; the web app proxies. Keep the CORS rule for local development.
- **Port:** `PORT` (set by Railway) is honored when `HARBOR_API_PORT` is unset.
- **Migrations:** run on start, idempotent.

## Web: signing in

- **When it's on:** sign-in is on when `GITHUB_CLIENT_ID` is set, with `GITHUB_CLIENT_SECRET`, `HARBOR_SESSION_SECRET` (32+ random bytes) and `HARBOR_ALLOWED_GITHUB_USERS` (comma-separated GitHub logins, case-insensitive). Without `GITHUB_CLIENT_ID`, the app is open, as it is in local development.
- **Flow:**
  - `/login` shows a "Sign in with GitHub" button.
  - `/auth/github` redirects to GitHub with a random `state` stored in a short-lived httpOnly cookie.
  - `/auth/github/callback` checks the state, exchanges the code, reads the user's login and checks it against the allowlist.
  - On success it sets the `harbor-session` cookie: httpOnly, Secure in production, SameSite=Lax, 30 days. Its value is an HMAC-signed payload `{login, exp}`.
  - `/auth/logout` clears the cookie.
- **Protection:** `apps/web/proxy.ts` (Next 16's name for middleware) guards every route except `/login`, `/auth/*`, static assets and `/icon.svg`. Every API call from the web app (`api()` in `app/api.ts`, which pages and server actions use) and the route handlers check the session again; the proxy isn't the only guard.
- **Calling the API:** every server-side call to the API adds `Authorization: Bearer ${HARBOR_INTERNAL_TOKEN}` when that variable is set.
- **Browser actions that used to call the API directly now go through the web app:**
  - Uploads go from the browser straight to the API. A proxy through the web app would cap them at Vercel's 4.5 MB body limit; the API takes images up to 25 MB and video up to 300 MB.
    - Just before each upload, a server action signs a ticket for that brand with the internal token: `<exp ms>.<HMAC-SHA256("upload:<brandId>:<exp>")>`, valid 10 minutes.
    - The browser sends it as the `Harbor-Upload-Ticket` header on `POST /v1/brands/:brandId/media`. The API accepts it on that route only, for that brand only, and CORS allows `HARBOR_WEB_URL`.
  - Connecting an account: `GET /connect/:platform?brandId=` asks the API for the connect redirect server-side (fetch with `redirect: 'manual'`) and sends the browser on to the platform's consent screen. The callback still goes straight to the API, which redirects back to `HARBOR_WEB_URL`.
- **Media `<img>` URLs** keep pointing at the public `/media/*`.
- **Signed out:** the layout renders the sign-in page bare (no sidebar, no API calls). Sign out is a POST from the sidebar.

## Docker

- **`Dockerfile`** at the repo root, building the API on node:22-slim:
  - pnpm comes from corepack;
  - a filtered install (`@harbor/api...`);
  - runs `pnpm --filter @harbor/api start`;
  - port from `PORT`;
  - `HEALTHCHECK` on `/health`.
- **`railway.json`:** the Dockerfile builder, healthcheck path `/health`, and a restart policy.
- **`docker-compose.yml`** for one-command self-hosting:
  - postgres:17 with a volume;
  - api, built from the Dockerfile, with a media volume;
  - web, from `apps/web/Dockerfile`, a Next standalone build;
  - `.env` driven, sandbox mode by default.
- **Docs:** the README's self-host section gets the one command.

## Moving data

`pnpm --filter @harbor/api db:copy -- --from <pglite dir or postgres url> --to <postgres url>`:
- migrates the target;
- refuses a non-empty target unless `--force`;
- copies every table in foreign-key-safe order, inside one transaction;
- prints the row counts per table on both sides.

Tokens stay encrypted with `HARBOR_SECRET_KEY`, so the target must use the same key.

## Environment

| Variable | API (Railway) | Web (Vercel) |
|---|---|---|
| `DATABASE_URL` | Neon connection string | |
| `HARBOR_SECRET_KEY` | the same as local | |
| `HARBOR_INTERNAL_TOKEN` | random | the same |
| `HARBOR_PUBLISH_MODE` | `live` | |
| `HARBOR_MODEL` | `simulated` | |
| `HARBOR_API_URL` | `https://api.useharbor.io` | the same |
| `HARBOR_WEB_URL` | `https://app.useharbor.io` | the same |
| `HARBOR_MEDIA_DIR` | `/data/media` (volume) | |
| `X_* / LINKEDIN_* / INSTAGRAM_* / THREADS_*` | platform app keys | |
| `HARBOR_API_INTERNAL_URL` | | `https://api.useharbor.io` |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | | GitHub OAuth app |
| `HARBOR_SESSION_SECRET`, `HARBOR_ALLOWED_GITHUB_USERS` | | random; `derekatharbor` |

After deploying, each platform's redirect URL becomes `https://api.useharbor.io/v1/channels/{platform}/callback`.
