# feat: expose the viewer's For You publications in Toolkit

## 1. Background

Add the first building block for a daily personalized digest: an authenticated
reader of the same For You publications the app displays. This is a stateless
reader, not a digest generator.

Design verified against remote main on 2026-09-07: Toolkit `8e15dec`,
Gateway `badafd5d`, Backend `da9f08448`. Implementation is isolated on
`codex/for-you-list`; unrelated changes in the original checkout are preserved.

## 2. End-to-End Behavior

```sh
alva for-you list --limit 50
alva for-you list --limit 20 --cursor '<endCursor>' --newer-than '<watermark>'
alva for-you list --feed-id 123 --limit 50
```

SDK: `client.forYou.list({ first, after, newerThan, feedId })`.
Terminal and embedded CLI share this resource and return the same JSON
connection with full immutable publication content.

| CLI            | SDK / GraphQL | Contract                                            |
| -------------- | ------------- | --------------------------------------------------- |
| `--limit`      | `first`       | Integer 1-50, default 20                            |
| `--cursor`     | `after`       | Exclusive upper publication bound; older entries    |
| `--newer-than` | `newerThan`   | Exclusive lower publication bound                   |
| `--feed-id`    | `feedId`      | Positive decimal int64 string; narrows viewer scope |

Results preserve `edges[{cursor,node}]` and all four `pageInfo` fields. Entry
IDs retain `FeedEntry:<id>`; Feed IDs remain decimal strings. No ID conversion
to JavaScript numbers, body truncation, auto-pagination, saved watermark,
summary generation, or invented app deep links.

Order is `(published_at DESC, id DESC)`, not event time. Cursors are opaque.
Keep `newerThan` unchanged while paging with `endCursor`. The first page's
`startCursor` is only a candidate next watermark after successful consumption.
Advancing it before draining the window can skip older unseen entries.
Membership/permissions are current per request, not a multi-request snapshot.

Invalid CLI input fails with usage errors before network I/O; the SDK also
validates arguments. Empty cursors and invalid/overflow Feed IDs fail closed.
HTTP/network failures propagate. GraphQL errors reject partial data; malformed
connection envelopes never become an empty feed. A valid empty page succeeds.
Cards and actions are untrusted data; this reader does not execute them.

## 3. Findings

```text
terminal commandDefinitions / embeddedCommandDefinitions
  -> executeParsedCommand -> ForYouResource.list -> POST /query
  -> Gateway viewer.forYou -> Backend ListViewerFeedEntries
  -> current For You sources + Feed-major authorization
  -> FeedEntryRepo.ListFeedEntriesByMajorIDs
```

Reuse the existing viewer collection, not alerts, notifications, automation
runs, or Channel timeline messages.

- Gateway `pkg/schema/feed_vnext.graphql` defines the selection and inputs.
- Gateway `pkg/resolver/viewer.resolvers.go` forwards the authenticated read;
  `feed_entry_convert.go` supplies publication cursors and string identities.
- Backend `internal/publishing/feed/feed_entries_grpc.go` resolves current
  effective sources and permissions. User/admin/API-key identities are allowed;
  service and PBSV identities are rejected.
- First read may lazily provision the system For You Channel and owner
  membership through the existing `EnsureForYouChannel` path.
- Toolkit's normal and embedded command catalogs are separate. The embedded
  route delegates to the same handler; no embedded special action is needed.

### Runtime availability is separate

Jagent main pins Alpi `40a4e820`, whose package pins Toolkit `0.25.1`. Updating
the package/lockfile, exhaustive Slim smoke coverage, bundle and gitlink is
required before the new command is available in that runtime.

Alpi's `ext/adapters/jagent/alva/cli-tool.ts` hard-truncates serialized output
at `64 * 1024` JavaScript string units. Complete Toolkit output is not proof
the model received complete cards. Smaller pages mitigate but do not solve
arbitrary oversized single-card output. Runtime lossless-result handling is a
separate acceptance gate, not a reason to trim publication bodies here.

Sandbox-agent-ts separately bundles the terminal CLI using `TOOLKIT_VERSION`
at image build time; npm publication does not update running images.

## 4. Change Specification

- `src/resources/forYou.ts`: fixed GraphQL selection, public connection types,
  shared argument validation, fail-closed response envelope checks.
- `src/client.ts`, `src/index.ts`: lazy Resource and public exports.
- `src/cli/commandDefinitions.ts`, `dispatch.ts`: strict registration, thin
  CLI argument adapter, terminal help.
- `src/cli/embeddedCommandDefinitions.ts`, `agentHelp.ts`: explicit embedded
  route and discoverable help, preserving system/embedded dependency separation.
- `test/resources/forYou.test.ts`: SDK and both CLI paths.
- `test/cli/agentCommandProfile.test.ts`: inventory count updated to 96.
- `README.md`: examples, pagination, scope and runtime limitations.

Select complete publication fields, `feed { id }` and
`major { id feedId number }`, without hydrating unrelated mutable Feed metadata.
GraphQL error handling follows existing resource-local patterns; no global
GraphQL client refactor.

Breaking changes: none. Database migrations: none. Gateway, Backend, server
code generation, release versions and runtime dependencies are unchanged.

## 5. Verification Strategy

Focused coverage includes default and bounded pages, combined opaque cursors,
int64 IDs, valid empty/intermediate pages, >64K full-body preservation,
GraphQL partial errors, malformed envelopes and pagination, no-auth access,
invalid SDK/CLI inputs with zero I/O, dual-dispatch parity, network-free help,
and rejection of embedded auth overrides.

Canonical checks: `npm ci`, `npm run lint:fix`, `npm run lint`,
`npm run typecheck`, `npm test`, `npm run format:check`, `npm run build`.
Build uses the repository's vendor-contract prebuild; generated artifacts
must not introduce unrelated changes.

E2E Required: yes for full feature acceptance. Verify actual Gateway/Backend
ordering and permission behavior with controlled users, comparing CLI output
with the App-equivalent query. Test both cursors and out-of-scope sources.
Then verify the built dispatch through an updated Agent runtime, including
large results. Unit/mock tests are not substitutes for these checks.

## 6. Human Interaction

The user approved the design and requested implementation and a PR.
After the disk-capacity blocker was reported, the user explicitly confirmed
publishing the PR with full-stack E2E pending. This exception permits PR
publication, not a claim of release readiness.
The approved scope is the Toolkit reader; digest scheduling, memory, delivery,
App navigation, runtime rollout and watermark policy remain separate work.

## 7. Outcome

Implemented all Toolkit modules in section 4 with 76 new tests. The full suite
passed: 47 files, 939 tests. Typecheck, lint, format checking and the canonical
build passed. Built SDK and embedded dispatch also passed a local HTTP fixture
smoke covering auth headers, GraphQL variables and JSON results. This is not
full-stack E2E.

Full-stack qualification is blocked before startup:

- `make e2e-preflight` passed.
- `go run . status` reported all core services stopped.
- `go run . -d start` failed the host-resource gate: 12.9 GiB free disk,
  minimum 15.0 GiB.

No services were stopped, disk cleanup performed, or resource checks bypassed.
The E2E gate is not recorded as passing.

## 8. Remaining Tasks

Resolve local disk capacity and run full-stack qualification. The user approved
publishing the PR with this check explicitly pending.
Runtime dependency/image updates and lossless large-output qualification
remain separate release work. No runtime deployment, digest or notification
was created.
