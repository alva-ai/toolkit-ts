# refactor: type following-feed authors as followed users

Local record. Primary record: alva-backend `docs/changelogs/2026-11-23-following-feed-user-follows-only.md` (design, evidence and decisions). Revises `2026-11-22-following-thesis-feed.md`.

## Change

- `FollowingThesisAuthor` (`src/resources/follows.ts`) is `{kind: 'user'; username: string; display_name: string}`. The `person` kind and `slug` are gone: Persons cannot be followed since the 2026-11-13 curated-Person decision, and the feed reads USER follows only. The validator now requires `kind: 'user'` and `username`; an author of any other shape is `INVALID_RESPONSE`, as an unknown kind already was.
- README: `people follows theses` lists Updates of the users the caller follows; the curated-person lag explanation is replaced by imported Theses, the case that remains.
- Compatibility: the gateway always sends `kind: "user"` with `username` (alva-gateway `docs/changelogs/2026-11-23-following-feed-user-follows-only.md`), before and after its change, because no Person follow exists. SDK callers lose the optional `slug` field of an unreleased (beta-only) type.

## Verification

- `npx vitest run`: 63 files, 1483 tests pass. The changed refusal test fails against the previous validator (it accepts a Person author and an author without `username`).
- `npm run typecheck`, `npm run lint`, `npm run build`, `npx prettier --check` on the changed files: pass.

## Remaining Work

- Ships with the next toolkit release (beta or stable).
