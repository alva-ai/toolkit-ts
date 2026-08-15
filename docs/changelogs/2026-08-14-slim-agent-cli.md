# feat: add a purpose-built Slim Alva Agent CLI

## 1. Background

- ALPI embeds `@alva-ai/toolkit/dispatch` with `mode: "jagent"`, but that mode
  currently exposes the terminal CLI's entire legacy command catalog. It only
  changes local-file behavior.
- The terminal CLI and the in-process Agent tool serve different users. The
  Agent tool already receives host-owned authentication and filesystem tools,
  so setup commands, duplicate aliases, SDK documentation commands, Arrays
  bootstrap commands, and legacy product groupings add ambiguity without adding
  capability.
- The approved Slim design keeps product terminology (`data-skills`,
  `skillhub`, `markets`, `portfolio`) and groups capabilities by ownership:
  account state, automation lifecycle, playbook lifecycle, alerts, portfolio
  reads, and trading actions.

## 2. End-to-End Behavior

- B1 — Calls dispatched with `mode: "jagent"` resolve only the Slim command
  catalog and Slim help. Old Agent paths are rejected; there are no legacy
  aliases in the Agent profile.
- B2 — Calls dispatched by the packaged terminal CLI continue to resolve the
  existing full catalog and help unchanged.
- B3 — Slim paths reuse the current Toolkit resources and Gateway contracts.
  Renaming or regrouping a command must not duplicate HTTP or business logic.
- B4 — `automation` presents one product lifecycle. Creation provisions and
  registers its producer; lifecycle and run commands resolve the backing
  cronjob from the automation id when needed. Per-Automation Alva-channel and
  verified-email delivery controls remain nested under `automation delivery`.
- B5 — `portfolio` owns connected-account reads: `accounts`, `summary`,
  `activities`, `orders`, and `equity-history`.
- B6 — `trading` owns shared execution prerequisites plus two explicit
  execution systems: read-only `accounts` and `risk-rules`, legacy
  `signals`, and venue-native `broker`.
- B7 — Signal subscription creation has no hidden execute-latest behavior.
  Signal execution defaults to dry-run and requires `--live` for a real
  execution. Risk-rule mutation is absent from the Agent catalog.
- B8 — Broker order execution retains the existing envelope, dry-run,
  intent-id, and unknown-outcome contract. Broker argv remains forward
  compatible after the `trading broker` prefix.
- B9 — A future, separate Slim Alva Skill will teach only Slim Agent paths, and
  ALPI will pin and bundle the Toolkit version that implements them. The
  existing Alva Skill remains unchanged.

## 3. Findings

- `DispatchRuntimeDeps.mode` is already the narrow selection seam. A separate
  npm package or fork would duplicate the SDK and release process.
- `commandDefinitions.ts`, `commandSchema.ts`, and `dispatch.ts` currently own
  catalog, parsing/help, and behavior respectively. An Agent catalog plus a
  small route adapter is the least invasive implementation; the full terminal
  catalog remains intact.
- ALPI currently pins Toolkit `0.21.0` and passes `mode: "jagent"`; no ALPI API
  redesign is needed, but its dependency, bundle, and adapter tests must move
  together.
- Automation detail already reads `GetFeedDetailResponse`, which contains the
  backing cronjob id but omits it from REST. Exposing that existing field is the
  smallest way to make unified lifecycle/run commands automation-id based.
- ConnectedAccount already owns orders and equity history in the canonical
  product graph. The Slim CLI can relocate those reads without a backend data
  migration.
- TREX Broker already provides the canonical account view and read-only risk
  rules, and intentionally has no risk-rule write command.

## 4. Change Specification

### Toolkit

- Add a declarative Agent-only command catalog and select it before help or
  parsing whenever `mode === "jagent"`.
- Add an Agent route adapter that maps Slim paths onto existing dispatcher
  behavior while preserving strict per-leaf flag validation and broker argv.
- Keep terminal command definitions, terminal help, public SDK resources, and
  wire paths compatible.
- Implement the approved group moves:
  - account: `whoami`, credits, secrets, notification preferences, and service
    accounts;
  - direct platform terms: `fs`, `run`, `data-skills`, `skillhub`, `markets`,
    and feedback;
  - automation: create/list/inspect/update/delete/pause/resume/trigger,
    set-visibility, nested delivery get/update, and nested runs
    list/status/logs;
  - playbooks: discovery/read, draft/release gates, visibility, social actions,
    comments, remix, lint, screenshot, and functions;
  - alerts: list/enable/disable/history;
  - portfolio and trading exactly as B5-B8.
- Agent automation creation is a two-step orchestration over the current deploy
  and feed-release resources. If registration fails, report the created
  cronjob id explicitly; do not silently delete a live resource as
  compensation.
- Agent automation mutations that touch both producer and product metadata
  return both results and surface partial failure with the automation and
  cronjob identifiers.

### Gateway

- Add the existing producer `cronjob_id` to automation detail REST responses.
  No proto, database, auth, or deployment configuration change is required.

### ALPI

- Pin the released Toolkit version containing the Slim catalog, refresh the
  lockfile with scripts disabled, and add adapter assertions that old Agent
  paths fail while representative Slim and broker paths reach dispatch with
  `mode: "jagent"`.
- Add an exhaustive Jagent smoke runner whose manifest is checked against the
  Toolkit's exported Slim leaf inventory. It must run reads with the locally
  logged-in profile, reject mutations before network I/O, and permit only
  explicitly dry-run trading requests.
- Rebuild and verify the Layer 3 bundle; lower layers must remain Toolkit-free.

### Future Slim Alva Skill

- Create this as a separate future Skill; do not update the existing Alva
  Skill as part of this change.
- Its command index and executable examples must use only Slim paths. It must
  omit Agent guidance for `sdk`, Arrays token management, deploy/feed split
  lifecycle, risk-rule writes, and Signal `--execute-latest`.
- Its authoritative references must cover preflight, unified Automation,
  playbook creation/release, alerts, credits/secrets, trading, and broker
  execution. Product-specific names such as `skillhub` remain unchanged.

### Compatibility and rollout

- Terminal CLI: compatible and unchanged.
- Agent CLI: intentionally breaking; old paths are rejected rather than
  aliased.
- Rollout order: deploy the additive Gateway detail field, publish Toolkit,
  then coordinate the ALPI pin/deployment with the future Slim Alva Skill.
  The existing Alva Skill is not part of this rollout.
- Rollback: redeploy the previous ALPI bundle and withdraw the future Slim Alva
  Skill release. The existing Alva Skill and additive Gateway response field
  can remain unchanged.

### Core documentation impact

- The existing `code/public/skills/skills/alva/` tree remains unchanged. The
  future Slim Alva Skill will own its own authoritative command references.
- `code/backend/jagent/alpi/ext/adapters/jagent/docs/layers/layer-3-alva-agent.md`
  must identify the dispatch surface as the Slim Agent profile.
- Toolkit terminal README remains accurate because terminal behavior is not
  changed; document the Agent profile in the embedded-dispatch section only.

## 5. Verification Strategy

- Affected components: Toolkit Agent catalog/parser/help/route adapter and
  automation types; Gateway automation detail handler; ALPI Alva CLI adapter
  and Layer 3 bundle.
- Relevant dependents: packaged Toolkit CLI (negative compatibility check),
  ALPI Layer 3 bundle, and the future Slim Alva Skill. No other Gateway
  consumer breaks because `cronjob_id` is additive.
- Toolkit evidence: focused command-schema and dispatch tests for catalog
  isolation, every regrouped leaf, automation partial failures, Signal safety,
  broker passthrough/global flags, and terminal compatibility; then typecheck,
  full tests, and build.
- Gateway evidence: focused `pkg/handler` automation tests and package compile.
- ALPI evidence: focused `alva-cli-tool` and Layer 3 bundle tests plus the
  repository-required `npm run check`; guarded local-account smoke coverage for
  every Slim catalog leaf and every Broker leaf. Do not run its full test/build
  commands beyond the focused documented commands.
- Future Slim Alva Skill verification belongs to its own PR: doc regression
  evals, mutation smoke, and a structural scan that every executable
  `alva ...` example starts with an allowed Slim route.
- Escalation triggers: a changed public Toolkit export, proto/schema change,
  unknown command consumer, or bundle input drift requires the broader owning
  repository suite.
- Full suite required: yes for Toolkit because the dispatcher is shared with
  the terminal CLI; no for Gateway (additive handler field) or ALPI (focused
  adapter/bundle tests plus required check). The future Slim Alva Skill will
  define its own verification scope.
- E2E Required: no for local completion. Production availability depends on
  the coordinated Toolkit publish and ALPI/future-Skill rollout and should
  receive a deployed smoke after release.

### Implementation Checklist

- [x] Add and test the isolated Toolkit Agent catalog, help, and route adapter.
- [x] Implement and test unified automation, playbook/account/alert mappings.
- [x] Implement and test the approved portfolio/trading tree and safety rules.
- [x] Expose and test automation `cronjob_id` in Gateway detail responses.
- [x] Update Toolkit embedded-dispatch docs without changing the existing Alva
      Skill.
- [x] Update and verify the ALPI adapter contract and Layer 3 bundle against the
      profile seam.
- [x] Add and run the exhaustive guarded Jagent Slim smoke against the local
      logged-in account without sending mutation requests.
- [x] Run final affected-graph verification and record the reviewed outcome.
- [ ] After Toolkit publication, pin that released version in ALPI and refresh
      its lockfile. An unpublished version must not be written into the lock.
- [ ] Create and verify the separate future Slim Alva Skill, then coordinate
      its rollout with the ALPI pin/deployment.

## 6. Human Interaction

The user approved the design and requested completion without intermediate
checkpoints. No additional decision is pending.

## 7. Outcome

- Toolkit now has a declarative Agent-only catalog selected exclusively by
  `mode: "jagent"`. The packaged terminal CLI still uses the original catalog.
- Slim help and parsing expose the approved account, direct discovery/runtime,
  unified automation, playbook, alert, portfolio, and trading trees. Old Agent
  paths and local-file flags are absent rather than aliased.
- Unified Automation commands orchestrate the existing product and producer
  resources, resolve run operations from the Automation id, and report partial
  two-record failures with both identifiers.
- Signal execution is dry-run by default and has no implicit execute-latest
  subscription flag. Shared trading accounts and read-only risk rules sit above
  the isolated Signal and Broker subtrees. Broker argv and order safety remain
  passthrough-compatible.
- Gateway automation detail now includes its existing `cronjob_id`; no proto,
  database, auth, or migration change was needed.
- ALPI names and documents the embedded tool as the Slim Agent CLI and its
  adapter/Layer 3 checks pass. The package pin intentionally remains at the last
  published Toolkit until this Toolkit change is released.
- ALPI also includes a Jagent dispatch smoke whose 94-entry catalog manifest is
  compared with Toolkit at runtime. A local tarball of this Toolkit was swapped
  into ALPI temporarily and the smoke passed all 105 probes: 94 catalog leaves
  plus 11 Broker leaves. Of those, 44 mutations were rejected locally with zero
  requests, three help paths were zero-network, and 58 read/dry-run paths made
  60 allowlisted requests. No live trading, file, secret, automation, playbook,
  alert, subscription, or account mutation was sent.
- The existing Alva Skill was deliberately left unchanged. A separate future
  Slim Alva Skill will own the Slim command guidance; Toolkit issue #160 still
  tracks eventual SDK-command cleanup in the full terminal catalog.

Fresh verification:

- Toolkit: `npm run format:check`, full `npm test` (43 files, 804 tests),
  `npm run typecheck`, and `npm run build` passed.
- Gateway: `make lint-fix` and `go test -count=1 ./pkg/handler` passed.
- ALPI: Layer 3 build, focused `alva-cli-tool` + `layer3-bundle` tests (5), the
  focused Slim smoke safety suite (4), repository-required `npm run check`, and
  the local-account exhaustive smoke (105/105 probes) passed after dependency
  hydration with scripts disabled.
- No database, proto, GraphQL, or migration artifact is required.

## 8. Remaining Tasks

Release-only rollout remains:

1. Deploy the additive Gateway response field.
2. Publish a new Toolkit version containing this change.
3. Pin that exact version in ALPI, refresh the lockfile with scripts disabled,
   rebuild/deploy Layer 3, and run a deployed Slim help smoke.
4. Create the separate future Slim Alva Skill and coordinate its publication
   with the new ALPI bundle. Do not change the existing Alva Skill.
