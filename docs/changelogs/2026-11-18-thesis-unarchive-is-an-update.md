# feat(thesis): unarchive by publishing an Update; remove thesis restore

## 1. Background and Current State

- Product decision (2026-11-18, alva-ai/alva-backend#3794): unarchiving a
  Thesis is publishing an Update, as the App and web already do. An archived
  Thesis takes no other Update (Backend `THESIS_ARCHIVED`). The Thesis return
  holds while archived and enters the unarchiving Update's tickers at its fills.
- Toolkit 0.36.0 offered `thesis restore` (terminal and embedded), which
  re-sent the current content with `archived: false`, a state-only unarchive.
  The Backend now publishes that as an Update, but the command still read as a
  state toggle and offered no way to unarchive with new content.
- `UpdateThesisParams.archived` already existed in the SDK and reached
  `PUT /api/v1/theses/:id`; the CLI exposed no flag for it.
- An Update whose resolved content equals the current one writes nothing, and
  the Backend returns the current Update. `thesis update` printed it like a
  saved Update, so an Agent reported success for a change that was never
  stored (alva-ai/alva-backend#3809: tickers sent as unknown keep their
  direction).

## 2. Behavior

- B1: `thesis update ... --archived false` publishes the Update and
  unarchives the Thesis, also with unchanged content (terminal and embedded).
- B2: `--archived true` is rejected before any request; archiving is
  `thesis archive`.
- B3: `thesis restore` is removed from the terminal CLI and the embedded
  Dispatch; invoking it fails as an unknown subcommand before any request.
- B4: help text (terminal `thesis --help`, embedded Agent help) describes
  archive and the unarchiving Update; the SDK `setArchived` doc says that
  unarchiving publishes the current content as an Update.
- B5: `thesis update` returns `unchanged`: true when the returned author
  version is the expected one, so nothing was written (terminal and
  embedded); false when it published an Update.
- B6: help says none is an exit also for the last long or short (Backend
  alva-ai/alva-backend#3794 stores it as sent), and that an identical Update
  writes nothing.
- F1: older Backends still accept `--archived false` as a content Update that
  leaves the archive (with unchanged content, a state-only unarchive).

## 3. Decision

- D1: keep `client.theses.setArchived` (used by `thesis archive`; its
  unarchive still works and now publishes an Update) rather than split it.
- D2: one flag on `update` instead of a new command, so unarchiving always
  goes through the Update the author reviews.
- D3: `unchanged` is derived in the CLI from the version IDs it already has,
  rather than a new API field: a non-editorial update keeps the author
  version only when it wrote nothing.

## 4. Implementation

- `src/cli/commandDefinitions.ts`, `src/cli/embeddedCommandDefinitions.ts`:
  drop `thesis restore`; add `archived` to `thesis update`.
- `src/cli/dispatch.ts`: `thesisUnarchive`; remove the `restore` case;
  `unchanged` on `thesis update`; help.
- `src/cli/agentHelp.ts`, `src/resources/theses.ts`: docs.

## 5. Verification

- `npx vitest run` (62 files, 1,463 tests), `npm run lint`,
  `npm run format:check`, `npm run typecheck`, `npm run build`: pass
  (2026-11-19).
- New `unarchives only by publishing an Update` test: `--archived false`
  reaches `update` with `archived: false`; `--archived true` and
  `thesis restore` are rejected with no resource call.
- New `says when an Update changed nothing` test: the same author version
  gives `unchanged: true` (terminal), a new one `unchanged: false` (embedded).

## 6. Human Decisions

- Jaxon, 2026-11-18: "toolkit：thesis update 带上 archived: false，并删掉
  restore 命令".
- Jaxon, 2026-11-19 (alva-ai/alva-backend#3809): an author's none is stored
  as sent; the CLI says when an Update changed nothing.

## 7. Outcome

As section 5.

## 8. Remaining Work

- Release, then update the Toolkit submodule and Dispatch version in
  sdk-monorepo (README release instructions).
- Skills: say that unarchiving is publishing an Update with
  `--archived false`, once this release is pinned.
