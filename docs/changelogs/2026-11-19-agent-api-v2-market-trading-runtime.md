# feat: market, trading, billing, functions and runtime resources on /api/v2

Primary record: alva-gateway/docs/changelogs/2026-11-19-agent-api-permissions.md
(M20, R16, D16; Appendices for M9, M12, M15/M19, M16/M17, M18). Transport:
`2026-11-19-agent-api-v2.md`. Wire contract: alva-gateway
`pkg/v2/api/testdata/v2_snapshot.golden` and the handlers in `pkg/v2/api/`.

## 1. Background and Current State

- `markets`, `credits`, `companyNews` and `x` called v1 GraphQL `/query`;
  `tradingPairs`, `portfolio`, `trading`, `functions`, `run`, `arraysJwt` and
  the broker CLI (`handleBroker`) called `/api/v1` REST.
- The transport (`_v2Request`, `_v2Pages`, `v2Path`, `collectAll`) and
  `AlvaId` exist; no resource had moved.

## 2. Behavior

- B1 markets: a ticker is the Asset `GET /assets/by-symbol/{T}?assetClass=US_STOCK`,
  else `NON_US_STOCK`; narrative, earnings calendar and report read
  `/assets/{id}/narrative|earnings-calendar|earnings`. Output as today; not
  found is `MARKETS_ENTITY_NOT_FOUND` / `MARKETS_EARNINGS_NOT_COVERED`; a
  missing narrative is `current: null, history: null`.
- B2 tradingPairs: every page of `GET /trading-pairs?q=` (500 per page), then
  today's normalization, filters, dedupe and limit.
- B3 companyNews: `POST /company-news-feeds`; `feed_id`/`cronjob_id` are the
  Automation and Cronjob IDs.
- B4 x: `/me/x-connection`, one page of `/me/x-following` and `/me/x-posts`;
  every edge's cursor is the page's next token; posts add `url`.
- B5 run: `POST /runs` (`workingDir` only with `code`), the v1 result rebuilt
  including the entitlement fields. arraysJwt: `/me/data-skills-token` and
  its `refresh`, rebuilt as Unix seconds and `SUBSCRIPTION_TIER_*`.
- B6 credits: `/me/wallet`; `items` reads one page of `/me/credit-entries`
  with the wallet totals and rebuilds the connection (op from the sign,
  source from the reason, the page token on the last edge).
- B7 functions: register/list on `/playbooks/{id}/functions`; delete and
  invoke find the function by name (`?name=`, once per resource and name) and
  use `/functions/{id}`; allowances on `/me/allowances`.
- B8 portfolio and trading: `/me/broker-accounts` (trading accounts are
  `provider != SNAPTRADE`), `/broker-accounts/{id}/snapshot|orders|activities|equity|trade-subscriptions`,
  `/trade-subscriptions/{id}/cancel`, `/me/risk-rules` (GET, PATCH). Embedded
  subscriptions and Playbook names are best effort, as v1 made them.
- B9 broker CLI: `POST /broker/invocations` `{argv, stdin}` → `{envelope,
exitCode}`; a failed request still prints the `network` envelope, exit 2.
- F1: `trading.execute` and `subscribe({executeLatest: true})` stay on
  `/api/v1` REST unchanged.

## 3. Decision

- D1: output keeps v1's units and names where v1 returned them: trex order
  status names (`partial`, `filled`) and lower-case sides in `trading`,
  equity `timestamp` in Unix seconds and `pnlPct` as a fraction
  (`pnlPercent / 100`), portfolio subscription `createdAt` in seconds. The
  mapping note said milliseconds for equity; trex returned seconds.
- D2: `trading.orders` refuses `source` (no v2 filter) and adds `origin`;
  `equityHistory` adds `range` and keeps `sinceMs`/`untilMs` by reading the
  smallest preset window holding `sinceMs` (months taken as 28 days) and
  filtering; `timeframe` other than `1D` (trex's only bucket) is refused.
- D3: `trading.subscribe` adds `signalSourceId`. Without it, `sourceFeed` is
  looked up among the caller's own automations, and only when
  `sourceUsername` is the caller (`GET /me`), so a same-named feed of another
  user is never copied; another user's feed needs the ID (no lookup by owner
  and name on /api/v2).
- D4: `trading.portfolio.equity` is null unless `valuationStatus` is
  `COMPLETE` (trex's rule); `portfolio.summary.totalValue` is the backend's.
- D5: removed fields /api/v2 does not serve: `PortfolioActivity.id`,
  `CreditWalletItem.extras` (adds `title`), `CreditAllowance.consumer_uid`.
- D6: `functions.register` refuses `run_as_user_id: "0"` (v1's clear); the
  CLI refuses `--clear-run-as` for functions and accepts any Account ID for
  `--run-as-service-account` there (`functionRunAsFlag`). At integration it
  reuses deploy's check, which the automation migration relaxed to Account
  IDs and which refuses `0`.
- D7: `updateRiskRules` rewrites the `trading_limits:write` refusal's message
  ("may only tighten") and keeps code, status and `requiredPermission`.
- D8: `src/resources/brokerAccounts.ts` holds the portfolio/trading wire
  types and readers both resources use.

## 4. Implementation

- `src/resources/{markets,tradingPairs,companyNews,x,run,arraysJwt,credits,functions,portfolio,trading,brokerAccounts}.ts`.
- `src/types.ts`: `AlvaId` on the moved IDs; `RunResponse` declares
  `stats.credits_used`, `error: null` and the entitlement fields;
  `SubscriptionTier` adds `MAX`; `CreditWalletItem` and `PortfolioActivity`
  as D5. `src/index.ts` exports `OrderOrigin`, `EquityRange`.
- `src/cli/dispatch.ts`: `handleBroker`; trading `--origin`, `--range`,
  `--signal-source-id`; functions take string IDs; help texts.
  `commandDefinitions.ts`, `embeddedCommandDefinitions.ts`: the new flags.
  `agentHelp.ts`: which account ID each Signal command takes.
- `test/fakeV2.ts`: a fake /api/v2 server (routes by method and path).

## 5. Verification

- Resource tests on the v2 wire: `test/resources/{markets,tradingPairs,companyNews,x,portfolio,trading}.test.ts`,
  `test/arraysJwt.test.ts`, the Credits/Run/Functions blocks of
  `test/resources/resources.test.ts`; CLI: `test/cli/{x,trading,companyNews}.test.ts`,
  `test/cli.test.ts` (broker, functions, credits, embedded portfolio).
- Mutations, each caught by a failing test and restored: no non-US fallback;
  peers default; trading pair market from the symbol; page size 50; edge
  start cursor; `pageSize` for `batchSize`; nullable `authorId`; `workingDir`
  with `entryPath`; entitlement fields on the wrong runs; expiry in ms; every
  credit edge with the token; `feedId` from the Playbook; grant source name;
  no function-ID cache; numeric allowance credits; `params_schema` default;
  `pnlPct` unscaled; upper-case side; `partially_filled`; SnapTrade as a
  trading account; broker exit fixed to 2; subscription `createdAt` in ms; no
  owner check before the name lookup; no one-month window.
- `npm run lint`, `npm run format:check`, `npm run typecheck`, `npm test`
  (66 files, 1,506 tests), `npm run build`: pass (2026-11-19). Not run against
  a live gateway (record 5.5 runs on the Linux nightly VM).

## 6. Human Decisions

- 2026-11-19 (primary record, section 6): `/api/v2`, D16 IDs with a Toolkit
  major version, output unchanged apart from IDs.
- 2026-11-19: follow the recommended designs and record the uncertain points.

## 7. Deviations and open points

- Kept on `/api/v1` REST (no v2 route): `trading.execute`,
  `trading.subscribe({executeLatest: true})`. Both take trex's numeric account
  ID (`alva broker accounts`), not the IDs `trading.accounts` now returns;
  the v1 executeLatest subscribe also takes a numeric Playbook ID. No
  `/query` call remains in these resources.
- `src/playbookRuntime.ts` (the browser UDF runtime) still calls
  `/api/v1/service/invoke` and `/service/functions` directly: /api/v2 sends no
  CORS allowance and treats a PBSV as a guest.
- The embedded `trading accounts` is the broker's list (trex IDs), while
  Signal subscriptions and `portfolio` take the IDs `portfolio accounts`
  lists; broker commands keep trex IDs (`--account`).
- Every broker command, reads included, now needs `trading:write`.
- `CHANGELOG.md` and the README "Resources" bullet gain one entry per
  resource; the resource migrations of the other domains add theirs beside.
