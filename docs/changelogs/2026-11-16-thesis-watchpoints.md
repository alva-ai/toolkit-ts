# feat(thesis): add `alva thesis watchpoints`

Local record. Primary record: alva-backend
`docs/changelogs/2026-11-16-thesis-watchpoints.md`, which holds the full
design and the behavior, failure, decision and risk IDs (B, F, D, R) referred
to below.

## 1. Background and Current State

- Problem/outcome: Backend will hold one set of watchpoints per Thesis. This
  repository's part is the command an agent uses to read it.
- Current implementation (`02f34a8`, 0.35.0): `alva thesis signals --id` is
  defined in `src/cli/commandDefinitions.ts`, dispatched in
  `src/cli/dispatch.ts` to `client.theses.signals`, and described in
  `src/cli/agentHelp.ts`. No command reads watchpoints.
- Runtime evidence: none.

## 2. Problem Model and End-to-End Behavior

- Carries B14 of the primary record: `alva thesis watchpoints --id <id>`
  returns the current set (`label`, `text`, `origin`) for a Thesis the caller
  may read. `alva thesis signals` passes through the `watchpoint` the Gateway
  adds to each row.

## 3. Research, Findings, and Architecture Decision

- Follows D6 of the primary record. The command mirrors `thesis signals`.

## 4. Implementation Design

- `src/resources/theses.ts`: `watchpoints(id)` calling
  `GET /api/v1/theses/:id/watchpoints`; the Signal row type gains
  `watchpoint`.
- `src/cli/commandDefinitions.ts`, `dispatch.ts`, `agentHelp.ts`, `README.md`:
  the subcommand and its help. The help says the text is model-written and
  what the three origins mean.
- Version 0.36.0; re-take it if another PR took it first.

### Serial Implementation Checklist

- [ ] Resource method and types.
- [ ] Command, dispatch, help, README, version.

## 5. Verification and E2E Design

- Tests beside the existing `thesis signals` resource and dispatch tests:
  the request path, the returned shape, a missing `--id`.
- Commands: the package's `test` and `lint` scripts. No `make lint-fix`
  exists here.
- E2E Required: no — not requested.

## 6. Human Decisions and Interaction

- See the primary record.

## 7. Outcome and Evidence

## 8. Remaining Work
