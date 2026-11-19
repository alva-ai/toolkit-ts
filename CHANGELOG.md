# Changelog

Releases before 1.0.0 are listed under the repository's tags.

## 1.0.0 (unreleased)

1.0.0 moves the SDK and CLI from `/api/v1` and GraphQL to the platform API,
`/api/v2`. CLIs and SDKs on 0.x keep working against `/api/v1`. Public
methods, CLI commands and output keep their shape apart from the changes
below. Migration notes: [README](README.md#migrating-from-0x-to-10).

### Breaking

- IDs are opaque strings (`AlvaId`) in the platform format (`task_0…`);
  numeric IDs are no longer returned or accepted. The calls listed under
  "Still on /api/v1" keep their 0.x IDs.
- Errors: an `/api/v2` failure is an `AlvaError` with the problem's `code`
  and `status` (`INVALID_ARGUMENT` 400, `UNAUTHENTICATED` 401,
  `INSUFFICIENT_PERMISSION`, `CREDENTIAL_NOT_ACCEPTED` and
  `PERMISSION_DENIED` 403, `NOT_FOUND` 404, `CONFLICT` 409,
  `REQUEST_TOO_LARGE` 413, `RATE_LIMITED` 429, `INTERNAL` 500,
  `UNAVAILABLE` 503, `DEADLINE_EXCEEDED` 504) and its detail as `message`.
  `details` is undefined, so backend reasons such as
  `THESIS_RETURN_LAST_LEG` are no longer reported. Codes that change: a
  failed precondition is `CONFLICT` 409 (was `FAILED_PRECONDITION` 412), an
  existing name with another configuration is `CONFLICT` (was
  `ALREADY_EXISTS`), and a malformed response is `INVALID_RESPONSE` 502
  (was `GRAPHQL_ERROR`, `GRAPHQL_EMPTY_RESPONSE` or
  `GRAPHQL_INVALID_RESPONSE`; `steward` keeps the GraphQL codes).
- Permissions: every `/api/v2` route requires one permission of the
  credential and refuses with `INSUFFICIENT_PERMISSION`, naming it in
  `requiredPermission`. Calls that rebuild paths or check ownership read the
  caller's username from `GET /api/v2/me`, which needs `social:read`
  (`release.feed`, own-Playbook lookups, `deploy` paths, `trading.subscribe`
  by feed name). Every broker command, reads included, needs
  `trading:write`.
- Browser credentials: `/api/v2` accepts only API keys and sends no CORS
  headers. A client whose requests carry a `pbsvToken` or `viewer_token`, or
  no credential, keeps `/api/v1` for `fs` and for Playbook and Skillhub
  discovery; every other resource calls `/api/v2` and needs an API key.

#### Content

- Theses (`client.theses`, `alva thesis`): Thesis, version, asset, Signal and
  profile IDs are platform IDs. `author_ref` is the author's Profile ID;
  `version_archived` is no longer returned. `update` sets a visibility that
  differs from the current one before the Update; it first refuses
  (`CONFLICT`) a stale `expected_author_version_id`, and an archived Thesis
  without `archived: false`. On an archived Thesis, `archived: false` first
  unarchives it (an Update of its current content), then publishes the
  Update; `archived: true` is refused (use `setArchived`). Signal entries
  carry the page's `next_cursor` on the last entry only, `feed_entry_id` is
  the Signal ID, and evidence excerpts never report omitted text. Asset
  candidates may have kind `COMMODITY` or `UNKNOWN`.
- Thesis reads (`list`, `related`, `thesisReturn`, `watchpoints`):
  `publication.playbookId` is the Playbook ID and differs from `thesisId`;
  `node.playbookId` and `thesisId` are the Thesis ID. Edges carry the page's
  `nextCursor` on the last edge only. A Thesis without a readable
  publication is not listed. Related is `GENERATING` or `READY` (a failed
  preparation reads as an empty `READY`). `ticker` resolves through the asset
  catalog, so tickers are no longer ambiguous; `person` and `user` must
  match a profile handle exactly. A watchpoint origin may be `unknown`.
- For You (`client.forYou`, `alva for-you`): entry and feed IDs are platform
  IDs; `major.id` is empty, ticker `logoUrl` empty and `sentiment` null.
  `newerThan` (`--newer-than`) is refused: read the first page again.
  `theses` returns an empty `listId` and `scanLimited: false`; an expired
  list is `CONFLICT`.
- Playbooks, comments, remix, release, Skillhub, SDK docs and feeds
  (`client.playbooks`, `comments`, `remix`, `release`, `playbookSkills`,
  `sdk`, `feed`): Playbook, comment, automation (feed), cronjob, draft and
  skill-owner IDs are platform IDs. `release.feed` takes a Cronjob ID and
  returns an Automation ID; `playbook_version_id` of a draft is its Draft ID.
  Skill `creator_uid` is the owner's Profile ID (null for platform skills);
  a comment's `creator.id` is a Profile ID. Paged rows carry the page cursor
  on the last row only. Without an API key (keyless, or a browser Playbook's
  PBSV token), discovery (`trending`, `getByIds`, `listByOwner`, `get`,
  Skillhub) still reads the `/api/v1` catalog, whose IDs are 0.x IDs.
  Leaving `paid` while subscriptions renew is `CONFLICT`.

#### Automation

- `deploy`: `Cronjob`, `CronjobRun` and their params take string IDs;
  `workflow_run_id` is the dispatch ID; `getRunStatus` checks that the
  dispatch belongs to `cronjob_id`; a paused trigger is 409 `CONFLICT`;
  `CronjobRunsListResponse.next_cursor` is an opaque string and
  `next_cursor_sort_at` is gone.
- `automation` (`inspect`, `update`, `delivery`) and `schedules`: string
  Automation, Cronjob and Channel IDs; `AgentScheduleTarget.channelId` no
  longer takes a number; schedule response errors are `INVALID_RESPONSE`.
  `automation list`, `stop`, `resume`, `delete` and `publish` take and return
  Automation IDs through `feed` and `release`.

#### Files and runtime

- `fs`, `screenshot`: API-key clients call `/api/v2`; a client holding a
  `pbsvToken` or `viewer_token`, or none, keeps `/api/v1/fs`. `FsStat` and
  `FsEntry` type `mod_time` as Unix seconds (as the wire always sent it);
  `readlink` is typed `{ target_path }`, as the wire always was.
- `run.execute` posts `/api/v2/runs` and returns the same result;
  `working_dir` is sent only with `code` (with `entry_path` the server
  ignored it).
- `arraysJwt.status` and `ensure` read `/api/v2/me/data-skills-token`;
  `tier` may be `SUBSCRIPTION_TIER_MAX`.

#### Account and billing

- `user.me().id`, `feedback.submit().feedback_id` and secret IDs are strings.
- `serviceAccount`: Account IDs; `grant` returns `ServiceAccountGrant`;
  `revoke` takes `{ id, grant_id }` (CLI `service-account revoke --grant-id`)
  instead of the path and permission.
- `credits.wallet` and `items` read `/api/v2/me/wallet` and
  `/api/v2/me/credit-entries`. Entry `id`, `sessionId`, `playbookId` and
  `feedId` (the feed's Automation) are platform IDs, and `sessionId` filters
  by a Session ID. `extras` is gone; entries add `title`. Entries have no
  cursor of their own: the last edge carries the page's `endCursor`, the
  others `''`. `source` is `other` for reasons 0.x had no name for.
- `functions`: `playbook_id` params and every `id`/`playbook_id` are
  platform IDs, and `run_as_user_id` is a service account's Account ID.
  `register` can no longer clear `run_as_user_id` (`"0"`, CLI
  `--clear-run-as`): `/api/v2` has no way to do so. `delete` and `invoke`
  look the function up by name first (`NOT_FOUND` when there is none).
  Allowances drop `consumer_uid` (always the caller).

#### Social

- `follows`: Asset and Profile IDs; `ProfileRefParams.kind` is optional and
  deprecated; `removeFromWatchlist` removes one Asset at a time; ambiguous
  symbols resolve to their primary listing instead of `FAILED_PRECONDITION`.
- `subscriptions`, `alerts`: string IDs; `PlaybookFollow` loses `id` and
  `user_id`; `PlaybookFollowItem.cursor`, `PushSubscription.cursor` and
  `PushSubscriptionListResponse.total_count` are gone; `unsubscribeBatch`
  reports every ID `UNSUBSCRIBED` and no longer reports `INVALID_ID`.

#### Market

- `markets.narrative`, `earningsPeriods` and `earnings` read
  `/api/v2/assets` (a ticker is a US stock listing, else a non-US one).
  Failures other than the `MARKETS_*` not-found codes carry `/api/v2`
  problem codes.
- `tradingPairs.search` and `resolve` read `/api/v2/trading-pairs`; the
  candidates are unchanged.
- `companyNews.create`: `feed_id` is an Automation ID and `cronjob_id` a
  Cronjob ID (were decimal int64 strings).
- `x.following` and `x.posts`: account and post `id` and `authorId` are
  platform IDs (were X snowflakes). Every edge's `cursor` is the page's next
  token.

#### Trading

- `portfolio` and `trading` read `/api/v2/me/broker-accounts` and
  `/api/v2/broker-accounts/{accountId}/…`. Account, subscription, order
  subscription and Playbook IDs are platform IDs (were `trex:7`/
  `snaptrade:10` or decimal strings), and every `accountId` parameter takes
  them. `trading.execute` and `subscribe({executeLatest: true})` stay on
  `/api/v1` and take trex's numeric account ID, which `alva broker accounts`
  lists.
- `portfolio.accounts`: `institution` is the broker's name and `exchange` its
  code; a provider that cannot be read fails the call (`UNAVAILABLE`) instead
  of returning a partial list. `portfolio.activities`: records have no `id`,
  and `kind` is the business kind (`TRADE`, `DIVIDEND`, `INTEREST`, `FEE`,
  `TRANSFER`, `OTHER`; was `ORDER`/`BROKER_ACTIVITY`).
- `trading.orders`: `origin` replaces the `source` filter, which is refused;
  `source` in the output is the origin, and dry runs are no longer listed.
- `trading.equityHistory`: without `range`, the smallest window holding
  `sinceMs` is read and points outside `sinceMs`/`untilMs` are dropped;
  `timeframe` other than `1D` is refused.
- `trading.subscribe`: without `signalSourceId`, `sourceUsername`/
  `sourceFeed` must name one of the caller's own feeds.
- `trading.updateRiskRules` sends a merge patch; raising or lifting a limit
  with a credential that may only tighten it fails with
  `INSUFFICIENT_PERMISSION`, `requiredPermission` `trading_limits:write`.
- The broker CLI (`alva broker`, `alva trading broker`) posts
  `/api/v2/broker/invocations`; envelopes and exit codes are unchanged.

#### CLI

- ID flags take platform IDs unchanged, without a numeric check, in the
  terminal and embedded catalogs (except the commands under "Still on
  /api/v1").
- `people follows follow|unfollow` no longer needs `--kind`.
- `--run-as-service-account` takes an Account ID and refuses an empty value
  and `0` (`deploy`, `functions register`).
- Removed: `for-you list --newer-than`, `trading orders --source` (use
  `--origin`), `functions register --clear-run-as` and
  `service-account revoke --path --permission` (use `--grant-id`).

### Added

- `AlvaError.requiredPermission`, `invalidParams` and `retryAfter`, read from
  the RFC 9457 problems `/api/v2` returns. The CLI prints them with the error.
- Every write sends an `Idempotency-Key`; a method that takes a request ID
  (Thesis writes) sends it as the key.
- `trading.orders({ origin })` (`--origin`: `EXTERNAL`, `ALVA_DIRECT`,
  `ALVA_INSTRUCTION`, `UNKNOWN`), `trading.equityHistory({ range })`
  (`--range`) and `trading.subscribe({ signalSourceId })`
  (`--signal-source-id`, the feed's Automation ID).
- Fields: `XPost.url`; Thesis `number` and `author_version_number`, and
  `publication.thesisNumber` (the numbers that name a Thesis page,
  `https://alva.ai/thesis/<number>`, and the Alva App's cards; 0.x returned
  them as the IDs); credit entry `title`; `playbooks.listOwn`
  `next_cursor` (followed by `playbooks mine --all`); alert subscription
  `id`; secret `id`; `FsStat`/`FsEntry` `meta`; `getRunLogs` `error`;
  `RunResponse` declares what 0.x already returned (`stats.credits_used`,
  `error: null` and, for a run that needs a higher plan, `reject_reason`,
  `upgrade_url` and `entitlement_failure`).

### Still on /api/v1

These calls have no `/api/v2` route yet and keep their 0.x transport and IDs:

- `steward` (GraphQL `/query`).
- `trading.execute` and `trading.subscribe({ executeLatest: true })`.
- `notifications.listFeed`, `subscriptions.subscribeFeed` and
  `unsubscribeFeed` (and the `alerts` methods by owner and feed name; CLI
  `alert enable|disable --automation` still takes a numeric `--channel-id`).
- `secrets.get` (the value).
- `channelGroupSubscriptions` `context`, `list`, `subscribe` and
  `unsubscribe` (CLI `alert group`), which name the group by its numeric
  origin session.
- `fs` and Playbook/Skillhub discovery for clients without an API key, the
  browser Playbook runtime's UDF calls (`window.alva.udf`), and the
  `auth login` token exchange.
