# feat: thesis toolkit resource and CLI for mono-meta#950

## 1. Current state and scope

mono-meta#950 needs the TypeScript toolkit boundary for authored theses. This
change is limited to `toolkit-ts`: a typed REST resource, independent terminal
and embedded command catalogs, help, docs, and fake-boundary tests. It does not
alter another repository or a submodule pointer.

## 2. Behaviors and failure rules

- B1: `client.theses` exposes create/get/update/close/delete/rewrite using the
  agreed `/api/v1/theses` contract.
- B2: terminal and embedded dispatch both expose all six leaves; embedded
  accepts only literal `--body` text.
- B3: all IDs remain strictly positive decimal int64 strings through requests
  and responses; numeric response IDs are rejected.
- F1: body rejects blank text, invalid Unicode, NUL, and values over 65536
  UTF-8 bytes. Title remains optional but rejects NUL and exceeds 500 bytes.
- F1a: terminal file/stdin body transports decode bytes with fatal UTF-8;
  malformed bytes fail rather than silently becoming U+FFFD.
- F1b: entity IDs are capped at 20, matching the gateway boundary; close notes
  reject NUL at both request and malformed-response boundaries.
- F1c: CRUD response body/title fields receive the same blank, Unicode, NUL,
  and byte-limit checks as requests; a successful HTTP 204 delete normalizes
  to `{}`.
- F2: writes require a caller-supplied stable canonical UUID and do not retry;
  update requires explicit public/private visibility.

## 3. Design decisions

- D1: create defaults visibility to `public`; update replaces body, title,
  entity IDs, visibility, and editorial state as a full author-version update.
- D2: rewrite is explicit. CRUD never calls it. Backend owns any Signal/Alert
  setup; the CLI never starts either separately or adds a fallback.
- D3: tests use local dispatch plus fake HTTP/resource boundaries, not a false
  end-to-end backend acceptance claim.

## 4. Implementation checklist

- [x] Add `ThesesResource`, response validation, exports, and `client.theses`.
- [x] Add terminal and embedded catalog/help/dispatch leaves.
- [x] Add SDK/HTTP-boundary and actual terminal/embedded dispatch tests.
- [x] Run typecheck, format, lint, test, and build after restoring the declared
      dependencies.

## 5. Verification design

Tests cover CRLF preservation, large IDs, positive-ID validation, UUIDv7,
explicit rewrite, no retry after HTTP failure, update visibility, terminal
file/stdin body transport (including malformed UTF-8), and embedded rejection
of unsupported transports. Terminal entity-ID CSV input trims each nonempty
token while rejecting empty entries; the delete boundary is checked with an
actual 204 `Response`.
No test claims a first-run backend state or accepted running state.

## 6. Pending integration

**Backend integration is pending. Signal integration is pending.** This is a
toolkit boundary implementation only; it does not claim end-to-end backend
acceptance, Signal behavior, Alert behavior, or a first-run runtime status.

## 7. Outcome and evidence

- `npm run typecheck` passed.
- `npm run format:check` passed.
- `npm run lint` passed.
- Focused Thesis and embedded-command coverage passed: 3 files and 69 tests.
- `npm test` passed: 52 files and 1011 tests. It ran outside the sandbox only
  because the pre-existing auth-login tests bind a localhost callback listener.
- `npm run build` passed, including its existing vendor-contract prebuild.

## 8. Remaining work

Deployment and cross-repository integration acceptance remain pending. These
source-only toolkit checks do not establish a deployed backend, a live model
rewrite, or end-to-end acceptance.
