import type { Report } from './types.js';

export type ReportFormat = 'human' | 'json';

export function formatReport(report: Report, format: ReportFormat): string {
  if (format === 'json') return JSON.stringify(report, null, 2);
  const lines: string[] = [];
  for (const f of report.findings) {
    const sev = f.severity.toUpperCase();
    const sel = f.selector ? ` [${f.selector}]` : '';
    const loc = f.location ? ` (L${f.location.line})` : '';
    lines.push(`${sev}  ${f.rule}${sel}${loc}  ${f.message}`);
  }
  lines.push('');
  lines.push(
    `${report.summary.errors} error(s), ${report.summary.warnings} warning(s), ${report.summary.info} info`
  );
  return lines.join('\n');
}
