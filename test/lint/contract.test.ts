// test/lint/contract.test.ts
import { describe, it, expect } from 'vitest';
import { loadContract } from '../../src/lint/contract.js';

const MIN_YAML = `
version: 1
global:
  required-container:
    selector: ".playbook-container"
    must-exist: true
  scroll:
    sole-scroll-container: ["body"]
  typography:
    font-family-root-must-include: "Delight"
    font-weight-allowed: [400, 500]
  links:
    anchor-required-attrs: ["target", "rel"]
components:
  button:
    root: "btn"
    variants: ["btn-primary"]
    bindings:
      - selector: "button"
        require-class: "btn"
`;

describe('loadContract', () => {
  it('parses kebab-case YAML into camelCase Contract', () => {
    const c = loadContract(MIN_YAML);
    expect(c.version).toBe(1);
    expect(c.global.requiredContainer.selector).toBe('.playbook-container');
    expect(c.global.requiredContainer.mustExist).toBe(true);
    expect(c.global.typography.fontWeightAllowed).toEqual([400, 500]);
    expect(c.global.links.anchorRequiredAttrs).toEqual(['target', 'rel']);
    expect(c.components).toHaveLength(1);
    const btn = c.components[0]!;
    expect(btn.name).toBe('button');
    expect(btn.root).toBe('btn');
    expect(btn.bindings?.[0]).toEqual({
      selector: 'button',
      requireClass: 'btn',
    });
  });

  it('throws on missing version', () => {
    expect(() => loadContract('global: {}')).toThrow(/version/);
  });

  it('throws on component without root', () => {
    expect(() =>
      loadContract(`version: 1\nglobal: {}\ncomponents:\n  bad: {}`)
    ).toThrow(/root/);
  });

  it('loads new optional global fields', () => {
    const c = loadContract(`
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
    - url: "https://example.com/tokens.css"
  anti-aliasing:
    required-declarations:
      - "-webkit-font-smoothing: antialiased"
components: {}
`);
    expect(c.global.typography.fontWeightRestrictions).toEqual([
      { minFontSizePx: 24, allowed: [400] },
    ]);
    expect(c.global.links.relMustContain).toEqual(['noopener', 'noreferrer']);
    expect(c.global.requiredStylesheets).toEqual([
      { url: 'https://example.com/tokens.css' },
    ]);
    expect(c.global.antiAliasing?.requiredDeclarations).toContain(
      '-webkit-font-smoothing: antialiased'
    );
  });

  it('keeps new optional fields undefined when absent', () => {
    const c = loadContract(MIN_YAML);
    expect(c.global.typography.fontWeightRestrictions).toBeUndefined();
    expect(c.global.links.relMustContain).toBeUndefined();
    expect(c.global.requiredStylesheets).toBeUndefined();
    expect(c.global.antiAliasing).toBeUndefined();
  });
});
