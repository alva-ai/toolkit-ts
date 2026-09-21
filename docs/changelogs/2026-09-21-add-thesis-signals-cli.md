# feat: add Thesis Signal history SDK and CLI

## 1. Background and Current State

Toolkit exposes Thesis lifecycle operations but cannot read published Thesis
Signals. Agents therefore cannot stay inside the required CLI boundary for
quoted-Thesis evidence questions.

## 2. Problem Model and End-to-End Behavior

- B1: `client.theses.signals(id, { first, cursor })` calls the authenticated
  Gateway REST endpoint and returns validated Signal evidence.
- B2: `alva thesis signals --id <id> [--first 1-50] [--cursor <cursor>]`
  works in terminal and embedded Agent profiles.
- B3: int64 identities remain decimal strings and pagination is explicit.
- F1: invalid IDs/page sizes fail before HTTP.
- F2: malformed, cross-Thesis or inconsistent cursor responses fail closed.
- B4: existing Thesis commands remain unchanged.

## 3. Research, Findings, and Architecture Decision

Extend the existing `ThesesResource` and command family instead of adding a
GraphQL client or a separate Signal namespace. Gateway owns REST-to-gRPC
translation and Backend owns authorization.

## 4. Implementation Design

Add public response types, strict response validation, one resource method,
terminal/embedded command definitions, dispatch and help. Core documentation
impact: CLI help and this changelog. No package dependency or config change.

## 5. Verification and E2E Design

- Affected components: Thesis resource, CLI dispatch, embedded command profile.
- Relevant dependent: Alva Skill docs in the companion update.
- Commands: `npm run lint:fix`; focused Vitest files for Thesis resource,
  CLI and embedded inventory; `npm run typecheck`; `npm run build`;
  `git diff --check`.
- Full suite required: no; change is bounded to one resource/command family.
- E2E required: no; deployed Gateway availability remains unverified.
- PR timing: after-verification.

## 6. Human Decisions and Interaction

The user requested the missing RESTful interface through the CLI.

## 7. Outcome and Evidence

Added the SDK method and `thesis signals` terminal/embedded command. Focused
verification passed: 80 tests, typecheck, build, lint-fix and diff check.

## 8. Remaining Work

Merge and deploy the Gateway REST PR before publishing this Toolkit command.
