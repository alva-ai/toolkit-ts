# refactor(cli)!: remove the screenshot command

## 1. Background and Current State

- The Alva screenshot endpoint (`GET /api/v1/screenshot`) is retired. The Alva
  skill no longer asks agents to capture pages, so the Toolkit drops its only
  caller.
- Current surfaces:
  - the `alva screenshot` terminal command (`src/cli/commandDefinitions.ts`,
    help, usage and dispatch in `src/cli/dispatch.ts`);
  - the embedded `playbooks screenshot` action (`embeddedCommandDefinitions.ts`,
    `embeddedDispatch.ts`, `agentCommandDefinitions.ts`, `agentHelp.ts`);
  - `client.screenshot.capture()` (`src/resources/screenshot.ts`,
    `ScreenshotParams` in `src/types.ts`);
  - the README resource table, CLI list and embedded-surface note.
- Only screenshots produced the CLI's `_image` result, wrote local files
  (`DispatchLocalFiles.writeBytes`), or sniffed and base64-encoded images.

## 2. Problem Model and End-to-End Behavior

- B1 — `alva screenshot` is an unknown command (`Unknown command: 'screenshot'`),
  with no API call.
- B2 — The embedded catalog no longer has `playbooks screenshot`; the inventory
  has 138 leaves and parsing the old path fails as an unknown command.
- B3 — `AlvaClient` has no `screenshot` resource and `ScreenshotParams` is gone.
- F1 — An older Toolkit calling the retired endpoint gets 404.
- Non-goals: other commands, the browser bundle, releases.

## 3. Research, Findings, and Architecture Decision

- Removal follows the embedded-feedback precedent
  (`2026-08-16-remove-embedded-feedback.md`): delete the catalog entries, assert
  the inventory and the rejection.
- D1 — Delete every screenshot surface listed above together with the code only
  it used: `sniffImageMime`, `encodeBase64`, `writeLocalFileBytes`, the CLI's
  `_image` output branch and `DispatchLocalFiles.writeBytes`.
- D2 — Releases are separate: the version bump, npm publish and the
  sdk-monorepo Toolkit/Dispatch update follow the repository's release process.
- R1 — ALPI's Slim smoke probes `playbooks screenshot`; it drops the probe when
  it moves to a Toolkit without the command.

## 4. Implementation Design

- Source: `src/client.ts`, `src/types.ts`, `src/resources/screenshot.ts`
  (deleted), `src/cli/{commandDefinitions,dispatch,index,embeddedCommandDefinitions,embeddedDispatch,agentCommandDefinitions,agentHelp}.ts`.
- Tests: `test/cli.test.ts`, `test/cli/agentCommandProfile.test.ts`,
  `test/resources/resources.test.ts`, `test/client.test.ts` (a binary-response
  path), `test/cli/theses.test.ts` (fake local files without `writeBytes`).
- Docs: `README.md`.

### Serial Implementation Checklist

- [x] Remove the terminal command, embedded action, resource and helpers (B1-B3, D1).
- [x] Update tests: removed-command rejections and the 138-leaf inventory (B1, B2).
- [x] README.

## 5. Verification and E2E Design

- `rejects the removed screenshot command` (terminal) and the Agent profile's
  removed-command list prove B1 and B2; the inventory test proves 138 leaves;
  `npm run typecheck` proves B3.
- E2E Required: no; the change only removes commands.
- Commands: `npm run typecheck`, `npm run lint`, `npx prettier --check <changed files>`,
  `npm test`, `npx tsup` (build without the network-dependent prebuild).

## 6. Human Decisions and Interaction

- 2026-11-26: the human approved retiring the endpoint and removing the
  command, the resource, its tests and the README section; no release in this
  change.
