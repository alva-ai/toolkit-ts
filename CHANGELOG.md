# Changelog

Releases before 1.0.0 are listed under the repository's tags.

## 1.0.0 (unreleased)

1.0.0 moves the SDK and CLI to Alva's platform API, `/api/v2`, and exposes its
shapes as they are. CLIs and SDKs on 0.x keep working against `/api/v1`.
Migration notes: [README](README.md#migrating-from-0x-to-10).

### Breaking

- Outputs are the `/api/v2` API shapes. Every SDK result, and the CLI's JSON
  output (the default of commands without a human formatter, and `--json` on
  every command), is the JSON of the route the method calls: camelCase
  members, opaque string IDs (`thesis_0…`), `{items, nextPageToken}` pages,
  RFC 3339 times and decimal strings. The contract is the OpenAPI 3.1
  document served at
  [`GET /api/v2/openapi.json`](https://api-llm.prd.alva.ai/api/v2/openapi.json)
  and vendored as `openapi/alva-platform-v2.json`; the SDK's types are
  generated from it and exported (`Schema<'Thesis'>`, `components`, `paths`,
  `V2Query`). The CLI's human formatters are kept and read the `/api/v2`
  fields.
- Errors: an `AlvaError` from `/api/v2` carries the problem's `code`,
  `status`, `detail` (as `message`), `reason` (a public reason such as
  `IDEMPOTENCY_KEY_REUSED`, `PAGE_TOKEN_INVALID` or `INSUFFICIENT_CREDITS`;
  the `Problem` schema lists them), `type`
  (`https://alva.ai/problems/<reason or code>`), `requiredPermission`,
  `invalidParams` and `retryAfter`. One parser reads `/api/v2` problems and
  `/api/v1` errors. A route answer that is not a JSON object is
  `INVALID_RESPONSE` (502). The CLI's error JSON adds `reason` and `type`.
- Credentials: `/api/v2` methods take an API key. A client holding a
  `pbsvToken` or `viewer_token` is refused before anything is sent, with
  `CREDENTIAL_REQUIRED` (401): use `client.v1`, or the 0.36 browser bundle
  in a page.
- Browser: 1.x has no browser build. `dist/browser.global.js`
  (`@alva-ai/toolkit/browser`) is the published 0.36.0 bundle, unchanged, so
  unversioned unpkg URLs in published Playbook pages keep their 0.36
  behavior. Pin `https://unpkg.com/@alva-ai/toolkit@0.36/dist/browser.global.js`.
- Writes and retries: every POST and PATCH sends one `Idempotency-Key` per
  call, as an RFC 9651 string (`"<uuid>"`): the caller's `idempotencyKey`
  (or request ID) or a new UUID. A network error (also while a response
  body downloads), 409
  `IDEMPOTENCY_KEY_IN_USE`, 429 with a `Retry-After` of at most 30 s, and
  502, 503 and 504 are retried with the same key and body bytes: at most 3
  attempts within 60 s, waiting 0.5 s × 2^(n-1) ±20 % and at least
  `Retry-After`. 500, other 4xx and other 409s are not retried; neither is a
  timed-out or aborted attempt. GET and DELETE are retried the same way.

### Moved to `client.v1`

Methods without an `/api/v2` route keep their 0.x types, IDs and credentials
under `client.v1`, and move back when their route exists:

- `steward` (GraphQL `/query`), as `client.v1.steward`;
- `secrets.get` (the secret's value), as `client.v1.secrets.get`;
- `notifications.listFeed` by owner and name, as
  `client.v1.notifications.listFeed` (`notifications.list` takes the
  Automation ID);
- feed subscriptions by owner and name: `subscriptions.subscribeFeed` and
  `unsubscribeFeed`, and `alerts.enableAutomation` and `disableAutomation`,
  are `client.v1.subscriptions.subscribeFeed` and `unsubscribeFeed`;
- channel group subscriptions by numeric origin session
  (`channelGroupSubscriptions.context`, `list`, `subscribe`, `unsubscribe`;
  CLI `alert group`), as `client.v1.channelGroupSubscriptions`;
  `getGroupChatHistory` stays;
- `fs` with a PBSV or viewer token, or a public read without a credential,
  as `client.v1.fs` (the 0.x JSON and byte decoding);
- `trading.subscribe({ executeLatest: true })`, as
  `client.v1.trading.subscribe(params)` with v1's numeric IDs;
- Playbook and Skillhub discovery without an API key, as `client.v1.playbooks`
  and `client.v1.playbookSkills`;
- the `auth login` token exchange (`/api/v1/oauth/token`).

### Renamed and removed

- `trading.execute` is
  `trading.placeOrders(accountId, instruction, { idempotencyKey })`, on
  `POST /api/v2/broker-accounts/{accountId}/orders`.
- `asks.create()` returns the ask operation; `asks.wait(operation)` polls it
  (1, 2 and 4 s, then every 5 s, for at most 35 minutes); `alva ask` waits.
- `--since` takes an RFC 3339 time only (a number is refused);
  `--newer-than` stays removed.
- `getByIds([])` returns `[]` without a request; reads that return `null`
  for a missing resource do so only on 404 (403 is thrown).
- Renamed: `markets.earningsPeriods` is `earningsCalendar`,
  `credits.items` is `entries`, `portfolio.summary` is `snapshot`,
  `trading.equityHistory` is `equity`, `deploy.getRunStatus` is
  `getDispatch`, `notificationPreferences.list` is `get`,
  `alerts.historyAutomation` is `history`, `alerts.updatePreference` is
  `updatePreferences`, `theses.setArchived` is `archive` and `unarchive`,
  and `playbooks.setVisibility` is `update`.
- Removed: `trading.accounts` and `trading.portfolio` (use
  `portfolio.accounts` and `portfolio.snapshot`), `fs.rawWrite` (`fs.write`
  takes bytes), `follows.addToWatchlist` and `removeFromWatchlist` (use
  `followAssets` and `unfollowAssets` with Asset IDs), and the methods moved
  to `client.v1` (above). The 0.x request and response types are gone: use
  the generated `Schema<'…'>` and `V2Query<…>` types.
- New: `asks`, `markets.assetBySymbol`, `tradingPairs.list`,
  `theses.getByNumber` and `getVersionByNumber`, `playbooks.getBySlug`,
  `deploy.runStats`, the `schedules` Session Inbox methods
  (`listSession`, `putSession`, `pauseSession`, `resumeSession`,
  `deleteSession`), `follows.followAssets`, `unfollowAsset`,
  `unfollowAssets` and `followCounts`, `subscriptions.unsubscribe` and
  `notifications.list`.

### Per resource

Every resource takes and returns the `/api/v2` shapes; the changes by
resource:

#### Markets

- `markets.assetBySymbol(symbol, { assetClass })` returns the `Asset`;
  `narrative(assetId)`, `earningsCalendar(assetId)` (was
  `earningsPeriods(ticker)`) and
  `earnings(assetId, { fiscalYear, fiscalQuarter })` take its ID and return
  `AssetNarrative` (`latest`, `history`, `changes`), `EarningsCalendar` and
  `EarningsReport` (`preview`, `release`, `transcript`, `recap`, each with
  its `availability`). A
  narrative or report without coverage is the 404 problem; the empty context
  and the `MARKETS_*` codes are gone. `earnings` without a period reads the
  calendar's default one.
- The CLI keeps `--ticker` (the US listing, else the non-US one) and
  `--event` (selected from the calendar; `NOT_FOUND` when the calendar lacks
  it, never another quarter) and prints the `/api/v2` objects.

#### Trading pairs

- `tradingPairs.list(query)` returns one page of `GET /api/v2/trading-pairs`
  (exactly one of `q`, `symbol`, `base` with `instrumentType`, or
  `underlyingType`).
- `search` returns `TradingPair[]` (was `{ query, candidates, truncated }`)
  and `resolve` one `TradingPair`, still matched exactly and filtered by
  `market`, `instrumentType`, `underlyingType` and `quote`; `resolve` looks a
  complete pair up by its symbol. A pair's `symbol` is the canonical pair
  (was `tradingPair`), `base` the ticker (was `symbol`), `exchange` the
  market, `feeRate` a decimal string and `logo` the icon. The CLI prints the
  `/api/v2` fields; `--limit` cuts the list without a truncation note.

#### Company news

- `companyNews.create` takes a `CompanyNewsFeedConfig` (`initialLookbackHours`,
  `batchSize`; were `initial_lookback_hours`, `page_size`) and returns the
  `CompanyNewsFeed` (`id`, `cronjobId`; were `feed_id`, `cronjob_id`). The
  gateway validates the configuration (no client validator).

#### X

- `x.status()` returns the `XConnection`; `x.following(query)` and
  `x.posts(query)` take `{ pageSize, pageToken }` (were `{ first, after }`)
  and return `{ items, nextPageToken }` pages (no `edges`, `pageInfo` or
  `retrievedAt`); a post's `authorId` and `createdAt` are `null` when X
  reported none (were `''`). CLI `--limit` takes 1 to 100 and `--cursor` the
  `nextPageToken`.

#### Credits

- `credits.wallet()` returns the `Wallet` (`balance` and `todayUsed` as
  decimal strings, `balances` by grant; no `totalRemaining`).
- `credits.items(params)` is `credits.entries(query)`, returning a
  `CreditEntryList` page: a signed decimal `amount`, `reason` (was `op` and
  `source`), `automationId` (was `feedId`) and `occurredAt` (was
  `createdAtMs`); it no longer carries the wallet. The filters are the
  route's (`from`, `to`, `sessionId`, `playbookId`, `automationId`, `reason`,
  `direction`). `alva credits items` sends its window as RFC 3339 and
  `--after` takes the `nextPageToken` of the same window.

#### Arrays token

- `arraysJwt.ensure()` and `status()` return `DataSkillsTokenRefresh` and
  `DataSkillsToken`: `expiresAt` is RFC 3339 or `null` (was Unix seconds or
  0), `tier` is `FREE`, `PRO`, `MAX` or `null` (was `SUBSCRIPTION_TIER_*`),
  and `renewalNeeded` was `renewal_needed`. `alva whoami` reports the same
  object under `_meta.arrays_jwt`.

#### Run

- `run.execute(request, { idempotencyKey, timeoutMs })` takes a `RunRequest`
  (`code`, `entryPath`, `workingDir`, `args`, `maxHeapSizeMb`; were
  snake_case, with `timeout_ms` in the request) and returns the `Run`:
  `status` `SUCCEEDED` or `FAILED` (was `completed` or `failed`),
  `returnValue` (was `result`), `durationMs` and a decimal `creditsUsed`
  (were `stats`), `subscriptionRequired` and `entitlementFailure` (were
  `reject_reason`, `upgrade_url` and `entitlement_failure`).
- `alva run` prints the `Run` with `returnValue` decoded from its JSON text,
  as 0.x decoded `result`.

#### Functions and allowances

- Functions are addressed by their ID:
  `functions.register(playbookId, body)` and `list(playbookId, query)`
  return the `PlaybookFunction` and a `PlaybookFunctionList` page (find one
  with `{ name }`); `delete(functionId)`
  and `invoke(functionId, { parametersJson }, { idempotencyKey })` take the
  ID, and `invoke` returns the `FunctionInvocation` (`resultJson` as text,
  credits as decimal strings). The name cache and `{ function }` wrapper are
  gone.
- `getAllowance(playbookId)` returns the `Allowance` or `null`;
  `listAllowances(query)` an `AllowanceList` page;
  `createAllowance({ playbookId, credits })` the `Allowance`;
  `revokeAllowance(allowanceId)` deletes by ID. The CLI finds a function by
  `--function-name`, sends `--params` as written, and prints nothing for
  `delete` and `allowance revoke`.

#### Portfolio and trading

- One account ID: every method and CLI flag takes the BrokerAccount ID
  (`broker_account_0…`) that `portfolio.accounts` lists. `trading.accounts`
  is `portfolio.accounts({ modes })` with every mode but `READ_ONLY` (what
  `alva trading accounts` sends), and `trading.portfolio` is
  `portfolio.snapshot(accountId)` (one list, one snapshot).
- `portfolio.accounts(query)`, `snapshot(accountId)` (was `summary`) and
  `activities(accountId, query)` return `BrokerAccountList`,
  `PortfolioSnapshot` and `BrokerActivityList` (Money with decimal amounts,
  RFC 3339 times); the embedded subscriptions and Playbook names are gone
  (read `trading.subscriptions`).
- `trading.orders(accountId, query)` returns an `OrderList` page: `status`
  adds `EXPIRED` and `ERROR`, `positionEffect` is `OPEN`, `CLOSE` or `null`,
  and the filters are `origin` and the RFC 3339 `from` and `to` (no
  `source` or `since`). `trading.equity(accountId, { range })` (was
  `equityHistory`) returns the `EquitySeries`, whose points carry `equity`,
  `change` (against the previous point) and `changePercent`; the
  client-side window filter and `timeframe` are gone.
- `trading.placeOrders(accountId, instruction, { idempotencyKey })` executes
  an `OrderInstruction` (`ORDERS`, `ALLOCATE` or `PREDICT`; `dryRun`) and
  returns the `OrderExecution`. `subscribe(accountId, body, options)` takes a
  `CreateTradeSubscriptionBody` (`signalSourceId` is required; a feed is no
  longer found by owner and name), `unsubscribe(tradeSubscriptionId)`
  returns the stopped `TradeSubscription`, and `riskRules()` and
  `updateRiskRules(patch)` use `RiskRules` and a merge-patch
  `RiskRulesPatch` with decimal values.
- CLI: `trading execute` takes `--instruction` and `--idempotency-key` and
  refuses `--signal`, `--source-username` and `--source-feed`;
  `trading orders --since` takes RFC 3339 only; `trading equity-history`
  refuses `--timeframe`, `--since-ms` and `--until-ms`; embedded
  `trading accounts` and `trading risk-rules` read `/api/v2` instead of the
  broker.
- Broker: `alva broker … --account-id <BrokerAccount ID>` names the account
  as the invocation's `accountId`; the gateway refuses an argv `--account`
  and the `accounts` command (use `alva trading accounts`).

#### Theses

- Every method takes and returns the `/api/v2` schemas (`Thesis`,
  `ThesisVersion`, `NewThesis`, `ThesisUpdate`, `ThesisList`, ...); the 0.x
  snake_case shapes, the publication summaries and the response validators
  are gone.
- `create(body, { idempotencyKey })`; `update(id, body, { idempotencyKey })`
  is one `POST …/updates` that also sets `visibility` and `archived`, and
  absent members carry over instead of being cleared. `setArchived` is
  `archive(id, { expectedVersionId, note })` and `unarchive(...)`.
- `getVersion(versionId)` takes the Update's ID only; new
  `getByNumber(number)` and `getVersionByNumber(number, versionNumber)`.
- `list()` takes `assetId` (was `entityId`), `archived` (was `status`) and
  `pageSize`/`pageToken` (were `first`/`cursor`), and returns the
  `ThesisList` page without `scope`.
- `related()` throws reason `RELATED_THESES_GENERATING` (503, not retried)
  instead of answering `state: GENERATING`, and no other failure reads as
  generating. `signals()` returns the `SignalList` page (research state is
  `Thesis.research`).
- `setStarred()` returns `ThesisFollow`; `setSignalEnabled()` and
  `setVisibility(id, { visibility, confirmEndPaidRenewals })` return the
  `Thesis`.
- CLI `thesis`: JSON is the route's answer (no `unchanged` member: an
  identical Update returns `currentVersion.id` equal to
  `--expected-author-version-id`). `--entity-stances` takes
  `[{"assetId":"…","stance":"BEARISH"}]`; `--medias` takes
  `currentVersion.media` (`[{type, coverUrl, url}]`). `update --visibility`
  is optional; omitted `--title`, `--entity-ids` and `--medias` carry over.
  New `get --number`, `version get --number --version` (replacing
  `version get --id`), `archive --expected-author-version-id`, and
  `--confirm-end-paid-renewals` on `set-visibility` and `update`.

#### For You

- `forYou.list(query)` returns the `FeedEntryList` page and
  `theses(query)` the `ForYouItemList` page (`ranking` `THESIS_ONLY` by
  default); an item carries the recommended `version` and the current
  `thesis` apart. The `edges`/`pageInfo` connections, `exhausted`, `listId`
  and the parameter validators are gone. CLI `for-you list --newer-than` is
  an error naming the removal.

#### Feeds

- `feed.list(query)` returns `AutomationSummaryList`; `stop(id)` and
  `resume(id)` return the `Automation`, `delete(id)` returns `{}`, and
  `setVisibility(id, 'PUBLIC' | 'PRIVATE')` returns `AutomationVisibility`.
  `automation.list/stop/resume/delete/publish` return the same shapes.

#### Playbooks and Skillhub

- `playbooks.getByIds(ids)` returns `Playbook[]` (`[]` without a request for
  none); `listByOwner(owner, query)`, `listOwn(query)` and `trending(query)`
  return `PlaybookList` pages; `get({ id } | { ref })` is `null` only on 404
  (403 is thrown); new `getBySlug(owner, slug)`.
  `setVisibility({ name, visibility })` is `update(id, PlaybookPatch)` (the
  CLI keeps `set-visibility --name` and adds `--confirm-end-paid-renewals`).
  The agent-friendly `url`, `ref` and per-row `cursor` members are gone
  (`playbookUrl()` builds the web URL).
- `playbookSkills.list(query)` and `tags(query)` return one page, `get(id)`
  the `SkillDetail`, `file(id, path)` the `SkillFile`; the CLI reads every
  page. `parsePlaybookSkillId()` returns `{ owner, name }`.
- Keyless discovery moved to `client.v1.playbooks` (`trending`, `getByIds`,
  `listByOwner`, `get`) and `client.v1.playbookSkills` (`list`, `tags`,
  `get`, `file`) with their 0.x types; the CLI uses them when no API key is
  configured.

#### Release, comments, remix and SDK docs

- `release.feed(PublishAutomationBody)` returns `AutomationVersion` (no
  `feed_path`); `playbookDraft(NewDraft)` returns `Draft`;
  `playbook(playbookId, NewRelease)` returns `Release`. CLI `--feeds` takes
  `[{"automationId":"…","major":1}]`, and `--skill-id` an ID or
  `owner/name`.
- `comments.create(playbookId, NewComment)`, `pin(id)` and `unpin(id)`
  return the `Comment`. `remix.save(playbookId, parentIds)` returns the
  `Playbook`. `sdk.doc(name)`, `sdk.partitions(query)` (one page) and
  `sdk.partitionSummary(name)` return `SDKModule`, `SDKPartitionList` and
  `SDKPartitionDetail`.

#### Account

- `user.me()` returns `Me` (`planTier`, `messagingBindings`,
  `preferredMessagingApp`, `toolkitMinVersion`, `homePath`); CLI `whoami`
  and `user me` print it (`whoami` adds `_meta`). The `*_username`,
  `subscription_tier` and `active_im_provider` members are gone.
- `secrets.create` and `update({ name, value })` return the `Secret`
  (metadata), `list(query)` one `SecretList` page, `delete(secretId)` `{}`.
  CLI `secrets list` prints every page as `{items, nextPageToken: null}`;
  `secrets delete --name` finds the ID.
- `serviceAccount.create({ displayName })`, `list(query)`, `delete(id)`,
  `grant(id, { path, permission })` (`READ`, `WRITE`, `IMPORT`) and
  `revoke(id, grantId)` return `ServiceAccount`, `ServiceAccountList`,
  `ServiceAccountGrant` and `{}`.
- `feedback.submit(SubmitFeedbackRequest)` returns `Feedback`
  (`notionPageId`, `notionUrl` may be null); enums are upper case.
- `screenshot.capture(ScreenshotRequest)` returns the `Screenshot`
  (`contentType`, `contentBase64`), not bytes.

#### Notifications and alerts

- `notificationPreferences.get()` (was `list()`) and `update(patch)` use
  `NotificationPreferences` (`sessionCompleted`, null for the default); the
  `{key, enabled}` settings are gone. `alerts.preferences()` and
  `updatePreferences(patch)` (was `updatePreference`) return the same.
- `notifications.list(query)` reads `/me/notification-deliveries` by
  `automationId` (`NotificationDeliveryList`, statuses upper case), and so
  does `alerts.history(query)` (was `historyAutomation`). CLI
  `alert history --automation-id` uses it; `--automation owner/name` and
  `notification-history list-feed` keep `client.v1`. `--since` takes an RFC
  3339 time on both (it was Unix seconds).
- `subscriptions.followPlaybook` and `unfollowPlaybook(playbookId)` return
  `PlaybookFollow`, `follows(query)` and `list(query)` their pages,
  `subscribeBatch({ automationIds, channelId })` the `SubscribeResponse`,
  `unsubscribe(id)` and `unsubscribeBatch(automationIds)` the removed
  destinations. `alerts` delegates with the same shapes. CLI `alert list`
  reads the `NotificationSubscription` fields.
- `channelGroupSubscriptions.getGroupChatHistory(query)` takes
  `{ app, remoteChat, from, to }` (RFC 3339) and returns `GroupChatHistory`.

#### Files

- `fs.read({ path }, { range })` returns `{ data, contentType, contentRange }`
  (raw bytes; a file over 32 MiB needs a range);
  `write({ path, mode, mkdirParents }, bytes | string)` replaces `write`
  and `rawWrite` and returns `WriteResult`; `stat`, `readdir` and
  `readlink` return `FileInfo` (`sizeBytes`, `updatedAt`, `isDirectory`,
  `contentType`), `DirectoryListing` and `Symlink`; the other changes take
  the camelCase request bodies and return `{}`. CLI `fs read` prints UTF-8
  files as text.

#### Cronjobs and schedules

- `deploy.create(CreateCronjobBody)` (`entryPath`, `cronExpression`,
  `argsJson` as written, `runAsAccountId`), `update(id, UpdateCronjobBody)`
  (merge patch; `runAsAccountId: null` runs as the owner),
  `get`, `delete`, `pause`, `resume(id)` and `list(query)` return the
  `Cronjob` (absolute `entryPath`, upper-case `status`) and its pages;
  `trigger(id)` returns `{ dispatchId }`; `listRuns(id, query)` returns the
  `CronjobRunList` page and the stats are `runStats(id)`; `getRunStatus` is
  `getDispatch(dispatchId)` (`CronjobDispatch`, states `QUEUED`,
  `SUCCEEDED`, ...); `getRunLogs(runId)`. CLI: new `deploy run-stats`;
  `run-logs` needs only `--run-id`; `run-status --workflow-run-id` takes the
  `dispatchId`.
- `schedules`: the Channel schedules are `list` and `put(channelId, ...)`
  and `pause`, `resume`, `delete(scheduleId)`; the Session Inbox ones
  `listSession`, `putSession`, `pauseSession`, `resumeSession` and
  `deleteSession(id)`. They take `PutScheduleBody`
  (`rule: {kind: AT|EVERY|CRON, ...}`, `message`, `endsAt`) and return
  `Schedule` and `SessionSchedule`. The CLI keeps `--after`, `--every`,
  `--at`, `--cron` and `--name`.

#### Automations

- `automation.inspect(id)` returns the `Automation`,
  `update(id, PublishVersionBody)` the `AutomationVersion`,
  `delivery.get(id)` the `AutomationDelivery` and
  `delivery.update(id, DeliveryPatch)` the `Automation`. `stop`, `resume`
  and `delete` take the Automation ID (were `{ id }`), as `feed` does.
- The agent CLI's `automation pause`, `resume`, `update` and `delete`
  print `{ automationId, cronjobId, automation, producer }` with the
  `/api/v2` objects they changed (were `automation_id`, `cronjob_id` and a
  lower-case `status`); `delete` prints the IDs only.

#### Follows

- `follows.watchlist(query)` returns the `FollowedAssetList` page (the size
  is `followCounts()`), `followAssets(assetIds)` and
  `unfollowAssets(assetIds)` the `FollowAssetsResponse`;
  `searchProfiles(query)` and `profiles(query)` return `ProfileList` pages,
  `followProfile` and `unfollowProfile(profileId)` the `ProfileFollow`.
  `addToWatchlist` and `removeFromWatchlist` by ticker are gone: CLI
  `markets watchlist add|remove` resolves the tickers and refuses an
  unknown one before writing.

#### Asks

- New `asks.create(NewAsk, { idempotencyKey })`,
  `get(askOperationId, { signal })` and `wait(operation, { signal })`, and
  `alva ask` (above): `--json` prints the finished `AskOperation`,
  `--no-wait` the started one.
