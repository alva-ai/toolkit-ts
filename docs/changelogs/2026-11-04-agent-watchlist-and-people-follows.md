# Agent manages the ticker watchlist and people follows

## 1. Background and Current State

A Feed App user asked Alva to add the tickers they hold to their watchlist.
Alva replied that it could not change the App's list. Product semantics: a
ticker is added to the watchlist, a user or person is followed, and a Thesis is
bookmarked (already Toolkit `thesis star|unstar`). The App writes the watchlist
through Gateway GraphQL `followTickers` / `unfollowTickers` (the Gateway stores
watchlist entries as ticker follows; up to 50 per atomic batch) and people
follows through `followProfile` / `unfollowProfile` (`USER` = Alva user,
`PERSON` = curated person). Agents only reach the playbook follow
(`alva subscriptions follow-playbook`) and Thesis bookmarks; Toolkit has no
command for the watchlist or people follows, so the Agent truthfully refuses.

Toolkit already calls Gateway GraphQL `/query` with the caller's API key for
several user-owned reads and writes (X, schedules, credits, automation
delivery). Gateway exposes exact ticker lookup (`market.entity(input:{ticker})`,
exact ticker plus share-class variant, ambiguity fails closed), entity follow
state (`Entity.viewerState.isFollowed`), the viewer watchlist
(`viewer.marketWatchlist`), profile search (`profiles(input:{query, kind})`),
and the viewer following list (`viewer.followingProfiles`).

## 2. Behavior

- B1: The Agent can add 1-50 tickers to, or remove them from, the watchlist in
  one command. Tickers are resolved by exact symbol; the change then runs as one
  atomic Gateway batch.
- B2: The result separates changed tickers, tickers already in the requested
  state, and tickers that could not be resolved (not found or ambiguous), so the
  Agent can report each group truthfully.
- B3: The Agent can list the watchlist one page at a time.
- B4: The Agent can search public profiles (users and people), then follow or
  unfollow one profile by `kind` + `id`, and list the profiles it follows.
- B5: Terminal CLI and embedded Dispatch expose identical behavior.
- F1: No identity override; Gateway derives the user from the API key.
- F2: Upstream errors (auth, unavailable, rate limit) propagate as typed errors;
  a failed resolution never becomes an empty success, and no mutation is sent
  when nothing resolved.
- F3: Only lookup outcomes `NOT_FOUND` and `FAILED_PRECONDITION` (ambiguous)
  are reported per ticker; any other lookup error fails the whole command
  before writing.
- F4: When Gateway hides the watchlist state (`viewerState: null` for a
  playbook-scoped viewer or group guest), the command fails with
  `PERMISSION_DENIED` before writing; it never reads hidden state as absent.
- B6: Remove sends every resolved ticker, including ones not in the
  watchlist (reported as `unchanged`), because the Backend records each
  removal as a suppression that keeps holdings sync from adding it later. Add
  sends only tickers not yet in the watchlist.

## 3. Decision

- D1: Toolkit-only. Reuse existing Gateway GraphQL; no Gateway, Backend, or
  schema change. Rejected: new Gateway REST routes (duplicate the GraphQL
  contract the App already uses).
- D2: Ticker symbols, not entity IDs, are the Agent input; resolution reuses
  Gateway exact lookup, never fuzzy search. Optional `--kind` disambiguates.
- D3: Profiles are addressed by `kind` + numeric `id` from search or list
  results. The Agent picks an exact match or asks the user.
- D4: Terminal commands sit beside `subscriptions follow-playbook`. Embedded
  commands follow the Slim tree: `markets watchlist ...` and `people ...`.
- D5: User-facing names follow product semantics: tickers use watchlist
  add/remove (`added` / `removed` result groups), people use follow/unfollow.
  Only the Gateway mutation names keep "follow".

## 4. Implementation design

`src/resources/follows.ts` (`client.follows`):

- `addToWatchlist({tickers, kind?})` / `removeFromWatchlist(...)`: normalize
  (trim, uppercase, dedupe, 1-50), resolve each ticker with
  `market.entity(input:{ticker, kind})` (bounded concurrency), read
  `viewerState.isFollowed`, then call `followTickers` / `unfollowTickers` with
  the resolved entity IDs. Returns `{added|removed, unchanged, unresolved}`.
- `watchlist({first?, after?})`: `viewer.marketWatchlist`, `first` 1-100;
  entries carry `addedAtMs`.
- `searchProfiles({query, kind?, first?})`, `followProfile({kind, id})`,
  `unfollowProfile({kind, id})`, `profiles({kind?, first?, after?})`; `first`
  1-50. Profiles are normalized to `{kind, id, displayName, username|slug,
xHandle, followersCount, following}`.

| Terminal                                               | Embedded                   |
| ------------------------------------------------------ | -------------------------- |
| `subscriptions watchlist-add --tickers --kind`         | `markets watchlist add`    |
| `subscriptions watchlist-remove --tickers --kind`      | `markets watchlist remove` |
| `subscriptions watchlist --limit --cursor`             | `markets watchlist list`   |
| `subscriptions search-profiles --query --kind --limit` | `people search`            |
| `subscriptions follow-profile --kind --id`             | `people follows follow`    |
| `subscriptions unfollow-profile --kind --id`           | `people follows unfollow`  |
| `subscriptions profiles --kind --limit --cursor`       | `people follows list`      |

Checklist:

- [x] Resource, client getter, exports.
- [x] Terminal and embedded commands, help text.
- [x] Resource and CLI contract tests.
- [x] Skill guidance (public/skills) for routing and reporting.

## 5. Verification

`npm test`, `npm run typecheck`, `npm run lint`, `npm run format:check`,
`npm run build`. Tests drive real resource requests through both dispatch paths
with mocked `_request`: normalization, mixed resolved/unresolved/unchanged,
no-mutation when nothing resolved, ambiguous lookup, propagated upstream
errors, invalid argv rejected before any request.

## 6. Human decisions

The user asked for ticker and user follows in the same request, then set the
product semantics: ticker = add to watchlist, user = follow, Thesis = bookmark
(D5).

## 7. Current verification

Codex review (`codex review --commit`) found two removal defects, both
confirmed against Backend `mutateManualFollows` /
`TestManualUnfollowBlocksAllLaterAutomaticImports` and Gateway
`marketEntityViewerState`; fixed as B6 and F4 with tests. The skills commit
review found no defects.

PR review (gemini): an omitted Person `xHandle` now reads as null (fixed with
a test); `Object.hasOwn` kept because the package targets Node >=18 / ES2022.

`npm ci` from the lockfile, then `npm test` (62 files, 1426 tests),
`npm run typecheck`, `npm run lint`, `npm run format:check` and `npm run build`
passed. New coverage: 22 resource cases and 30 CLI cases (15 per dispatch
path), plus the Slim leaf inventory (131 -> 138). `node dist/cli.js
subscriptions --help` shows the new subcommands. Requests are mocked; no live
Gateway, STG, or PRD call was made.

## 8. Remaining work

- R1: The live API-key path to `followTickers` / `followProfile` is inferred
  from existing Toolkit GraphQL commands, not exercised against STG.
- R2: Release chain: Toolkit npm release, then sdk-monorepo Toolkit pin and
  Dispatch version for the embedded agent, then the Skill release. Until the
  Sandbox CLI includes these commands, the Agent still cannot follow.
- Skill guidance: public/skills
  docs/changelogs/2026-11-04-watchlist-and-people-follows.md.
