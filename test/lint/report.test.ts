// test/lint/report.test.ts
import { describe, it, expect } from 'vitest';
import { formatReport } from '../../src/lint/report.js';
import type { Report } from '../../src/lint/types.js';

const REPORT: Report = {
  findings: [
    { rule: 'required-container', severity: 'error', message: 'missing .playbook-container' },
    { rule: 'anchor-attrs', severity: 'warning', message: 'a tag missing rel', selector: '<a>' },
  ],
  summary: { errors: 1, warnings: 1, info: 0 },
};

describe('formatReport', () => {
  it('human format includes rule names and severities', () => {
    const out = formatReport(REPORT, 'human');
    expect(out).toMatch(/ERROR.*required-container/);
    expect(out).toMatch(/WARNING.*anchor-attrs/);
    expect(out).toMatch(/1 error/);
  });

  it('json format is parseable', () => {
    const out = formatReport(REPORT, 'json');
    expect(JSON.parse(out)).toEqual(REPORT);
  });
});
