// --- Client config ---

export interface AlvaClientConfig {
  viewer_token?: string;
  apiKey?: string;
  baseUrl?: string;
  arraysBaseUrl?: string;
}

// --- User ---

export interface UserProfile {
  id: number;
  username: string;
  subscription_tier: 'free' | 'pro';
  telegram_username: string | null;
  /** Caller's alfs home directory, e.g. `/alva/home/<username>`. */
  home_path: string;
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
}

export interface FsRawWriteParams {
  path: string;
  /** Raw file content: string, ArrayBuffer, Uint8Array, Blob, etc. */
  body: BodyInit;
  mkdir_parents?: boolean;
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
}

export interface Cronjob {
  id: number;
  name: string;
  path: string;
  cron_expression: string;
  status: string;
  args: Record<string, unknown>;
  push_notify: boolean;
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
}

export interface CronjobRunsListParams {
  cronjob_id: number;
  first?: number;
  cursor?: number;
}

export interface CronjobRun {
  id: number;
  cronjob_id: number;
  status: string;
  error: string;
  duration_ms: number;
  credits_used: number;
  created_at: string;
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

export interface CronjobRunLogsResponse {
  logs: string;
}

// --- Release ---

export interface FeedReleaseRequest {
  name: string;
  version: string;
  cronjob_id: number;
  view_json?: Record<string, unknown>;
  description?: string;
  changelog?: string;
}

export interface FeedReleaseResponse {
  feed_id: number;
  name: string;
  feed_major: number;
  /** Canonical alfs path: `/alva/home/<username>/feeds/<name>`. */
  feed_path: string;
}

export interface PlaybookDraftRequest {
  name: string;
  display_name: string;
  description?: string;
  feeds: Array<{ feed_id: number; feed_major?: number }>;
  trading_symbols?: string[];
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
  /**
   * `true` when the row is currently active. `false` means the user
   * previously subscribed and then unsubscribed; the row is preserved
   * so re-subscribe restores seniority via UPSERT-revive. Only present
   * when `include_history=true` is passed to `list`.
   */
  subscribed: boolean;
  created_at_ms: number;
  updated_at_ms: number;
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
  /** Default `false`. When `true`, include rows with `subscribed=false`. */
  include_history?: boolean;
}

export interface PushSubscriptionListResponse {
  items: PushSubscription[];
}

export interface SubscribePushTargetResponse {
  subscription: PushSubscription;
  /** Canonical alfs path: `/alva/home/<username>/playbooks/<name>`. */
  playbook_path: string;
}

export interface SubscribeFeedPushTargetResponse {
  subscription: PushSubscription;
  /** Canonical alfs path: `/alva/home/<username>/feeds/<name>`. */
  feed_path: string;
}

export interface UnsubscribePushTargetResponse {
  ok: true;
}
