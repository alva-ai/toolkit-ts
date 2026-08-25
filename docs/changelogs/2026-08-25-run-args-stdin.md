# fix: carry large run arguments over stdin

## 1. Background and Current State

- **Problem/outcome:** The hosted Trading Automation replay sends a frozen,
  point-in-time turn input that can be about 390 KB. The current `alva run
--args <json>` CLI contract places that entire JSON string in one `argv`
  element, so Linux rejects the child launch with `E2BIG` before Alva or the
  hosted script starts.
- **Current architecture:** The terminal CLI parses `run` flags, validates
  serialized arguments with the existing JSON-object and safe-number rules,
  and forwards the original text through the run resource. The Node CLI already
  has an explicit `readStdin` capability used by other commands, but `run`
  currently has no stdin argument mode. Embedded/Jagent dispatch has no local
  stdin capability by default.
- **Consumer evidence:** Current `alva-trading-agents` main passes the canonical
  turn record from `orchestrator/hosted-trading-automation.js::runHostedTurn`
  as one `--args` value. `orchestrator/altra-step.js` is a separate,
  substantially smaller invocation and is outside this change.
- **Data meaning:** The large object is one session's exact raw-tweet evidence
  plus execution, identity, prompt, cutoff, and source metadata. It is not all
  historical sessions concatenated into a model prompt, and it contains no
  credentials. The hosted runtime exposes the evidence to `compute`, where the
  model returns a compact decision summary.
- **Constraints and unknowns:** Preserve the serialized bytes, `env.args`
  behavior, source hash, resume identity, and legacy `--args` compatibility.
  Backend operation receipts, timeout reconciliation, and retry policy are
  separate concerns and are not part of this CLI transport fix. External
  research is unnecessary: the existing CLI capability boundary and local
  consumer/tests fully determine the design.

## 2. Problem Model and End-to-End Behavior

- **Root cause:** A large but valid JSON value is encoded as a single process
  argument; the operating-system argument-size limit is reached before the API
  request can be made.
- **Goals:** Let the existing hosted caller transport the same canonical JSON
  without an argv-size limit, retain exact input identity, and make malformed
  or unsupported use fail before an API request.
- **Non-goals:** No backend or API schema change; no ALFS pointer protocol; no
  `--args-file`; no change to deploy arguments, Altra, model prompts, account
  behavior, timeout semantics, retry/reconciliation, or experiment treatment.
- **B1 - stdin transport:** `alva run --args-stdin` reads the complete stdin
  text and sends that exact serialized object through the same `env.args`
  request path as `--args`.
- **B2 - compatibility:** `--args` remains unchanged. The two modes are
  mutually exclusive. The terminal Node adapter supplies stdin; an embedded
  runtime that does not provide the capability rejects the mode clearly.
- **B3 - hosted replay:** The hosted Trading Automation adapter selects the
  stdin mode while preserving the canonical input hash, wrapper, envelope,
  result, and runner/checkpoint identity. No raw evidence is moved into a
  live/current feed.
- **F1 - invalid input:** Empty, malformed, non-object, or unsafe-number JSON
  from stdin follows the existing argument-validation error boundary and does
  not dispatch a run request.
- **F2 - unavailable/conflicting mode:** Missing stdin capability or combining
  `--args` with `--args-stdin` fails with a CLI usage error before dispatch.
- **F3 - legacy path:** Existing `--args` callers continue to receive the same
  validation and raw-serialization behavior.

## 3. Research, Findings, and Architecture Decision

- **Repository findings:** `src/cli/commandDefinitions.ts` owns terminal flag
  declarations; `src/cli/dispatch.ts` owns run validation and dispatch;
  `src/cli/index.ts` already supplies `readStdin`; `src/resources/run.ts`
  preserves raw serialized argument text. Hosted tests mock the child process
  and can assert both argv and stdin without a live provider.
- **Approach A - stdin (selected):** Add a mutually exclusive run flag backed
  by the existing capability, then have the hosted caller pass the same JSON
  over child stdin. This keeps one validation/request path and leaves no
  temporary payload file.
- **Approach B - local args file (rejected):** Avoids argv limits but adds
  mode/permission/cleanup races and a path lifecycle that the current caller
  does not own.
- **Approach C - hash-addressed ALFS input (deferred):** Could make the child
  read a pinned object, but requires a new authenticated immutable-generation
  contract and source/readback semantics; it is larger than the observed
  transport problem.
- **D1 - exact-byte boundary:** Reuse the existing serialized-argument
  validator and raw request path; stdin changes only how the text reaches the
  CLI. UTF-8 text is read once through the explicit adapter.
- **D2 - narrow ownership:** Change toolkit-ts plus the one hosted consumer and
  their records/tests/docs. Keep Altra, backend schemas, and retry/reconcile
  owners untouched.
- **R1 - transport regression:** A future caller could accidentally parse or
  reserialize stdin; tests must include a large, non-ASCII payload and assert
  exact text reaches the serialized request boundary.
- **R2 - capability drift:** Embedded dispatch may lack stdin; the error must
  remain explicit rather than silently reading or substituting another source.
- **Closest references:** `src/cli/dispatch.ts`, `src/cli/index.ts`,
  `src/resources/run.ts`, `test/cli.test.ts`, and the linked hosted adapter
  changelog in `alva-trading-agents`.

## 4. Implementation Design

### 4.1 Impact and call map

The primary implementation is in `toolkit-ts` and owns the terminal CLI
contract:

1. `src/cli/commandDefinitions.ts` adds `args-stdin` as a boolean on the
   terminal `run` definition. The embedded command catalog remains unchanged;
   its deliberately smaller contract rejects this terminal-only transport as
   unsupported rather than pretending an in-process stdin exists.
2. `src/cli/dispatch.ts` documents the flag, checks mode exclusivity, reads
   stdin through `DispatchRuntimeDeps.readStdin`, and labels validation errors
   with the selected flag. `src/cli/index.ts` already supplies the Node
   adapter, so no second stdin reader or global stream side effect is needed.
3. `src/resources/run.ts` and `src/jsonPayload.ts` remain the single request
   boundary. They receive the raw string and preserve its exact JSON text as
   `env.args`; no parser or serializer is added to the resource layer.
4. `test/cli.test.ts`, `test/cli/commandSchema.test.ts`, and
   `test/cli/agentCommandProfile.test.ts` cover the terminal grammar, dispatch
   branches, no-request failure behavior, and the absence of the terminal-only
   flag from the embedded parser and help. The linked trading repository owns
   the consumer change and its child-process tests; its local record is
   `2026-08-25-hosted-args-stdin.md`.

The representative successful path is:

```text
argv --args-stdin
  -> parseCommand (boolean flag)
  -> executeParsedCommand/run
  -> readStdin exactly once
  -> validateSerializedArgs (object + safe-number rules)
  -> RunResource._executeSerializedArgs(raw text)
  -> objectWithRawJSONField
  -> POST /api/v1/run with the same args bytes
```

The hosted path constructs the same `inputRecord.content`, keeps a small
`argv` containing `--args-stdin`, and supplies that text as the child
process's `input`. The resulting invocation record contains the actual small
argv and existing `input_sha256`, never the raw evidence. Envelope decoding,
runner checkpoints, and resume state are downstream and unchanged.

### 4.2 Critical interfaces and contracts

The terminal definition is equivalent to:

```ts
command('run', {
  values: [
    'code',
    'local-file',
    'entry-path',
    'working-dir',
    'args',
    'max-heap-size-mb',
    'timeout-ms',
  ],
  booleans: ['args-stdin'],
});
```

The existing serialized-argument helper gains only a diagnostic label so
legacy callers retain their current wording while stdin failures identify
`--args-stdin`:

```ts
serializedJSONFlag(value, 'run', '--args') -> string | undefined
serializedJSONFlag(stdin, 'run', '--args-stdin') -> string | undefined
```

The `run` branch resolves the modes in this order:

```text
stdinMode = boolFlag(flags['args-stdin']) === true
if stdinMode and flags.args is present: CliUsageError (mutually exclusive)
serialized = validate(flags.args, '--args')
if stdinMode:
  require deps.readStdin
  serialized = validate(await deps.readStdin(), '--args-stdin')
dispatch execute() when serialized is absent, otherwise _executeSerializedArgs()
```

`--args-stdin=false` and the parser's `--no-args-stdin` form are inert and do
not consume stdin. A true mode reads once, does not trim or normalize newlines,
and passes the returned UTF-8 string unchanged. Missing capability, empty
input, malformed JSON, non-object JSON, and unsafe numeric tokens raise before
`client.run` is called. The resource's existing second validation remains a
defense-in-depth check and does not alter the bytes.

The hosted adapter change is intentionally mechanical:

```js
const argv = [
  '--profile', PROFILE, 'run', '--local-file', entryPath, '--args-stdin',
];
const invocation = { command: 'alva', argv: [...argv], transport: 'hosted_prd',
  input_sha256: inputRecord.id, ... };
execFileSyncImpl('alva', argv, { input: inputRecord.content, encoding: 'utf8', ... });
```

No raw input is copied into errors, logs, or invocation metadata. Existing
stdout/stderr capture and envelope-error attachment stay intact. The hosted
runner does not add retries, cancellation, operation IDs, or reconciliation;
those are separate approved ownership boundaries.

### 4.3 Errors, security, and observability

| Code path            | Failure                                        | Handling and visible result                                                                      |
| -------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Terminal parser      | Unknown/unsupported embedded flag              | Existing `CliUsageError`; no request.                                                            |
| `run` mode selection | Both modes supplied                            | `CliUsageError` naming `run`; no stdin read or API call.                                         |
| Stdin capability     | Adapter absent                                 | Explicit `--args-stdin` capability error; no request.                                            |
| Stdin validation     | Empty, malformed, non-object, or unsafe number | Existing validation boundary with selected flag label; no request.                               |
| Hosted child launch  | `E2BIG`/spawn/provider/process failure         | Existing error propagation, sanitized stdout/stderr, small invocation metadata; no retry change. |
| Hosted envelope      | Malformed or failed envelope                   | Existing decode error with invocation and captured output; no state/retry change.                |

The raw payload is not placed in argv, logs, or error metadata. The child
environment remains the existing allowlisted `safeEnv`; no credential or
permission path changes. `input_sha256`, transport, envelope hash, and current
runner event traces remain the operator-visible evidence for correlation.

### 4.4 Compatibility, rollout, and recovery

There is no schema, proto, generated artifact, migration, or deployment config
change. Merge and release the toolkit CLI contract before enabling the hosted
consumer in an environment that has the new binary; existing `--args`
callers remain compatible. The hosted consumer PR then changes only its
transport flag/input and must retain the primary changelog link.

Rollback is a normal code revert: restore the consumer's `--args` call (which
will again be subject to the OS limit) or keep the toolkit flag while reverting
the consumer. No temporary payload files, ALFS objects, account state, or
experiment artifacts are created by this change. A live hosted canary is an
operational post-merge gate, not a review-time test or a reason to modify
timeout/retry semantics.

### 4.5 Serial implementation checklist

1. Update the terminal `run` definition/help and dispatch validation, then add
   parser/dispatch tests for the new mode and all F1/F2 branches. Run the
   toolkit focused tests, typecheck, build, and `git diff --check`.
2. Update `runHostedTurn` to pass canonical input through child stdin and to
   record the small actual argv; update its success/failure regression tests.
3. Run the hosted adapter and runner-dependent tests plus SDK typecheck/build,
   inspect both diffs, and update both changelogs with exact results.
4. Perform the AlDev review gates, publish the toolkit change first, then the
   consumer change; leave live canary/merge decisions to the human operational
   gate.

## 5. Verification and E2E Design

### 5.1 Testability boundary and representative cases

The injected `readStdin` function and mocked `RunResource` are the stable
toolkit boundary; the hosted test's injected `execFileSyncImpl` is the stable
child boundary. No live API or provider is needed to prove byte transport.

Planned toolkit cases:

- Parse `run --args-stdin` as a boolean and include it in help; verify the
  embedded catalog does not silently advertise a terminal-only flag.
- Dispatch a large object containing non-ASCII text and identifier strings via
  injected stdin. Assert `_executeSerializedArgs` receives the exact original
  string, `execute` is not called, and no argv-sized transformation occurs.
- Table-drive empty, malformed, `null`, array, and unsafe-number stdin; assert
  the selected flag appears in the error and both request mocks remain unused.
- Assert `--args` plus true `--args-stdin` is rejected before reading stdin;
  assert missing `readStdin` fails clearly; retain the existing legacy
  `--args` string-ID regression.

Planned hosted cases:

- Use a large Unicode canonical input and capture the fake child call. Assert
  `argv` contains `--args-stdin`, contains no canonical payload, `options.input`
  equals the exact canonical text, and `input_sha256` and envelope decoding
  remain unchanged.
- Throw a fake child transport error with stdout/stderr and assert the error
  retains sanitized output and the same small invocation metadata.

These tests falsify the main risks: accidental reserialization/trimming (R1),
wrong flag ownership or stdin consumption (R2), accidental argv leakage, and
legacy behavior drift (F3).

### 5.2 Commands and evidence

Toolkit worktree (`worktrees/toolkit-large-args`):

```bash
npm exec vitest run test/cli.test.ts test/cli/commandSchema.test.ts
npm run typecheck
npm run build
git diff --check
```

Trading worktree (`worktrees/task966-hosted-args-stdin`):

```bash
node --test orchestrator/hosted-trading-automation.test.js orchestrator/trading-automation/*.test.js
npm test
npm run sdk:typecheck
npm run sdk:build
node --check orchestrator/hosted-trading-automation.js
git diff --check
```

The full repository suites are retained because the shared runner and CLI
resource are direct dependents. Neither repository defines `make lint-fix`, so
AlDev records lint as unavailable rather than substituting an unapproved lint
command. No generated or golden files are expected; any unexpected one must be
investigated before review.

### 5.3 E2E decision

**E2E Required: no.** This is a transparent process-boundary change already
proven by the terminal dispatch/request mock and hosted child-process mock. A
live hosted run would add provider/account state and timeout ambiguity without
testing a contract that the focused tests cannot observe. After merge, a human
may run the existing bounded hosted canary as an operational rollout gate;
that is intentionally outside this PR's evidence and does not authorize an
experiment launch.

### 5.4 Behavior-to-evidence map

| ID    | Evidence                                                                                             |
| ----- | ---------------------------------------------------------------------------------------------------- |
| B1/B2 | Terminal parser/dispatch exact-byte and legacy tests; toolkit typecheck/build.                       |
| B3    | Hosted success test: exact stdin, small argv, preserved hash/envelope.                               |
| F1    | Table-driven invalid stdin tests with zero request calls.                                            |
| F2    | Conflict and missing-adapter tests.                                                                  |
| F3    | Existing `--args` string-ID and serialized request tests.                                            |
| D1/R1 | Raw-string equality assertion with large non-ASCII payload.                                          |
| D2/R2 | Terminal-only definition, explicit capability error, hosted failure metadata, and diff/scope review. |

## 6. Human Decisions and Interaction

- Mozhi authorized the patch in `a78be3b6`; the source-level correction to
  `runHostedTurn` and the exclusion of `altra-step.js` were confirmed in
  `816adcf9`.
- The approved transport is `--args-stdin`, not `--args-file` or an ALFS
  pointer. The record preserves the exact canonical bytes and keeps timeout,
  retry, reconciliation, backend, and experiment behavior out of scope.
- H0 reviewed the recorded architecture (`728024a6`) and this code-level
  walkthrough (`445580fe`) with `approve`; sections 4-6 were then accepted in
  `8ac7310f` before production edits began.
- The invocation artifact intentionally records the actual small argv with
  `--args-stdin` rather than the old `<canonical-input>` placeholder. Because
  the payload now travels on stdin, this is both more truthful and still
  payload-safe; `input_sha256` remains the correlation identity.
- Operational authority is unchanged: toolkit availability/release and any
  post-merge hosted canary require the owning human gate. No credentials,
  accounts, provider calls, or experiment state were touched while planning.

**Plan status:** sections 4-6 were approved and implemented; the outcome and
publication gates are recorded below.

## 7. Outcome and Evidence

- **Result:** Implemented the terminal `run --args-stdin` transport, kept
  legacy `--args` behavior intact, and validated the hosted consumer against a
  large non-ASCII canonical turn. The raw JSON now crosses the child boundary
  on stdin while the request/resource and runner identity paths remain the
  same.
- **B/F/D/R reconciliation:** B1/B2 are covered by the terminal parser,
  exact-string dispatch, conflict, missing-adapter, and legacy tests. B3 is
  covered by the linked hosted regression, which proves exact stdin bytes,
  small argv, hash preservation, and envelope behavior. F1/F2 are fail-closed
  before request dispatch; F3 remains green on the unchanged `--args` path.
  D1/D2 are reflected in the final source ownership and unchanged embedded,
  Altra, backend, and retry/reconciliation boundaries. R1 is falsified by the
  150,000-character noncanonical Unicode equality test (whitespace and escaped
  code points); R2 is covered by the explicit capability error and
  terminal-only flag definition.
- **Implementation deviations:** No behavior or ownership deviation from the
  approved sections 1-6. A review pass found that the public `README.md` run
  synopsis omitted the new mutually exclusive mode; it was updated without
  changing the CLI behavior. A follow-up review also required the stdin path
  to fail closed when a runtime adapter returns `undefined`; the dispatch now
  raises the same usage error instead of falling through to no-args execution,
  with a regression test proving neither client dispatch path is called. The
  hosted worktree temporarily symlinked an
  already-installed dependency tree solely for local SDK checks; the symlink
  was removed before review and is not part of either diff.
- **Verification and E2E:**
  - `npm exec vitest run test/cli.test.ts test/cli/commandSchema.test.ts` — 2
    files, 383 tests passed.
  - `npm exec vitest run test/cli/agentCommandProfile.test.ts` — 1 file, 14
    tests passed; the embedded parser rejects `--args-stdin` and the Slim run
    help omits it.
  - `npm test` — 46 files, 862 tests passed.
  - `npm run typecheck`, `npm run build`, and `npm run format:check` — passed
    after the stdin fail-closed fix; the build/vendor step produced no tracked
    generated diff.
  - `git diff --check` — passed in both worktrees. The hosted worktree also
    passed `node --check orchestrator/hosted-trading-automation.js`.
  - The linked hosted worktree passed its focused adapter test (6/6), full
    repository suite (474/474), `npm run sdk:typecheck`, and
    `npm run sdk:build`. **E2E Required: no** remains the approved decision;
    no provider, account, canary, or experiment run was performed.
  - Neither repository exposes the required `make lint-fix` target; lint is
    recorded unavailable under the AlDev policy rather than substituted.
- **Migration and docs:** No schema, generated artifact, deployment, account,
  provider, or experiment migration is required. The public `README.md` run
  synopsis now documents `[--args <json> | --args-stdin]`; this primary record
  and the linked hosted local record remain the authoritative implementation/
  outcome documentation.
- **Review/publication state:** The main-agent behavior, architecture, test,
  security/compatibility, migration, and documentation review is clean after
  the fail-closed stdin feedback fix. The dependency-ordered publication
  remains in progress; the final candidate will receive a fresh secret scan.
- **PR/CI outcome:** PR #169 contains implementation feedback head
  `1ce2c9f182741af8d7ef2487507c540253710d17` plus a docs-only publication
  reconciliation; it is open, non-draft, mergeable, and its current-head
  toolkit CI is green (three build jobs).
  The hosted consumer remains separately published as PR #252 at head
  `5c30ad66b440bd533a3e09db427a822692d11602` and must follow this PR. Neither
  PR is merged.

## 8. Remaining Work

- Monitor both current PR heads until CI/review is terminal and clean, then
  obtain human merge authorization in the stated order.
- Monitor both current PR heads until CI/review is terminal and clean, then
  obtain human merge authorization in the stated order. After the new toolkit
  binary is available, let the owner decide whether to run the existing
  bounded hosted canary. No live canary is part of this review evidence.
