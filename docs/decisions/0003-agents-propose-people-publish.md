# 0003: Agents propose, people publish

Date: 2026-10-15. Status: accepted.

## Decision

- No agent publishes or schedules on its own. This covers Harbor's built-in agents, automations and any MCP client. Whatever an agent wants posted becomes an **approval**: a draft, a channel, a proposed slot, the reason for it, and the voice-check results.
- Approving schedules the post. Editing first saves a new draft version. Rejecting keeps the record, with an optional note.
- The MCP server exposes `propose_post`, not `schedule_post` or `publish`. API keys have only `read` and `write` scopes. Even `write` stops at proposing.
- Automations (schedules and post events) have a daily run cap and pause themselves after 3 consecutive failures.

## Why

- **One bad post costs more than ten saved minutes.** Harbor posts for several brands, often to audiences their owners built over years. A wrong-voice post, or one sent to the wrong brand, is the failure people remember.
- **Platform rules.** X, Meta and LinkedIn all restrict fully automated posting to some degree. A person in the loop keeps Harbor on the right side of them.
- **It's the useful part anyway.** The time sink is working out what to post, writing it and finding a time. Clicking approve on a week of well-reasoned drafts takes two minutes.
- **Spend stays predictable.** Daily caps and auto-pause keep a looping automation from burning model tokens once Harbor runs on a real model.

## References

- Jasper: an agent library and a docked agent panel, with output delivered as cards to review.
- Sanity: Functions (event and schedule triggers) with run logs, and an MCP server with scoped tokens.
- Postiz: its public API publishes directly. Harbor deliberately doesn't.

## Consequences

- Approvals is a top-level page with a count in the sidebar, and Home shows what's waiting.
- A later "trusted" mode (auto-approve when every check passes, per brand) is possible, but it has to be an explicit per-brand opt-in.
