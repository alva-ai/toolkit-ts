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
  `src/cli/agentHelp.ts`; it is a REST read. The newer Thesis reads (`list`,
  `related`, `return`) query GraphQL through `graphql()` in
  `src/resources/thesisReads.ts`. No command reads watchpoints.
- Runtime evidence: none.

## 2. Problem Model and End-to-End Behavior

- Carries B14 of the primary record: `alva thesis watchpoints --id <id>`
  returns the current set (`label`, `text`, `origin`) for a Thesis the caller
  may read. `alva thesis signals` is unchanged: its REST rows carry no
  watchpoint in this change.

## 3. Research, Findings, and Architecture Decision

- Follows D6 of the primary record. The command mirrors `thesis return`: a
  GraphQL read, no REST route (owner, 2026-11-17).

## 4. Implementation Design

- `src/resources/thesisReads.ts`: `thesisWatchpoints(client, id)` querying
  `node(id: "Playbook:<id>") { latestRelease { thesisPublication {
watchpoints { label text origin } } } }`, with the validation and not-found
  handling of `thesisReturn`; `src/resources/theses.ts` exposes it.
- `src/cli/commandDefinitions.ts`, `dispatch.ts`, `agentHelp.ts`, `README.md`:
  the subcommand and its help. The help says the text is model-written and
  what the three origins mean.
- Version 0.36.0; re-take it if another PR took it first.

### Serial Implementation Checklist

- [x] Resource method and types.
- [x] Command, dispatch, help, README.
- [ ] Version: left at 0.35.0. Releases bump the version in their own PR
      (`v0.35.0 (#206)`), so 0.36.0 is taken by the release PR, not here.

### Implementation notes

- `thesisWatchpoints` in `src/resources/thesisReads.ts` follows
  `thesisReturn`: a positive int64 id, a login, `node: null` as `NOT_FOUND`,
  a missing release or publication as an empty list, and any malformed entry
  (empty label or text, an origin other than `stated`, `inferred`, `agent`) as
  `GRAPHQL_INVALID_RESPONSE`.
- The command is in both catalogs (`commandDefinitions.ts`,
  `embeddedCommandDefinitions.ts`) under the same path. The Agent profile's
  leaf inventory guard in `test/cli/agentCommandProfile.test.ts` goes from 136
  to 137.
- `README.md`: one line in the command list. `agentHelp.ts` and `dispatch.ts`
  help state the three origins and that the text is model-written data.

## 5. Verification and E2E Design

- Tests beside the existing `thesis return` resource and dispatch tests: the
  query and variables, the returned shape, a null node, a missing `--id`.
- Commands: the package's `test` and `lint` scripts. No `make lint-fix`
  exists here.
- E2E Required: no — not requested.

## 6. Human Decisions and Interaction

- See the primary record.

## 7. Outcome and Evidence

Run on 2026-11-17 after `npm ci`:

- `npm run typecheck`: pass.
- `npm run lint`: pass.
- `npm run format:check`: pass.
- `npm test`: 62 files, 1461 tests, all pass.
- No run against a deployed Gateway. The GraphQL field ships in
  alva-ai/alva-gateway#1429 (merged).

## 8. Remaining Work

- Release: a version PR, then the npm release; the STG chat agent gets the
  command only after a toolkit beta release and a sandbox-agent STG redeploy.
- skills: the Thesis tracking guidance, after the toolkit release.
