# feat(thesis): send and read per-Thesis weights; read the allocation

Local record. The primary record is alva-backend
`docs/changelogs/2026-11-23-thesis-weights.md` (per-Thesis positions on the
Thesis return); its B/F/D IDs are used here.

## Change

- `ThesisEntityStance.weight` (a fraction, 0.4 is 40%, at most four decimals)
  on `create`, `update` and `--entity-stances`, only on a bullish or bearish
  stance; give one to every long or short or to none (B5, B10). Responses
  carry it on an Update published with weights.
- `create` and `update` fail with `INVALID_RESPONSE` when the response does not
  return the weights sent, saying the Update was published without them: a
  gateway that predates weights drops them (F5).
- `setArchived` (`alva thesis archive`, and unarchive) resends directions
  only: archiving keeps the current Update and unarchiving keeps its shares
  without restating them (B20), so a stale weight can never block either.
- `thesisReturn` reads `allocation` (the current target shares and cash) and
  each position's `weight` (B9); `alva thesis return --detail` shows them.
- Agent help describes weights and the allocation.

## Rollout

Release only after the alva-gateway change and its Backend run in production
(D13): the return query asks for `allocation` and `weight`, which an older
gateway rejects, failing every `alva thesis return`.

## Verification

`npx vitest run` (64 files, 1488 tests), `npx tsc --noEmit`, `npx eslint .`.
