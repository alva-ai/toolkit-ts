import * as fs from 'fs';
import { lint, loadContract, formatReport } from '../lint/index.js';
import { loadActiveContract } from '../lint/fetchContract.js';
import type { AlvaClient } from '../client.js';
import type { Report } from '../lint/types.js';

export interface LintPlaybookOptions {
  file: string;
  format?: 'human' | 'json';
  /** Override: use this YAML string instead of fetching the active contract. */
  contractYaml?: string;
}

export interface LintResult {
  exitCode: 0 | 1;
  output: string;
}

export async function handleLintPlaybook(
  opts: LintPlaybookOptions
): Promise<LintResult> {
  const html = fs.readFileSync(opts.file, 'utf8');
  const contract = opts.contractYaml
    ? loadContract(opts.contractYaml)
    : await loadActiveContract();
  const report = lint(html, contract);
  const output = formatReport(report, opts.format ?? 'human');
  return { exitCode: report.summary.errors > 0 ? 1 : 0, output };
}

export interface LintBeforeReleaseOptions {
  client: AlvaClient;
  playbookName: string;
  /** Override for tests — supply a YAML string directly. */
  contractYaml?: string;
  /** Override for tests — supply HTML directly instead of reading via ALFS. */
  html?: string;
}

/**
 * Reads ~/playbooks/{name}/index.html from ALFS, lints it, throws if errors.
 * Returns the report so the caller can print warnings.
 */
export async function lintBeforeRelease(
  opts: LintBeforeReleaseOptions
): Promise<Report> {
  let html: string;
  if (opts.html !== undefined) {
    html = opts.html;
  } else {
    // `fs.read` is typed `ArrayBuffer | unknown`: the resource layer decodes
    // UTF-8 and returns a string for text bodies (and parsed JSON if the
    // body happens to be valid JSON, which an HTML playbook never is).
    const result = await opts.client.fs.read({
      path: `~/playbooks/${opts.playbookName}/index.html`,
    });
    if (typeof result === 'string') {
      html = result;
    } else if (result instanceof ArrayBuffer) {
      html = new TextDecoder('utf-8').decode(result);
    } else {
      throw new Error(
        `Cannot lint ~/playbooks/${opts.playbookName}/index.html: expected text content, got ${typeof result}.`
      );
    }
  }

  const contract = opts.contractYaml
    ? loadContract(opts.contractYaml)
    : await loadActiveContract();

  const report = lint(html, contract);
  if (report.summary.errors > 0) {
    const err = new Error(
      `Release blocked by design lint:\n${formatReport(report, 'human')}`
    );
    (err as Error & { exitCode?: number }).exitCode = 1;
    throw err;
  }
  return report;
}
