// --- Client config ---

export interface AlvaClientConfig {
  viewer_token?: string;
  pbsvToken?: string;
  apiKey?: string;
  baseUrl?: string;
  arraysBaseUrl?: string;
  gaClientId?: string;
  gaSessionId?: string;
  utmParams?: string;
  /** Optional default AbortSignal applied to every request from this client. */
  signal?: AbortSignal;
  /** Alva chat session owning produced artifacts; sent as X-Alva-Origin-Session-Id. */
  originSessionId?: string;
}

// --- User ---

export interface UserProfile {
  id: string;
  username: string;
  subscription_tier: 'free' | 'pro' | 'max';
  telegram_username: string;
  discord_username: string;
  slack_username: string;
  whatsapp_username: string;
  imessage_username: string;
  active_channel: string;
  toolkit_min_version: string;
  /** Caller's alfs home directory, e.g. `/alva/home/<username>`. */
  home_path: string;
}

// --- Credits ---

export interface CreditWallet {
  balance: number;
  totalRemaining: number;
  todayUsed: number;
}

export interface CreditWalletItemsParams {
  /** Inclusive UTC lower bound, Unix milliseconds. */
  startAtMs: number;
  /** Exclusive UTC upper bound, Unix milliseconds. */
  endAtMs: number;
  /** Optional chat/session id to filter consumption records. */
  sessionId?: string;
  /** Page size, defaulted and capped by the gateway. */
  first?: number;
  /** Opaque cursor from a previous page's `pageInfo.endCursor`. */
  after?: string;
}

export interface CreditWalletItem {
  id: string;
  sessionId: string | null;
  playbookId: string | null;
  feedId: string | null;
  op: string;
  source: string;
  amount: number;
  extras?: unknown;
  /** Creation timestamp, Unix milliseconds. */
  createdAtMs: number;
}

export interface CreditWalletPageInfo {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  startCursor: string | null;
  endCursor: string | null;
}

export interface CreditWalletItemEdge {
  cursor: string;
  node: CreditWalletItem;
}

export interface CreditWalletItemConnection {
  pageInfo: CreditWalletPageInfo;
  edges: CreditWalletItemEdge[];
}

export interface CreditWalletItemsResponse extends CreditWallet {
  items: CreditWalletItemConnection;
}

// --- Arrays JWT ---

export type SubscriptionTier =
  | 'SUBSCRIPTION_TIER_UNSPECIFIED'
  | 'SUBSCRIPTION_TIER_FREE'
  | 'SUBSCRIPTION_TIER_PRO';

export interface EnsureArraysJwtResponse {
  expires_at: number;
  tier: SubscriptionTier;
  renewed: boolean;
}

export interface ArraysJwtStatusResponse {
  exists: boolean;
  expires_at: number;
  tier: SubscriptionTier;
  renewal_needed: boolean;
}

// --- Filesystem ---

export interface FsReadParams {
  path: string;
  offset?: number;
  size?: number;
}

export interface FsWriteParams {
  path: string;
  data: string;
  mkdir_parents?: boolean;
  /** Append to the existing file instead of overwriting it. */
  append?: boolean;
}

export interface FsRawWriteParams {
  path: string;
  /** Raw file content: string, ArrayBuffer, Uint8Array, Blob, etc. */
  body: BodyInit;
  mkdir_parents?: boolean;
  /** Append to the existing file instead of overwriting it. */
  append?: boolean;
}

export interface FsWriteResponse {
  bytes_written: number;
}

export interface FsStat {
  name: string;
  size: number;
  mode: number;
  mod_time: string;
  is_dir: boolean;
}

export interface FsReaddirParams {
  path: string;
  recursive?: boolean;
}

export interface FsEntry {
  name: string;
  size: number;
  is_dir: boolean;
  mod_time?: string;
  mode?: number;
}

export interface FsReaddirResponse {
  entries: FsEntry[];
}

export interface FsMkdirParams {
  path: string;
}

export interface FsRemoveParams {
  path: string;
  recursive?: boolean;
}

export interface FsRenameParams {
  old_path: string;
  new_path: string;
}

export interface FsCopyParams {
  src_path: string;
  dst_path: string;
}

export interface FsSymlinkParams {
  target_path: string;
  link_path: string;
}

export interface FsReadlinkParams {
  path: string;
}

export interface FsChmodParams {
  path: string;
  mode: number;
}

export interface FsGrantParams {
  path: string;
  subject: string;
  permission: string;
}

export interface FsRevokeParams {
  path: string;
  subject: string;
  permission: string;
}

// --- Run ---

export interface RunRequest {
  code?: string;
  entry_path?: string;
  working_dir?: string;
  args?: Record<string, unknown>;
  /**
   * Override the server's default V8 heap limit, in MB. Valid range is
   * 1–2048. Omitted means the server uses its default heap (256 MB).
   */
  max_heap_size_mb?: number;
  /**
   * Client-side HTTP timeout for waiting on POST /api/v1/run, in
   * milliseconds. This is not sent to the server.
   */
  timeout_ms?: number;
}

export interface RunResponse {
  result: string;
  logs: string;
  stats: { duration_ms: number };
  status: 'completed' | 'failed';
  error?: string;
}

// --- Deploy (Cronjobs) ---

export interface CronjobCreateRequest {
  path: string;
  cron_expression: string;
  name: string;
  args?: Record<string, unknown>;
  push_notify?: boolean;
  /** Override per-cronjob V8 heap limit (MB). Valid range 1–2046. */
  max_heap_size_mb?: number;
  /**
   * Run the cronjob under a restricted service-account identity (an SA id
   * owned by the caller) instead of the owner (#602). Omitted ⇒ runs as owner.
   * A string: SA ids are snowflake int64s that overflow JS number precision.
   */
  run_as_user_id?: string;
  /** Inclusive RFC3339 lower bound. Omitted means start now (server clock). */
  start_at?: string;
  /**
   * Exclusive RFC3339 upper bound. A run is admitted only while now < end_at.
   */
  end_at?: string;
  /** Maximum number of admitted runs. */
  max_runs?: number;
}

export interface Cronjob {
  id: number;
  name: string;
  path: string;
  cron_expression: string;
  status: string;
  args: Record<string, unknown>;
  push_notify: boolean;
  /** Per-cronjob V8 heap cap (MB). null when using the server default. */
  max_heap_size_mb: number | null;
  /**
   * SA id the cronjob runs as, or "0" when it runs as the owner (#602).
   * A string: snowflake int64 ids overflow JS number precision.
   */
  run_as_user_id: string;
  /** Inclusive eligibility lower bound, resolved by the server on create. */
  start_at?: string | null;
  /**
   * Lifetime ceiling (RFC3339), or null/omitted when the cronjob has no expiry.
   * Set by `alva loop create`; unset for feeds and other crons.
   */
  end_at?: string | null;
  /** Maximum admitted runs, or null when unbounded by count. */
  max_runs?: number | null;
  /** Number of runs admitted so far. */
  run_count: number;
  created_at: string;
  updated_at: string;
}

export interface CronjobListParams {
  limit?: number;
  cursor?: string;
}

export interface CronjobListResponse {
  cronjobs: Cronjob[];
  next_cursor?: string;
}

export interface CronjobUpdateRequest {
  id: number;
  name?: string;
  cron_expression?: string;
  args?: Record<string, unknown>;
  push_notify?: boolean;
  /** Override per-cronjob V8 heap limit (MB). Valid range 1–2046. */
  max_heap_size_mb?: number;
  /**
   * Re-point the cronjob at a service-account identity, or "0" to clear it back
   * to the owner (#602). Omitted ⇒ run_as unchanged.
   * A string: SA ids are snowflake int64s that overflow JS number precision.
   */
  run_as_user_id?: string;
}

export interface CronjobRunsListParams {
  cronjob_id: number;
  first?: number;
  cursor?: string;
}

export interface CronjobRun {
  id: number;
  cronjob_id: number;
  status: string;
  error: string;
  duration_ms: number;
  credits_used: number;
  created_at: string;
  /**
   * Hatchet workflow run id captured at trigger time. Populated for runs
   * persisted by recent worker binaries (both naturally-scheduled ticks and
   * triggered runs); empty for older rows. External callers that issued
   * `deploy.trigger()` filter by this field to find the run their request
   * produced.
   */
  workflow_run_id?: string;
}

export interface CronjobRunStats {
  total_runs: number;
  success_count: number;
  fail_count: number;
  last_run_at?: string;
  last_success_at?: string;
}

export interface CronjobRunsListResponse {
  runs: CronjobRun[];
  stats?: CronjobRunStats;
  next_cursor?: number;
}

export interface CronjobRunStatusParams {
  cronjob_id: number;
  workflow_run_id: string;
}

export interface CronjobRunStatusResponse {
  workflow_run_id: string;
  /**
   * PENDING means no cronjob_runs row exists yet. It is not falsifiable:
   * a mistyped workflow_run_id, a workflow_run_id from another cronjob, or
   * a workflow that failed before persistence can remain PENDING forever.
   * DISPATCHED and RUNNING mean an in-flight row exists. Pollers must stop
   * on their own deadline if the run never reaches a terminal state.
   */
  state:
    | 'PENDING'
    | 'DISPATCHED'
    | 'RUNNING'
    | 'COMPLETED'
    | 'FAILED'
    | 'SKIPPED'
    | 'UNSPECIFIED'
    | string;
  run?: CronjobRun;
}

export interface CronjobRunLogsResponse {
  logs: string;
}

export interface CronjobTriggerResponse {
  /**
   * Hatchet workflow run id at enqueue. Async — the persisted
   * `cronjob_runs` row appears only after the worker finishes the run.
   * Callers verify completion by polling
   * `deploy.getRunStatus({cronjob_id, workflow_run_id})` with their own
   * timeout/deadline.
   */
  workflow_run_id: string;
}

// --- Release ---

export interface FeedReleaseRequest {
  name: string;
  version: string;
  cronjob_id: number;
  view_json?: Record<string, unknown>;
  description?: string;
  changelog?: string;
  /**
   * Agent kind that produces this feed (e.g. "alpi"). Optional. Marks the feed
   * as an agent feed whose prompt is editable; an empty/omitted value means a
   * regular (non-agent) feed. The backend validates it against its catalog.
   */
  agent_type?: string;
}

export interface FeedReleaseResponse {
  feed_id: number;
  name: string;
  feed_major: number;
  /** Canonical alfs path: `/alva/home/<username>/feeds/<name>`. */
  feed_path: string;
}

export interface FeedDeleteRequest {
  /** Numeric feed id to delete. */
  id: number;
}

export type FeedListStatus = 'active' | 'paused' | 'all';

export interface FeedListParams {
  /** Page size, default 50, max 100 server-side. */
  limit?: number;
  /** Opaque cursor token from the previous page. */
  cursor?: string;
  /** Runtime status filter; defaults to active on the gateway. */
  status?: FeedListStatus;
}

export interface FeedListItem {
  /** Numeric feed id encoded as a string, matching the gateway response. */
  id: string;
  name: string;
  /** Feed runtime status. */
  status: 'ACTIVE' | 'PAUSED' | 'UNSPECIFIED' | (string & {});
  cron_expression?: string;
  total_runs: number;
  used_by_total: number;
}

export interface FeedListResponse {
  feeds: FeedListItem[];
  next_cursor?: string;
  has_more: boolean;
}

export interface AutomationInspectRequest {
  /** Numeric automation id. Currently the same underlying feed id. */
  id: number;
}

export interface AutomationInspectResponse {
  /** Numeric automation id encoded as a string, matching the gateway response. */
  id: string;
  /** Backing feed id encoded as a string. */
  feed_id: string;
  name: string;
  description?: string;
  /** Automation runtime status. */
  status: 'ACTIVE' | 'PAUSED' | 'UNSPECIFIED' | (string & {});
  cron_expression?: string;
  total_runs: number;
  /**
   * Backend product-flow registry id. Null for ordinary non-flow automations.
   */
  flow_id: string | null;
  /**
   * Absolute ALFS config path for caller-owned product-flow automations.
   * Null for ordinary automations and product-flow automations not owned by
   * the caller.
   */
  flow_config_path: string | null;
}

export interface FeedStatusUpdateRequest {
  /** Numeric feed id to stop/resume. */
  id: number;
}

export interface FeedStatusUpdateResponse {
  /** Echoed feed id (string form, matching gateway response). */
  id: string;
  /** Feed runtime status after the update. */
  status: 'ACTIVE' | 'PAUSED' | 'UNSPECIFIED' | (string & {});
}

export interface FeedDeleteResponse {
  /** Echoed feed id (string form, matching gateway response). */
  id: string;
}

/** Feed visibility: 'public' publishes the feed, 'private' unpublishes it. */
export type FeedVisibility = 'public' | 'private';

export interface FeedSetVisibilityRequest {
  /** Numeric feed id to publish/unpublish. */
  id: number;
  /** Target visibility. */
  visibility: FeedVisibility;
}

export interface FeedSetVisibilityResponse {
  /** Echoed feed id (string form, matching gateway response). */
  id: string;
  /** Feed visibility after the update. */
  visibility: FeedVisibility;
}

export interface PlaybookDraftRequest {
  name: string;
  display_name: string;
  description?: string;
  feeds: Array<{ feed_id: number; feed_major?: number }>;
  trading_symbols?: string[];
  /**
   * Optional source-skill reference in "username/name" form (e.g.
   * "alva/screener"). The value identifies a playbook skill published to
   * Skillhub; discover available skills via `alva skillhub list`.
   * Persisted set-once on the playbook's first draft; subsequent drafts
   * ignore the field.
   */
  skill_id?: string;
  /**
   * Optional discovery tags (max 10, each up to 32 characters). On a
   * playbook's first draft these merge with any template-inherited tags;
   * on a re-draft of an existing playbook they replace the current tag
   * set. Omitted/empty leaves tags unchanged.
   */
  tags?: string[];
}

export interface PlaybookDraftResponse {
  playbook_id: number;
  playbook_version_id: number;
  /** Canonical alfs path: `/alva/home/<username>/playbooks/<name>`. */
  playbook_path: string;
}

export interface PlaybookReleaseRequest {
  name: string;
  version: string;
  feeds: Array<{ feed_id: number; feed_major?: number }>;
  changelog: string;
  /**
   * Owner-attested README location. Server validates the value is one of:
   *   - relative: `<name>/README.md`
   *   - absolute: `/alva/home/<username>/playbooks/<name>/README.md`
   * The owner is responsible for placing the README at that path on ALFS
   * before publish; the server does not write the file.
   */
  readme_url: string;
}

export interface PlaybookReleaseResponse {
  playbook_id: number;
  version: string;
  published_url: string;
  /** Canonical alfs path: `/alva/home/<username>/playbooks/<name>`. */
  playbook_path: string;
}

// --- Secrets ---

export interface CreateSecretRequest {
  name: string;
  value: string;
}

export interface SecretMetadata {
  name: string;
  keyVersion: number;
  createdAt: string;
  updatedAt: string;
  valueLength: number;
  keyPrefix: string;
}

export interface Secret {
  name: string;
  value: string;
  createdAt: string;
  updatedAt: string;
}

// --- SDK Docs ---

export interface ModuleDoc {
  name: string;
  doc: string;
}

export interface PartitionsResponse {
  partitions: string[];
}

export interface PartitionSummaryResponse {
  summary: string;
}

// --- Playbook Comments ---

export interface CreateCommentRequest {
  username: string;
  name: string;
  content: string;
  parent_id?: number;
}

export interface Comment {
  id: number;
  playbook_id: number;
  content: string;
  pin_at: number | null;
  created_at: number;
  updated_at: number;
  creator?: {
    id: string;
    name: string;
    avatar: string;
  };
  agent?: {
    name: string;
  };
}

// --- Remix ---

export interface RemixRequest {
  child: { username: string; name: string };
  parents: Array<{ username: string; name: string }>;
}

// --- Screenshot ---

export interface ScreenshotParams {
  url: string;
  selector?: string;
  xpath?: string;
  compress?: boolean;
  compressQuality?: number;
  compressMaxWidth?: number;
}

// Trading

export interface TradingAccount {
  id: string;
  name: string;
  exchange: string;
  paper: boolean;
  identifier: string;
  createdAtMs: number;
  subscriptions: AccountSubscription[];
}

export interface AccountSubscription {
  id: string;
  sourceUsername: string;
  sourceFeed: string;
  playbookId: string;
  playbookName: string;
  active: boolean;
}

export interface TradingSubscription {
  id: string;
  accountId: string;
  sourceUsername: string;
  sourceFeed: string;
  active: boolean;
  deactivateReason?: string;
  playbookId: string;
  playbookVersion: string;
  createdAtMs: number;
  watermark: number;
}

export interface TradingOrder {
  orderId: string;
  symbol: string;
  side: string;
  requestedQty: number;
  filledQty: number;
  price: number;
  status: string;
  rejectReason?: string;
  source: string;
  sourcePlaybook: string;
  subscriptionId?: string;
  dryRun: boolean;
  createdAtMs: number;
}

export interface PortfolioAsset {
  symbol: string;
  side: string;
  quantity: number;
  entryPrice: number;
  currentPrice?: number;
  marketValue?: number;
  unrealizedPnl?: number;
  allocation?: number;
}

export interface TradingPortfolio {
  equity: number;
  cash: number;
  unrealizedPnl?: number;
  assets: PortfolioAsset[];
}

export interface EquityPoint {
  timestamp: number;
  equity: number;
  pnl: number;
  pnlPct: number;
}

export interface RiskRuleEntry {
  value: number;
  enabled: boolean;
}

export interface TradingRiskRule {
  maxSingleOrder: RiskRuleEntry;
  maxDailyTurnover: RiskRuleEntry;
  maxDailyOrders: RiskRuleEntry;
}

export type TradingRiskRuleInput = TradingRiskRule;

export interface ExecuteSignalOrder {
  orderId: string;
  symbol: string;
  side: string;
  requestedQty: number;
  filledQty: number;
  price: number;
  status: string;
  rejectReason?: string;
}

export interface ExecuteSignalResult {
  status: string;
  orders: ExecuteSignalOrder[];
  error?: string;
}

// --- Portfolio (connected accounts across TREX + SnapTrade) ---

export interface PortfolioAccount {
  id: string;
  provider: 'TREX' | 'SNAPTRADE';
  name: string;
  institution: string;
  identifier?: string;
  readOnly: boolean;
  paper: boolean;
  exchange?: string;
  createdAtMs?: number;
  subscriptions: PortfolioAccountSubscription[];
  status?: string;
  statusReason?: string;
  lastSyncedAtMs?: number;
  connectionId?: string;
}

export interface PortfolioAccountSubscription {
  id: string;
  sourceUsername: string;
  sourceFeed: string;
  playbookId: string;
  playbookName: string;
  playbookVersion: string;
  active: boolean;
  deactivateReason?: string;
  createdAt: number;
  watermark: number;
}

export interface PortfolioMoney {
  amount: number;
  currency: string;
  currencySymbol: string;
}

export interface PortfolioHolding {
  symbol: string;
  side?: string;
  quantity: number;
  avgCost?: PortfolioMoney;
  currentPrice?: PortfolioMoney;
  marketValue?: PortfolioMoney;
  unrealizedPnl?: PortfolioMoney;
  allocation?: number;
}

export interface PortfolioSummary {
  totalValue?: PortfolioMoney;
  cash?: PortfolioMoney;
  unrealizedPnl?: PortfolioMoney;
  holdings: PortfolioHolding[];
  asOfMs?: number;
}

export interface PortfolioActivity {
  id: string;
  kind: string;
  type: string;
  occurredAtMs?: number;
  symbol?: string;
  side?: string;
  quantity?: number;
  price?: PortfolioMoney;
  amount?: PortfolioMoney;
  fee?: PortfolioMoney;
  status?: string;
  sourceLabel?: string;
  description?: string;
  externalReferenceId?: string;
}

export interface PortfolioActivityConnection {
  activities: PortfolioActivity[];
  nextPageToken?: string;
}

// --- Notifications ---

export interface NotificationListParams {
  username: string;
  name: string;
  channel?: string;
  /** `sent` / `failed` / `filtered`. */
  status?: string;
  /** Unix seconds; only notifications newer than this. */
  since_time?: number;
  /** Page size, default 50, max 200. */
  first?: number;
  /** Opaque cursor token from previous page's `next_cursor`. */
  cursor?: string;
}

export interface NotificationEvent {
  id: string;
  event_type: string;
  user_id: string;
  channel: string;
  /** `sent` / `failed` / `filtered`. */
  status: string;
  /** Unix seconds. */
  created_at: number;
  message?: string;
  error_msg?: string;
  /** Present when notification is playbook-scoped. */
  playbook_id?: string;
  /** Present when notification is feed-scoped. */
  feed_id?: string;
}

export interface PlaybookNotificationListResponse {
  items: NotificationEvent[];
  /** Empty when there is no next page. */
  next_cursor: string;
  /** Canonical alfs path: `/alva/home/<username>/playbooks/<name>`. */
  playbook_path: string;
}

export interface FeedNotificationListResponse {
  items: NotificationEvent[];
  next_cursor: string;
  /** Canonical alfs path: `/alva/home/<username>/feeds/<name>`. */
  feed_path: string;
}

// --- Notification Preferences ---

export type NotificationPreferenceKey = 'session_completed';

export interface NotificationPreference {
  key: NotificationPreferenceKey;
  enabled: boolean;
}

export interface NotificationPreferencesResponse {
  settings: NotificationPreference[];
}

export interface NotificationPreferenceUpdateParams {
  key: NotificationPreferenceKey;
  enabled: boolean;
}

export interface NotificationPreferenceUpdateResponse {
  setting: NotificationPreference;
}

// --- Feedback ---

export interface SubmitFeedbackRequest {
  /** Defaults to "agent_detected" on the server. */
  source?: 'agent_detected' | 'user_reported' | 'system_detected' | string;
  /** Defaults to "other" on the server. */
  category?:
    | 'api_error'
    | 'data_quality'
    | 'docs'
    | 'runtime'
    | 'auth'
    | 'billing'
    | 'other'
    | string;
  /** Defaults to "medium" on the server. */
  severity?: 'low' | 'medium' | 'high' | 'critical' | string;
  summary: string;
  details?: string;
  /** Optional structured diagnostics; omit unless the agent has useful metadata. */
  evidence?: Record<string, unknown>;
  /** Optional structured session metadata; omit unless relevant to triage. */
  context?: Record<string, unknown>;
}

export interface SubmitFeedbackResponse {
  feedback_id: number;
  notion_page_id: string;
  notion_url: string;
}

// --- Push Subscriptions ---

/**
 * Identifies the asset a personal push subscription is keyed to.
 * `PLAYBOOK` is the only target supported today; `FEED` is reserved for
 * a future phase where users can subscribe to a feed independent of any
 * playbook that consumes it.
 */
export type PushTargetType = 'PLAYBOOK' | 'FEED' | 'UNSPECIFIED';

export interface PushTarget {
  type: PushTargetType;
  /** Numeric id encoded as a string (matches the rest of the SDK). */
  id: string;
}

export interface PushSubscription {
  target: PushTarget;
  created_at_ms: number;
  updated_at_ms: number;
  /** Present on list responses. */
  cursor?: string;
  /** Feed metadata is present for FEED targets when available. */
  feed_name?: string;
  feed_status?: 'ACTIVE' | 'PAUSED' | 'UNSPECIFIED' | string;
  /** Unix milliseconds of the latest successful delivery for this user+target. */
  last_pushed_at_ms?: number;
  /** Playbooks whose latest release currently references this feed. */
  used_by?: PushSubscriptionUsedBy[];
  used_by_total?: number;
  /**
   * Row-shape discriminator: PLAYBOOK_ALERTS = a playbook-level wildcard
   * (alerts for every push-enabled automation of the playbook);
   * FEED_ALERT = a single feed's alert.
   */
  kind?: 'PLAYBOOK_ALERTS' | 'FEED_ALERT' | 'UNSPECIFIED' | string;
  /**
   * Legacy social playbook-follow signal. Do not use this to decide whether
   * alert delivery is enabled; use kind + target_status instead.
   */
  following?: boolean;
  /**
   * Target lifecycle: TARGET_DELETED marks a ghost row (the playbook/feed
   * was deleted) — clear it with unsubscribeBatch by target id.
   */
  target_status?:
    | 'ACTIVE'
    | 'TARGET_DELETED'
    | 'PAUSED'
    | 'UNSPECIFIED'
    | string;
  /** Playbook identity, present for PLAYBOOK targets on list responses. */
  playbook?: PushSubscriptionPlaybookInfo;
}

export interface PushSubscriptionPlaybookInfo {
  owner_username: string;
  name: string;
  display_name: string;
}

export interface PushSubscriptionUsedBy {
  playbook_id: string;
  owner_username: string;
  playbook_name: string;
  display_name: string;
  owner_avatar_url: string;
}

export interface PushSubscriptionPlaybookParams {
  username: string;
  name: string;
}

export interface PushSubscriptionFeedParams {
  username: string;
  name: string;
}

export interface PushSubscriptionListParams {
  /** Page size, default 50, max 200 server-side. */
  first?: number;
  /** Opaque cursor token from previous page's `next_cursor`. */
  cursor?: string;
}

export interface PushSubscriptionListResponse {
  items: PushSubscription[];
  /** Empty when there is no next page. */
  next_cursor?: string;
  /**
   * Total active subscription rows independent of pagination — when
   * items.length < total_count, the page is truncated; keep paginating.
   */
  total_count?: number;
}

export interface FollowsListParams {
  /** Page size, default 50, max 100 server-side. */
  limit?: number;
  /** Opaque cursor from the previous page's `next_cursor`. */
  cursor?: string;
}

export interface PlaybookFollowItem {
  playbook_id: string;
  owner_username: string;
  name: string;
  display_name: string;
  followed_at_ms: number;
  cursor: string;
}

export interface FollowsListResponse {
  items: PlaybookFollowItem[];
  has_next: boolean;
  next_cursor?: string;
}

export interface UnsubscribeBatchParams {
  /** Playbook target ids (strings — snowflake ids exceed JS safe integers). */
  playbookIds?: string[];
  /** Feed target ids (strings). */
  feedIds?: string[];
}

export interface UnsubscribeBatchResult {
  id: string;
  kind: 'PLAYBOOK' | 'FEED' | string;
  ok: boolean;
  status: 'UNSUBSCRIBED' | 'INVALID_ID' | string;
}

export interface UnsubscribeBatchResponse {
  results: UnsubscribeBatchResult[];
  ok_count: number;
}

export interface PlaybookFollow {
  id: string;
  user_id: string;
  playbook_id: string;
  created_at_ms: number;
  updated_at_ms: number;
}

export interface SubscribePlaybookResponse {
  /** The follow row created (or confirmed) by the cascade subscribe. */
  follow: PlaybookFollow;
  /** Feed ids whose alert this subscribe enabled (push-enabled automations). */
  subscribed_feed_ids: string[];
  /** Canonical alfs path: `/alva/home/<username>/playbooks/<name>`. */
  playbook_path: string;
}

export interface SubscribeFeedResponse {
  subscription: PushSubscription;
  /** Canonical alfs path: `/alva/home/<username>/feeds/<name>`. */
  feed_path: string;
}

export interface UnsubscribeResponse {
  ok: true;
}

// --- Channel Group Subscriptions ---

export type ChannelGroupSubscriptionTargetType = 'feed' | 'playbook';

export interface ChannelGroupSubscriptionTarget {
  type: ChannelGroupSubscriptionTargetType | '';
  id: number;
}

export interface ChannelGroupSubscription {
  event_type: string;
  target: ChannelGroupSubscriptionTarget | null;
  subscribed_by_user_id: number;
  enabled: boolean;
  created_at_ms: number;
  updated_at_ms: number;
}

export interface ChannelGroupCallerInfo {
  user_id: number;
  is_admin: boolean;
}

export interface ChannelGroupAdminInfo {
  user_id: number;
  username: string;
  telegram_user_id: string;
  telegram_username: string;
}

export interface ChannelGroupSubscriptionSessionParams {
  session_id: number | string;
}

export interface ChannelGroupSubscriptionMutationParams extends ChannelGroupSubscriptionSessionParams {
  target_type: ChannelGroupSubscriptionTargetType;
  target_id: number | string;
}

export interface ChannelGroupSubscriptionContextResponse {
  channel_id: string;
  remote_chat_id: string;
  caller: ChannelGroupCallerInfo;
  admin: ChannelGroupAdminInfo | null;
  subscriptions: ChannelGroupSubscription[];
}

export interface ChannelGroupSubscriptionListResponse {
  subscriptions: ChannelGroupSubscription[];
}

export interface ChannelGroupSubscriptionMutationResponse {
  ok: boolean;
  reason: string;
  caller: ChannelGroupCallerInfo;
  admin: ChannelGroupAdminInfo | null;
  subscriptions: ChannelGroupSubscription[];
}

/** Params for reading a group's buffered chat history (group-chat digest). */
export interface ChannelGroupHistoryParams {
  /** Platform: "telegram" | "discord" | "slack". */
  channel: string;
  /** Platform group/channel id. */
  remote_chat_id: string;
  /** Window start, message-origin timestamp in microseconds (inclusive). */
  from_micros: number | string;
  /** Window end, message-origin timestamp in microseconds (inclusive). */
  to_micros: number | string;
}

/** One buffered group message, projected for the digest. */
export interface GroupChatMessage {
  sender_username: string;
  content: string;
  /** "[photo]" etc. when the message carried media. */
  media_summary: string;
  ts_micros: number;
  /** Deep link back to the original message; empty when unavailable. */
  permalink: string;
  /** "user" | "assistant" (bot replies). */
  role: string;
}

export interface ChannelGroupHistoryResponse {
  /** Chronological (ts ascending). */
  messages: GroupChatMessage[];
}

// --- Service accounts (restricted run-as identities, issue #602) ---

export interface ServiceAccount {
  // id and parent_user_id are snowflake int64 user ids that overflow JS number
  // precision, so they are strings (the gateway emits them string-encoded) and
  // round-trip safely back into --run-as-service-account (#602).
  id: string;
  display_name: string;
  username: string;
  parent_user_id: string;
  created_at?: number;
}

export interface ServiceAccountCreateRequest {
  display_name: string;
}

export interface ServiceAccountCreateResponse {
  service_account: ServiceAccount;
}

export interface ServiceAccountListResponse {
  service_accounts: ServiceAccount[];
}

export interface ServiceAccountGrantRequest {
  id: string; // snowflake int64 SA id, kept as a string (overflows JS number)
  path: string;
  permission: string; // read | write | import
}
