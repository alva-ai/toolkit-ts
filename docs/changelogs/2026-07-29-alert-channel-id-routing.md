# fix: make alert channel routing explicit

## 1. Background

- Problem/outcome: `alva alert enable --automation owner/name --channel-id ID`
  parsed but ignored `--channel-id`, and unrelated alert subcommands also
  silently accepted unused flags.
- Verified constraints: gateway's name-addressed endpoint must be deployed
  first; the existing ID batch command remains supported.

## 2. End-to-End Behavior

- B1 — agents may enable an alert by `owner/name` or by ID list with the same
  optional `--channel-id` routing semantics.
- B2 — `alert list` displays `channel_id`, including the `0` agent/home
  sentinel, and `--json` preserves the field.
- F1 — alert subcommands reject flags they do not consume instead of silently
  continuing.
- B3 — omitting `--channel-id` preserves the current default-channel request
  shape.

## 3. Findings

- CLI parsing intentionally accepts generic flags; validation must occur at the
  alert subcommand boundary.
- The SDK name subscription method made an empty POST, while batch subscribe
  already serialized `channel_id`.
- Chosen direction: add optional name-subscription channel input, preserve the
  empty-body call when omitted, and validate alert flags per subcommand.

## 4. Change Specification

- CLI dispatch/help: forward validated `--channel-id` for name targets and
  reject unsupported alert flags.
- SDK types/resource: add optional `channelId` input and `channel_id` readback;
  send a body only when the caller explicitly selects a channel.
- Product formatting: display the durable delivery channel in human-readable
  alert lists.
- Contract impact: additive SDK fields; requires the companion gateway REST
  change for name-addressed explicit routing.
- Compatibility/rollout: merge/deploy gateway first, then release toolkit.

## 5. Verification Strategy

- Affected packages/components: toolkit CLI, subscription resource, exported
  subscription types, and alert formatter.
- Relevant dependents: none inside this repository beyond the tested CLI and
  resource surfaces.
- Focused commands: full `test/cli.test.ts` and
  `test/resources/resources.test.ts`, TypeScript typecheck, scoped ESLint and
  Prettier.
- Escalation triggers: exported-type failures in another toolkit test file.
- Full suite required: no — no unrelated resources or build infrastructure
  changed.
- E2E Required: no — transport calls and CLI dispatch are mocked at stable
  boundaries.

| Behavior | Evidence                                          |
| -------- | ------------------------------------------------- |
| B1, B3   | CLI dispatch and `subscribeFeed()` resource tests |
| B2       | alert list text/JSON tests                        |
| F1       | unsupported alert flag regression test            |

### Implementation Checklist

- [x] Add failing routing, readback, and strict-flag tests.
- [x] Implement name/ID parity and additive SDK fields.
- [x] Complete final scoped verification.

## 6. Human Interaction

The implementation scope expanded to a dependency-ordered gateway and toolkit
pair after confirming the gateway name endpoint did not expose the backend's
existing atomic channel field.

## 7. Outcome

- Result: Agent callers can choose a name or ID selector without changing
  explicit channel-routing semantics.
- Changes: both addressing forms forward explicit channels, alert readback
  shows the destination, and unused alert flags fail fast.
- Deviations: the gateway companion is required to preserve atomic routing.
- Verification: 373 focused CLI/resource tests, TypeScript typecheck, scoped
  ESLint, scoped Prettier, and `git diff --check` passed.
- Migration: none.

## 8. Remaining Tasks

- Merge/release after the companion gateway PR.
