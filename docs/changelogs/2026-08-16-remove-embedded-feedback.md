# refactor: remove feedback from the embedded Alpi dispatch

## 1. Background

The dedicated `@alva-ai/toolkit/dispatch` catalog introduced by #161 included
`feedback submit`. Feedback is an operator-facing system CLI capability, not a
runtime operation needed by the Alpi Alva Agent.

## 2. End-to-End Behavior

- Embedded dispatch no longer advertises or parses `feedback submit`.
- The embedded inventory contains exactly 93 unique command leaves.
- The packaged system `alva` CLI retains its feedback command, help, parser,
  resource client, and execution behavior.
- Unsupported embedded feedback input fails locally before API I/O.

## 3. Findings

- Embedded and terminal catalogs are independent, so the removal belongs only
  in `embeddedCommandDefinitions.ts` and `agentHelp.ts`.
- Shared feedback resources and terminal execution handlers remain required by
  the system CLI and must not be removed.
- ALPI currently carries the previous 94-leaf dispatch as a vendored build.
  The approved integration replaces that copy with an exact npm dependency so
  Layer 3 is rebuilt from the same published Toolkit package used by CI.

## 4. Change Specification

- Delete the embedded `feedback submit` route and embedded help entry.
- Document the embedded omission and system CLI preservation in the README.
- Add regressions proving the embedded inventory is 93, embedded parsing
  rejects feedback, and terminal parsing continues to accept it.

### Required ALPI follow-up

No ALPI code is changed by this PR. After this Toolkit PR is merged:

1. Publish `@alva-ai/toolkit@0.25.0` from the resulting clean Toolkit `main`.
2. Pin ALPI's package and lockfile to exact `0.25.0`, import Toolkit and
   `@alva-ai/toolkit/dispatch` through normal npm resolution, and remove the
   vendored Toolkit files, aliases, provenance manifest, and vendor-only tests.
3. Change ALPI's Slim inventory assertions from 94 to 93.
4. Remove the `feedback submit` probe from
   `ext/adapters/jagent/scripts/run-alva-slim-smoke.ts` and its expected
   local-rejection coverage.
5. Rebuild Layer 3 from the locked npm package, verify its metafile resolves
   Toolkit from `node_modules`, and run ALPI's required checks, Layer 3 tests,
   and Slim smoke coverage.

## 5. Verification Strategy

- Focused embedded profile tests cover exact inventory, parser rejection, and
  terminal preservation.
- The full Toolkit suite protects shared execution and system CLI behavior.
- Formatting, typecheck, and build validate source and package entries.
- No live E2E, database migration, or backend change is required. Downstream
  ALPI/Jagent smoke runs occur after the npm dependency migration.

## 6. Implementation Checklist

- [x] Remove embedded feedback definition and help.
- [x] Preserve and test terminal feedback parsing.
- [x] Update README and add exact inventory coverage.
- [x] Run focused and full Toolkit verification.
- [ ] Publish Toolkit 0.25.0 and migrate ALPI to its exact npm dependency.

## 7. Outcome

`@alva-ai/toolkit/dispatch` now exposes 93 command leaves and rejects feedback.
The system CLI remains unchanged and continues to expose feedback.

Verification passed with the focused 13-test Agent profile, the full 810-test
Toolkit suite, formatting, typecheck, and build.

## 8. Remaining Work

Apply the five ALPI npm-integration steps in section 4, then update Jagent's
embedded ALPI bundle through its normal provenance-preserving workflow.
