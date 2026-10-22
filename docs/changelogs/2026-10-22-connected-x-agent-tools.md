# Connected X agent tools

Primary design: alva-backend/docs/changelogs/2026-10-22-connected-x-agent-tools.md.

## 2. Behavior

B1: x status reads local connection/capability state without contacting X.
B2: x following and x posts read one live X page for the authenticated owner.
B3: Both terminal CLI and embedded Dispatch support identical commands and
bounded pagination; results include retrieval time and continuation metadata.
F1: Missing/revoked credentials request reconnect; absent scope is distinct.
F2: Rate limit/unavailable errors propagate; never return an empty success.
F3: No identity override, bookmarks read, OAuth start, import enqueue, or follow
mutation. Group guests and scoped PBSV/service callers cannot read private X.

## 3. Decision

Reuse XFollowingService and existing X HTTP client/refresh machinery; add local
connection status and live following RPCs. Expose viewer-owned GraphQL relations,
then a cohesive Toolkit X resource shared by both CLI dispatch paths. No separate
MCP deployment or snapshot persistence. Backend retains X tokens. SDK Dispatch
must adopt the Toolkit commit and release a new compatible version; ALPI itself
needs no code change. Rejected: cache-only import export (expires) and separate
MCP/token distribution (duplicates existing auth and transport).

## 4. Implementation design

New GetMyXConnection returns connected/can_read_following/can_read_posts based
on current token and bound identity, with no X request. ListMyXFollowing accepts
first (default 20, 5-100) and opaque page_token (max 1024), returns account IDs,
handles, names and next_page_token. Identity comes only from authctx. Shared
read access checks owner role, token scope and identity; refresh-once and typed
X errors preserve existing behavior. GraphQL viewer.xConnection, xFollowing
Relay connection reuse existing X page cursor conventions. Existing xPosts
remains the Posts relation. Toolkit x.status(), following({first,after}),
posts({first,after}) back alva x status/following/posts (--limit/--cursor).
No auto-pagination or data mutation. returned retrievedAt is client retrieval
time, not an import timestamp or a claim of a consistent multi-page snapshot.

| Use                 | Object | Relation                | Cardinality | Graph path         | Cursor/order             | Visibility       | RPC              |
| ------------------- | ------ | ----------------------- | ----------- | ------------------ | ------------------------ | ---------------- | ---------------- |
| Inspect connection  | Viewer | bound X credentials     | 0:1         | viewer.xConnection | none                     | own user/API key | GetMyXConnection |
| Read following      | Viewer | bound X account follows | 1:N         | viewer.xFollowing  | X order + Gateway cursor | own user/API key | ListMyXFollowing |
| Read authored Posts | Viewer | bound X authored Posts  | 1:N         | viewer.xPosts      | existing X cursor        | own user/API key | ListMyXPosts     |

Serial checklist:

- [x] Backend contracts, auth/read handlers, generated API and behavior tests.
- [x] Gateway graph/resolvers and paging/auth/error tests; regenerate gqlgen.
- [x] Toolkit resource, terminal and embedded commands, help and contract tests.
- [x] SDK Toolkit pin/version, artifact tests and agent guidance.
- [x] Review full cross-repo diff, generation, format/lint, tests/build.

## 5. Verification

Backend: affected complete package tests, generated protobuf validation, pinned
Go 1.25.7 fmt/build and CI golangci-lint 2.8.0 lint-fix. Test role denial before
storage, missing scope/identity, following pagination, refresh-once, final X
errors and no mutation. Gateway: gql-gen, resolver tests, build/vet, pinned lint.
Toolkit: npm ci, npm test, typecheck, build, CI lint and format; test real resource
requests through terminal and embedded dispatch, default/empty/continuation,
invalid args/identity overrides, auth/errors. SDK: build, typecheck and artifact
contracts using host-bound credentials against an isolated HTTP fixture.
E2E Required: yes, the GraphQL/API-key-to-X read flow is new. Use isolated X HTTP
fixtures; no production credentials or provider business side effects. Final
live-agent/version acceptance remains separate from local contract evidence.

## 6. Human decisions

User explicitly requested live X refetch like a normal MCP tool, approved the
Toolkit -> Backend ownership model and instructed implementation. The user subsequently authorized PR publication, merge to main/STG and STG
acceptance. Production promotion remains outside scope.

## 7. Current verification

Toolkit 0.33.0: npm ci (lockfile), npm test (57 files, 1259 tests),
npm run typecheck, npm run lint, npm run format:check and npm run build passed.
Both real terminal and embedded dispatch resource paths have 36 focused X
contract cases. No live user credentials or X calls were used.

Forge/Linux acceptance passed on dedicated VM `env-n5wqmt4n` at
2026-10-22 13:58:44 UTC with Go 1.25.7 and Node 24.20.0. After explicit
user upload authorization, the archive hash was verified and CLI production
dependencies were installed from this revision's lockfile using
`npm ci --omit=dev --ignore-scripts --no-audit --no-fund`.
Gateway `bash scripts/test-connected-x-e2e.sh ../backend ../toolkit ../dispatch/index.cjs`
passed `TestConnectedXEndToEnd` (1.70s) and `TestXReadE2EBackendFixture` (1.80s),
exit 0. Terminal and embedded Dispatch 1.1.0 both passed status, live following,
refresh-once, continuation, authored Posts and identity checks. The X transport
and credential store/refresher remain fixtures; this is not online X acceptance.
SDK's English release artifact inspection and 55 bilingual Skill tests passed.
Full revision/hash and environment correction evidence is in the Backend and
SDK changelogs. Zero test processes, running containers or Docker volumes remain;
upload chunks/archive were removed and the reusable VM/workspace retained.

## 8. Remaining integration

Dispatch 1.1.0 pins Toolkit `25f335be3d8a2bd438a90bc45b98f40065af4c11`.
Cross-service acceptance has passed; PR publication, final upstream dependency
pins, deployment and online acceptance remain separate. User authorized main/STG merges and acceptance; production promotion remains outside scope.

Review follow-up for PR #195: preserve homogeneous recognized GraphQL error
codes and corresponding HTTP statuses (including 429/503/403/401/504), while
retaining details and rejecting mixed/unknown codes as a 502 GraphQL failure.
Eight regression cases failed before the fix; all 57 files / 1267 tests passed
afterward, together with `npm run lint`, `npm run format:check`,
`npm run typecheck` and `npm run build`. Dispatch and cross-service acceptance
will be refreshed for this final Toolkit content before the follow-up push.
