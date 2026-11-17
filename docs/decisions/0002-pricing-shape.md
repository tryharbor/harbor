# 0002: Pricing shape

Date: 2026-10-15. Status: accepted (prices themselves still to be tested with design partners).

**Update 2026-11-17:** with the startup-OS pivot the unit is the **business**, not the brand, and the free path is no
longer self-hosting (open source is out of the positioning). Same prices and counts: Starter $19 (2 businesses),
Builder $49 (6), Agency $149 (25). Plans add a monthly app-build allowance ($5, $25, $75 at list price; an owner's own
AI key doesn't count against it). Stripe products: docs/setup/stripe-plans.md.

## Decision

- Harbor follows the Sanity / Postiz shape, not Jasper's: start free, cheap self-serve plans, no sales call.
- **The free path is self-hosting** (AGPL). There is **no hosted free tier** for now.
- Harbor Cloud is priced **per brand**, not per seat. Working hypothesis: Starter $19 (2 brands), Builder $49 (6), Agency $149 (25).
- A more generous plan (hosted free tier, discounts) can come later, once Harbor makes money.

## Why

- **We can't absorb variable costs.** Unlike Sanity, every active Harbor user costs money: model tokens for agents and drafting, X's pay-per-read API, storage for snapshots. A hosted free tier would be paid for out of pocket.
- **Jasper is priced for marketing departments** (per seat, sales-led). Builders running several brands won't pay that, and it's the gap Harbor is aimed at.
- **Brands are the unit builders think in.** Seats don't matter to a solo founder; the number of things they post for does.

## Consequences

- Cloud plans need usage limits that keep each plan profitable: AI runs per month, X reads, snapshot retention.
- The sandbox and simulated model stay first-class, so self-hosters and design partners can try everything without spend.
