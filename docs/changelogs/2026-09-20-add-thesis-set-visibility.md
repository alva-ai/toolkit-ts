# feat: add Thesis visibility updates

## 1. Background and Current State

- Problem/outcome: authenticated Thesis owners need to change an existing
  Thesis between public and private without republishing its body or creating a
  new author version.
- Current implementation: Backend already exposes
  ThesisService.SetThesisVisibility. It authorizes the caller, locks the Thesis
  parent, updates the shared Playbook access state and discoverability, closes
  premium renewals, and returns the current Thesis without changing its
  author/material versions or body. Gateway exposes this operation to frontend
  GraphQL, but the authenticated Thesis REST surface used by Toolkit has no
  visibility endpoint. Toolkit therefore exposes only full thesis update,
  which requires the body, request UUID, expected author version, and explicit
  visibility and publishes a new author version.
- Current caller path: Toolkit Thesis methods call Gateway REST under
  /api/v1/theses; Gateway authenticates the caller and forwards the trusted
  request context to Backend gRPC. Toolkit does not connect to Backend gRPC.
- Related evidence: Gateway Playbook visibility already uses the desired thin
  REST-adapter pattern; Toolkit exposes it as a dedicated setVisibility
  resource method and CLI subcommand. Skills Thesis guidance currently
  documents visibility only during create/full update.
- Runtime evidence: none; current code, tests, protobuf contracts, and merged
  changelogs are sufficient for this additive transport feature.
- Constraints/assumptions/unknowns: only public and private are valid for the
  dedicated Thesis setter. Backend remains the authorization and state
  authority. No database migration, model call, research run, new author
  version, or direct GraphQL dependency is required.

## 2. Problem Model and End-to-End Behavior

- Root cause: the domain operation exists behind Backend gRPC and frontend
  GraphQL, but the REST transport consumed by Toolkit omits it. The only Toolkit
  write path therefore has materially different version-publication semantics.
- Goal: provide one explicit SDK/terminal/embedded command that changes current
  Thesis access and returns the authoritative current Thesis.
- Non-goals: changing body/title/entities, supporting paid visibility, changing
  Backend lifecycle behavior, adding frontend UI, or introducing another
  publication/version.
- B1 — Dedicated change: alva thesis set-visibility --id <id> --visibility
  public|private changes only current access through the existing Backend
  setter.
- B2 — Stable publication: a successful visibility change returns the current
  Thesis with unchanged author version, material version, body, title, and
  entity IDs.
- B3 — Agent workflow: an explicit visibility request may execute directly;
  the Skill reads the current Thesis first, reports the current-to-target
  change, invokes the dedicated command, then uses thesis get as readback.
- B4 — Compatibility: existing create/get/update/close/delete/rewrite behavior
  and command syntax remain unchanged.
- F1 — Invalid input: missing/invalid ID or a visibility outside public|private
  fails before or at the Gateway boundary and performs no update.
- F2 — Authorization/lifecycle failure: inaccessible, missing, deleted, or
  otherwise rejected Thesis changes surface the Backend error without fallback
  to full update, GraphQL, Playbook commands, or retries.
- F3 — Invalid upstream response: Gateway or Toolkit rejects a missing,
  malformed, or wrong-ID Thesis response rather than reporting success.
- Idempotency/compatibility: setting the current value remains a successful
  Backend-owned idempotent operation. No client request UUID is introduced.

## 3. Research, Findings, and Architecture Decision

- Repository evidence: Backend SetThesisVisibility already owns the
  transaction, owner authorization, access-state audit, renewal closure, and
  discoverability calculation. Gateway's Playbook visibility handler proves
  the REST-to-gRPC adapter shape; Toolkit's Playbook resource proves the
  resource/CLI/embedded-command shape; Thesis response validators already
  preserve decimal IDs and validate visibility.
- External research: skipped because this is a local additive adapter over an
  existing domain RPC and established repository pattern; external protocols
  would not change the decision.
- Premise challenge: doing nothing leaves agents able to change visibility only
  by publishing a new author version. Reusing the Playbook domain command would
  be incorrect because Thesis uses an ID and Thesis-specific lifecycle rules;
  only the transport and CLI structure should be reused.
- Approaches:
  1. Add a Thesis-specific REST endpoint, Toolkit resource method/CLI command,
     and Skill workflow. This preserves the existing transport boundary and
     delegates all state semantics to Backend.
  2. Call the existing GraphQL mutation from Toolkit. This avoids one REST
     handler but introduces a one-off transport, graph-shaped response mapping,
     and a dependency the current Thesis Toolkit deliberately does not use.
  3. Read the Thesis and issue full PUT /api/v1/theses/:id. This needs
     optimistic-version and idempotency inputs, republishes content, and can
     conflict with concurrent edits; it does not represent a visibility-only
     change.
- D1 — Selected: approach 1, reusing the Playbook adapter/client/CLI pattern
  while calling the existing Thesis-specific Backend RPC.
- D2 — REST contract: use a nested visibility action under the existing Thesis
  resource, authenticated by the same middleware and returning the canonical
  { thesis } response.
- D3 — Skill behavior: no additional formal consent gate for an explicit
  visibility request. Read before changing, state the transition, execute once,
  and read back; never reconstruct a full update payload.
- R1 — Dependency order: Toolkit cannot function until the Gateway endpoint is
  deployed. PRs must express that dependency and verification must distinguish
  local contract coverage from deployed availability.
- R2 — Version drift: Gateway's generated Backend API pin must already contain
  SetThesisVisibility; if the current pin lacks it, dependency publication is a
  delivery blocker rather than permission to reimplement the operation.
- Closest references: Gateway pkg/handler/playbook.go and
  pkg/handler/thesis.go; Toolkit src/resources/playbooks.ts,
  src/resources/theses.ts, terminal/embedded command definitions and Thesis
  tests; Skills skills/alva/references/thesis.md and docs eval cases.

## 4. Implementation Design

- Change/ownership map:
  - alva-gateway owns the public REST compatibility boundary for Toolkit. In
    pkg/handler/thesis.go it adds the existing RPC to the narrow thesisClient
    interface, registers POST /api/v1/theses/:id/visibility, validates one
    visibility field, forwards trusted context, validates the returned Thesis,
    and uses the existing REST serializer/error mapping. Its local changelog is
    docs/changelogs/2026-09-20-expose-thesis-set-visibility.md.
  - toolkit-ts owns the public TypeScript SDK and terminal/embedded command. In
    src/resources/theses.ts it adds SetThesisVisibilityParams and
    setVisibility(id, params), and src/index.ts exports the type. Command
    definitions, dispatch, embedded routing, and help expose thesis
    set-visibility with only --id and --visibility.
  - skills owns agent behavior. skills/alva/references/thesis.md documents the
    dedicated mutation/readback workflow, and evals/alva-skill-docs/cases.json
    protects it. Its local changelog is
    docs/changelogs/2026-09-20-guide-thesis-set-visibility.md.
- REST compatibility exception: this is not a new first-party frontend
  operation. Frontend already has GraphQL setThesisVisibility; the new REST
  action completes the existing authenticated Thesis compatibility surface
  consumed by the public Toolkit CLI and embedded agent runtime.
- Call/data flow:
  1. Terminal or embedded dispatch validates required flags and canonical
     public/private visibility.
  2. ThesesResource validates the decimal ID and visibility, authenticates,
     then sends POST /api/v1/theses/{id}/visibility with
     {"visibility":"public|private"} exactly once.
  3. Gateway requires a logged-in non-PBSV, non-group-guest caller, parses the
     positive int64 ID, strictly decodes the bounded JSON body, and calls
     SetThesisVisibility with the incoming trusted gRPC context.
  4. Backend remains the transaction and authorization owner. Gateway verifies
     a nonnil valid Thesis whose ID equals the route ID and serializes the
     canonical { thesis } response.
  5. The Skill performs an independent thesis get readback and compares the
     access and immutable publication fields.
- Critical interfaces:

      export interface SetThesisVisibilityParams {
        visibility: ThesisVisibility;
      }

      async setVisibility(
        id: ThesisID,
        params: SetThesisVisibilityParams
      ): Promise<ThesisResponse>

      POST /api/v1/theses/:id/visibility
      { "visibility": "public" | "private" }
      -> { "thesis": <canonical Thesis REST object> }

- Gateway handler algorithm:
  - requireCaller; invalid Guest/PBSV/group-guest callers stop before Backend;
  - parseThesisIDParam;
  - bindThesisJSON into a dedicated request using the existing duplicate,
    unknown-field, Unicode, trailing-data, and size protections;
  - require present visibility and validThesisVisibility;
  - call SetThesisVisibility once;
  - map Backend status with grpcToHTTPError;
  - reject nil/invalid/wrong-ID or target-visibility-mismatched responses with
    502 UNAVAILABLE;
  - otherwise write the existing thesisResponse shape.
- Auth matrix:

  | Caller           | Gateway result                 | Backend authority                       |
  | ---------------- | ------------------------------ | --------------------------------------- |
  | Guest            | deny before RPC                | none                                    |
  | User             | allow to RPC                   | owner/lifecycle check                   |
  | Admin            | allow to RPC                   | Backend maintenance authorization       |
  | API key          | allow as authenticated user    | owner/lifecycle check for resolved user |
  | PBSV/group guest | deny before RPC                | none                                    |
  | Service          | no public HTTP credential/path | internal callers use gRPC directly      |

- Error/security/observability: do not accept caller identity in JSON, do not
  log body content, do not retry, and preserve existing gRPC-to-HTTP error
  codes. Invalid client input is 400 INVALID_ARGUMENT; unavailable client is
  503; malformed upstream response is 502; Backend ownership/not-found/state
  errors pass through the standard mapper. Existing request/service logging is
  sufficient; no new metric is justified for the thin adapter.
- Migration/compatibility/rollout: no schema, proto, GraphQL, generated file,
  migration, config, or deployment manifest changes. Gateway's current Backend
  API pin already contains SetThesisVisibility. Deploy Gateway before relying
  on the Toolkit command; Skill guidance may land independently but remains
  operationally dependent on both.
- Rollback/forward recovery: each PR is additive. Reverting Toolkit/Skill hides
  the command/workflow without affecting Backend state. Reverting Gateway makes
  the new command return route-not-found; no data rollback is needed.
- Authoritative docs: CLI help and the Alva Thesis reference must state that
  the dedicated setter changes access only, supports public/private, creates no
  version, and has no request UUID/version/body flags.

### Serial Implementation Checklist

- [x] Gateway: add the REST handler/client method and behavior-first handler
      tests for B1/B2/F1/F2/F3; run focused handler tests and repository lint-fix.
- [x] Toolkit: add the resource type/method/export, terminal and embedded
      command definitions/dispatch/help, and SDK/CLI/profile tests for B1/B2/B4 and
      F1/F3; run focused tests, typecheck, build, and lint-fix.
- [x] Skills: add the get/set/get workflow and eval case for B3/F2 without
      weakening create confirmation or GET-only preview rules; run all documented
      skill evals.
- [x] Review all three final diffs in dependency order, reconcile sections 7-8,
      and record the explicit E2E exclusion.

## 5. Verification and E2E Design

- Testability boundaries:
  - Gateway handler tests use thesisClientStub to prove trusted context,
    exact RPC request, response validation, and HTTP error mapping without
    duplicating Backend transaction tests.
  - Toolkit resource tests replace the HTTP boundary to prove exact method,
    path, body, single-call behavior, ID/visibility validation, and response
    validation. CLI tests spy on the resource to prove terminal and embedded
    flag routing.
  - Skills eval checks protect the dedicated command, read-before/write/readback
    order, immutable-field comparison, no-fallback rule, and absence of a new
    formal confirmation gate.
- Representative Gateway tests:
  - table public/private; assert caller UID/role reaches context, request ID and
    visibility are exact, response ID/version/body are preserved;
  - invalid route ID, missing/paid/uppercase visibility, duplicate/unknown
    fields; assert zero RPC calls;
  - Backend PermissionDenied; assert standard HTTP mapping and no retry;
  - nil, invalid, and wrong-ID responses; assert 502.
- Representative Toolkit tests:
  - setVisibility(MAX_ID, {visibility: "private"}) sends one POST to
    /api/v1/theses/{MAX_ID}/visibility and returns thesisResponse;
  - invalid ID or visibility rejects before \_request;
  - malformed or wrong-ID response rejects INVALID_RESPONSE. The resource
    method explicitly compares response.thesis.id with the requested ID;
  - terminal and embedded commands call setVisibility with exact strings and
    reject missing/invalid flags;
  - embedded command inventory includes thesis set-visibility and remains
    unique.
- E2E Required: no — the feature is user-visible and normally merits a full
  local-stack test, but the human explicitly excluded alva-local-dev from this
  task on 2026-09-20. Component contract tests cover every new branch; actual
  Gateway-to-Backend execution and deployed availability remain unverified and
  must not be claimed.
- Exact Gateway commands:

      go test ./pkg/handler -run 'TestThesis.*Visibility' -count=1
      go test ./pkg/handler -count=1
      make lint-fix
      go build ./...

- Exact Toolkit commands:

      npm test -- test/resources/theses.test.ts test/cli/theses.test.ts test/cli/agentCommandProfile.test.ts
      npm run typecheck
      npm run build
      npm run lint:fix
      git diff --check

- Exact Skills commands:

      node evals/alva-skill-docs/skill-doc-eval.mjs --skill-dir skills/alva
      node evals/alva-skill-docs/mutation-smoke.mjs --skill-dir skills/alva
      node --test evals/alva-skill-docs/durable-agent.test.mjs
      git diff --check

| Behavior/failure | Evidence                                                              |
| ---------------- | --------------------------------------------------------------------- |
| B1               | Gateway happy-path RPC test + Toolkit resource/CLI tests              |
| B2               | Gateway unchanged response fields + Toolkit response validation tests |
| B3               | Skills reference eval for get/set/get and immutable comparisons       |
| B4               | Existing Gateway handler and Toolkit Thesis suites remain green       |
| F1               | Gateway no-RPC invalid-input table + Toolkit pre-request rejection    |
| F2               | Gateway PermissionDenied mapping + Skills no-fallback/no-retry eval   |
| F3               | Gateway nil/invalid/wrong-ID tests + Toolkit invalid-response tests   |

- Intentionally excluded: alva-local-dev source/test changes, full local-stack
  E2E, staging calls, deployment, and production proof, per explicit human
  direction. Full-repository test suites are unnecessary for the scoped
  additive handler/SDK/docs change.

## 6. Human Decisions and Interaction

- The human proposed reusing Playbook visibility infrastructure. Repository
  evidence refined this to reuse the REST adapter/SDK/CLI pattern while keeping
  Thesis-specific Backend lifecycle ownership.
- The human approved a dedicated public/private command, no publication/version
  side effect, direct execution for explicit requests, and get-based readback.
- The human approved the sections 1-3 architecture record.
- During planning, missing permanent cross-service E2E coverage was surfaced.
  The human explicitly directed: “不管localdev了”. Therefore alva-local-dev is
  excluded, component tests are required, and final reporting must state that
  full-stack/deployed behavior was not verified.

## 7. Outcome and Evidence

- Result: Gateway now exposes the existing Thesis visibility domain operation
  through authenticated REST; Toolkit exports a typed SDK method plus terminal
  and embedded thesis set-visibility command; Skills routes explicit
  public/private changes through get/set/get verification.
- Reconciliation:

  | ID    | Implementation/evidence                                                                                               | Status       |
  | ----- | --------------------------------------------------------------------------------------------------------------------- | ------------ |
  | B1    | Gateway handler and Toolkit SDK/CLI command call the dedicated setter                                                 | DONE         |
  | B2    | Gateway/Toolkit validate canonical returned Thesis and target visibility; Backend contract remains version-preserving | DONE         |
  | B3    | Thesis reference and target eval require get/set/get and immutable-field comparison                                   | DONE         |
  | B4    | Existing handler suite and focused Toolkit Thesis suites remain green                                                 | DONE         |
  | F1    | Gateway invalid-input table and Toolkit pre-request/flag rejection                                                    | DONE         |
  | F2    | Gateway PermissionDenied mapping plus Skill stop/no-fallback rule                                                     | DONE         |
  | F3    | Gateway nil/invalid/wrong-ID/wrong-visibility tests and Toolkit mismatched-response tests                             | DONE         |
  | D1-D3 | Thesis-specific REST adapter, canonical response, direct explicit Skill workflow                                      | DONE         |
  | R1    | Deploy order is documented; no deployment was authorized or performed                                                 | UNVERIFIABLE |
  | R2    | Current Gateway Backend API module contains SetThesisVisibility                                                       | DONE         |

- Review findings fixed: added direct auth-boundary coverage for the new
  Gateway route and explicit missing-ID CLI coverage. No unresolved code
  findings remain after restarting the review.
- Gateway verification in code/backend/alva-gateway:
  - go test ./pkg/handler -run 'TestThesisSetVisibility' -count=1 — passed.
  - go test ./pkg/handler -count=1 — passed.
  - make lint-fix — passed with 0 issues.
  - go build ./... — passed.
  - git diff --check — passed.
- Toolkit verification in code/public/toolkit-ts:
  - npm run lint:fix — passed.
  - npm test -- test/resources/theses.test.ts test/cli/theses.test.ts
    test/cli/agentCommandProfile.test.ts — 3 files, 71 tests passed.
  - npm run typecheck — passed.
  - npm run build — passed; vendor-contract refresh produced no tracked
    fallback-contract/bundle diff.
  - git diff --check — passed.
- Skills verification in code/public/skills:
  - node evals/alva-skill-docs/skill-doc-eval.mjs --skill-dir skills/alva —
    93/93 cases and 994/994 checks passed.
  - node evals/alva-skill-docs/mutation-smoke.mjs --skill-dir skills/alva —
    21/21 mutations failed as expected.
  - node --test evals/alva-skill-docs/durable-agent.test.mjs — 5/5 passed.
  - git diff --check — passed.
- E2E: not run and no alva-local-dev test was added, per explicit human scope.
  This evidence proves component contracts, not a live Gateway-to-Backend or
  deployed command execution.
- Migration/rollout: no migration, proto, GraphQL, generated API, config, or
  deployment artifact changed. Gateway must be available before Toolkit users
  can execute the command; Skills remains operationally dependent on both.
- PR/CI/review outcome: pending push stage.

## 8. Remaining Work

- Create the three dependency-ordered PRs and report current CI/review state.
- Deployment and a real authenticated end-to-end execution remain outside this
  task. Gateway must deploy before the Toolkit command becomes operational.
