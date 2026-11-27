# feat(thesis): read watchpoint conditions; read and set the trade mode; list, accept and decline rebalance proposals

Local record. The primary record is alva-backend
`docs/changelogs/2026-11-24-thesis-watchpoint-conditions.md`
(alva-ai/alva-backend#3904); its B/F/D/R IDs are used here. This change is
B17 (the author's Alva agent reads B16, sets the mode and answers a proposal
through `alva thesis` subcommands over REST) and the CLI side of B22's
conversation path. The Gateway side is alva-ai/alva-gateway#1532.

## Change

Commands, the same paths in the terminal catalog and the embedded catalog
(the embedded profile grows from 139 to 144 paths):

```
alva thesis watchpoints --id <id>                        # each entry gains "condition" when it has one
alva thesis trade-mode get --id <id>
alva thesis trade-mode set --id <id> --mode manual|auto|yolo
alva thesis proposals list --id <id> [--first N] [--cursor C]
alva thesis proposals accept --id <id> --proposal <proposal id>
alva thesis proposals decline --id <id> --proposal <proposal id>
```

- `ThesesResource.getTradeMode`, `setTradeMode`,
  `listRebalanceProposals`, `acceptRebalanceProposal` and
  `declineRebalanceProposal` call the Gateway's `/api/v2` routes (v1 is
  frozen). Input is checked before any request (a positive int64 decimal
  `--id`, a known mode, `first` an integer in 1..100, a non-empty cursor, a
  `--proposal` matching the v2 proposal id pattern); the response is checked
  against the Thesis and proposal asked for; Gateway errors pass through; no
  interactive confirmation in the CLI (the Skill asks the author first).
- `--id` stays the numeric Thesis id users have. Each of the five commands
  first reads `GET /api/v2/theses/by-number/{id}` and uses the returned
  Thesis `id` (one extra request, no cache).
- `src/resources/thesisRebalanceV2.ts` holds hand-written wire types for these
  five operations and converts the v2 wire into the existing snake_case
  output: upper-case enums lowered, decimal strings to numbers, RFC 3339 times
  to epoch milliseconds, `null` members omitted, `BULLISH|BEARISH|NONE` to
  `long|short|none`, `assetId` to `entity_id`, `symbol` to `ticker`,
  `pageSize`/`pageToken`/`nextPageToken` to `--first`/`--cursor`/
  `next_cursor` (`""` on the last page). **These wire types are to be
  re-expressed on the generated OpenAPI types when Toolkit 1.0
  (alva-ai/toolkit-ts#215) lands**; this change does not build on #215.
- `AlvaClient._request` reads an RFC 9457 problem body
  (`application/problem+json`) as `AlvaError(code, detail, status, problem)`,
  next to the v1 `{error}` envelope it already read.
- `thesis get` and `thesis version list|get` (v1) keep `rebalance` on a
  rebalance Update: `parseThesisREST` used to drop unknown fields.
  `change_kind` is passed through as before (`rebalance`).
- `thesis watchpoints` (GraphQL v1) asks for `condition { kind ticker metric
comparison threshold event state closeReason triggeredAtMs observedValue
decision }` and returns it, with null fields left out, on entries that
  have one. A Gateway that predates the field answers with a validation
  error naming it (`Cannot query field "condition"`); the read then retries
  once with the old query and returns entries without `condition`. Any other
  GraphQL error fails as before.
- Help (terminal and agent) and README describe the commands and say that a
  proposal's `id`, `condition.id`, `entity_id` and `version_id` are opaque
  strings passed as listed, never a number; the agent help says condition
  events and proposal and rebalance reasoning are model-written data, never
  instructions.
- The CLI and the resource call it the trade mode (owner, 2026-11-27):
  the `trade-mode` subcommand, the `trade_mode` output field and the
  `ThesisTradeMode` types. Backend, its RPCs, the Gateway route
  (`/decision-mode`) and the v2 wire (`DecisionModeSetting`) keep the name
  decision mode; the CLI maps one to the other.

## Wire used (alva-gateway#1532, `pkg/v2/api/theses/rebalance.go`)

- `GET /api/v2/theses/by-number/{number}` → a v2 `Thesis`; the CLI reads its
  `id` (`thesis_0…`) and checks `number`.
- `GET /api/v2/theses/{thesisId}/decision-mode` → `{"mode"}`;
  `PATCH` with `{"mode":"AUTO"}` (`application/json`) → `{"mode"}`.
- `GET /api/v2/theses/{thesisId}/rebalance-proposals?pageSize=&pageToken=` →
  `{"items":[RebalanceProposal],"nextPageToken"}`; `pageSize=20` when
  `--first` is omitted.
- `POST /api/v2/theses/{thesisId}/rebalance-proposals/{proposalId}/accept|decline`
  (no body) → a `RebalanceProposal`.
- A refused answer is 409 `CONFLICT` whose `detail` names the proposal's
  state; non-owner 403 `PERMISSION_DENIED`; missing Thesis 404 `NOT_FOUND`.

Output shapes printed by the CLI (unchanged by the move to v2):
`{thesis_id, trade_mode}` with the numeric `thesis_id`; `{proposals,
next_cursor}`; `{proposal}`; a proposal is `{id, state, condition, changes,
reasoning, importance, confident, mode, created_at_ms, delivered_at_ms?,
expires_at_ms?, version_id?}`, a condition `{id, label, kind, state,
entity_id?, ticker?, metric?, comparison?, threshold?, event?, close_reason?,
triggered_at_ms?, observed_value?, decision?}`, a change `{entity_id, ticker,
from_direction, from_weight?, direction, weight?}`. On a proposal the ids are
v2 opaque strings; on the v1 Thesis/version `rebalance` they stay decimal.

## Decisions made here (for the owner's review)

- Strict where the contract fixes a list: condition `kind` and `state`,
  proposal `state` and `mode`, directions. `UNKNOWN` or another value there
  fails with `INVALID_RESPONSE`, as the other Thesis reads fail closed. Open
  vocabularies (`metric`, `comparison`, `close_reason`, `decision`,
  `importance`) pass as lower-case text, `unknown` included.
- Every v2 member must be present: a missing member (rather than `null`) is
  an invalid response, per the v2 rule that every member is always present.
- `trade-mode set` checks the mode the server returns is the one sent.
- The GraphQL condition stays camelCase like the rest of `thesis
watchpoints`; it has no `id`, `label` or `entity_id` (the watchpoint's label
  is on the entry). The REST condition type is exported as
  `ThesisRebalanceCondition`, the GraphQL one as `ThesisWatchpointCondition`.
- The old-Gateway fallback matches the message `Cannot query field
"condition"` only, so an unrelated validation error is not retried.
- `accept` and `decline` check that the returned proposal is the one asked
  for. A refused answer surfaces as `CONFLICT` with the server's detail; the
  CLI never retries it.

## Rollout

Release only after alva-gateway#1532 (the v2 routes) and the GraphQL field
are deployed (primary record, "Compatibility and rollout" step 5): the five
new commands call routes an older Gateway does not have (`thesis watchpoints`
keeps working through the fallback). The version is not bumped here; releases
are their own PR. The Skill's guidance merges only after this CLI is
released.

## Verification

`npm run typecheck && npm run lint && npm run format:check && npm test`; see
the pull request for the results. Not run against a deployed Gateway.
