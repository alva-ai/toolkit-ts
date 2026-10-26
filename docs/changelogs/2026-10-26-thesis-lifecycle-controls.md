# Add Thesis archive, bookmark, and Signal controls

## 1. Background and Current State

The Gateway already exposes Thesis archive/restore through the existing full
author-version update contract, bookmarks through setThesisStarred, and managed
Signal research through setThesisSignalEnabled. Toolkit 0.33.1 exposed none of
these operations to the SDK, terminal CLI, or embedded Agent command surface.

## 2. Problem Model and End-to-End Behavior

- B1: An authenticated owner can archive or restore a Thesis while preserving
  its current content and receiving the resulting archive state.
- B2: A viewer can add or remove a Thesis bookmark and receive the authoritative
  bookmark state and count.
- B3: A Thesis owner can enable or disable managed Signal research and receive
  the resulting research state.
- F1: A version conflict during archive/restore is surfaced by the existing
  Gateway error path; stale content is never silently overwritten.
- F2: GraphQL errors or malformed mutation payloads fail closed at the SDK.

## 3. Research, Findings, and Architecture Decision

The existing Gateway schema and handoff documentation are the authority for the
three mutations. Archive/restore requires the current title, body, entity IDs,
visibility, and expected author version, so the SDK reads the current Thesis
before issuing the existing REST update with archived=true or false. Bookmark
and Signal controls use the existing Gateway GraphQL mutations directly.

This keeps the change inside Toolkit and the public skill; no Gateway or data
migration is required. The SDK preserves decimal-string IDs and validates the
returned state before returning it.

## 4. Implementation Design

- Extend the Thesis resource with setArchived, setStarred, and setSignalEnabled.
- Add optional archive/version metadata to parsed Thesis responses and preserve
  paid visibility when carrying an existing Thesis through archive/restore.
- Add terminal and embedded commands: archive, restore, star, unstar, and
  set-signal-enabled.
- Document the commands and optimistic-concurrency behavior in the public skill.

## 5. Verification and E2E Design

Focused SDK tests cover the archive read/update payload, bookmark mutation,
Signal mutation, authoritative response validation, and CLI dispatch. Typecheck
and the focused Thesis test files are required. Full local E2E is not required
for this SDK/skill surface change.

## 6. Human Decisions and Interaction

Archive/restore use separate commands and require a caller-supplied request ID.
The SDK performs the current read so callers do not resend Thesis text manually.
Bookmarks are named star/unstar to match the Gateway contract. Signal control
uses an explicit enabled=true|false value.

## 7. Outcome and Evidence

Implemented SDK methods, terminal commands, embedded command routes, response
validation, and public skill documentation. Verified with:

- npm run typecheck
- npm test -- --run test/resources/theses.test.ts test/cli/theses.test.ts
  (76 tests passed)
- npm run build
- npm run lint
- npm run format:check
- node dist/cli.js thesis --help
- git diff --check

## 8. Remaining Work

No Gateway migration or local E2E is required. Publication remains subject to
the Toolkit and skills PR review and CI; production behavior still requires a
deployed Toolkit/Dispatch version and an authenticated runtime check.
