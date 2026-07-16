# fix: restore the automation update command

## 1. Background

- Agent-facing skills require `alva automation update --id <feed_id>` for
  in-place version, producer, and metadata changes, but the released CLI does
  not register that subcommand.
- The gateway PATCH endpoint already exists. The missing toolkit implementation
  remained on PR #133 while its documentation shipped, leaving registered
  automation metadata stale for affected users.

## 2. End-to-End Behavior

- B1 — `alva automation update --id <id>` updates only the supplied version,
  producer, metadata, or trigger fields through the existing automation PATCH
  endpoint.
- B2 — automation IDs remain decimal strings so int64 snowflake values are not
  rounded by JavaScript.
- B3 — omitted fields remain unchanged while an explicit empty metadata value
  clears that field.
- F1 — missing update fields, invalid IDs, and unsupported flags fail before an
  API request is sent.

## 3. Findings

- The existing SDK and CLI implementation was complete on PR #133, including a
  follow-up fix for snowflake IDs, but it predated the runtime-neutral dispatch
  refactor on `main`.
- Current CLI commands must be registered in `commandDefinitions.ts` and
  dispatched from `dispatch.ts`; retaining the old `index.ts` implementation
  would either conflict or bypass strict command parsing.
- Chosen direction: rebase the existing PR, preserve its SDK contract, and port
  its CLI behavior to the current declarative command architecture.

## 4. Change Specification

- Automation SDK: add typed update request/response models and an authenticated,
  ID-scoped PATCH method that preserves field presence.
- CLI: register the update command and flags, add snowflake-safe parameter
  handling and no-op validation, dispatch to the SDK, and document the command
  in top-level and automation help.
- Tests: cover strict dispatch, large IDs, explicit empty metadata, no-op
  rejection, PATCH payloads, and help drift.
- Contract impact: additive toolkit SDK and CLI surface; no backend, schema,
  configuration, or migration change.
- Rollout: publish a toolkit build to the npm `next` dist-tag and rebuild the
  sandbox-agent image before the command is available to production agents.

## 5. Verification Strategy

- Affected packages/components: toolkit CLI schema/dispatch/help and automation
  SDK resource/types.
- Relevant dependents: terminal CLI and runtime-neutral embedded dispatch, both
  built from the same dispatcher.
- Focused commands: CLI, resource, and command-schema Vitest files.
- Escalation triggers: strict parser drift, public type errors, or bundle build
  failures.
- Full suite required: yes — this adds a public CLI leaf and SDK method and the
  repository's established quality gate is inexpensive.
- E2E Required: no — the toolkit request boundary is covered locally and the
  already-deployed gateway endpoint has its own handler tests.

| Behavior | Evidence                                               |
| -------- | ------------------------------------------------------ |
| B1, B2   | CLI dispatch and automation resource tests             |
| B3       | explicit-empty CLI and PATCH payload tests             |
| F1       | no-op, invalid-ID, strict parser, and help drift tests |

### Implementation Checklist

- [x] Rebase PR #133 onto the runtime-neutral CLI architecture.
- [x] Register and dispatch `automation update` with snowflake-safe IDs.
- [x] Preserve PATCH field presence and reject invalid/no-op updates.
- [x] Complete focused and full toolkit verification.

## 6. Human Interaction

None.

## 7. Outcome

- Result: the current CLI architecture now exposes the documented
  `automation update` command and the SDK sends an ID-scoped PATCH without
  losing snowflake precision or explicit empty metadata.
- Changes: added declarative command registration, dispatcher/help support,
  typed SDK request/response handling, and behavior regressions for the update
  lifecycle.
- Deviations: the original PR modified the former monolithic CLI entry; the
  rebased implementation instead uses the current `dispatch.ts` and
  `commandDefinitions.ts` ownership boundaries.
- Verification: `npm run format:check`, `npm run lint`, `npm run typecheck`,
  `npm test` (40 files, 711 tests), `npm run build`, `git diff --check`, and a
  built `automation update --help` smoke test passed.
- Migration: none.

## 8. Remaining Tasks

- Publish the updated toolkit to the npm `next` dist-tag, rebuild the
  sandbox-agent image, and smoke-test update plus inspect in the deployed agent
  environment.
