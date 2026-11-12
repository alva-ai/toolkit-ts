# Remove Thesis close, delete, Update deletion, and editorial edits

## 1. Background and Current State

Product decision (Zet, 2026-11-10 and 2026-11-12): a Thesis's published
tickers and long/short directions stay on the record. Authors only publish new
Updates; a published Update can no longer be edited in
place, and the Alva Agent can no longer close a Thesis, delete a Thesis, or
delete an Update.

Toolkit 0.35.0 exposed all four in the SDK (`theses.close`, `theses.delete`,
`theses.deleteUpdate`, `UpdateThesisParams.editorial`), the terminal CLI, and
the embedded Agent catalog (`thesis close`, `thesis delete`,
`thesis version delete`, `thesis update --editorial`). In parallel,
alva-gateway removes `POST /api/v1/theses/:id/close`,
`DELETE /api/v1/theses/:id` and `DELETE /api/v1/theses/:id/versions/:version_id`,
and `PUT /api/v1/theses/:id` rejects `"editorial": true` (false or omitted is
still accepted).

## 2. Behavior

- B1: Terminal CLI and embedded Dispatch no longer offer `thesis close`,
  `thesis delete`, or `thesis version delete`. Invoking them is rejected as an
  unknown command before any request (terminal: exit 1; embedded:
  `CliUsageError` "Unknown subcommand").
- B2: `thesis update` no longer accepts `--editorial`; passing it is rejected
  before any request. Every update publishes a new Update.
- B3: `client.theses.update()` omits `editorial` from the request body.
- B4: Help text (terminal `thesis --help`, embedded Agent help) and the README
  command summary no longer describe close, delete, Update deletion, or
  editorial edits.
- F1: All other Thesis commands, including archive/restore (which reuse
  `update`), are unchanged apart from the omitted `editorial` field.

## 3. Decision

- D1: Remove the SDK methods rather than keep dead wrappers. No caller in this
  repository uses `close`, `delete`, or `deleteUpdate` outside the removed CLI
  handlers, and the Gateway routes they call are being removed.
- D2: Remove `editorial` from the exported `UpdateThesisParams` type rather than
  narrow it to `false`. Omitting the field is the Gateway default, and a typed
  caller still passing it gets a compile error instead of a silently different
  write.
- D3: Breaking removal of CLI commands and public SDK surface; no deprecation
  window, because the Gateway routes go away at the same time.
- D4: No version bump in this change; releases bump the version separately
  (`v0.35.0 (#206)`).

## 4. Implementation design

- `src/resources/theses.ts`: delete `close`, `delete`, `deleteUpdate`,
  `CloseThesisParams`; drop `editorial` from `UpdateThesisParams` and
  `updateBody`. `src/index.ts` no longer exports `CloseThesisParams`.
- `src/cli/commandDefinitions.ts`, `src/cli/embeddedCommandDefinitions.ts`:
  remove the three leaves and the `editorial` boolean on `thesis update`.
- `src/cli/dispatch.ts`: remove the handlers and help lines; describe update as
  publishing a new Update.
- `src/cli/agentHelp.ts`, `README.md`: remove the subcommands and state that a
  published Update cannot be edited in place.
- Tests: removed close/delete/Update-delete and editorial cases; added
  rejection tests for each removed command and `--editorial` on both dispatch
  paths, help assertions, and the Slim leaf inventory (138 -> 135, with the
  removed leaves asserted absent). `test/cli/thesis-delete.test.ts` is renamed
  to `test/cli/thesis-updates.test.ts` and keeps only the Update list case.

## 5. Verification

`npm ci`, then `npm run typecheck`, `npm run lint`, `npm run format:check`,
`npm test`, `npm run build`. Removed-command behavior checked against the built
`dist/cli.js` and `dist/dispatch.js`.

## 6. Human decisions

Zet (2026-11-10, 2026-11-12): withdraw in-place Update edits; remove Close
thesis, Delete thesis, and Delete an Update from the Agent.

## 7. Current verification

- `npm ci` from the lockfile.
- `npm run typecheck`, `npm run lint`, `npm run format:check`: pass.
- `npm test`: 62 files, 1444 tests passed (main: 62 files, 1443 tests).
- `npm run build`: pass.
- `node dist/cli.js thesis close|delete|version delete ...` and
  `thesis update ... --editorial`: "Unknown command", exit 1, no request.
- Embedded `dispatch()`: `CliUsageError` "Unknown subcommand: thesis close"
  (likewise `delete`, `version delete`); `--editorial` raises
  `CliUsageError` "--editorial is not supported for 'thesis update'".

Requests are mocked; no live Gateway, STG, or PRD call was made.

## 8. Remaining work

- R1: Release chain: Toolkit npm release, then sdk-monorepo Toolkit pin and
  Dispatch version for the embedded Agent. Until then the deployed Agent still
  carries the old commands, which fail once the Gateway routes are removed.
- R2: Skill guidance (alva-ai/skills `references/thesis.md`) already tells the
  Agent not to close, delete, or pass `--editorial`; align it with this release
  if it still mentions "an older CLI".
- R3: alpi `ext/adapters/jagent/scripts/run-alva-slim-smoke.ts` asserts
  `reject("thesis close")` / `reject("thesis delete")`; the embedded
  dispatcher now rejects both as unknown subcommands.
