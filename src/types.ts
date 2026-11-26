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

// --- Secrets ---

/** A secret with its value, as /api/v1 returns it (`client.v1.secrets.get`). */
export interface Secret {
  name: string;
  value: string;
  createdAt: string;
  updatedAt: string;
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

export interface PushSubscriptionFeedParams {
  username: string;
  name: string;
}

export interface SubscribeFeedParams extends PushSubscriptionFeedParams {
  /** Delivery channel id. Omit for the user's agent/home channel. */
  channelId?: string;
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
