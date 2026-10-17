# Founder accounts

Status: built, 2026-10-16.

## Why

A builder's own account isn't a brand. Making a founder fill in audiences, products and a logo for themselves is friction with no payoff. Their account is also one of the best channels their brands have.

## Shape

- **A person is a brand row with `kind = 'person'`.** Memory, baselines, approvals, ideas, drafts and publishing work unchanged.
  - There is at most one person per workspace, enforced by a partial unique index; a second one gets a 409.
  - `speaks_for` lists the brands the person posts about. Only brands in the same workspace qualify, and deleting a brand drops it from the list.
  - Brand Memory has `topics`: what the person posts about.
- **Onboarding:** adding a brand is unchanged. The brand form offers your own account as an optional link to `/brands/new?kind=person`, which goes About you → Connect → Voice → Done. Nothing requires it, and connecting can be skipped.
  - About you asks for a name, topics and which brands. No audience or product forms.
  - Connect passes `returnTo`, which is stored on the OAuth state, so the platform sends you back to the wizard. The first account's avatar becomes the person's picture.
  - Voice opens on "Paste your own". The sample dials start personal and candid.
- **Planning:**
  - A person always speaks as "I".
  - Topics become signals ("Something you post about: …").
  - Each linked brand's best post from the last 14 days (≥ 1.5× its median) becomes a signal on the person. The planner turns it into "Quote {brand}'s win with your take".
  - Ideas name the brands the person builds, never the person's own name.
- **App:**
  - A "You" section appears above Brands in the sidebar once you've added yourself.
  - The account page has a founder checklist and an About you card.
  - The profile menu (bottom-left) holds Settings, Theme and Sign out.

## Pricing

On Cloud, a personal account is included with any paid plan (one per workspace), not a free tier on its own. Self-hosted, everything is free.

## Later

- Cross-account coordination, so the person and a brand don't post the same thing on the same day.
- Importing a founder's past X posts for the voice step, which waits on X read costs (`HARBOR_X_READ_REPLIES`).
- Pulling the profile bio as a starting point for topics.
