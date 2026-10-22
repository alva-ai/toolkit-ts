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

- [ ] Backend contracts, auth/read handlers, generated API and behavior tests.
- [ ] Gateway graph/resolvers and paging/auth/error tests; regenerate gqlgen.
- [ ] Toolkit resource, terminal and embedded commands, help and contract tests.
- [ ] SDK Toolkit pin/version, artifact tests and agent guidance.
- [ ] Review full cross-repo diff, generation, format/lint, tests/build.

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
Toolkit -> Backend ownership model and instructed implementation. Do not merge
or promote to production without separate authority.

## 7. Current verification

Toolkit 0.33.0: npm ci (lockfile), npm test (57 files, 1259 tests),
npm run typecheck, npm run lint, npm run format:check and npm run build passed.
Both real terminal and embedded dispatch resource paths have 36 focused X
contract cases. No live user credentials or X calls were used.

## 8. Remaining integration

SDK Dispatch pin/artifact, cross-service E2E and deployment remain separate.
