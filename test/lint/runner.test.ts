// test/lint/runner.test.ts
import { describe, it, expect } from 'vitest';
import { parseHtml } from '../../src/lint/parser.js';
import { buildModel } from '../../src/lint/model.js';
import { runRules } from '../../src/lint/runner.js';
import type { Contract } from '../../src/lint/types.js';

const CONTRACT: Contract = {
  version: 1,
  global: {
    requiredContainer: { selector: '.playbook-container', mustExist: true },
    scroll: { soleScrollContainer: ['body'] },
    typography: { fontFamilyRootMustInclude: 'Delight', fontWeightAllowed: [400, 500] },
    links: { anchorRequiredAttrs: ['target', 'rel'] },
  },
  components: [],
};

describe('runRules', () => {
  it('aggregates findings and computes summary', () => {
    const m = buildModel(parseHtml('<body><p>no container</p></body>'), CONTRACT);
    const report = runRules(m, CONTRACT);
    expect(report.summary.errors).toBeGreaterThan(0);
    expect(report.findings.length).toBe(report.summary.errors + report.summary.warnings + report.summary.info);
  });
});
