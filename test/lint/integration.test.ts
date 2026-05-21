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
  typography:
    font-family-root-must-include: "Delight"
    font-weight-allowed: [400, 500]
    font-weight-restrictions:
      - min-font-size-px: 24
        allowed: [400]
  links:
    anchor-required-attrs: ["target", "rel"]
    rel-must-contain: ["noopener", "noreferrer"]
  required-stylesheets:
    - any-of:
        - url: "https://example.com/tokens.css"
        - url: "https://x.example/legacy.css"
        - url: "https://x.example/v1/full.css"
  canonical-css-urls:
    - "https://x.example/v1/full.css"
  anti-aliasing:
    required-declarations:
      - "-webkit-font-smoothing: antialiased"
      - "-moz-osx-font-smoothing: grayscale"
      - "text-rendering: optimizeLegibility"
components:
  button:
    root: "btn"
    variants: ["btn-primary"]
    sizes: ["btn-large"]
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

  it('bad/missing-tokens-link.html → reports required-stylesheet', () => {
    const r = lint(read('bad/missing-tokens-link.html'), contract);
    expect(r.findings.map((f) => f.rule)).toContain('required-stylesheet');
  });

  it('good/v1-bundle-only.html → 0 errors, 0 warnings', () => {
    const r = lint(read('good/v1-bundle-only.html'), contract);
    expect(r.summary.errors).toBe(0);
    expect(r.summary.warnings).toBe(0);
  });

  it('good/legacy-with-inline.html → 0 errors', () => {
    const r = lint(read('good/legacy-with-inline.html'), contract);
    expect(r.summary.errors).toBe(0);
  });

  it('warn/canonical-override.html → 0 errors, ≥1 warning (forbid-core-selector-override)', () => {
    const r = lint(read('warn/canonical-override.html'), contract);
    expect(r.summary.errors).toBe(0);
    expect(r.summary.warnings).toBeGreaterThan(0);
    expect(
      r.findings.some((f) => f.rule === 'forbid-core-selector-override')
    ).toBe(true);
  });
});
