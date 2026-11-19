# Changelog

Releases before 1.0.0 are listed under the repository's tags.

## 1.0.0 (unreleased)

1.0.0 moves the SDK and CLI from `/api/v1` and GraphQL to the platform API,
`/api/v2`. Migration notes: [README](README.md#migrating-from-0x-to-10).

### Breaking

- IDs are opaque strings (`AlvaId`) in the platform format (`task_0…`);
  numeric IDs are no longer returned or accepted.
- Resources call `/api/v2`. The changes of each resource are listed here as
  it moves.
- Theses (`client.theses`, `alva thesis`): Thesis, version, asset, Signal and
  profile IDs are platform IDs. `author_ref` is the author's Profile ID;
  `version_archived` is no longer returned. `update` sets a visibility that
  differs from the current one before the Update; on an archived Thesis,
  `archived: false` first unarchives it (an Update of its current content),
  then publishes the Update; `archived: true` is refused (use
  `setArchived`). Signal entries carry the page's `next_cursor` on the last
  entry only, `feed_entry_id` is the Signal ID, and evidence excerpts never
  report omitted text. Asset candidates may have kind `COMMODITY` or
  `UNKNOWN`. Rejections carry the problem's code and message: a backend
  reason such as `THESIS_RETURN_LAST_LEG` is no longer in `details`, and a
  failed precondition is `CONFLICT` (409).
- Thesis reads (`list`, `related`, `thesisReturn`, `watchpoints`):
  `publication.playbookId` is the Playbook ID and differs from `thesisId`;
  `node.playbookId` and `thesisId` are the Thesis ID. Edges carry the page's
  `nextCursor` on the last edge only. A Thesis without a readable
  publication is not listed. Related is `GENERATING` or `READY` (a failed
  preparation reads as an empty `READY`). `ticker` resolves through the asset
  catalog, so tickers are no longer ambiguous. A watchpoint origin may be
  `unknown`. Malformed responses are `INVALID_RESPONSE` (not `GRAPHQL_*`).
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
  on the last row only; `listOwn` adds `next_cursor`. Without an API key
  (keyless, or a browser Playbook's PBSV token), discovery (`trending`,
  `getByIds`, `listByOwner`, `get`, Skillhub) still reads the `/api/v1`
  catalog, whose IDs are 0.x IDs. Leaving `paid` while subscriptions renew is
  `CONFLICT`.
- `fs`, `screenshot`: API-key clients call `/api/v2`; a client holding a
  `pbsvToken` or `viewer_token`, or none, keeps `/api/v1/fs`. `FsStat` and
  `FsEntry` type `mod_time` as Unix seconds (as the wire always sent it) and
  carry `meta`; `readlink` is typed `{ target_path }`, as the wire always was.
- `deploy`: `Cronjob`, `CronjobRun` and their params take string IDs;
  `workflow_run_id` is the dispatch ID; `getRunStatus` checks that the
  dispatch belongs to `cronjob_id`; a paused trigger is 409 `CONFLICT`;
  `CronjobRunsListResponse.next_cursor` is an opaque string and
  `next_cursor_sort_at` is gone; `getRunLogs` also returns `error`.
- `automation` (`inspect`, `update`, `delivery`) and `schedules`: string
  Automation, Cronjob and Channel IDs; `AgentScheduleTarget.channelId` no
  longer takes a number; schedule response errors are `INVALID_RESPONSE`.
- `follows`: Asset and Profile IDs; `ProfileRefParams.kind` is optional and
  deprecated; `removeFromWatchlist` removes one Asset at a time; ambiguous
  symbols resolve to their primary listing instead of `FAILED_PRECONDITION`.
- `subscriptions`: string IDs; `PlaybookFollow` loses `id` and `user_id`;
  `PlaybookFollowItem.cursor`, `PushSubscription.cursor` and
  `PushSubscriptionListResponse.total_count` are gone; alerts carry their
  subscription `id`; `unsubscribeBatch` no longer reports `INVALID_ID`.
- `serviceAccount`: Account IDs; `grant` returns `ServiceAccountGrant`;
  `revoke` takes `{ id, grant_id }` (CLI `service-account revoke --grant-id`).
- `user.me().id`, `feedback.submit().feedback_id` and secret IDs are strings.
- CLI: `people follows follow|unfollow` no longer needs `--kind`;
  `--run-as-service-account` takes an Account ID and refuses `0`.
- `markets.narrative`, `earningsPeriods` and `earnings` read
  `/api/v2/assets` (a ticker is a US stock listing, else a non-US one).
  Failures other than the `MARKETS_*` not-found codes carry `/api/v2`
  problem codes; `GRAPHQL_ERROR` and `GRAPHQL_EMPTY_RESPONSE` are gone.
- `tradingPairs.search` and `resolve` read `/api/v2/trading-pairs`; the
  candidates are unchanged.
- `companyNews.create`: `feed_id` is an Automation ID and `cronjob_id` a
  Cronjob ID (were decimal int64 strings). Errors carry problem codes, such as
  `CONFLICT` for an existing name with another configuration (was
  `ALREADY_EXISTS`).
- `x.following` and `x.posts`: account and post `id` and `authorId` are
  Alva IDs (were X snowflakes); posts add `url`, which keeps the X post
  readable. Every edge's `cursor` is the page's next token. A malformed
  response is `INVALID_RESPONSE` (was `GRAPHQL_INVALID_RESPONSE`).
- `run.execute` posts `/api/v2/runs` and returns the same result;
  `working_dir` is sent only with `code` (with `entry_path` the server
  ignored it). `RunResponse` now declares what v1 already returned:
  `stats.credits_used`, `error: null` and, for a run that needs a higher
  plan, `reject_reason`, `upgrade_url` and `entitlement_failure`.
- `arraysJwt.status` and `ensure` read `/api/v2/me/data-skills-token`;
  `tier` may be `SUBSCRIPTION_TIER_MAX`.
- `credits.wallet` and `items` read `/api/v2/me/wallet` and
  `/api/v2/me/credit-entries`. Entry `id`, `sessionId`, `playbookId` and
  `feedId` (the feed's Automation) are Alva IDs, and `sessionId` filters by a
  Session ID. `extras` is gone; entries add `title`. Entries have no cursor of
  their own: the last edge carries the page's `endCursor`, the others `''`.
  `source` is `other` for reasons v1 had no name for.
- `functions`: `playbook_id` params and every `id`/`playbook_id` are Alva
  IDs (were numbers or decimal strings), and `run_as_user_id` is a service
  account's Account ID. `register` can no longer clear `run_as_user_id`
  (`"0"`, CLI `--clear-run-as`): `/api/v2` has no way to do so. `delete` and
  `invoke` look the function up by name first (`NOT_FOUND` when there is
  none). Allowances drop `consumer_uid` (always the caller).
- `portfolio` and `trading` read `/api/v2/me/broker-accounts` and
  `/api/v2/broker-accounts/{accountId}/…`. Account, subscription, order
  subscription and Playbook IDs are Alva IDs (were `trex:7`/`snaptrade:10`
  or decimal strings), and every `accountId` parameter takes them.
  `trading.execute` and `subscribe({executeLatest: true})` stay on `/api/v1`
  (no order placement on `/api/v2` yet) and take trex's numeric account ID,
  which `alva broker accounts` lists.
- `portfolio.accounts`: `institution` is the broker's name and `exchange` its
  code; a provider that cannot be read fails the call (`UNAVAILABLE`) instead
  of returning a partial list. `portfolio.activities`: records have no `id`,
  and `kind` is the business kind (`TRADE`, `DIVIDEND`, `INTEREST`, `FEE`,
  `TRANSFER`, `OTHER`; was `ORDER`/`BROKER_ACTIVITY`).
- `trading.orders`: `origin` (`EXTERNAL`, `ALVA_DIRECT`, `ALVA_INSTRUCTION`,
  `UNKNOWN`; CLI `--origin`) replaces the `source` filter, which is refused;
  `source` in the output is the origin, and dry runs are no longer listed.
- `trading.equityHistory`: `range` (CLI `--range`) selects the window; without
  it the smallest window holding `sinceMs` is read and points outside
  `sinceMs`/`untilMs` are dropped. `timeframe` other than `1D` is refused.
- `trading.subscribe` takes `signalSourceId` (the feed's Automation ID; CLI
  `--signal-source-id`). Without it, `sourceUsername`/`sourceFeed` must name
  one of the caller's own feeds.
- `trading.updateRiskRules` sends a merge patch; a credential that may only
  tighten limits gets `INSUFFICIENT_PERMISSION` with `requiredPermission:
"trading_limits:write"`.
- The broker CLI (`alva broker`, `alva trading broker`) posts
  `/api/v2/broker/invocations`, which needs `trading:write`; envelopes and
  exit codes are unchanged.

### Added

- `AlvaError.requiredPermission`, `invalidParams` and `retryAfter`, read from
  the RFC 9457 problems `/api/v2` returns. The CLI prints them with the error.
- Every write sends an `Idempotency-Key`.
