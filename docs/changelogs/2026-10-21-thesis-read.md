# Thesis list and related reads

## 1. Context

Approved handoff: thesis-read-cli-skill-plan.md (2026-10-21). Toolkit base
2699f2533689feae60bf89a2c244073a105e7b1d (main); Skills dependency PR #650,
05ea621cdeed6b6067b7aabbe7c10a2d30b73d9c, still open. Independent clones in
df07; no working files copied from 76b9. Gateway schema checked at
80ade96aa6f0807124733555304931f5056d5ea6 (read-only).

## 2. Behaviors

B1: Read Person, PublicUser and entity theses, or related current publications.
B2: Default 10, maximum 50 per existing endpoints, one page only; preserve body,
canonical publisher, source references, internal playbook ID and exact version.
B3: Names/tickers resolve only when unique; exact identifiers never fuzzy-fallback.
F1: Distinguish not found, ambiguous identity, GraphQL failures and Related state.
F2: Missing publication data is explicit; never fill a page through per-item GETs.

## 3. Design

Fixed GraphQL operations, existing auth and permission filtering. Share the existing
For You publication projection and validation. No backend, Sandbox rules, writes,
new dependencies, automatic pagination, content truncation or research side effects.

## 4. Implementation

- [x] Add Thesis resource reads and identity resolution.
- [x] Wire terminal/embedded definitions, dispatch, help and README.
- [x] Add incremental Skill reading section/routes on PR #650.
- [x] Verify and review complete diff.
      Author pages use latestRelease.thesisPublication; entity/related already expose
      ThesisPublication. Preserve nullable author publication with its Playbook ID.
      Use explicit --person (slug), --person-name (search), --person-id, --user (username),
      --user-id, --ticker or --entity-id selectors; exactly one per list call. Separate
      name and slug flags avoid guessing whether a single-word name is an exact slug.
      Related uses internal ID and reports current-version scope, never replaces a quoted version.

## 5. Verification

Focused resource/CLI tests, complete npm test, npm run typecheck, npm run build.
Validate fixed queries against current Gateway schema. No Makefile/lint-fix target;
no separate lint command was chosen. The existing pre-push hook subsequently
ran and passed lint, format:check, typecheck, test and build. E2E Required: no (full local
stack not requested). Actual deployed Agent conversations remain rollout verification.

## 6. Decisions

User approved implementation in current isolated workspace, minimal Toolkit/Skill
scope. Parameter spelling follows CLI conventions; explicit person-name separates
search from exact lookup. No runtime publication or shared LocalDev changes.

## 7. Outcome and evidence

| Item            | Implementation/evidence                                                                                                         | Status        |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| B1              | Thesis resource; both CLI command registries, dispatch and help                                                                 | DONE          |
| B2              | 58 read tests; shared For You projection; lossless decimal IDs and version checks                                               | DONE          |
| B3/F1           | Unique search only, exact profile lookup, candidates with identity/market metadata, fail-closed GraphQL and Related state tests | DONE          |
| F2              | Null author snapshots retained; no per-entry GET or automatic next-page read                                                    | DONE          |
| Skill routing   | Incremental Skills change on #650; reading anchor and narrow FinTwit/Signals boundaries                                         | DONE (static) |
| Runtime rollout | No installed production/Agent version changed or claimed                                                                        | NOT DONE      |

Validation in Toolkit:

- `npm ci --no-audit --no-fund`: installed lockfile dependencies, no lockfile change.
- `npm run typecheck`: passed.
- `npm test`: 55 files / 1,228 tests passed. Initial full run found the existing
  embedded inventory expected 118 leaves; updated to 120 with both new commands.
- `npm run build`: ESM/CJS/browser/terminal/embedded/types passed. Design-contract
  CDN fetch fell back to the existing artifact; CSS verified; no generated diff.
- `go run /tmp/df07-validate-thesis.go` from Gateway: all seven extracted fixed
  queries validate against the full schema at 80ade96. No Gateway changes.
- `node /tmp/df07-thesis-bundle-smoke.mjs`: built terminal and embedded bundles
  performed exactly two HTTP requests against a local fixture server; synthetic
  70,000-byte body preserved, terminal response 78,496 bytes; 120 embedded leaves.
  This measures serialization, not live data coverage or model context behavior.
- Skills `node evals/alva-skill-docs/skill-doc-eval.mjs --out /tmp/df07-skill-eval.md`:
  106 cases and 1,237 static checks passed. Original publication/quote sections
  remain unchanged. This is not a real Agent routing evaluation.
- `git diff --check`: passed in both changed repositories.

Main-agent review covered behavior/scope, design, tests, auth/IDs/versions,
release dependencies, and documentation. No new backend/API/security boundary,
package dependency, migration, or Sandbox dialogue rule. No unresolved code findings.

## 8. Remaining work

npm release, Sandbox installation, sdk-monorepo Toolkit/Dispatch publication and
Skill rollout must precede real Agent acceptance. Local success does not prove rollout.

PRs: [Toolkit #191](https://github.com/alva-ai/toolkit-ts/pull/191) and
[Skills #651](https://github.com/alva-ai/skills/pull/651), stacked on Skills #650.

Review follow-up: the suggestion to accept opaque Person lookup IDs was checked
against Gateway public_profile_convert.go at both 80ade96 and the handoff baseline.
publicProfileRefInputToProto calls parsePositiveID for PERSON and USER, and
publicProfileProtoToModel formats ref.GetId() as decimal. Retained the numeric
lookup contract; corrected an older For You publisher comment that implied otherwise.
No behavior change; publisher output remains a string.

Consumer review found sdk-monorepo's Toolkit Dispatch error envelope retains
only Error.message, dropping AlvaError.details. Ambiguity now includes candidate
identities in the message as well as structured details, preserving choices in
both terminal and the existing ALPI wrapper without changing another repository.
Added a message-only embedded-adapter regression. This is a compatibility fix
within B3/F1, not a new identity or error transport contract.

Gateway graphqlerror.Present also emits canonical NOT_FOUND, PERMISSION_DENIED
and UNAUTHENTICATED codes; preserve those distinctions in AlvaError instead of
flattening them into GRAPHQL_ERROR. Unknown/mixed errors still fail generically,
and partial data is never returned. Three regression cases cover that boundary.

## 9. Review follow-up (simplification)

- Publication contract moved from `forYou.ts` into a neutral
  `thesisPublication.ts` shared by For You and the new reads; `record` and
  `isPositiveInt64` are reused instead of re-implemented.
- Every publication publisher now carries `__typename` plus the exact handle
  (`slug` for Person, `username` for PublicUser), so "more from this author"
  maps to `--person <slug>` / `--user <username>` without guessing a kind.
  `--person-id`, `--user-id` and the `publicProfile` query are removed.
- Both reads return one continuation, `nextCursor` (null at the end, possibly
  set after an empty page), matching `for-you theses`. Removed `pageInfo`,
  `source`, `ready`, `scanLimited`, `listId` and `pageCursor` from the output.
- Removed client re-checks of invariants Gateway already derives or enforces
  (entity membership, duplicate/overfull pages, ready/state and
  hasNextPage/nextCursor agreement, author/material version vs snapshot,
  echoed IDs). Shape validation of every selected field is unchanged.
- The ACTIVE status default is left to Gateway instead of being sent.
- Ticker resolution is unchanged: `byPrefix: false` is llm-data's exact alias
  match (`FindAllByAlias`), not a fuzzy search.
