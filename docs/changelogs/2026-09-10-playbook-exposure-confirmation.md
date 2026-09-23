# Playbook release exposure confirmation

## 1. Problem

Full local E2E reaches a real CLI publishing gap: the backend rejects publishing
bundled non-public Feeds without explicit consent, but toolkit cannot send consent.

## 2. Approved behavior

The user approved fixing this gap. SDK callers may pass the optional boolean
`confirm_bundled_feed_exposure`; CLI callers may explicitly provide
`--confirm-bundled-feed-exposure`. Omitted and false values remain unconfirmed.

## 3. Design

Forward consent through the existing release request. The gateway already parses
and forwards this field to the backend. No gateway or backend change is required.
Both standalone and embedded CLI routes accept the boolean. Never automatically
retry a denied release with consent enabled.

## 4. Scope

Toolkit release request type, resource, CLI definitions, dispatch, help, and tests.
Companion E2E changes live in alva-local-dev under
`docs/changelogs/2026-09-10-bound-local-e2e-feedback.md`.

## 5. Verification

Unit coverage checks omitted, false, and true consent. Typecheck and build verify
consumers. Real E2E rejects an unconfirmed release and publishes the same version
with explicit consent. Existing gateway coverage already verifies forwarding.

## 6. Execution

- [x] Add optional SDK consent and both CLI routes.
- [x] Add boundary tests and explicit consent to publishing E2E fixtures.
- [x] Run focused tests, typecheck, build, and review.
- [ ] Run managed final E2E and record results.

No schema migration or automatic consent is introduced. Existing callers retain
the default unconfirmed behavior. This repository has no `make lint-fix` target.

## 7. Outcome and Evidence

`npm test -- test/cli.test.ts test/resources/resources.test.ts`: 480 tests passed.
`npm run typecheck`: passed. Managed E2E preparation ran `npm run build` successfully;
vendored design contract files have no tracked changes. The companion E2E HTML
passes the current design contract with zero findings.

Review traced standalone and embedded command validation through dispatch, SDK
serialization, existing gateway forwarding, and backend enforcement. There is no
automatic confirmation or retry. Omitted values remain omitted on the wire.
No backend/gateway product modification or deployment ordering requirement exists.

| Intent                 | Evidence                          | Status |
| ---------------------- | --------------------------------- | ------ |
| Explicit SDK consent   | Omitted/false/true resource tests | DONE   |
| Both CLI routes        | Six route/boolean boundary cases  | DONE   |
| Preserve backend guard | Real negative/positive E2E        | DONE   |

## 8. Remaining Work

The managed full run `e2e-437272-dlbi5q3stb3h` passed
`TestCLI_ReleaseFeedAndPlaybook` (9.19s), including HTTP 412 / FAILED_PRECONDITION
without consent and successful publication of the same version with consent.
`TestCLI_PlaybookComments`, `TestCLI_Remix`, and the missing-HTML negative test
also passed. Full E2E stopped after 793.032s at the separate existing
`TestConversationUsageProviderParity/claude`: the 180-second request returned no
PONG text. Sandbox readiness completed in 2.4s; the remaining provider/runtime
failure is not diagnosed by this change. There were 69 passed outcomes, 29
historical quarantined skips, and 2 failures (the subtest and its parent).
Owned cleanup passed in 8.716s. No retry, timeout increase, or new quarantine was
introduced. Required full coverage remains incomplete, so publication is blocked.
