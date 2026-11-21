import { lint, loadContract, formatReport } from '../lint/index.js';
import { loadActiveDesignSystem } from '../lint/fetchContract.js';
import type { AlvaClient } from '../client.js';
import type { Report } from '../lint/types.js';

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

/** The UTF-8 text of an ALFS file. */
async function readText(client: AlvaClient, path: string): Promise<string> {
  const file = await client.fs.read({ path });
  return new TextDecoder('utf-8').decode(file.data);
}

async function readPlaybookHtml(opts: LintPlaybookOptions): Promise<string> {
  if (opts.client) return readText(opts.client, opts.file);
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
    html = await readText(
      opts.client,
      `~/playbooks/${opts.playbookName}/index.html`
    );
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
