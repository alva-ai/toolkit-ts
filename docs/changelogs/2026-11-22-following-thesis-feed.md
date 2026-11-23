# feat(follows): read followed profiles' Thesis Updates with a cursor

Local record. The primary record is alva-backend `docs/changelogs/2026-11-22-following-thesis-feed.md`.

## What changes here

- **CLI command.** `alva people follows theses [--cursor <next_cursor>]`, in the terminal and embedded trees (one path, as the repo requires).
  - It calls `GET /api/v1/me/following/theses` with `first=100`. Agents page with `next_cursor`, so the largest page keeps the calls few.
  - It prints `{items: [{thesis, author}], next_cursor, has_more}`. Without `--cursor` it reads the last 24 hours.
- **SDK.** `client.follows.theses({ cursor, first })` validates the page:
  - each `thesis` through the REST thesis validator (`parseThesisREST`, now exported from `theses.ts` and reused by the Update list);
  - `author` as `{kind: user|person, username?, slug?, display_name}` or null;
  - a non-empty `next_cursor` and a boolean `has_more`.
  - Anything else is `INVALID_RESPONSE`.
- **`change_kind` on REST theses.** The REST thesis type now keeps `change_kind` (`initial` | `material`) when the server sends it. The routine needs it to tell a first publication from an Update, and `thesis get` and the Update list pass it through too. The change is additive.
- **Docs and inventory.** Help text in `dispatch.ts` and `agentHelp.ts` and the README command list cover the new command. The embedded leaf inventory test now counts 137 leaves, with `people follows theses` among them.

## Verification

- `npx vitest run`: 62 files, 1474 tests pass. The new tests in `test/cli/follows.test.ts` run for both trees:
  - the request (`first=100`, cursor passthrough) and the parsed page;
  - a page without `next_cursor`, with an invalid thesis, or with an invalid author kind → `INVALID_RESPONSE`.
- `npx tsc --noEmit`, `npm run lint`, and `npx prettier --check` on the changed files pass.
