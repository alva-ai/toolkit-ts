# fix(for-you): help must permit a caller's own page budget

## 1. Background and Current State

`for-you theses` help says `exhausted` is "the only stop condition". That
sentence was written against one failure: a reader stopping at the first old
`publishedAtMs`, or at `scanLimited`, and silently dropping recommendations it
should have paged into. Both of those are real, and the help should keep
forbidding them.

It also, read literally, forbids the caller from ever stopping early for its
own reasons — and the first consumer to adopt the command cannot obey it. The
ALPI steward's Daily Brief reads For You once per occurrence inside one wake.
Measured on production, the eligible Direct pool for four active users is 825,
563, 737 and 723 publications, of which 11, 8, 4 and 9 were published in the
last 24 hours; `ListDirectTheses` has no `published_at` floor and the mixer's
`ScanBudget` resets per page, so `exhausted` means walking the whole pool. At
ten per page that is 56 to 83 calls, before Related and Platform, to surface a
single-digit number of relevant items — past both the 30-minute cursor TTL and
the steward's own wake budget.

So the Skill has to stop early, and current help leaves it no compliant way to
do that. A Skill instruction that contradicts live help is worse than either
one alone: `SKILL.md` principle 1 makes current help authoritative for command
details, so the agent is told to obey two rules that cannot both hold.

## 2. Problem Model and End-to-End Behavior

- B1: help now separates two different things. `exhausted` is "the only signal
  that the stream has ended" — unchanged in force against `publishedAtMs`,
  `scanLimited` and empty pages, all of which still must not end a read.
- B2: stopping on a page budget of the caller's own is explicitly allowed, with
  the reason a bounded job needs it: the pool is every eligible publication,
  not a recent window.
- B3: the obligation that comes with it is stated in the same breath — the
  caller then holds a partial stream and must say so rather than present it as
  all there was. Permission without that clause would license the exact
  misreport the original sentence was guarding against.
- F1: no behavioural change. No flag, request, response, validator or exit code
  moves; this is help text in the two profiles plus its test.

## 3. Research, Findings, and Architecture Decision

**The bug is a universal quantifier, not the rule underneath it.** "Only stop
condition" conflates "nothing remains to read" with "I am done reading". The
first is a property of the stream and `exhausted` is indeed its only witness.
The second is a decision the caller makes, and no server flag can make it. Once
the two are named separately, the guard against `scanLimited` and stale
`publishedAtMs` keeps its full strength — those are false claims about the
stream — while a budget, which claims nothing about the stream, stops being
collateral damage.

**The alternative was to scope the conflict inside the consumer,** by having
the Skill say that help governs command syntax while the Brief's procedure
governs how much it reads. That resolves nothing: an agent reading an absolute
sentence in live help does not know it was meant narrowly, and the Skill would
be asking it to discount the source its own precedence rule ranks highest. The
sentence that is wrong is the one to fix.

**A server-side `publishedAfterMs` was the other option** — pushing a time
floor into `ThesisRecommendationInput` and `ListDirectTheses` would cut the
pool from 825 to 11 and make `exhausted` reachable in one or two pages. It is
the better long-term shape and is not ruled out here, but it is a Gateway and
Backend change; this one is a help-text correction that is needed either way,
because a bounded caller can always hit its budget before the floor empties.

## 4. Implementation Design

One sentence replaced and one added, in both help copies: `AGENT_COMMAND_HELP`
in `src/cli/agentHelp.ts` (embedded profile) and `COMMAND_HELP` in
`src/cli/dispatch.ts` (terminal profile). They are separate strings serving
separate profiles, which is why the existing test asserts through `dispatch`
under both.

## 5. Verification and E2E Design

- Commands: `npx vitest run` (1103/1103, 52 files), `npm run typecheck`,
  `npm run lint`, `npm run build`.
- The help test now pins the split explicitly: `only signal that the stream has
ended`, `more remains, so keep paging`, `budget of your own is allowed`, and
  `hold a partial stream and must say so`.
- Probed by deleting only the new permission sentence and leaving everything
  else in place — the likelier future edit than a full revert. Two tests went
  red, one per profile, and reversing the deletion returned them to green.
  Assertion phrases were chosen to sit within a single line of the template
  literal; a phrase spanning a line break fails on the newline, which reads as
  missing help text rather than as a badly written matcher.
- E2E required: no. Help text only; no request is issued on any help path and
  the test asserts the transport was never called.
