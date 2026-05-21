import { parseHtml } from './parser.js';
import { buildModel } from './model.js';
import { runRules } from './runner.js';
import type { Contract, Report } from './types.js';

export { loadContract } from './contract.js';
export { formatReport } from './report.js';
export type { Contract, Report, Finding, Severity } from './types.js';

export function lint(html: string, contract: Contract): Report {
  const dom = parseHtml(html);
  const model = buildModel(dom, contract);
  return runRules(model, contract);
}
