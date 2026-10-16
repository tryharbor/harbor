# Contributing to Harbor

Thanks for helping. Harbor is early and moving fast, so a little coordination saves everyone time.

## Before you start

- **Bugs:** open an issue with what you did, what you expected and what happened. Include the API's `request_id` from the error, if there is one.
- **Features and larger changes:** open an issue first so we can agree on the shape before you write code. Harbor keeps design contracts in `docs/design/` and decisions in `docs/decisions/`; a change that touches those starts there.
- **Small fixes** (typos, copy, obvious bugs): a pull request is fine on its own.

## Setup

```sh
pnpm install
pnpm dev                          # sandbox + simulated model: no keys, no spend
pnpm --filter @harbor/api dev:demo  # or with demo data
```

## Before opening a pull request

```sh
pnpm typecheck
pnpm test
```

Both must pass. Tests never touch the network: platform calls use mocked HTTP and the model is the simulated one.

## How Harbor's code reads

- Match the code around you: terse doc comments that say why, plain names, no clever abstractions.
- UI: square controls, no native `<select>` (use `components/select.tsx`), no colored edge accents. See `docs/design/DESIGN.md`.
- Copy: plain and specific. No hype words, and nothing claimed that Harbor doesn't do.
- Never add anything that publishes without a person approving it ([decision 0003](docs/decisions/0003-agents-propose-people-publish.md)).

## License

By contributing you agree that your contributions are licensed under the [AGPL-3.0](LICENSE).
