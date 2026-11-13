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

### Final v11 rebase review acceptance (2026-11-13)

Accepted candidate `b002d55241b941410fac902029daf85e62b25a87` against base `5ce80070632e1b9c68c87458f82d6aadf98f8ad0`; complete diff SHA256 `162b9e8ac4f122d643d960bbbcf73f7e02d532ea486fe4c8b3475959c07d41f6`. Main Codex `93f1219e-8a47-4111-a592-8a35d5a46812` and verified same-VM Claude child `3eb63872-0e41-4478-bfff-4850cabeea5b` (native `8bdb34b1-a752-4635-a799-0c3dc08b274d`, env `env-9nbmf8g4`) both explicitly accept the same eight candidates/hashes with no unresolved in-scope actionable findings.

Durable evidence hashes: `final-candidate-manifest-v11.json` SHA256 `caa45c6648f9ca0a893c0afb9aa6b1ef211f624cc4627b7c2352ea6684f52c57`; `main-final-acceptance-v11.md` SHA256 `7444649e357725a884b41a42fd45af7f0af6563c615a6a89f2b2e6623967606e`; `claude-final-review-v10.md` SHA256 `a72d67c6c7b376db214d5042b10148bf6b45ff612a2809ef653c4ca2c4ff010d`; `claude-final-review-v11.md` SHA256 `e62fb1b9f533e9b37319414d2c29cc6199f84fba871a587d541026e32796265a`; `verification-final-v11.json` SHA256 `ba64d7a52395fb4db5ddaaa972f6872dd92ad5ca48130be9d5ac5fa431db7c94`. Reports retained in parent task records `rebase-20261113/`; the primary Backend changelog records all eight identities. v10 was rejected for V10-1; v11 resolves it. The authoritative integration field in historical manifests is `base`; inherited `main` is historical preflight metadata.

V10-1: newly upstreamed v2 portfolio handlers skipped the current-owner check. Fixed by sharing `Service.currentAlvaUserID`; real synthetic PG regression fails six denial assertions before the fix and passes afterwards, including current/new-owner positives. Claude independently reproduced mutation red/green, full portfolio tests, server tests and build. Current Gateway already strips stale-owner scopes; no current end-to-end exploit path was established.

Author verification: Backend portfolio/playbook/servicefunction/server + tagged PBSV integration and build pass; final v2 portfolio51.473s/server153.426s pass. Full canonical lint has 7 latest-main baseline issues, byte-identical to clean base (not counted pass); existing CI only checks new diagnostics, unchanged by this task. Gateway tests/lint/build and real latest ViewerFrame/CSP old/new SDK Chromium+origin isolation4.765s pass. Toolkit1445 tests/lint/typecheck/build pass. Internal restful/resolver tests/build pass; 4 SA1019 full-lint baseline diagnostics reproduced byte-identically (not counted pass). Infra both real Docker nginx configs pass; Meta source module syntax passes with no load execution. Frontend/Node unchanged product content reuse their v9 complete verification. PG packages must run serially to avoid shared local test DB contention. No real user credential/data, deployment, Terraform command, dbops or online experiment.

Remaining limits and existing compatibility notes in §8 remain. Rebased remote heads require fresh CI/feedback monitoring before ready-for-human-review; previous-head checks are historical. Any subsequent changes here are §7–8 evidence only and do not change accepted product/test/config/CI content.


### 2026-11-13 explicit origin/main rebase (v10)

Yumin explicitly requested rebasing this published branch. Previous published head `72b8db6f2c1eb731c132e1e9828b580ab08deb88` is preserved under a local `refs/backup/pbsv-1138/` ref; integration base is `5ce80070632e1b9c68c87458f82d6aadf98f8ad0`. Exact old remote SHA leases are required for publication. No shared checkout, live data, deployment or dbops changes.

Initial rebase tree equals `git merge-tree --write-tree <previous-head> <new-main>`; conflict resolutions preserve the prior product changes and new upstream behavior. Frontend remains byte-identical to v9; Node screenshot already has the current main ancestor and its exact commit is unchanged. New-main verification and the independent same-VM Claude Code review are complete in the final v11 record above; historical acceptances below are retained as history.


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

### Additional final audit evidence (2026-11-08)

Both main Codex93f1219e and real same-VM/verified-parent Claude Code3eb63872 explicitly accept the eight exact product candidates in the primary Backend record; no unresolved actionable finding within scope. This supersedes historical pending-review/checklist text above. This repository accepted candidate: `f60f4516652a4e4ee582ad8fddc70ad70b28c7fc`, complete diff SHA256 `f3327afc46ea43c296c7b7f3f3e2d78a0cbfb845d5548d3ae21119671b38a092`. Claude final report SHA256 `8ea270e0e5e2b9a3b586a13b8f1547e31b2198842d2435908f53f0b1294f1a71`; main acceptance SHA256 `c38e36960af7e0f438655fa60bd535e49e32744dd7df878f6816085ac4e98610`. Independent tests, main checks, all findings/dispositions and residual limits are in [primary record](https://github.com/alva-ai/alva-backend/blob/security/issue-1138-research/docs/changelogs/2026-11-07-pbsv-credential-boundary.md). Only evidence §7–8 changes follow acceptance. PR publication and CI monitoring pending; no merge/deploy/apply/data changes.
