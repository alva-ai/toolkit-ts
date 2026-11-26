# feat: social, automation, files and account resources on /api/v2

Primary record: alva-gateway/docs/changelogs/2026-11-19-agent-api-permissions.md
(D10, D16, R16, 4.6 M20, Appendices D, E, G, H). Transport:
[2026-11-19-agent-api-v2.md](2026-11-19-agent-api-v2.md). Wire contract:
alva-gateway `pkg/v2/api/testdata/v2_snapshot.golden` and the handlers in
`pkg/v2/api/{social,channel,automation,files,account}` (branch `agent-api-v2`).

## 1. Background and Current State

- The resources below called `/api/v1` REST and, for follows, schedules and
  automation delivery, v1 GraphQL `/query`: `follows`, `subscriptions`,
  `channelGroupSubscriptions`, `automation`, `deploy`, `schedules`,
  `steward`, `alerts`, `fs`, `screenshot`, `user`, `secrets`,
  `serviceAccount`, `feedback`, `notificationPreferences`, `notifications`.
- The gateway serves their domains on `/api/v2` (M11 social, M13
  automation, M14 channel, M15 files, M16 account), except the gaps listed
  in section 7.

## 2. Behavior

- B1: each moved method calls `/api/v2` through `_v2Request`/`_v2Pages` and
  rebuilds today's output; IDs are the D16 strings the responses carry
  (`AlvaId`), and the CLI passes ID flags unchanged.
- B2 (fs): an API-key client calls `/api/v2/fs`; a client holding a
  `pbsvToken` or `viewer_token`, or no credential, keeps `/api/v1/fs`.
  BASE64 content is returned as bytes, UTF8 content parsed as JSON or as
  text; writes send UTF8 or BASE64 content.
- B3 (deploy): cronjob output keeps its home-relative `path` (the caller's
  username is read once per client), lower-case `status`, parsed `args` and
  `run_as_user_id` `"0"` for the owner; `"0"` on update is `runAsOwner`.
  `trigger` returns the dispatch ID as `workflow_run_id`; `getRunStatus`
  reads it and refuses one of another cronjob (404); runs and states keep
  v1's names.
- B4 (automation, schedules): inspect, version publishing and alert delivery
  on `/api/v2/automations`; `"0"` in `alvaChannelIds` is the caller's Agent
  channel. Schedules pause, resume and delete by the ID their name finds;
  the Agent channel comes from `/api/v2/me/channels?kind=AGENT`.
- B5 (follows): symbols resolve through `/api/v2/assets/by-symbol` (the
  primary listing, or the kind's listing markets); add is one write whose
  `changed` flags split added and unchanged; remove deletes per Asset.
  Profiles are addressed by Profile ID.
- B6 (subscriptions): playbook follows resolve the Playbook by slug; alert
  rows keep their v1 shape (agent channel as `"0"`) and gain their
  subscription `id`; unsubscribe-batch deletes every destination of the
  named Automations and reports each ID `UNSUBSCRIBED`.
- B7 (account): `/api/v2/me`, notification preferences, secrets (metadata;
  delete by name finds the ID), service accounts (Account IDs; `grant`
  returns the grant, `revoke` takes its ID) and feedback (upper-case
  enums).
- F1: calls without a route keep their transport (section 7).

## 3. Decisions

- D1: fs chooses its door by credential (B2). The browser bundle and the
  Playbook runtime read files with a PBSV or viewer token, which `/api/v2`
  treats as a guest and serves without CORS; agents and the CLI use API
  keys. All fs methods follow the one rule.
- D2: the caller's username for path rebuilding comes from one cached
  `GET /api/v2/me` per client (`client.user._username()`), retried after a
  failure.
- D3: a kind-restricted ticker lookup tries the kind's listing markets in
  order (stock and ETF: US, then non-US; crypto: Binance spot, Hyperliquid
  spot, Binance perpetual) and keeps the first Asset of that kind. Without a
  kind the primary listing wins, as `ResolveListing` decides; the v1
  `FAILED_PRECONDITION` (ambiguous symbol) no longer occurs.
- D4: `serviceAccount.revoke` takes the grant ID. The v1 revoke-by-path the
  record kept cannot take an Account ID, and the grant route has no list to
  find one; granting the same pair again returns the same grant ID.
- D5: v1's `"0"` sentinel for the Agent channel stays where it was output
  (`channel_id` of alerts) and accepted (`alvaChannelIds`,
  `subscribeBatch` `channelId`).
- D6: `unsubscribeBatch` reports every requested ID `UNSUBSCRIBED`;
  telling a malformed ID apart would need parsing it (D16).
- D7: `ProfileRefParams.kind` is optional and deprecated: the Profile ID
  names the kind; a given kind is still validated.
- D8: schedule lifecycle and the Agent channel answer `NOT_FOUND` when the
  name or channel is missing; malformed schedule responses are
  `INVALID_RESPONSE` (502).

## 4. Implementation

- `src/base64.ts`: runtime-independent base64 (the CLI's encoder moved
  here, plus a strict decoder).
- `src/resources/{fs,screenshot,user,notificationPreferences,secrets,
serviceAccount,feedback,deploy,automation,schedules,follows,subscriptions,
channelGroupSubscriptions,alerts}.ts`; `src/types.ts` (AlvaId fields,
  `FsMeta`, `ServiceAccountGrant`, `ServiceAccountRevokeRequest`).
- `src/cli/dispatch.ts`, `embeddedDispatch.ts`, command catalogs and help:
  `requireIdFlag`; `service-account revoke --grant-id`; `people follows`
  without `--kind`; `--run-as-service-account` refuses `0`.
- `test/helpers/v2Client.ts`: a client whose `/api/v2` transport answers
  from a route table and whose `_request` fails the test.

## 5. Verification

- New or rewritten tests: `test/base64.test.ts`;
  `test/resources/{fs,screenshot,user,notificationPreferences,secrets,
serviceAccount,feedback,deploy,automation,schedules,follows,subscriptions,
channelGroupSubscriptions}.test.ts`; `test/cli/follows.test.ts`; the
  deploy, schedule, automation, alert, subscription and service-account
  cases of `test/cli.test.ts`.
- Mutations, each caught by a failing test and restored: user plan tier not
  lower-cased; the username cache keeping a failure; secrets `mustExist`
  inverted and delete without the not-found guard; grant permission not
  upper-cased; the fs door ignoring a missing API key; `mod_time` not
  floored; rawWrite sending UTF8; base64 double padding; notification
  preference keys checked with `in`; feedback without the Notion fallback;
  screenshot not decoded; cronjob path not home-relative; `runAsOwner`
  never sent; QUEUED mapped to `queued`; getRunStatus without the cronjob
  check; deploy list `next_cursor` undefined; `/me` read on every call;
  inspect emitting a null `cronjob_id`; delivery `isEnabled` with `&&`;
  the `"0"` alias skipped; `triggerRun` dropped; `until` sent instead of
  `endsAt`; fractional semantic instants accepted; schedule lifecycle
  without NOT_FOUND; Agent channel without `kind=AGENT`; embedded producer
  ID accepted when not a string; batch alert `--channel-id` numeric-only;
  follow writes counting every Asset as changed (add and remove); the kind
  ignored; every lookup error read as NOT_FOUND; a null `followedAt` as NaN;
  a USER handle as slug; a duplicated Asset written twice; the agent
  channel `channel_id` left undefined; unsubscribe-batch deleting other
  Automations; the `"0"` alias sent to the server; `playbook_path` from the
  request; the group history window not converted; its role not
  lower-cased. One equivalent mutant (a redundant `Math.floor` before
  `new Date`) led to removing that code.
- `npx tsc --noEmit`, `npx eslint src test`, `npx prettier --check .`,
  `npx vitest run` (71 files, 1,502 tests) and `npx tsup` pass
  (2026-11-19). Tests ran with `fetch` disabled, so no case reaches a
  network.

## 6. Human Decisions

- 2026-11-19 (primary record, section 6): D16 IDs with a clean switch and a
  Toolkit major version; public output unchanged apart from IDs.
- 2026-11-19: follow the recommended designs and record the uncertain points
  (sections 3 and 7).

## 7. Deviations, gaps and open points

Calls that keep their transport:

- `steward` (every method) stays on v1 GraphQL `/query` (blocks M21: Backend
  must write D16 IDs into Session Inbox events and add one RPC for the
  publish saga).
- `notifications.listFeed`, `subscriptions.subscribeFeed` and
  `unsubscribeFeed` (and `alerts.historyAutomation`, `enableAutomation`,
  `disableAutomation`) keep v1 REST: `/api/v2` has no Automation lookup by
  owner and name. Their output keeps v1's numeric IDs; `alert enable
--automation` keeps a numeric `--channel-id`.
- `secrets.get` keeps `GET /api/v1/secrets/{name}`: `/api/v2` never returns a
  secret value.
- `channelGroupSubscriptions` `context`, `list`, `subscribe`, `unsubscribe`
  (CLI `alert group`) keep v1 REST: they name the group by the numeric origin
  session the sandbox holds, and `/api/v2` takes a Session ID. Their
  `--automation-ids` is a numeric feed ID, which 1.0 no longer prints
  anywhere else, so `alert group enable|disable` works only with IDs from
  `alert group list` until the sandbox receives Session IDs.
- `fs` for PBSV, viewer-token and anonymous clients keeps `/api/v1/fs` (D1).
- `automation.list`, `stop`, `resume`, `delete` and `publish` delegate to
  `feed` and `release`, which move in the content change; the embedded
  `automation create` flow needs both.

Integration notes:

- The content change adds its own username helper for `feed_path`; one of
  the two should go (done at integration: `client.user._username()`).
- `release feed --cronjob-id` and `FeedReleaseRequest.cronjob_id` changed
  here exactly as in the content change, so both merge cleanly.
- `package.json` stays at 0.36.0 (`scripts/release.sh major` bumps it).
