# feat: separate the Alpi Alva dispatch from the system Alva CLI

## 1. Background

- Toolkit publishes two different products: the system `alva` CLI through
  `@alva-ai/toolkit/cli`, and the in-process Alpi Alva tool through
  `@alva-ai/toolkit/dispatch`.
- The current implementation couples them in one dispatcher. `mode: "jagent"`
  selects an Agent catalog, Agent definitions copy the terminal definitions,
  and Agent execution translates back through `dispatchFull()`. The system CLI
  imports that same dispatcher.
- The approved boundary is stricter: the system CLI must remain byte- and
  behavior-compatible, while the embedded dispatch has one purpose-built
  command surface and no Full/Slim selection or fallback.
- The Alpi Alva Agent likewise has one Skill coordinate,
  `@alva/alpi-slim-skill`; the old `@alva/skill` fallback is not part of this
  runtime.

## 2. End-to-End Behavior

- B1 — Importing `@alva-ai/toolkit/dispatch` always exposes the 94-leaf Alpi
  Alva command catalog and its help. No mode or profile selects another
  catalog, and old paths are rejected rather than aliased.
- B2 — Invoking the packaged system `alva` CLI continues to expose its existing
  terminal catalog, help, aliases, config/auth shell, local-file behavior, and
  wire behavior unchanged.
- B3 — The two entries own independent catalog, parser, help, and dispatch
  orchestration. They may share `AlvaClient`, resource SDKs, and command
  execution handlers; a catalog change on one side must not select or mutate
  the other side.
- B4 — Embedded paths preserve the already approved Automation, Playbook,
  alert, portfolio, Signal, and Broker semantics, including dry-run defaults,
  partial-failure reporting, and forward-compatible Broker argv.
- B5 — `createAlvaAgentSession()` registers one `alva` tool and resolves only
  `@alva/alpi-slim-skill` at a pinned stable version. Omitting a caller override
  cannot fall back to `@alva/skill`.
- B6 — ALPI vendors the reviewed embedded dispatch, Jagent embeds that exact
  ALPI bundle, and the Skill/eval repository records the resulting immutable
  artifact and binary provenance.

## 3. Findings

- `package.json` already has separate `./cli` and `./dispatch` exports, so a new
  package or runtime profile is unnecessary. The leverage point is to make the
  existing exports own separate orchestration.
- `src/cli/index.ts` currently calls the dispatcher exported from
  `dispatch.ts`. `dispatch()` chooses Full versus Agent from
  `DispatchRuntimeDeps.mode`; therefore changing the default alone would change
  the system CLI.
- `agentCommandDefinitions.ts` currently imports terminal definitions, and
  `dispatchAgentTarget()` converts Agent argv and calls `dispatchFull()`. Clean
  separation requires explicit embedded definitions plus a shared parsed
  command executor below both entry-specific parsers.
- Runtime differences such as local files, stdio, screenshots, and Broker
  output remain real, but they are execution capabilities rather than catalog
  selectors.
- ALPI's resolver currently defaults to `@alva/skill@latest` unless an exact
  Slim prerelease is passed. The runtime cannot claim one Skill until that
  fallback is removed and a stable staging artifact is pinned.
- No backend, database, proto, auth, or deployment contract changes are needed.

## 4. Change Specification

### Toolkit

- Keep `@alva-ai/toolkit/cli` on a terminal-only dispatcher with its current
  definitions, parser, help, runtime dependencies, and public behavior.
- Make `@alva-ai/toolkit/dispatch` an embedded-only dispatcher. Remove catalog
  selection from `DispatchRuntimeDeps`, Full fallback, and Agent-to-Full
  redispatch.
- Give the embedded catalog explicit flag and positional definitions instead
  of copying terminal definitions. Route both parsed command forms into shared
  internal execution handlers so HTTP and business logic remain single-source.
- Preserve the 94 embedded leaves and all previously approved Automation,
  Playbook, alert, portfolio, Signal, and Broker behavior.
- Keep package export names stable. `./cli` remains the system CLI entry;
  `./dispatch` remains the in-process ALPI entry.
- Update the embedded-dispatch README and this changelog. Terminal CLI docs do
  not change because its contract does not change.

### ALPI

- Vendor the exact reviewed Toolkit embedded runtime and verify its archive,
  source, inventory, and generated bundle provenance.
- Remove the `@alva/skill` resolver branch. Rename the session option to the
  generic `alvaSkillVersion`, default it to the pinned stable
  `@alva/alpi-slim-skill` release, and keep exact-version validation.
- Keep exactly one built-in `alva` tool and dispatch through the embedded
  Toolkit entry without a catalog-selection mode.
- Rebuild the Layer 3 bundle and update its authoritative Layer 3 documentation.

### Jagent and Skill/eval repository

- Pin the final ALPI commit, regenerate the embedded `@alva/pi` bundle and
  provenance, and rebuild the Jagent binary without hand-editing generated
  output.
- Publish one stable staging `@alva/alpi-slim-skill` artifact from an exact
  clean Skill commit, verify public readback, and record its version/source in
  the eval documentation.
- Update the eval launcher pins to the final Jagent binary and embedded bundle,
  then run one read-only live Layer 3 canary against the stable Skill.
- The existing public system-CLI Skill and immutable historical registry
  artifacts are outside this change and remain untouched.

### Compatibility, rollout, and failure handling

- System CLI: zero intentional behavior change. Any terminal inventory, help,
  parsing, or representative dispatch drift blocks the change.
- Embedded dispatch: intentionally breaking for callers that depended on Full
  fallback or catalog selection. Unsupported paths fail locally before API I/O.
- Skill resolution: missing, malformed, or non-canonical versions fail before
  session creation; omission selects the pinned stable Slim Skill and never the
  old coordinate.
- Rollout order: Toolkit source, stable staging Skill artifact, ALPI vendor and
  bundle, Jagent embed and binary, then Skill/eval pins. Git PR merge order
  remains Toolkit, ALPI, Jagent, Skills after all pins are finalized.
- Rollback is the previous ALPI/Jagent bundle. The system CLI and historical
  Skill remain independently deployable throughout.

### Core documentation impact

- `README.md`: embedded `./dispatch` is always the Alpi command surface; remove
  the mode-selection example and compatibility wording.
- ALPI Layer 3 Alva Agent documentation: record the single embedded dispatch
  and single Skill coordinate/default.
- Skills eval changelog: record stable artifact and final Toolkit/ALPI/Jagent
  provenance. System CLI documentation requires no semantic edit.

## 5. Verification Strategy

- **Affected components:** Toolkit terminal and embedded dispatch entries,
  catalog/parser/help boundaries, and shared execution handlers; ALPI Skill
  resolution, Alva tool adapter, vendor provenance, and Layer 3 bundle; Jagent
  embedded PI module; staging Skill package and eval pins.
- **Relevant dependents:** the packaged system `alva` CLI, ALPI Layer 3, Jagent
  PI adapter, and the Skills evaluation harness. Backend APIs and SDK resource
  consumers are unchanged.
- **Toolkit focused evidence:** tests must prove `./dispatch` is Slim without a
  mode, rejects terminal-only paths before I/O, and retains all 94 leaves.
  Terminal tests must compare the full command inventory/help and representative
  read, mutation, local-file, auth/config, and Broker behavior with the current
  baseline. Add an import-boundary test so the CLI entry cannot call the
  embedded dispatcher. Run `npm test`, `npm run typecheck`,
  `npm run format:check`, and `npm run build`.
- **ALPI focused evidence:** Skill resolver default/exact/error cases; one Alva
  tool; no dispatch mode; vendor archive/hash/inventory tests; Layer 3 bundle
  tests; `npm run check` and the offline Layer 3 build.
- **Jagent focused evidence:** canonical generated-bundle rebuild and exact pin
  tests, affected Go packages, `make lint-fix`, and `make test-pi PI_INSTALL=0`.
- **Skill/eval evidence:** alpkg dry-run and exact public readback for the stable
  artifact, structural Skill tests, full Node eval suite, and a read-only live
  Layer 3 canary proving the stable Skill path and single embedded Alva tool.
- **Escalation triggers:** any terminal CLI golden drift, unclassified embedded
  route, vendor/build nondeterminism, generated Jagent diff after canonical
  rebuild, or live canary mismatch blocks publishing and expands investigation
  to the owning component.
- **Full suite required:** yes for Toolkit because shared execution code moves;
  yes for the Skills Node suite because pins and launch contracts change. ALPI
  uses its repository-required check plus focused bundle tests; Jagent uses the
  canonical PI and affected-package suites.
- **E2E required:** one staging read-only Layer 3 canary. No backend local-stack
  E2E is required because no backend contract changes.

### Implementation Checklist

- [x] Separate Toolkit terminal and embedded entries; move shared behavior
      below their independent catalogs/parsers and add terminal zero-drift
      regressions.
- [ ] Publish and read back the stable staging Slim Skill from an exact clean
      Skills commit.
- [ ] Update ALPI to the single embedded dispatch and single pinned Skill,
      vendor the final Toolkit bytes, and rebuild/verify Layer 3.
- [ ] Pin final ALPI in Jagent, regenerate and verify the embedded PI bundle,
      then rebuild the exact binary.
- [ ] Update Skills eval provenance/pins, run the full verification matrix and
      staging canary, review diffs, commit each root cause separately, and push
      the four existing PR branches in dependency order.

## 6. Human Interaction

The user approved the design and requested completion without intermediate
checkpoints. No additional decision is pending.

## 7. Outcome

- Toolkit now publishes two independent entries. `./dispatch` always exposes
  the 94-leaf Alpi Alva catalog; `./cli` retains the terminal catalog and shell.
- The embedded entry no longer exposes a mode/profile selector, reads terminal
  definitions, or redispatches through the terminal parser. Both entries share
  only neutral parser mechanics, SDK resources, and execution handlers.
- The built `dispatch.js` exports only the embedded contract. The built
  `cli.js` contains no embedded catalog, help, or inventory.
- Embedded help and parsing expose the approved account, discovery/runtime,
  unified Automation, Playbook, alert, portfolio, and trading trees. Old paths
  and local-file flags are absent rather than aliased.
- Unified Automation commands orchestrate the existing product and producer
  resources, resolve run operations from the Automation id, and report partial
  two-record failures with both identifiers.
- Signal execution is dry-run by default and has no implicit execute-latest
  subscription flag. Shared trading accounts and read-only risk rules sit above
  the isolated Signal and Broker subtrees. Broker argv and order safety remain
  passthrough-compatible.
- The system CLI remains a supported independent product. Its existing tests,
  command inventory, help, local-file behavior, auth/config shell, and Broker
  output contract are unchanged.

Fresh verification:

- Toolkit: `npm run format:check`, full `npm test` (43 files, 810 tests),
  `npm run typecheck`, and `npm run build` passed.
- Focused boundary checks prove default embedded dispatch, terminal-only path
  rejection, explicit embedded definitions, no embedded dependencies in the
  system CLI path, and unchanged representative terminal dispatch.
- No database, proto, GraphQL, or migration artifact is required.

## 8. Remaining Tasks

Downstream integration remains:

1. Publish and read back the stable staging `@alva/alpi-slim-skill` artifact.
2. Vendor this exact Toolkit commit in ALPI, remove the old Skill fallback, and
   rebuild Layer 3.
3. Regenerate the Jagent embedded bundle/binary and update the Skills eval pins.
4. Run the read-only staging Layer 3 canary before merging the dependency chain.
