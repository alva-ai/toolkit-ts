import * as fs from 'fs';
import { lint, loadContract, formatReport } from '../lint/index.js';
import { loadActiveContract } from '../lint/fetchContract.js';

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
