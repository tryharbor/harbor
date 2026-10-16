# Connecting your own accounts

Harbor publishes through your own developer apps (decision: `docs/decisions/0001-direct-publishing.md`). For your own brands none of these need app review: you only connect accounts that hold a role on the app. Allow about an hour for all four. Dashboard labels change often; if a name below doesn't match exactly, look for the closest equivalent.

## 0. Before you start

1. **Token key.** Run `openssl rand -base64 32` and put the result in `.env` as `HARBOR_SECRET_KEY`. Harbor encrypts every account token with it. If you lose it, reconnect every channel.
2. **A stable HTTPS URL for the API.** Meta (Instagram, Threads) only accepts HTTPS redirect URLs, and every platform needs the redirect URL registered exactly. Use a tunnel whose address doesn't change between runs:
   - ngrok (one free static domain): `ngrok http --url=<your-name>.ngrok-free.app 4800`
   - or a Cloudflare named tunnel pointed at `http://localhost:4800`

   Put that URL in `.env` as `HARBOR_API_URL` (no trailing slash). Quick tunnels with a random address each run won't work, because you'd have to re-register the redirect URLs every time.
3. Your redirect URLs are then:

   | Platform | Redirect / callback URL |
   |---|---|
   | X | `{HARBOR_API_URL}/v1/channels/x/callback` |
   | LinkedIn | `{HARBOR_API_URL}/v1/channels/linkedin/callback` |
   | Instagram | `{HARBOR_API_URL}/v1/channels/instagram/callback` |
   | Threads | `{HARBOR_API_URL}/v1/channels/threads/callback` |

## 1. X

1. Sign in to the X developer console (developer.x.com) and create a project and app.
2. **User authentication settings:** OAuth 2.0 on; type **Web App, Automated App or Bot** (a confidential client); permissions **Read and write**; callback URL from the table; a website URL (any page you own).
3. Copy the **OAuth 2.0 Client ID and Client Secret** into `X_CLIENT_ID` / `X_CLIENT_SECRET`.
4. **Billing:** the API is pay-per-use. Add credits and set a **spending limit**. Rough costs: a post about $0.015 (about $0.20 if it contains a link), each metrics read about $0.005. Harbor reads each post 5 times over its first week.

Scopes Harbor asks for: `tweet.read tweet.write users.read offline.access media.write`. Images work; video on X isn't supported yet.

Replies and past-post import on X are **billed reads**, so they're off by default. Set `HARBOR_X_READ_REPLIES=true` only if you want them and have a spending limit set.

## 2. LinkedIn

1. At linkedin.com/developers, **Create app**. LinkedIn requires a Company Page to associate the app with; any page you admin works (the app still posts as you, personally).
2. **Products tab:** add **Sign In with LinkedIn using OpenID Connect** and **Share on LinkedIn**. Both are self-serve and approved instantly.
3. **Auth tab:** add the redirect URL from the table. Copy **Client ID** and **Primary Client Secret** into `LINKEDIN_CLIENT_ID` / `LINKEDIN_CLIENT_SECRET`.

Limits for now:
- Tokens last 60 days and **can't be refreshed** without partner access. Harbor marks the channel "refresh needed" and you click Reconnect.
- **No post metrics**: they need LinkedIn's Community Management API (partner approval). Posts publish fine; metrics show n/a.
- Text plus one image per post. API version: `LINKEDIN_API_VERSION` (default `202601`). Bump it before LinkedIn retires that version, roughly January 2027.

## 3. Instagram (Instagram API with Instagram Login)

Requirements: the Instagram account must be a **professional account** (Business or Creator). No Facebook Page needed.

1. At developers.facebook.com, **Create app**. Choose the use case for managing content on Instagram (API setup with **Instagram login**).
2. In that use case's settings, find the **Instagram app ID and Instagram app secret**. These are different from the Meta app ID at the top of the dashboard. Copy them into `INSTAGRAM_APP_ID` / `INSTAGRAM_APP_SECRET`.
3. **Business login settings:** add the redirect URL from the table.
4. **Roles:** add your Instagram account as an **Instagram tester**, then accept the invite from the Instagram account (in Instagram: Settings → Apps and websites → Tester invites, or the equivalent on the web).
5. Keep the app in **development mode**. Permissions Harbor requests: `instagram_business_basic`, `instagram_business_content_publish`, `instagram_business_manage_insights`, `instagram_business_manage_comments` (to read replies).

Limits:
- Every Instagram post needs an image or video at a **public URL** (Instagram downloads it). Harbor's media library serves uploads from `HARBOR_API_URL`, so your HTTPS tunnel covers this while developing.
- One image → feed post; one video → Reel; 2–10 items → carousel.
- Long-lived tokens last 60 days; Harbor refreshes them automatically.

## 4. Threads

1. In the same Meta developer account, create an app (or add a use case) for **Access the Threads API**.
2. In the Threads use case settings, copy the **Threads app ID and secret** into `THREADS_APP_ID` / `THREADS_APP_SECRET`. Add the redirect URL from the table as a callback URL (also set the uninstall and delete callbacks to any URL on your domain).
3. **Roles:** add your Threads profile as a **Threads tester** and accept the invite in Threads (Settings → Account → Website permissions → Invites).
4. Permissions: `threads_basic`, `threads_content_publish`, `threads_manage_insights`, `threads_read_replies` (to read replies), `threads_manage_replies` (to post threads as replies to your own post).

Threads: 500 characters per post; a line with `---` in Harbor's composer starts a reply in the thread. Tokens refresh automatically.

## 5. Run it

```bash
pnpm install
pnpm dev
```

Open http://localhost:4801, add a brand, and click **Connect** for each platform. You'll go through the platform's consent screen and come back to the brand page with the account listed.

**Troubleshooting**
- "redirect_uri mismatch": the URL registered on the platform must equal `{HARBOR_API_URL}/v1/channels/{platform}/callback` exactly (scheme, host, no trailing slash).
- "Set X_CLIENT_ID…": the app credentials aren't in `.env`, or the API wasn't restarted after you added them.
- A post shows **Check platform**: Harbor sent it but couldn't confirm it landed. Look on the platform, then click "It went out" or "It didn't go out, retry". Harbor never retries these on its own, to avoid double posts.
