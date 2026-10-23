# Fix Thesis update direction passthrough

## 1. Background and current state

Issue #194 reports a body update changing SMH from bearish to unknown.
Create accepts entity_stances, but terminal/embedded update flags, dispatch,
UpdateThesisParams and updateBody omit it. Backend already supports the field
and deliberately replaces omitted directions with unknown on ordinary updates.

## 2. Behavior

- B1: Terminal, embedded and SDK updates carry explicit bearish/bullish/unknown
  directions keyed to the selected entity IDs, including asset changes.
- B2: A caller editing only the body reads and resubmits the original directions.
  Help explains full replacement; Toolkit does not infer or merge old state.
- F1: Invalid JSON, directions, duplicate IDs or bindings outside entity_ids fail
  before HTTP, using the existing create validation.
- F2: Version conflicts propagate without retries, rewriting or dropping fields.
- Compatibility: omitted entity_stances remains omitted. No Backend semantic or
  schema change and no modification of the affected user's content.

## 3. Decision

Reuse the create parser and requireEntityStances validator across update.
Extend CLI schemas, SDK input/body and both help surfaces. Reject changing the
Backend omission contract or adding an automatic read/merge in the SDK.
This is a mechanical existing-contract repair; external research cannot change
its ownership. Source and existing Backend tests establish the contract.

## 4. Implementation design

Add optional ThesisEntityStance[] to UpdateThesisParams. updateBody conditionally
validates and serializes it using the submitted entity_ids. Both command
schemas accept --entity-stances and shared dispatch parses it. Keep request_id,
expected_author_version_id, visibility and all body transport rules unchanged.

Serial checklist:

- [x] Add failing request-boundary regressions.
- [x] Implement schemas, dispatch, serialization and help.
- [x] Run full CI checks and review the complete diff.
- [ ] Publish the Toolkit fix for review; downstream Dispatch adoption is required
      before ALPI can consume it, and package publication/deployment is separate.

## 5. Verification design

Node 22 (CI covers 18/20/22), lockfile dependencies through npm ci.
Use both actual dispatchers and SDK through fetch to assert PUT JSON and response
readback, explicit clears, mixed entity bindings, pre-HTTP rejection and one-shot
409 errors. Existing lifecycle tests establish unchanged omission behavior.
Commands: npm test, npm run lint, npm run format:check, npm run typecheck,
npm run build. The repository CI requires these exact scripts.
E2E Required: no new service behavior; the stable boundary is the already-supported
HTTP request, covered through real CLI/SDK serialization with a fixture transport.
No production requests or writes are used for verification.

## 6. Human decisions

The user approved the minimal update-passthrough fix on 2026-10-23 after review
of the exact missing layers and existing Backend replacement contract. The
separate asset-extraction concern remains read-only investigation in this change.

## 7. Outcome and evidence

25 new request-boundary tests; RED reproduced unsupported update flags and the
SDK dropping entity_stances. Final Node v22.23.3 / npm 10.9.9 checks:

- npm ci --no-audit --no-fund: passed using package-lock.json.
- npm test: passed, 58 files / 1292 tests.
- npm run lint: passed (repository CI ESLint scope).
- npm run format:check: passed (repository CI Prettier scope).
- npm run typecheck: passed.
- npm run build: passed, including vendor-contract and declaration builds;
  no generated source changes.
- git diff --check: passed.

Review traced both accepted command schemas to the shared parser and SDK PUT
body, confirmed existing omission behavior, unique selected-ID validation,
explicit unknown clearing and one-shot 409 propagation. No Backend changes.
B1/B2/F1/F2 are covered by the CLI/SDK request-boundary tests and existing suite.

## 8. Remaining work

Dependent sdk-monorepo change must pin the reviewed Toolkit revision and release
Dispatch 1.1.1 before ALPI can use it. Upstream merge, final merged dependency pin,
STG/PRD publication and live acceptance remain separate. No production content
was repaired by this code change.
