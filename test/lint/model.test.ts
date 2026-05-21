// test/lint/model.test.ts
import { describe, it, expect } from 'vitest';
import { parseHtml } from '../../src/lint/parser.js';
import { buildModel } from '../../src/lint/model.js';
import { loadContract } from '../../src/lint/contract.js';

const YAML = `
version: 1
global:
  required-container: { selector: ".playbook-container", must-exist: true }
  scroll: { sole-scroll-container: ["body"] }
  typography: { font-family-root-must-include: "Delight", font-weight-allowed: [400, 500] }
  links: { anchor-required-attrs: ["target", "rel"] }
components:
  button:
    root: "btn"
    bindings:
      - selector: "button"
        require-class: "btn"
  dropdown:
    root: "dropdown"
`;

const HTML = `
<div class="dropdown">
  <button class="dropdown-trigger">Toggle</button>
</div>
<button class="btn btn-primary">OK</button>
<button class="not-component">Bare</button>
`;

describe('buildModel', () => {
  it('marks elements with their nearest ancestor component root', () => {
    const c = loadContract(YAML);
    const m = buildModel(parseHtml(HTML), c);

    const triggerKey = m.dom.elements.find(
      (e) => e.tag === 'button' && e.classes.includes('dropdown-trigger')
    )!.elementKey;
    expect(m.componentOwnership.get(triggerKey)).toBe('dropdown');

    const okKey = m.dom.elements.find(
      (e) => e.tag === 'button' && e.classes.includes('btn-primary')
    )!.elementKey;
    // .btn is itself the root → it owns itself
    expect(m.componentOwnership.get(okKey)).toBe('button');

    const bareKey = m.dom.elements.find(
      (e) => e.tag === 'button' && e.classes.includes('not-component')
    )!.elementKey;
    expect(m.componentOwnership.has(bareKey)).toBe(false);
  });

  it('lists component roots present', () => {
    const c = loadContract(YAML);
    const m = buildModel(parseHtml(HTML), c);
    expect(m.componentRoots.has('dropdown')).toBe(true);
    expect(m.componentRoots.has('button')).toBe(true);
  });
});
