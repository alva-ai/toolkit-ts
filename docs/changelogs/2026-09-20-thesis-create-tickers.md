# feat: Accept tickers in Thesis creation SDK and CLI

Primary design: [Backend Thesis create tickers](https://github.com/alva-ai/alva-backend/blob/main/docs/changelogs/2026-09-20-thesis-create-tickers.md).

## 1. Background and Current State

- `CreateThesisParams` and `alva thesis create` currently support `entity_ids`/`--entity-ids` only. The CLI has normal and embedded command registries and dispatches through the same SDK create resource. The worktree starts at fetched `origin/main` on September 20, 2026.

## 2. Problem Model and End-to-End Behavior

- B1 — SDK create supports `tickers` and CLI create supports comma-separated `--tickers AAPL,NVDA`, optionally together with existing IDs. ID-only usage stays valid; no ticker lookup is performed locally.
- F1 — Empty/malformed CLI list is rejected before a request. Backend owns live exact STOCK lookup and the overall limit. A retry may reuse the same `request_id` only while the effective ticker mapping is unchanged; a Backend conflict after mapping drift requires a new UUID. Update commands and SDK update remain ID-only.

## 3. Research, Findings, and Architecture Decision

- Existing anchors are `src/resources/theses.ts`, `src/cli/dispatch.ts`, both CLI command registries, and their focused resource/CLI tests. Resolving in SDK would only serve one caller and is not the selected Backend contract.
- D1 — Forward caller ticker strings through SDK and CLI create only; preserve ID string transport and existing response semantics. Follow the primary record's Backend-first additive rollout and B/F/D/R contract.

## 4. Implementation Design

- Extend only `CreateThesisParams` and `createBody` with optional `tickers?: string[]`. Parse comma-separated `--tickers` in the create branch of dispatch and both command registries/help; reject empty tokens. The SDK transports strings, not resolved IDs. Update and read contracts remain unchanged.

### Serial Implementation Checklist

- [x] Add SDK create payload and strict string-list tests.
- [x] Add both CLI command registries, dispatch and help with mixed-input/invalid-input tests; run focused tests, typecheck and build.

## 5. Verification and E2E Design

- Resource test asserts exact REST JSON for `tickers` plus `entity_ids`; CLI tests assert normal/embedded acceptance, empty-token rejection, update flag rejection and ID-only continuity. Run `npm test -- --run test/resources/theses.test.ts test/cli/theses.test.ts`, `npm run typecheck`, `npm run build`. Running REST→Backend E2E is owned by local-dev.

## 6. Human Decisions and Interaction

- User selected plural tickers, coexistence with entity IDs, and create-only scope, then approved this code-level plan.

## 7. Outcome and Evidence

- SDK create transports optional `tickers`; normal and embedded CLI create accept comma-separated `--tickers` with IDs, reject both empty tokens and an explicitly empty flag value, while update rejects it. On the rebased final tree, 58 focused tests, typecheck, build and Prettier check passed. No repository `make lint-fix` target exists.

## 8. Remaining Work

- Backend is merged and Gateway PR #986 is open. The local-dev full-stack test passed through Gateway, Backend and llm-data (`TestThesisCreateTickers`, local-dev PR #387). Merge this consumer after Gateway; no deployment or production proof is included.
