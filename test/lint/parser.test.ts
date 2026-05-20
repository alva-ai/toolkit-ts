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

  it('sets line on each element from its position in the source', () => {
    const m = parseHtml(HTML);
    // <html> is on line 2, <body> is on line 6, <div> is on line 7
    const html = m.elements.find((e) => e.tag === 'html')!;
    expect(html.line).toBe(2);
    const body = m.elements.find((e) => e.tag === 'body')!;
    expect(body.line).toBe(6);
    const div = m.elements.find((e) => e.tag === 'div')!;
    expect(div.line).toBe(7);
    // <a> is on line 8, <button> is on line 9
    const a = m.elements.find((e) => e.tag === 'a')!;
    expect(a.line).toBe(8);
    const btn = m.elements.find((e) => e.tag === 'button')!;
    expect(btn.line).toBe(9);
  });

  it('sets sourceLine on CSS rules as HTML-absolute line numbers', () => {
    const m = parseHtml(HTML);
    // The <style> tag is on line 2 (<html><head><style> all on line 2).
    // styleBlockStartLine = 2 + 1 = 3.
    // The style element's textContent starts with '\n  body ...' so css-tree
    // reports body at line 2 and .btn-primary at line 3 (1-based within CSS).
    // HTML-absolute: styleBlockStartLine + cssLine - 1 → 3 + 2 - 1 = 4, 3 + 3 - 1 = 5.
    const bodyRule = m.cssRules.find((r) => r.selectorText === 'body')!;
    expect(bodyRule.sourceLine).toBeDefined();
    expect(bodyRule.sourceLine).toBe(4);
    const btnRule = m.cssRules.find((r) => r.selectorText === '.btn-primary')!;
    expect(btnRule.sourceLine).toBeDefined();
    expect(btnRule.sourceLine).toBe(5);
  });
});
