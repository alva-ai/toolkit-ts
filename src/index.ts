declare const __VERSION__: string;

/** SDK version, injected at build time from package.json. */
export const VERSION: string =
  typeof __VERSION__ !== 'undefined' ? __VERSION__ : 'dev';

export { AlvaClient } from './client.js';
export { AlvaError } from './error.js';
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
} from './types.js';
export type {
  SkillDoc,
  SkillEndpointMetadata,
  SkillEndpointTier,
  SkillMetadata,
  SkillSummary,
} from './resources/skills.js';
