# feat: add For You Thesis recommendation SDK and CLI

## 1. Background and Current State

`alva for-you list` reads `viewer.forYou`, the chronological `FeedEntry`
stream. The For You screen in the product reads `viewer.thesisRecommendations`,
a ranked Thesis stream that Gateway has exposed since 2026-09-28
(`recommendation_vnext.graphql`, resolver `ListForYouItems`). Toolkit and the
vendored SDK have zero references to it, so an agent asked "what is on my For
You screen" answers from a different stream than the human is looking at.

## 2. Problem Model and End-to-End Behavior

- B1: `client.forYou.theses({ first, after })` returns one validated
  `ThesisRecommendationPage`.
- B2: `alva for-you theses [--limit 1-10] [--cursor <cursor>]` works in the
  terminal and embedded Agent profiles.
- B3: `first` is rejected above 10 client-side because Gateway silently caps it
  at 10; int64 identities stay decimal strings and paging stays explicit.
- B4: `exhausted` and `scanLimited` are returned so the caller can tell "pool
  ended" from "this page hit the server scan budget".
- B5: `alva for-you list` keeps its exact behaviour, flags and output.
- F1: invalid page size or empty cursor fails before any request.
- F2: a partial GraphQL `errors` array fails closed even when `data` is
  present, and an absent `viewer.thesisRecommendations` is a 502 naming the
  field rather than an empty page.
- F3: a page whose `hasNextPage` disagrees with `nextCursor`, whose `edges` and
  `items` disagree in length or item key, or whose publication is missing a
  required field fails closed.
- F4: an empty page with `hasNextPage: true` is accepted, because `endCursor`
  advances past scanned references that current visibility hides.

## 3. Research, Findings, and Architecture Decision

This is not a data-source swap for `for-you list`, for four independent
reasons:

- The node type differs. `ThesisRecommendation { itemKey, publication }`
  carries a Thesis author version; `FeedEntry` carries actions, presentation,
  tickers, media and sources. The field sets barely overlap.
- The stream is a ranked, slot-mixed browsing session, not a time series. The
  Backend policy interleaves Direct/Related/Platform pools behind a Redis pager
  with a 30-minute TTL; refreshing issues a new `listId`. There is no
  `newerThan` on `ThesisRecommendationInput`.
- A read-time cooldown withholds publications the viewer saw within 24 hours or
  opened within 7 days. That window overlaps "the past day" almost exactly, so
  a window read is "recommended and recent", never "every publication in the
  window".
- The stream is Thesis-only. The Backend `oneof` has a `feed_entry` branch but
  only ever sets `thesis`, so it is not a superset of `for-you list`.

Decision: a sibling command on the existing resource, not a flag on `list` and
not a new namespace. Gateway and Backend need no change.

Exposure is caller-driven: the resolver forwards `pendingEvents` and
`seenItemKeys` only when supplied, and exposure is otherwise recorded by the
`recordContentFeedback` mutation. The SDK therefore sends neither and never
exposes that mutation, so a Toolkit read cannot consume the reader's own feed.
A test asserts the query string contains none of those names.

`isRead` is deliberately not selected: Gateway documents it as null for
non-human callers.

## 4. Implementation Design

Add public response types, `validateForYouThesesParams`, the
`ToolkitForYouTheses` query, a page validator tuned to this stream's real
`pageInfo` semantics, and one resource method. Factor the GraphQL envelope
handling shared by `list` and `theses` into `graphqlViewerField` so both fail
closed identically and the 502 names the missing field. Wire terminal and
embedded command definitions, dispatch and help. No dependency or config
change.

## 5. Verification and E2E Design

- Affected components: For You resource, CLI dispatch, help, embedded command
  profile and leaf inventory.
- Relevant dependent: the Alva Skill Brief procedure, which still claims the
  For You read covers a whole publication window. It does not cover one on this
  stream; that text change is in a separate repository and follows this PR.
- Commands: `npm run lint:fix`; focused Vitest for the For You resource and the
  embedded command profile; full Vitest; `npm run typecheck`; `npm run build`;
  `git diff --check`.
- Full suite required: yes; the embedded profile asserts an exact leaf count.
- E2E required: no; this reads a deployed Gateway field with no writes.
- PR timing: after-verification.

## 6. Human Decisions and Interaction

The user asked why `alva for-you list` does not show what the For You screen
shows, then asked whether the new stream can simply be filtered to everything
published in the past day. Filtering is cheap — the scan budget resets per page
call and the whole platform publishes only 19-73 Thesis versions a day — but it
cannot be complete, because of the cooldown, because pool admission is a
recommendation decision rather than a time decision, and because a refreshed
session is not reproducible. Given that, the user chose option A: expose the
ranked stream as its own command and do not make it carry a
window-completeness promise. Option B (a new Backend "theses published by the
people I follow in this window" read, which no RPC provides today) was not
taken.

Two latent defects were reported and are out of scope here: Gateway fails a
whole `thesisRecommendations` page with a 500 if Backend ever emits the
`feed_entry` branch, because the publication converter rejects a nil Thesis
author; and the Skill's coverage claim above.

## 7. Outcome and Evidence

Added `client.forYou.theses` and the `for-you theses` terminal/embedded
command. Verification passed: 1096 tests across 52 files (136 in the For You
file), typecheck, build, lint-fix and diff check.

## 8. Remaining Work

Publish this Toolkit version first. Then, in a separate PR against the SDK
monorepo, bump the vendored Toolkit gitlink and Dispatch version, and reword
the Skill Brief procedure in both the EN and CN `references/steward.md` so it
states that the Thesis read covers the recommendation pool rather than a whole
time window.
