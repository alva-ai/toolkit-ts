// test/lint/parser.test.ts
import { describe, it, expect } from 'vitest';
import { parseHtml } from '../../src/lint/parser.js';

const HTML = `<!doctype html>
<html><head><style>
  body { font-family: Delight, sans-serif; overflow-y: auto; }
  .btn-primary { font-weight: 700; }
</style></head>
<body>
  <div class="playbook-container">
    <a href="/x" target="_blank" rel="noopener">link</a>
    <button class="btn btn-primary" style="padding: 8px">Go</button>
  </div>
</body></html>`;

describe('parseHtml', () => {
  it('extracts elements with classes and inline styles', () => {
    const m = parseHtml(HTML);
    const btn = m.elements.find((e) => e.tag === 'button')!;
    expect(btn.classes).toEqual(['btn', 'btn-primary']);
    expect(btn.declarations).toEqual({ padding: '8px' });
    const a = m.elements.find((e) => e.tag === 'a')!;
    expect(a.attrs.target).toBe('_blank');
    expect(a.attrs.rel).toBe('noopener');
  });

  it('extracts CSS rules from <style>', () => {
    const m = parseHtml(HTML);
    const bodyRule = m.cssRules.find((r) => r.selectorText === 'body')!;
    expect(bodyRule.declarations['font-family']).toContain('Delight');
    expect(bodyRule.declarations['overflow-y']).toBe('auto');
    const btnRule = m.cssRules.find((r) => r.selectorText === '.btn-primary')!;
    expect(btnRule.declarations['font-weight']).toBe('700');
  });
});
