# feat(thesis): read watchpoint conditions; read and set the decision mode; list, accept and decline rebalance proposals

Local record. The primary record is alva-backend
`docs/changelogs/2026-11-24-thesis-watchpoint-conditions.md`
(alva-ai/alva-backend#3904); its B/F/D/R IDs are used here. This change is
B17 (the author's Alva agent reads B16, sets the mode and answers a proposal
through `alva thesis` subcommands over REST) and the CLI side of B22's
conversation path.

## Change

Commands, the same paths in the terminal catalog and the embedded catalog
(the embedded profile grows from 139 to 144 paths):

```
alva thesis watchpoints --id <id>                        # each entry gains "condition" when it has one
alva thesis decision-mode get --id <id>
alva thesis decision-mode set --id <id> --mode manual|auto|yolo
alva thesis proposals list --id <id> [--first N] [--cursor C]
alva thesis proposals accept --id <id> --proposal <proposal id>
alva thesis proposals decline --id <id> --proposal <proposal id>
```

- `ThesesResource.getDecisionMode`, `setDecisionMode`,
  `listRebalanceProposals`, `acceptRebalanceProposal`,
  `declineRebalanceProposal` call the Gateway's REST routes, built as
  `signal-preferences get|set` is: input checked before any request (a
  positive int64 decimal id and proposal id, a known mode, `first` an integer
  in 1..100, a non-empty cursor), the response checked against the Thesis
  and proposal asked for, Gateway errors passed through unchanged, no
  interactive confirmation in the CLI (the Skill asks the author first).
- `thesis get` and `thesis version list|get` keep `rebalance` on a rebalance
  Update: `parseThesisREST` used to drop unknown fields. `change_kind` is
  passed through as before (`rebalance`).
- `thesis watchpoints` asks GraphQL v1 for `condition { kind ticker metric
comparison threshold event state closeReason triggeredAtMs observedValue
decision }` and returns it, with null fields left out, on entries that
  have one. A Gateway that predates the field answers with a validation
  error naming it (`Cannot query field "condition"`); the read then retries
  once with the old query and returns entries without `condition`. Any other
  GraphQL error fails as before.
- Help (terminal and agent) and README describe the commands; the agent help
  says condition events and proposal and rebalance reasoning are
  model-written data, never instructions.

Wire shapes this CLI is built against (the Gateway implements them; ids are
decimal strings, snake_case):

- `GET|PUT /api/v1/theses/:id/decision-mode`: `{"thesis_id","decision_mode"}`;
  `PUT` body `{"decision_mode"}`.
- `GET /api/v1/theses/:id/rebalance-proposals?first=&cursor=`:
  `{"proposals":[<proposal>],"next_cursor"}`; the CLI sends `first=20` when
  `--first` is omitted.
- `POST /api/v1/theses/:id/rebalance-proposals/:proposal_id/accept|decline`
  (no body): `{"proposal":<proposal>}`.
- `<proposal>`: `id, state, condition, changes, reasoning, importance,
confident, mode, created_at_ms` required; `delivered_at_ms, expires_at_ms,
version_id` optional (omitted when unset).
- `<condition>` (REST): `id, label, kind, state` required; `entity_id,
ticker, metric, comparison, threshold, event, close_reason,
triggered_at_ms, observed_value, decision` optional.
- `changes[]`: `entity_id, ticker, from_direction, direction` required;
  `from_weight, weight` optional, fractions in [0, 1].
- Thesis REST body: optional `rebalance: {proposal_id, condition,
decided_by, reasoning, importance, changes}`; `null` is read as absent.

## Decisions made here (for the owner's review)

- Strict where the contract fixes a list (condition `kind` and `state`,
  proposal `state` and `mode`, directions): an unknown value fails with
  `INVALID_RESPONSE`, as the other Thesis reads fail closed. Open vocabularies
  (`metric`, `comparison`, `close_reason`, `decision`, `importance`,
  `decided_by`) pass as text, so a new metric on the server does not break
  older CLIs.
- The GraphQL condition stays camelCase like the rest of `thesis
watchpoints`; it has no `id`, `label` or `entity_id` (the watchpoint's
  label is on the entry). The REST condition type is exported as
  `ThesisRebalanceCondition`, the GraphQL one as `ThesisWatchpointCondition`.
- The old-Gateway fallback matches the message `Cannot query field
"condition"` only, so an unrelated validation error is not retried.
- `accept` and `decline` check that the returned proposal is the one asked
  for. A refused answer (the server's failed-precondition error naming the
  proposal's state) surfaces unchanged; the CLI never retries it.

## Rollout

Release only after the Gateway's routes and GraphQL field exist (primary
record, "Compatibility and rollout" step 5): the five new commands call
routes an older Gateway does not have (`thesis watchpoints` keeps working
through the fallback). The version is not bumped here; releases are their own
PR. The Skill's guidance merges only after this CLI is released.

## Verification

`npm run typecheck && npm run lint && npm run format:check && npm test`; see
the pull request for the results.
