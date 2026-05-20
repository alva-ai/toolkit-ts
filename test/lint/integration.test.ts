// test/lint/integration.test.ts
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { lint } from '../../src/lint/index.js';
import { loadContract } from '../../src/lint/contract.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONTRACT_YAML = `
version: 1
global:
  required-container: { selector: ".playbook-container", must-exist: true }
  scroll: { sole-scroll-container: ["body"] }
  typography: { font-family-root-must-include: "Delight", font-weight-allowed: [400, 500] }
  links: { anchor-required-attrs: ["target", "rel"] }
components: {}
`;

function read(p: string): string {
  return fs.readFileSync(path.join(__dirname, 'fixtures', p), 'utf8');
}

describe('lint() integration', () => {
  const contract = loadContract(CONTRACT_YAML);

  it('good/minimal.html → 0 errors', () => {
    const r = lint(read('good/minimal.html'), contract);
    expect(r.summary.errors).toBe(0);
  });

  it('bad/missing-container.html → reports required-container', () => {
    const r = lint(read('bad/missing-container.html'), contract);
    expect(r.findings.map((f) => f.rule)).toContain('required-container');
  });

  it('bad/font-weight-700.html → reports font-weight-range', () => {
    const r = lint(read('bad/font-weight-700.html'), contract);
    expect(r.findings.map((f) => f.rule)).toContain('font-weight-range');
  });
});
