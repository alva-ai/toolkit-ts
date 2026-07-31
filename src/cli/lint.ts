import * as fs from 'node:fs';

import {
  handleLintPlaybook as handleLintPlaybookCore,
  lintBeforeRelease as lintBeforeReleaseCore,
  type LintBeforeReleaseOptions,
  type LintPlaybookOptions,
  type LintResult,
} from './lintCore.js';

export type {
  LintBeforeReleaseOptions,
  LintPlaybookOptions,
  LintResult,
} from './lintCore.js';

export function handleLintPlaybook(
  options: LintPlaybookOptions
): Promise<LintResult> {
  return handleLintPlaybookCore({
    readFile: (path) => fs.readFileSync(path, 'utf8'),
    ...options,
  });
}

export function lintBeforeRelease(options: LintBeforeReleaseOptions) {
  return lintBeforeReleaseCore({ stderr: process.stderr, ...options });
}
