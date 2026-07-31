import { lint, loadContract, formatReport } from '../lint/index.js';
import { loadActiveDesignSystem } from '../lint/fetchContract.js';
import type { AlvaClient } from '../client.js';
import type { Report } from '../lint/types.js';
import { isArrayBuffer } from '../arrayBuffer.js';

export interface LintPlaybookOptions {
  file: string;
  format?: 'human' | 'json';
  /** Optional ALFS-backed client. When supplied, file is read through client.fs. */
  client?: AlvaClient;
  /** Local runtime adapter. Required only when client is not supplied. */
  readFile?: (path: string) => string;
  /** Override: use this YAML string instead of fetching the active contract. */
  contractYaml?: string;
}

export interface LintResult {
  exitCode: 0 | 1;
  output: string;
}

function textContent(result: ArrayBuffer | unknown, path: string): string {
  if (typeof result === 'string') return result;
  if (isArrayBuffer(result)) {
    return new TextDecoder('utf-8').decode(result);
  }
  throw new Error(
    `Cannot lint ${path}: expected text content, got ${typeof result}.`
  );
}

async function readPlaybookHtml(opts: LintPlaybookOptions): Promise<string> {
  if (opts.client) {
    return textContent(
      await opts.client.fs.read({ path: opts.file }),
      opts.file
    );
  }
  if (!opts.readFile) {
    throw new Error('Local lint input requires a Node.js runtime adapter.');
  }
  return opts.readFile(opts.file);
}

export async function handleLintPlaybook(
  opts: LintPlaybookOptions
): Promise<LintResult> {
  const html = await readPlaybookHtml(opts);
  const contract = opts.contractYaml
    ? loadContract(opts.contractYaml)
    : await loadActiveDesignSystem();
  const report = lint(html, contract);
  const output = formatReport(report, opts.format ?? 'human');
  return { exitCode: report.summary.errors > 0 ? 1 : 0, output };
}

export interface LintBeforeReleaseOptions {
  client: AlvaClient;
  playbookName: string;
  /** When true: errors are surfaced on stderr but the release proceeds.
   *  Use sparingly — exists for emergency hotfixes and legacy playbook
   *  re-releases that can't realistically be fully refitted. */
  bypassLint?: boolean;
  /** Override for tests — supply a YAML string directly. */
  contractYaml?: string;
  /** Override for tests — supply HTML directly instead of reading via ALFS. */
  html?: string;
  /** Runtime-owned diagnostic sink. */
  stderr?: { write(value: string): unknown };
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
    html = textContent(result, `~/playbooks/${opts.playbookName}/index.html`);
  }

  const contract = opts.contractYaml
    ? loadContract(opts.contractYaml)
    : await loadActiveDesignSystem();

  const report = lint(html, contract);
  if (report.summary.errors > 0) {
    if (opts.bypassLint) {
      // --bypass-lint in effect: surface findings prominently but don't block.
      opts.stderr?.write(
        `WARNING: --bypass-lint bypassing ${report.summary.errors} design lint error(s):\n`
      );
      opts.stderr?.write(formatReport(report, 'human') + '\n');
      return report;
    }
    const err = new Error(
      `Release blocked by design lint:\n${formatReport(report, 'human')}\n` +
        `(Use --bypass-lint to bypass — findings will still be printed to stderr.)`
    );
    (err as Error & { exitCode?: number }).exitCode = 1;
    throw err;
  }
  return report;
}
