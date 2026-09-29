# feat(thesis): entity_ids take up to 100

## 1. Background

Backend's Thesis entity limit goes from 20 to 100 (`thesis.MaxEntities`),
which matches the existing ticker limit. With that change, curated
supply-chain and basket Theses publish every ticker they carry. In PRD, five
cards had 21–43 tickers.

The SDK checked `entity_ids` against 20 in two places:

- on requests (`requireIDs`);
- on responses (`responseIDs`). A Thesis with more than 20 entities would fail
  `get`, `create`, `update` and version reads with `INVALID_RESPONSE`.

## 2. Change

- `MAX_ENTITY_IDS = 100` bounds both `requireIDs` and `responseIDs`.
- `alva thesis create` help now says "at most 100 entity IDs".
- Tests:
  - 101 request IDs are rejected before HTTP;
  - 100 IDs are accepted both ways;
  - a response with 101 IDs is `INVALID_RESPONSE`.

## 3. Rollout

- Release this CLI before, or together with, the Backend limit raise.
- An older CLI rejects every response that carries more than 20 entities.
- Deploy order:
  1. Worldline (alva-ai/worldline#237).
  2. This CLI.
  3. alva-gateway.
  4. alva-backend.
- The skill documents no entity limit, so it needs no change.

## 4. Verification

- `pnpm typecheck`
- `pnpm exec vitest run test/resources/theses.test.ts test/cli`: 580 passed
- `pnpm lint`
- `prettier --check` on the changed files. The six files already failing on
  `origin/main` are unchanged by this PR.
