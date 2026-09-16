# feat: explicit Thesis rewrite modes

## 1. Current state and scope

Toolkit PR #174 already exposes explicit, candidate-only Thesis rewrite through
the SDK plus independent terminal and embedded command catalogs. This follow-up
adds the shared canonical mode contract only in `toolkit-ts`; Backend/Gateway
behavior and mono-meta pointers are out of scope.

## 2. Behaviors and failure rules

- B1: SDK callers may select `reformat`, `shorten`, or `enrich`; omitting mode
  sends canonical `reformat`.
- B2: terminal and embedded `thesis rewrite` both catalog, document, parse, and
  forward the same explicit `--mode` value.
- F1: empty, whitespace-only, `null`, and unknown mode values are errors; only
  omission defaults, and rejected modes make no resource/HTTP request.
- F2: body, body-file, and body-stdin validation remains exact. Rewrite never
  selects a mode from body length/errors, retries, creates, or updates.

## 3. Design decisions

- D1: `ThesisRewriteMode` is an exported string union. The SDK validates its
  runtime value before the request boundary and always serializes the canonical
  selected/defaulted value.
- D2: all mode semantics are Backend-owned. Toolkit preserves the caller's
  choice and returns only the candidate response; it does not infer quality or
  compensate for model/backend errors.

## 4. Implementation checklist

- [x] Export and validate the SDK mode union; serialize canonical default.
- [x] Add terminal and embedded catalog, dispatch, and help coverage.
- [x] Add SDK and actual terminal/embedded invocation tests, including
      no-request invalid-mode boundaries.
- [x] Document this local contract and the linked public-Skill guidance.

## 5. Verification design

Run Toolkit typecheck, test, build, and format check. Unit tests cover every
canonical mode, omitted default, invalid runtime values, terminal and embedded
invocations, and retain existing body transport validation. No live model or
server request is permitted.

## 6. Integration boundary

Backend remains responsible for mode execution and HTTP error semantics:
incomplete model output is `FailedPrecondition`/HTTP 412 with a readable
message; unavailable service/admission is HTTP 503; invalid model output is
`Internal`/HTTP 500. Quota exhaustion is HTTP 429 with `Retry-After` when the
server provides a valid positive delay. Toolkit does not automatically retry.

## 7. Outcome and evidence

- `npm run typecheck` passed.
- Focused Thesis coverage passed: 2 files, 54 tests.
- Full `npm test` passed: 50 files, 999 tests. The first sandboxed attempt
  could not bind the pre-existing loopback auth-listener tests; the permitted
  rerun passed without a Thesis/API/model call.
- `npm run build` passed. Its pre-existing `vendor-contract` prebuild fetched
  public static design assets before compiling; no live Thesis or model request
  was run, but this build was not fully offline.
- `npm run format:check` and `git diff --check` passed.

## 8. Remaining work

Backend/Gateway integration, deployment, and live model acceptance remain
outside this repository and this no-live-call task.
