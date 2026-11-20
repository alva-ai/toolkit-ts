// --- IDs ---

/**
 * An Alva resource ID as /api/v2 returns it, for example `task_0…`: an opaque
 * string. Pass it back unchanged; never parse it or convert it to a number.
 */
export type AlvaId = string;

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
  /** Session profile kind used to gate attached-context CLI commands. */
  originSessionKind?: string;
  /** Host-attached canonical Session Inbox path; embedded scheduling is self-only. */
  originInboxPath?: string;
}

// --- User ---

export interface UserProfile {
  id: AlvaId;
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

/** The meta file ALFS attaches to a virtual path (a feed directory). */
export interface FsMeta {
  name: string;
  type: string;
  content: Record<string, string>;
}

export interface FsStat {
  name: string;
  size: number;
  mode: number;
  /** Unix seconds; 0 when unknown. */
  mod_time: number;
  is_dir: boolean;
  meta: FsMeta | null;
}

export interface FsReaddirParams {
  path: string;
  recursive?: boolean;
}

export interface FsEntry {
  name: string;
  size: number;
  is_dir: boolean;
  /** Unix seconds; 0 when unknown. */
  mod_time?: number;
  mode?: number;
  meta?: FsMeta | null;
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
   * Client-side HTTP timeout for waiting on POST /api/v2/runs, in
   * milliseconds. This is not sent to the server.
   */
  timeout_ms?: number;
}

export interface RunResponse {
  result: string;
  logs: string;
  stats: { credits_used: number; duration_ms: number };
  status: 'completed' | 'failed';
  /** The script's failure; null when it succeeded. */
  error?: string | null;
  /** Set when the run failed because it needs a higher plan. */
  reject_reason?: 'SUBSCRIPTION_ENTITLEMENT_REQUIRED';
  upgrade_url?: string;
  entitlement_failure?: {
    resource: string;
    category: string;
    required_tier: string;
  };
}

// --- Deploy (Cronjobs) ---

export interface CronjobCreateRequest {
  path: string;
  cron_expression: string;
  name: string;
  args?: Record<string, unknown>;
  /**
   * Let successful scheduled and manually triggered Feed runs deliver declared
   * alert outputs to eligible subscribers. Does not create subscriptions.
   */
  push_notify?: boolean;
  /** Override per-cronjob V8 heap limit (MB). Valid range 1–2046. */
  max_heap_size_mb?: number;
  /**
   * Maximum wall-clock execution time in seconds. Valid range 1–3600.
   * Omitted means the server uses its default (1800 seconds).
   */
  execution_timeout_seconds?: number;
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
  id: AlvaId;
  name: string;
  path: string;
  cron_expression: string;
  status: string;
  /** Valid current rows are objects; legacy invalid rows are returned as strings. */
  args: Record<string, unknown> | string | null;
  /** Whether successful Feed runs may deliver alerts to subscribers. */
  push_notify: boolean;
  /** Per-cronjob V8 heap cap (MB). null when using the server default. */
  max_heap_size_mb: number | null;
  /** Effective wall-clock execution timeout in seconds. */
  execution_timeout_seconds: number;
  /**
   * Account ID of the service account the cronjob runs as, or "0" when it
   * runs as the owner (#602).
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
  /** Empty on the last page. */
  next_cursor?: string;
}

export interface CronjobUpdateRequest {
  id: AlvaId;
  name?: string;
  cron_expression?: string;
  args?: Record<string, unknown>;
  /** Enable or disable delivery of declared Feed alert outputs. */
  push_notify?: boolean;
  /** Override per-cronjob V8 heap limit (MB). Valid range 1–2046. */
  max_heap_size_mb?: number;
  /**
   * Maximum wall-clock execution time in seconds. Valid range 1–3600.
   * Omitted means the existing value is preserved.
   */
  execution_timeout_seconds?: number;
  /**
   * Re-point the cronjob at a service account (its Account ID), or "0" to
   * clear it back to the owner (#602). Omitted ⇒ run_as unchanged.
   */
  run_as_user_id?: string;
}

export interface CronjobRunsListParams {
  cronjob_id: AlvaId;
  first?: number;
  cursor?: string;
}

export interface CronjobRun {
  id: AlvaId;
  cronjob_id: AlvaId;
  status: string;
  error: string;
  duration_ms: number;
  credits_used: number;
  created_at: string;
  finished_at?: string;
  /**
   * Dispatch ID of the run (what `deploy.trigger()` returns). Populated for
   * runs persisted by recent worker binaries (both naturally-scheduled ticks
   * and triggered runs); empty for older rows. External callers that issued
   * `deploy.trigger()` filter by this field to find the run their request
   * produced.
   */
  workflow_run_id?: string;
}

export interface CronjobRunStats {
  total_runs: number;
  success_count: number;
  fail_count: number;
  skipped_count: number;
  last_run_at?: string;
  last_success_at?: string;
}

export interface CronjobRunsListResponse {
  runs: CronjobRun[];
  stats?: CronjobRunStats;
  /** Opaque token of the next page; absent on the last page. */
  next_cursor?: string;
}

export interface CronjobRunStatusParams {
  cronjob_id: AlvaId;
  /** The dispatch ID `deploy.trigger()` returned. */
  workflow_run_id: AlvaId;
}

export interface CronjobRunStatusResponse {
  workflow_run_id: string;
  /**
   * PENDING means no cronjob_runs row exists yet. It is not falsifiable:
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
  /** The run's error; empty when it has none. */
  error?: string;
}

export interface CronjobTriggerResponse {
  /**
   * Dispatch ID at enqueue. Async — the persisted
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
  /** Cronjob ID of the producer. */
  cronjob_id: AlvaId;
  view_json?: Record<string, unknown>;
  description?: string;
  changelog?: string;
  /**
   * Agent kind that produces this feed (e.g. "alpi"). Optional. Marks the feed
   * as an agent feed whose prompt is editable; an empty/omitted value means a
   * regular (non-agent) feed. The backend validates it against its catalog.
   */
  agent_type?: string;
  /** Suppress ReleaseFeed's default publish-time first run. */
  skip_auto_trigger?: boolean;
}

export interface FeedReleaseResponse {
  /** Automation ID of the feed. */
  feed_id: AlvaId;
  name: string;
  feed_major: number;
  /** Canonical alfs path: `/alva/home/<username>/feeds/<name>`. */
  feed_path: string;
}

export interface FeedDeleteRequest {
  /** Feed (Automation) ID. */
  id: AlvaId;
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
  /** Feed (Automation) ID. */
  id: AlvaId;
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
  /** Automation ID. */
  id: AlvaId;
}

export interface AutomationInspectResponse {
  /** Automation ID. */
  id: AlvaId;
  /** The same Automation ID (automations and feeds share one ID). */
  feed_id: AlvaId;
  /** Cronjob ID of the producer, used by lifecycle and run operations. */
  cronjob_id?: AlvaId;
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

export interface AutomationUpdateRequest {
  /** Automation ID. */
  id: AlvaId;
  /** Contract version to republish. Omitted preserves the current version. */
  version?: string;
  /** Cronjob ID of a replacement producer. Omitted preserves the current one. */
  cronjob_id?: AlvaId;
  /** Omitted preserves; an explicit empty string clears the field. */
  description?: string;
  /** Omitted preserves; an explicit empty string clears the field. */
  changelog?: string;
  /** Omitted preserves; an explicit empty string clears the agent marker. */
  agent_type?: string;
  /** Trigger the effective producer once after the update commits. */
  trigger?: boolean;
}

export interface AutomationUpdateResponse {
  id: AlvaId;
  feed_id: AlvaId;
  name: string;
  feed_major: number;
  version: string;
  cronjob_id: AlvaId;
}

export interface AutomationEmailDelivery {
  isEnabled: boolean;
  isAvailable: boolean;
  address: string | null;
}

export interface AutomationAlertDelivery {
  isEnabled: boolean;
  /** Channel IDs. */
  alvaChannels: Array<{ id: AlvaId }>;
  email: AutomationEmailDelivery;
}

export interface AutomationAlertDeliveryGetRequest {
  /** Automation ID. */
  id: AlvaId;
}

export interface AutomationAlertDeliveryUpdateRequest {
  /** Automation ID. */
  id: AlvaId;
  /**
   * Replace Alva destinations (Channel IDs; "0" is the caller's Agent channel)
   * when present; an explicit empty list clears them.
   */
  alvaChannelIds?: readonly string[];
  /** Update only the verified-account email destination when present. */
  emailEnabled?: boolean;
}

export interface AutomationAlertDeliveryUpdateResponse {
  automation: { id: AlvaId };
  alertDelivery: {
    isEnabled: boolean;
    alvaChannels?: Array<{ id: AlvaId }>;
    email?: AutomationEmailDelivery;
  };
}

export interface FeedStatusUpdateRequest {
  /** Feed (Automation) ID. */
  id: AlvaId;
}

export interface FeedStatusUpdateResponse {
  /** Echoed feed (Automation) ID. */
  id: AlvaId;
  /** Feed runtime status after the update. */
  status: 'ACTIVE' | 'PAUSED' | 'UNSPECIFIED' | (string & {});
}

export interface FeedDeleteResponse {
  /** Echoed feed (Automation) ID. */
  id: AlvaId;
}

/** Feed visibility: 'public' publishes the feed, 'private' unpublishes it. */
export type FeedVisibility = 'public' | 'private';

export interface FeedSetVisibilityRequest {
  /** Feed (Automation) ID. */
  id: AlvaId;
  /** Target visibility. */
  visibility: FeedVisibility;
}

export interface FeedSetVisibilityResponse {
  /** Echoed feed (Automation) ID. */
  id: AlvaId;
  /** Feed visibility after the update. */
  visibility: FeedVisibility;
}

export interface PlaybookDraftRequest {
  name: string;
  display_name: string;
  description?: string;
  /** Bundled feeds by Automation ID. */
  feeds: Array<{ feed_id: AlvaId; feed_major?: number }>;
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
  playbook_id: AlvaId;
  /** Draft ID of this draft. */
  playbook_version_id: AlvaId;
  /** Canonical alfs path: `/alva/home/<username>/playbooks/<name>`. */
  playbook_path: string;
}

export interface PlaybookReleaseRequest {
  /** Explicit consent to deliver bundled non-public Feeds to the Playbook audience. */
  confirm_bundled_feed_exposure?: boolean;
  name: string;
  version: string;
  /** Bundled feeds by Automation ID. */
  feeds: Array<{ feed_id: AlvaId; feed_major?: number }>;
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
  playbook_id: AlvaId;
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
  id: AlvaId;
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
  /** Comment ID of the comment this replies to. */
  parent_id?: AlvaId;
}

export interface Comment {
  id: AlvaId;
  playbook_id: AlvaId;
  content: string;
  pin_at: number | null;
  created_at: number;
  updated_at: number;
  creator?: {
    /** Profile ID of the author. */
    id: AlvaId;
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
  id: AlvaId;
  name: string;
  exchange: string;
  paper: boolean;
  identifier: string;
  createdAtMs: number;
  subscriptions: AccountSubscription[];
}

export interface AccountSubscription {
  id: AlvaId;
  sourceUsername: string;
  sourceFeed: string;
  playbookId: AlvaId;
  playbookName: string;
  active: boolean;
}

export interface TradingSubscription {
  id: AlvaId;
  accountId: AlvaId;
  sourceUsername: string;
  sourceFeed: string;
  active: boolean;
  deactivateReason?: string;
  playbookId: AlvaId;
  playbookVersion: string;
  createdAtMs: number;
  watermark: number;
}

export interface TradingOrder {
  /** The provider's order ID. */
  orderId: string;
  symbol: string;
  side: string;
  requestedQty: number;
  filledQty: number;
  price: number;
  status: string;
  rejectReason?: string;
  /** Where the order came from: EXTERNAL, ALVA_DIRECT, ALVA_INSTRUCTION or UNKNOWN. */
  source: string;
  sourcePlaybook: string;
  subscriptionId?: AlvaId;
  /** Always false: dry runs are not stored. */
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
  /** Null when one or more holdings could not be valued. */
  equity: number | null;
  cash: number;
  unrealizedPnl?: number;
  assets: PortfolioAsset[];
}

export interface EquityPoint {
  /** Start of the point's bucket, Unix seconds. */
  timestamp: number;
  equity: number;
  pnl: number;
  /** Change against the previous point, a fraction (0.0123 is 1.23%). */
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
  id: AlvaId;
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
  connectionId?: AlvaId;
}

export interface PortfolioAccountSubscription {
  id: AlvaId;
  sourceUsername: string;
  sourceFeed: string;
  playbookId: AlvaId;
  playbookName: string;
  playbookVersion: string;
  active: boolean;
  deactivateReason?: string;
  /** Unix seconds. */
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
  /** TRADE, DIVIDEND, INTEREST, FEE, TRANSFER or OTHER. */
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
  feed_id: string;
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
  feedback_id: AlvaId;
  notion_page_id: string;
  notion_url: string;
}

// --- Push Subscriptions ---

/** Personal alert subscriptions are keyed only to feeds. */
export type PushTargetType = 'FEED';

export interface PushTarget {
  type: PushTargetType;
  /** Automation ID. */
  id: AlvaId;
}

export interface PushSubscription {
  /** Subscription ID; absent on `subscribeFeed`, which still uses /api/v1. */
  id?: AlvaId;
  target: PushTarget;
  created_at_ms: number;
  updated_at_ms: number;
  /** Alva delivery Channel ID. "0" denotes the agent/home channel. */
  channel_id?: string;
  /** Feed metadata is present for FEED targets when available. */
  feed_name?: string;
  feed_status?: 'ACTIVE' | 'PAUSED' | 'UNSPECIFIED' | string;
  /** Unix milliseconds of the latest successful delivery for this user+target. */
  last_pushed_at_ms?: number;
  /** Playbooks whose latest release currently references this feed. */
  used_by?: PushSubscriptionUsedBy[];
  used_by_total?: number;
  /** Row-shape discriminator. */
  kind?: 'FEED_ALERT';
  /**
   * Target lifecycle. TARGET_DELETED marks a feed row whose target was
   * deleted; clear it with unsubscribeBatch by target id.
   */
  target_status?:
    | 'ACTIVE'
    | 'TARGET_DELETED'
    | 'PAUSED'
    | 'UNSPECIFIED'
    | string;
}

export interface PushSubscriptionUsedBy {
  playbook_id: AlvaId;
  owner_username: string;
  playbook_name: string;
  display_name: string;
  owner_avatar_url: string;
}

export interface PlaybookFollowParams {
  username: string;
  name: string;
}

export interface PushSubscriptionFeedParams {
  username: string;
  name: string;
}

export interface SubscribeFeedParams extends PushSubscriptionFeedParams {
  /** Delivery channel id. Omit for the user's agent/home channel. */
  channelId?: string;
}

export interface PushSubscriptionListParams {
  /** Page size, default 50, max 200 server-side. */
  first?: number;
  /** Opaque cursor token from previous page's `next_cursor`. */
  cursor?: string;
}

export interface PushSubscriptionListResponse {
  items: PushSubscription[];
  /** Empty when there is no next page; otherwise the page is truncated. */
  next_cursor?: string;
}

export interface FollowsListParams {
  /** Page size, default 50, max 100 server-side. */
  limit?: number;
  /** Opaque cursor from the previous page's `next_cursor`. */
  cursor?: string;
}

export interface PlaybookFollowItem {
  playbook_id: AlvaId;
  owner_username: string;
  name: string;
  display_name: string;
  followed_at_ms: number;
}

export interface FollowsListResponse {
  items: PlaybookFollowItem[];
  has_next: boolean;
  next_cursor?: string;
}

export interface UnsubscribeBatchParams {
  /** Automation IDs. */
  feedIds: AlvaId[];
}

export interface SubscribeBatchParams {
  /** Automation IDs. */
  feedIds: AlvaId[];
  /** Delivery Channel ID. Omit (or "0") for the user's agent/home channel. */
  channelId?: AlvaId;
}

export interface SubscribeBatchResponse {
  subscriptions: PushSubscription[];
}

export interface UnsubscribeBatchResult {
  id: AlvaId;
  kind: 'FEED';
  ok: boolean;
  status: 'UNSUBSCRIBED' | string;
}

export interface UnsubscribeBatchResponse {
  results: UnsubscribeBatchResult[];
  ok_count: number;
}

export interface PlaybookFollow {
  playbook_id: AlvaId;
  created_at_ms: number;
  updated_at_ms: number;
}

export interface FollowPlaybookResponse {
  /** The social follow created or confirmed by this operation. */
  follow: PlaybookFollow;
  /** Canonical alfs path: `/alva/home/<username>/playbooks/<name>`. */
  playbook_path: string;
  playbook_id: AlvaId;
}

export interface UnfollowPlaybookResponse {
  ok: true;
  unfollowed: boolean;
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

export type ChannelGroupSubscriptionTargetType = 'feed';

export interface ChannelGroupSubscriptionTarget {
  type: ChannelGroupSubscriptionTargetType;
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
  target_type: 'feed';
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
  /** Window start, message-origin timestamp in microseconds (inclusive, read at millisecond precision). */
  from_micros: number | string;
  /** Window end, message-origin timestamp in microseconds (inclusive, read at millisecond precision). */
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
  /** Account ID; what `--run-as-service-account` takes (#602). */
  id: AlvaId;
  display_name: string;
  username: string;
  /** Account ID of the owner. */
  parent_user_id: AlvaId;
  /** Unix milliseconds. */
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
  id: AlvaId;
  path: string;
  permission: string; // read | write | import
}

/** One permission a service account holds on one path. */
export interface ServiceAccountGrant {
  id: AlvaId;
  service_account_id: AlvaId;
  /** Absolute ALFS path. */
  path: string;
  permission: string; // read | write | import
}

export interface ServiceAccountRevokeRequest {
  id: AlvaId;
  /** The grant's ID, from `grant` (granting the same pair again returns it). */
  grant_id: AlvaId;
}
