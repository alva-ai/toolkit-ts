# feat(thesis): preview directions and the return switch, and read Thesis returns

Local record. Primary record: alva-backend `docs/changelogs/2026-11-16-thesis-agent-return-preview.md` (behaviors B1–B10, decisions D1–D7).

## 1. Background and Current State

- `theses.assetCandidates` (`src/resources/theses.ts`) sends only `text` and
  reads the legacy `stance`.
- `--entity-stances` rejects `none`; create and update have no switch flag.
- `src/client.ts` builds errors from `error.code` and `error.message` only,
  dropping `details.domain` and `details.reason`.
- No command reads a Thesis return.

## 2. Problem Model and End-to-End Behavior

- **B1:** `asset-candidates` can classify known entities without discovery,
  on an Update with the Thesis id, and returns the full `direction` and the
  rule block.
- **B2:** create and update take `--track-return true|false`, sent only when
  given; `--entity-stances` accepts `none`.
- **B3:** errors expose `details.domain` and `details.reason`.
- **B4:** `alva thesis return --id <id> [--detail]` reads
  `ThesisPublication.thesisReturn` through GraphQL.
- Release: npm release and the sandbox pin before the skills release.
- Deferred (Occam): accepting COMMODITY candidates on the fallback path, as
  its own fix.

## 3. Research, Findings, and Architecture Decision

- **D1:** No rules in the client; it passes Backend results through.
- **D2:** Return reads reuse the existing Thesis publication GraphQL pattern
  (`src/resources/thesisReads.ts`).

## 4. Implementation Design

See the primary record section 4 (contracts, copy table, rollout) for this
repository's row of the impact table and its checklist step.

Occam pass on the code (2026-11-16): the raw `selectedEntityStances` and the
per-mention `direction` were dropped from `asset-candidates` results; the
Agent reads only `returnPreview` directions, and mentions serve identity only.
Thesis responses keep each entity's `direction` for readback.

## 5. Verification and E2E Design

See the primary record section 5 for this repository's tests. E2E Required: no.

## 6. Human Decisions and Interaction

See the primary record section 6.

## 7. Outcome and Evidence

See the primary record section 7 for this repository's verification results
and the publication links.

Review feedback: `thesisReturn` now rejects an Update without
`publishedAtMs` (non-null in the gateway schema), covered by a new test that
fails without the check. `npm test` 62 files / 1457 tests pass; `npm run
build` passes.

## 8. Remaining Work

See the primary record section 8 (STG release chain, public skill coupling,
PRD order).
