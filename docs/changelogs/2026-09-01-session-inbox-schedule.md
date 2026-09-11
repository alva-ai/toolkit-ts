# Session Inbox schedules

Issue: https://github.com/alva-ai/alpi/issues/130

Primary approved design: `alva-backend/docs/changelogs/2026-09-01-session-inbox-schedule.md`
(coordinated branch `handson/session-inbox-schedule`).

Toolkit scope: add an exclusive Channel/Inbox target to the existing Schedule
resource without changing its returned shape. Terminal CLI retains its default
Agent Channel and accepts explicit `--inbox-path`. Embedded commands expose only
list/put/pause/resume/delete for the host-attached current Inbox. No target,
credential, endpoint, or run-as override is accepted by those embedded commands.

Implementation is complete for this upstream Toolkit PR. The full feature still
requires the coordinated Backend/Gateway/ALPI/Jagent changes and release pins.
This PR does not publish an npm version or deploy the feature.

Verification (Node 22.23.2):

- `npm ci --ignore-scripts`: passed; existing dependency audit reports nine
  vulnerabilities. No unrelated dependency upgrades made.
- `npm run format`, `npm run lint`, `npm run format:check`,
  `npm run typecheck`: passed.
- Focused Schedule/CLI suites: 412 tests passed.
- `npm test`: all 47 files / 869 tests passed. Initial sandboxed execution
  could not bind localhost for the existing auth tests; rerun with local socket
  permission passed without changing those tests or using real credentials.
- `npm run build`: passed, including the canonical CDN contract prebuild.
  Generated fallback sources match the baseline; no unrelated generated diff.
- `git diff --check`: passed.

## 7. Outcome and review evidence

Reviewed the complete tracked and untracked candidate against fetched
`origin/main` at `8e15dec86bc5c8702ae7e732dc52281d37865b9f` on 2026-09-02.
The primary changelog owns approved sections 1-6; this is its independently
publishable SDK/CLI portion, not completion of the cross-repository rollout.
The user explicitly authorized submitting this Toolkit PR on 2026-09-02.

| Plan item | Toolkit implementation and evidence                                                                                                   | Status                           |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| B2 / D3   | Five embedded commands inject only `originInboxPath`; missing attachment and target/credential/profile overrides fail before requests | DONE                             |
| B2 / D4   | Terminal CLI keeps default Agent Channel, accepts explicit Inbox, rejects mixed targets; all five command routes tested               | DONE                             |
| B3 / D4   | Separate Session GraphQL operations; existing Channel operations and normalized result fields remain unchanged                        | DONE                             |
| B8 / F3   | Help distinguishes saving from processing and explains no AutoRun execution retry plus ordinary unacked recovery                      | DONE                             |
| R5        | Toolkit API/export is ready; real npm version and downstream ALPI/Jagent pins require later publication                               | PARTIAL, downstream release work |

Main-agent review covered behavior/scope, module ownership/error handling,
falsifiable tests, authentication/compatibility, operations and documentation.
No unresolved Toolkit finding. The host Inbox property is not an authorization
credential or a new request header; Backend must independently authorize the
target. No new package dependency, version bump, migration, generated-source
drift, retry loop, ALFS primitive or trading feature.

Fresh Node 22.23.2 verification:

- `npm run format`: passed; no unrelated formatter changes.
- `npm run lint`, `npm run format:check`, `npm run typecheck`: passed.
- `npm test`: 47 files, 869 tests passed.
- `npm run build`: passed; CDN-vendored generated sources unchanged.
- Built `dist/index.js` and `dist/dispatch.js` exactly match the local ALPI
  consumer overlay used by the coordinated test stack.
- Post-review coordinated Session Inbox E2E passed all five cases in 96.045s.
  From `local-dev/e2e-tests/go`, Go 1.25.7: `go test -count=1 -tags=integration
-v -run '^TestAgentScheduleSessionInbox' .`, with the documented isolated
  endpoint environment, `ALVA_E2E_SKIP_LOCAL_DEV_ENV=1`, task-only coordinated
  modfile and in-memory Hatchet token wrapper. Source, reviewed build and local
  ALPI consumer matched. Log: `<task-root>/toolkit-pr-e2e.log`.

The existing Channel tests cover SDK serialization/pagination/errors and CLI
defaults. The coordinated Go E2E exercises real authenticated embedded commands
through Gateway, Backend, AutoRun, Jagent and Linux JuiceFS/POSIX ALFS, using
fresh local users and a non-forwarding model relay. No production or SOPS
credentials are imported.

## 8. Remaining work and compatibility

- Publish a real Toolkit npm version only after separate authorization; ALPI
  then pins that version, and Jagent pins the actual ALPI commit. No fake SHA,
  local path dependency or release version is committed here.
- New Inbox calls require the companion Backend/Gateway implementation. This
  PR can merge as an upstream library change, but must not be described as an
  available deployed feature. Channel calls continue to use existing APIs.
- Public `PutAgentScheduleParams` / `ManageAgentScheduleParams` are now exclusive
  target type aliases. Existing Channel call sites retain their shape; consumers
  that extend these with a TypeScript `interface` must use a type intersection.
- Full cross-repository release review/E2E, Backend's recorded baseline proto
  lint failure, service migrations and rollout remain outside this Toolkit-only
  PR. The focused coordinated run is not a passing `make e2e-full` claim.
