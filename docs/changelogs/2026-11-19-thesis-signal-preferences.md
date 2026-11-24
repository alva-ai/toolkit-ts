# feat(thesis): read and set which Signals a Thesis shows

Local record. Primary record: alva-backend
`docs/changelogs/2026-11-19-thesis-signal-preferences.md` (alva-ai/alva-backend#3771), approved
2026-11-23. This record covers checklist step 12 (toolkit-ts). Depends on alva-ai/alva-gateway#1489
(merged 2026-11-24) and alva-ai/alva-gateway#1494 (the REST getter and setter).

## Change

A Thesis's author chooses which Signals it shows to every reader: kinds (`fundamentals`, `macro`,
`technicals`, `commentary`) and a minimum importance (`all`, `notable`, `major`).

- `ThesesResource.getSignalPreferences(id?)`: with an id, the Thesis's setting through REST
  `GET /api/v1/theses/{id}/signal-preferences` (author only; the gateway's 403/404 pass through);
  without one, the caller's last choice through `GET /api/v1/theses/signal-preferences`.
- `ThesesResource.setSignalPreferences(id, preferences)`: the whole setting through
  `PUT /api/v1/theses/{id}/signal-preferences` with `{signal_preferences}`; kinds deduplicated,
  values validated before any request. Every call is REST: the CLI wraps REST, not GraphQL (owner
  decision 2026-11-24); the routes are alva-ai/alva-gateway#1494.
- `create` takes `signal_preferences`, sent over REST as `signal_preferences`.
- CLI, terminal and embedded (same paths): `thesis create --signal-kinds <kind,kind>
--signal-min-importance all|notable|major` (omit both: every Signal; with one, the other keeps
  its default); `thesis signal-preferences get [--id]`; `thesis signal-preferences set --id
[--kinds] [--min-importance]`, which reads the current setting and changes only what is given.
  Help text in `dispatch.ts` and `agentHelp.ts`.

## Deviations from the primary plan (not material)

- `thesis update` takes no Signal flags: an author changes the setting with
  `signal-preferences set`, which never publishes an Update. The gateway's REST update accepts the
  field for other clients.
- The agent profile has no separate `account signal-preferences` command: the last choice is
  `thesis signal-preferences get` without `--id`.

## Verification (2026-11-24)

`npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test` (63 files, 1483 tests),
including `test/resources/thesisSignalPreferences.test.ts`, the CLI cases in
`test/cli/theses.test.ts` (terminal and embedded) and the agent leaf inventory (139 leaves).

## Release

After merge: `release:stg`, then the Toolkit submodule and Dispatch in sdk-monorepo (AGENTS.md),
then the skill (alva-ai/skills#697).
