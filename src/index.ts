declare const __VERSION__: string;

/** SDK version, injected at build time from package.json. */
export const VERSION: string =
  typeof __VERSION__ !== 'undefined' ? __VERSION__ : 'dev';

export { AlvaClient } from './client.js';
export {
  AlvaError,
  CliUsageError,
  type InvalidParam,
  type ProblemFields,
  type ProblemReason,
} from './error.js';
export type { Page, Schema, V2Query } from './platformApi.js';
export type { components, paths } from './generated/platform-v2.js';
export { V1Resources } from './v1/index.js';
export { AsksResource, type AskWaitOptions } from './resources/asks.js';
export type {
  FsChangeOptions,
  FsReadOptions,
  FsReadResult,
  FsWriteOptions,
} from './resources/fs.js';
export type { SecretWriteOptions } from './resources/secrets.js';
export type { ServiceAccountWriteOptions } from './resources/serviceAccount.js';
export { V1FsResource } from './v1/fs.js';
export { V1NotificationsResource } from './v1/notifications.js';
export { V1SecretsResource } from './v1/secrets.js';
export * from './playbookRuntime.js';
export {
  AutomationAlertDeliveryResource,
  AutomationResource,
  type AutomationWriteOptions,
} from './resources/automation.js';
export { AlertsResource } from './resources/alerts.js';
export { CompanyNewsResource } from './resources/companyNews.js';
export {
  ThesesResource,
  type ListThesesParams,
  type ThesisPageQuery,
  type ThesisWriteOptions,
} from './resources/theses.js';
export {
  ForYouResource,
  type ForYouListQuery,
  type ForYouThesesQuery,
} from './resources/forYou.js';
export { FeedResource, type FeedListQuery } from './resources/feed.js';
export {
  PlaybooksResource,
  parsePlaybookRef,
  playbookUrl,
  webOriginFromApiBase,
  type OwnPlaybooksQuery,
  type PlaybookCatalogQuery,
  type PlaybookPageQuery,
  type PlaybookWriteOptions,
} from './resources/playbooks.js';
export {
  PlaybookSkillsResource,
  parsePlaybookSkillId,
  type PlaybookSkillsQuery,
  type PlaybookSkillTagsQuery,
} from './resources/playbookSkills.js';
export {
  CommentsResource,
  type CommentWriteOptions,
} from './resources/comments.js';
export { RemixResource } from './resources/remix.js';
export {
  ReleaseResource,
  type ReleaseWriteOptions,
} from './resources/release.js';
export { SdkDocsResource } from './resources/sdkDocs.js';
export {
  V1PlaybooksResource,
  type DiscoveryByIDsResponse,
  type ListByOwnerParams,
  type ListByOwnerResponse,
  type PlaybookDiscoveryItem,
  type TrendingPlaybookItem,
  type TrendingPlaybooksDir,
  type TrendingPlaybooksParams,
  type TrendingPlaybooksResponse,
  type TrendingPlaybooksSort,
} from './v1/playbooks.js';
export {
  V1PlaybookSkillsResource,
  type PlaybookSkillFile,
  type PlaybookSkillFileMeta,
  type PlaybookSkillMeta,
  type PlaybookSkillSummary,
  type PlaybookSkillTagEntry,
} from './v1/playbookSkills.js';
export { MarketsResource } from './resources/markets.js';
export {
  TradingPairsResource,
  type TradingPairFilters,
  type TradingPairResolveParams,
  type TradingPairSearchParams,
} from './resources/tradingPairs.js';
export {
  SchedulesResource,
  type ScheduleWriteOptions,
} from './resources/schedules.js';
export {
  DeployResource,
  type CronjobWriteOptions,
} from './resources/deploy.js';
export {
  StewardResource,
  type StewardBriefedParams,
  type StewardDigestRun,
  type StewardDigestRunParams,
  type StewardDigestRunState,
  type StewardDecideParams,
  type StewardDecision,
  type StewardForwardParams,
  type StewardPendingItem,
  type StewardPendingPage,
  type StewardPendingPageParams,
  type StewardPendingFullParams,
  type StewardPendingParams,
  type StewardPendingResult,
  type StewardSendParams,
  type StewardSendDigestRunParams,
  type StewardTarget,
} from './v1/steward.js';
export type {
  AlvaId,
  AlvaClientConfig,
  FeedNotificationListResponse,
  NotificationEvent,
  NotificationListParams,
  PushSubscription,
  PushSubscriptionFeedParams,
  Secret,
  SubscribeFeedParams,
  SubscribeFeedResponse,
  UnsubscribeResponse,
  FsReadParams,
  FsWriteParams,
  FsRawWriteParams,
  FsWriteResponse,
  FsMeta,
  FsStat,
  FsReaddirParams,
  FsEntry,
  FsReaddirResponse,
  FsMkdirParams,
  FsRemoveParams,
  FsRenameParams,
  FsCopyParams,
  FsSymlinkParams,
  FsReadlinkParams,
  FsChmodParams,
  FsGrantParams,
  FsRevokeParams,
  ChannelGroupSubscriptionTargetType,
  ChannelGroupSubscriptionTarget,
  ChannelGroupSubscription,
  ChannelGroupCallerInfo,
  ChannelGroupAdminInfo,
  ChannelGroupSubscriptionSessionParams,
  ChannelGroupSubscriptionMutationParams,
  ChannelGroupSubscriptionContextResponse,
  ChannelGroupSubscriptionListResponse,
  ChannelGroupSubscriptionMutationResponse,
  FeedDeleteRequest,
  FeedStatusUpdateRequest,
} from './types.js';
export type {
  SkillDoc,
  SkillEndpointMetadata,
  SkillEndpointTier,
  SkillMetadata,
  SkillSummary,
} from './resources/dataSkills.js';
export type { InvokeFunctionOptions } from './resources/functions.js';
export type { RunOptions } from './resources/run.js';

export { XResource } from './resources/x.js';

export type { TradeOptions } from './resources/trading.js';
export {
  V1TradingResource,
  type SubscribeExecutingLatestParams,
  type TradingSubscription,
} from './v1/trading.js';

export {
  FollowsResource,
  type FollowWriteOptions,
} from './resources/follows.js';
export {
  SubscriptionsResource,
  type SubscriptionWriteOptions,
} from './resources/subscriptions.js';
export { V1ChannelGroupSubscriptionsResource } from './v1/channelGroupSubscriptions.js';
export { V1SubscriptionsResource } from './v1/subscriptions.js';
