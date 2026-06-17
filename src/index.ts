declare const __VERSION__: string;

/** SDK version, injected at build time from package.json. */
export const VERSION: string =
  typeof __VERSION__ !== 'undefined' ? __VERSION__ : 'dev';

export { AlvaClient } from './client.js';
export { AlvaError, CliUsageError } from './error.js';
export * from './playbookRuntime.js';
export type {
  AlvaClientConfig,
  FsReadParams,
  FsWriteParams,
  FsRawWriteParams,
  FsWriteResponse,
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
  NotificationPreferenceKey,
  NotificationPreference,
  NotificationPreferencesResponse,
  NotificationPreferenceUpdateParams,
  NotificationPreferenceUpdateResponse,
  SubmitFeedbackRequest,
  SubmitFeedbackResponse,
  FeedDeleteRequest,
  FeedDeleteResponse,
  FeedStatusUpdateRequest,
  FeedStatusUpdateResponse,
} from './types.js';
export type {
  SkillDoc,
  SkillEndpointMetadata,
  SkillEndpointTier,
  SkillMetadata,
  SkillSummary,
} from './resources/dataSkills.js';
export type {
  TrendingPlaybookItem,
  TrendingPlaybooksDir,
  TrendingPlaybooksParams,
  TrendingPlaybooksResponse,
  TrendingPlaybooksSort,
} from './resources/playbooks.js';
export type {
  PlaybookSkillFile,
  PlaybookSkillFileMeta,
  PlaybookSkillMeta,
  PlaybookSkillSummary,
  PlaybookSkillTagEntry,
} from './resources/playbookSkills.js';
export type {
  CreateAllowanceParams,
  CreateAllowanceResponse,
  CreditAllowance,
  DeleteFunctionParams,
  GetAllowanceParams,
  InvokeFunctionParams,
  InvokeFunctionResponse,
  ListAllowancesResponse,
  ListFunctionsParams,
  ListFunctionsResponse,
  PlaybookFunction,
  RegisterFunctionParams,
  RegisterFunctionResponse,
  RevokeAllowanceParams,
  RevokeAllowanceResponse,
} from './resources/functions.js';
