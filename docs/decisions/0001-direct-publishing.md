# 0001: Publish directly to each platform

Date: 2026-10-15. Status: accepted.

## Decision

Harbor talks to X, LinkedIn, Instagram and Threads through each platform's own API, using our own developer apps. Postiz is a design reference only; Harbor neither calls its API nor uses its code.

## Why

- **For our own brands, no app review is needed.** LinkedIn's "Share on LinkedIn" and "Sign In with LinkedIn (OpenID Connect)" products are self-serve. Meta apps in development mode work for accounts that hold a role on the app (admin, developer or tester). X posting is pay-per-use from the developer console.
- **No dependency on a competitor** for the core loop (their pricing, rate limits, plan gating, and visibility into our content).
- **Our snapshot model needs direct reads anyway.** Postiz pulls analytics on demand with a 1-hour cache; Harbor's growth curve (1h, 6h, 24h, 72h, 7d) needs its own polling.

## Consequences

- We register and maintain 4 developer apps. App review (Meta Advanced Access, TikTok audit, LinkedIn partner programs) only becomes necessary when other people connect their accounts.
- Meta requires HTTPS redirect URIs, so local development uses a stable HTTPS tunnel (see `docs/setup/platform-apps.md`).
- **LinkedIn personal-post metrics need partner approval** (Community Management API). Until then LinkedIn posts publish but report no metrics; Harbor shows them as unavailable rather than guessing.
- X non-public metrics (profile visits, link clicks) are only available for posts under 30 days old.
