# feat: expose the automation publish first-run opt-out

## 1. Background

- Publishing a new automation has two intentional side effects: it creates the
  owner's ACTIVE alert binding and starts the producer once.
- The SDK already accepts `skip_auto_trigger`, but the strict CLI command schema
  did not expose the corresponding flag. Agents therefore could not prevent a
  duplicate full pipeline run when they needed to route the binding and trigger
  the producer explicitly after publish.

## 2. End-to-End Behavior

- B1 — `alva automation publish --skip-auto-trigger` publishes the automation
  while suppressing its automatic first producer run.
- B2 — `alva release feed --skip-auto-trigger` exposes the same underlying feed
  release behavior.
- B3 — omitting the flag preserves the existing automatic first run.
- B4 — the flag does not suppress creation of the owner's alert binding.
- F1 — strict CLI parsing accepts the flag only on the two supported publish
  command leaves.

## 3. Findings

- `FeedReleaseRequest` and the release resource already model and send
  `skip_auto_trigger`; no SDK or backend contract change is required.
- Both automation publish and release feed flow through the shared
  `feedReleaseParams` mapper, so one mapping plus two command registrations
  covers both CLI surfaces.
- Chosen direction: expose the existing API option and document both default
  publish side effects in CLI help.

## 4. Change Specification

- Register `--skip-auto-trigger` as a boolean on `automation publish` and
  `release feed`.
- Map the CLI flag to `skip_auto_trigger` in the existing release request.
- Document that publish still creates the owner binding and that the default
  path starts the first producer run.
- Add dispatch regressions for both command aliases and help text.
- Contract impact: additive CLI surface only; no backend, schema,
  configuration, or migration change.

## 5. Verification Strategy

- Affected components: strict CLI command definitions, shared release argument
  mapping, automation/release help, and CLI dispatch tests.
- Relevant dependents: terminal CLI and runtime-neutral embedded dispatch.
- Focused verification: CLI dispatch, command-schema, and resource tests.
- Full suite required: yes — the change touches shared command registration and
  release mapping.
- E2E required: no — the existing SDK resource tests cover the API request
  boundary and the backend option already exists.

| Behavior | Evidence                                           |
| -------- | -------------------------------------------------- |
| B1, B2   | automation publish and release feed dispatch tests |
| B3, B4   | existing resource tests plus CLI help regression   |
| F1       | strict command-schema and full CLI test suites     |

### Implementation Checklist

- [x] Register the flag on both publish command leaves.
- [x] Map the flag through the shared release request builder.
- [x] Document publish side effects in CLI help.
- [x] Complete full toolkit verification.

## 6. Human Interaction

The user selected the CLI opt-out plus documentation direction after confirming
that automatic owner subscription and the first run are intended product
behavior.

## 7. Outcome

- Result: both publish command leaves now accept `--skip-auto-trigger`, map it
  to the existing release request, and explain that the owner binding is still
  created while only the automatic first run is skipped.
- Verification: `npm run format:check`, `npm run lint`, `npm run typecheck`,
  `npm test` (40 files, 712 tests), `npm run build`, `git diff --check`, and
  built CLI help smoke tests for both command leaves passed.
- Migration: none.

## 8. Remaining Tasks

- Publish the toolkit build and roll it into the agent runtime before downstream
  skills rely on the new CLI flag.
