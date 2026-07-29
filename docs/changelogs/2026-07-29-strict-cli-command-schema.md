# fix: reject unknown CLI arguments globally

## 1. Background

- Problem/outcome: the shared CLI parser accepted arbitrary long flags, so most
  command handlers silently ignored typos and flags belonging to another
  command. Alert commands added local allowlists in #144, but the same failure
  mode remained across the rest of the toolkit.
- Verified constraints: `dispatch()` is a public embedded API that returns
  arbitrary command results and throws `CliUsageError`/`AlvaError`; jagent
  relies on that contract. `broker` must preserve raw argv passthrough.

## 2. End-to-End Behavior

- B1 — every toolkit-managed command accepts only its declared local flags plus
  shared global flags.
- B2 — unknown flags fail before any SDK/API method is invoked and suggest a
  nearby flag from the resolved command when possible.
- B3 — value, boolean, literal `--no-*`, synthetic boolean negation,
  `--flag=value`, and positional arguments have one shared parser.
- B4 — `configure`, both auth login modes, the terminal CLI, and embedded
  `dispatch()` use the same command definitions.
- B5 — `broker` continues to forward every argument after `broker` verbatim.
- F1 — missing flag values, invalid explicit boolean values, unknown command
  leaves, and unexpected positional arguments produce `CliUsageError` with the
  top-level command attached.

## 3. Findings

- The old parser in `src/cli/index.ts` knew only a global boolean set and could
  not determine whether a flag belonged to the selected leaf. Auth maintained a
  second permissive parser.
- `@stricli/core` was evaluated, including Node 18/20/22 import smoke tests, but
  its public runner always returns `Promise<void>` and captures command errors.
  Adapting it would break the documented embedded `dispatch()` return/error
  contract.
- Chosen direction: keep execution handlers and public APIs intact while adding
  an internal declarative route/flag schema whose parser returns values and
  throws normally.

## 4. Change Specification

- Add a declarative registry for every command leaf, its value/boolean flags,
  positional bounds, global flags, and the broker passthrough marker.
- Add a trie-backed parser that resolves the leaf before parsing arguments,
  rejects unsupported input, and provides edit-distance suggestions.
- Route `dispatch()`, configure, and auth parsing through the shared parser;
  remove internal use of the global boolean parser, auth parser, and alert-only
  allowlists while retaining deprecated `parseFlags` and `BOOLEAN_FLAGS`
  compatibility exports.
- Keep existing semantic validators in handlers for required inputs, ranges,
  mutual exclusion, deprecated flags, and security-sensitive service-account
  IDs.
- Derive global-flag stripping from the shared global definitions while
  retaining broker's positional passthrough boundary.
- Compatibility: valid invocations, help output, API shapes, embedded return
  values, error classes, and existing `./cli` named exports remain unchanged.
  Previously ignored arguments now fail intentionally. Rollback is a toolkit
  package rollback with no backend dependency or data migration.

## 5. Verification Strategy

- Affected packages/components: toolkit CLI parser, dispatch, configure, auth,
  config bootstrap, embedded CLI documentation.
- Relevant dependents: embedded callers through `@alva-ai/toolkit/cli`; the
  public signature and result/error contract remain unchanged.
- Focused commands: command parser, CLI dispatch, auth login, config tests,
  TypeScript typecheck, scoped lint/format, and build.
- Escalation triggers: any unregistered flag consumed by an existing handler,
  command/help regression, or built CLI failure on a supported Node major.
- Full suite required: yes — the parser is shared by every toolkit command.
- E2E Required: no — parsing and dispatch are covered before mocked resource
  calls, with no backend contract change.

| Behavior   | Evidence                                                    |
| ---------- | ----------------------------------------------------------- |
| B1–B3, F1  | `test/cli/commandSchema.test.ts`                            |
| B1, B2, B4 | `test/cli.test.ts`, auth/config tests                       |
| B5         | existing broker dispatch tests plus parser passthrough test |

### Implementation Checklist

- [x] Add strict parser behavior tests and command definitions.
- [x] Route dispatch, configure, auth, and global stripping through the shared
      definitions.
- [x] Complete full package verification and built Node-version smoke tests.

## 6. Human Interaction

The approved Stricli-style command graph was adjusted during planning after
confirming that Stricli's CLI-only runner conflicts with the public embedded
dispatch contract. The user approved implementation after receiving the
revised internal-parser plan.

## 7. Outcome

- Outcome: all toolkit-managed command leaves now reject unknown flags and
  unexpected positional arguments before invoking an API. Errors are scoped to
  the resolved command and include a nearby flag suggestion when available.
- Changes: added the declarative command registry and trie-backed parser,
  routed terminal/embedded/configure/auth parsing through it, removed internal
  use of both old permissive parsers and the alert-only allowlists, preserved
  broker raw argv handling, and retained deprecated compatibility exports for
  the old low-level parser surface.
- Deviations: review established that the undocumented `parseFlags` and
  `BOOLEAN_FLAGS` exports may still have external consumers, so they remain as
  deprecated compatibility exports rather than being removed in a patch.
- Tests and verification: added parser, boolean-negation, unknown-flag,
  wrong-leaf, positional, passthrough, compatibility-export, terminal auth, and
  missing-global-value regressions. `npm test` passed 703 tests; `npm run
typecheck`, `npm run lint`, `npm run format:check`, `npm run build`, `git diff
--check`, and built CLI/embedded-dispatch smoke tests passed. The initial
  implementation additionally passed built CLI/embedded-dispatch smoke tests
  on Node 18, 20, and 22.
- Migration: none; this is a toolkit-only behavioral fix.

## 8. Remaining Tasks

None.
