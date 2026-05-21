// test/lint/report.test.ts
import { describe, it, expect } from 'vitest';
import { formatReport } from '../../src/lint/report.js';
import type { Report } from '../../src/lint/types.js';

const REPORT: Report = {
  findings: [
    {
      rule: 'required-container',
      severity: 'error',
      message: 'missing .playbook-container',
    },
    {
      rule: 'anchor-attrs',
      severity: 'warning',
      message: 'a tag missing rel',
      selector: '<a>',
    },
  ],
  summary: { errors: 1, warnings: 1, info: 0 },
};

const REPORT_WITH_LOCATION: Report = {
  findings: [
    {
      rule: 'component-required-structure',
      severity: 'error',
      message: '<div class="tab …"> missing required variant',
      location: { line: 41, column: 0 },
    },
    {
      rule: 'anchor-attrs',
      severity: 'error',
      message: '<a href="/x"> is missing required attribute \'rel\'.',
      selector: '<a>',
      location: { line: 8, column: 0 },
    },
  ],
  summary: { errors: 2, warnings: 0, info: 0 },
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

  it('human format includes (L<line>) when location is set', () => {
    const out = formatReport(REPORT_WITH_LOCATION, 'human');
    expect(out).toMatch(/ERROR.*component-required-structure.*\(L41\)/);
    expect(out).toMatch(/ERROR.*anchor-attrs.*\(L8\)/);
  });

  it('human format omits line annotation when location is absent', () => {
    const out = formatReport(REPORT, 'human');
    expect(out).not.toMatch(/\(L\d+\)/);
  });

  it('json format serializes location naturally', () => {
    const out = formatReport(REPORT_WITH_LOCATION, 'json');
    const parsed = JSON.parse(out) as Report;
    expect(parsed.findings[0]!.location).toEqual({ line: 41, column: 0 });
    expect(parsed.findings[1]!.location).toEqual({ line: 8, column: 0 });
  });
});
