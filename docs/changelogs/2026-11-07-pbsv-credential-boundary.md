# PBSV credential boundary — mono-meta #1138

## 1. Current state

Sharing and iframe navigation put viewer credentials in URLs. Non-owner runtime tokens carry UDF invoke scope. Owner portfolio scope is checked without rechecking current playbook ownership.

## 2. Approved behavior

Yumin approved on 2026-11-07: PBSV is the current viewer credential, never a URL/share capability. Keep resource-bound read; UDF and portfolio capabilities are owner-only. Accept bearer security assumptions, no login-session binding or parent API proxy. No schema/data changes, merge or deployment.

## 3. Scope and risks

Backend is the primary record. Companion changes: alva-gateway, frontend-monorepo, toolkit-ts. Share copies a clean navigation link and does not grant private access. No replacement long-lived share token. Historical credential URLs are no longer authentication. Private iframe navigation needs body/header authentication; trusted parent provides runtime bootstrap. Old SDK bundles must be accounted for in rollout. Existing UDF consumers lose execution; owner functions remain available.

## 4. Implementation

1. Mint privileged scopes only for owner; recheck ownership at UDF/portfolio runtime, including historical tokens.
2. Prevent URL authentication/propagation, use POST for protected iframe HTML and non-URL runtime bootstrap with origin/source checks.
3. Remove share mint and SSR URL credential forwarding. Keep TTL, signatures and bound read.
4. Cover owner/non-owner, old scopes, URL leakage, private navigation and runtime readiness; update contracts and docs.

## 5. Verification

Focused unit/integration suites, Go builds and make lint-fix, frontend/toolkit tests/typecheck/build as available. Synthetic data only. No production credential experiment. Full local service-stack E2E not requested.

## 6. Review and delivery

Independent Forge session pbsv-1138-review reviews design and final diff; main agent reviews findings and fixes, repeat until no unresolved findings. Separate reviewable PRs, never merge/deploy. Toolkit/gateway transport support precedes frontend switch; final rollout evidence is not supplied by code review.

## 7. Outcome and evidence

- Runtime consumes and deletes the private document response bootstrap; historical URL PBSV is ignored and scrubbed. Parent refresh still requires expected source/origin. Gateway provides compatibility for already-published old runtime bundles.
- `npm test` (Vitest run): PASS, 62 files / 1444 tests, including 14 runtime tests. `npm run typecheck`: PASS. `npm run build`: PASS. `npm run lint`: PASS (repository ESLint check). `npm run format:check`: PASS. No `make lint-fix` target exists in this TypeScript repository.
- Gateway browser regression uses both the base 0.35.0 runtime source (commit 38cce7a) and this source bundled by installed esbuild. Both pass actual React ViewerFrame + proxy CSP, native POST, immediate list/invoke, bootstrap deletion, clean URL, refresh/reload and cross-pid navigation. No package publication or deployment performed.
- Cross-review: independent Forge session `pbsv-1138-review` plus main-agent complete net-diff review; confirmed findings fixed and regression-covered. Round 4 disposition: PASS, no unresolved security/correctness findings; main-agent review also has no outstanding finding. Staged candidate and PR text secret scans PASS.

Cross-provider final acceptance: main Codex and verified Claude child explicitly accept product `bd616dcb6190dfdd293b480080e27930b93943ff` with no unresolved actionable finding. [Full report, decision ledger and SHA-256 evidence](https://github.com/alva-ai/alva-backend/blob/security/issue-1138-research/docs/changelogs/2026-11-07-pbsv-credential-boundary.md). Subsequent sections 7–8 updates are evidence-only; no merge/deploy/apply is authorized.

## 8. Remaining work

- Human-controlled rollout: Gateway body/bootstrap support must precede the frontend switch. The bundled-old-runtime bridge avoids requiring existing HTML to update Toolkit first; Toolkit release supports future bundles. Backend owner restriction is independently deployable. Do not merge or deploy as part of this task.
- Intentional compatibility change: copied private links grant no additional access; historical `_pbsv` navigation links cease authenticating; non-owner PBSV UDF invocation is denied. Existing separate `_t` handler remains, but sharing does not mint or propagate it. Non-PBSV login-based UDF semantics are outside this change.
- New revocable private-sharing grants, lifetime/version/viewer policies and any DB operations remain separate product decisions. No replacement long-lived bearer sharing secret was introduced. TTL remains 15 minutes; no individual-token revocation is claimed.
- Evidence is code + controlled local fixtures. Production artifact versions, real-user impact counts and complete service-stack E2E were not measured; no production credentials, holdings or data were accessed. No migrations, online writes, merges or deployments.
