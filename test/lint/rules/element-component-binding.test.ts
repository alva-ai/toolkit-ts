import { describe, it, expect } from 'vitest';
import { parseHtml } from '../../../src/lint/parser.js';
import { buildModel } from '../../../src/lint/model.js';
import { elementComponentBinding } from '../../../src/lint/rules/element-component-binding.js';
import type { Contract } from '../../../src/lint/types.js';

const CONTRACT: Contract = {
  version: 1,
  global: {
    requiredContainer: { selector: '.playbook-container', mustExist: true },
    scroll: { soleScrollContainer: ['body'] },
    typography: { fontFamilyRootMustInclude: 'Delight', fontWeightAllowed: [400, 500] },
    links: { anchorRequiredAttrs: ['target', 'rel'] },
  },
  components: [
    {
      name: 'button',
      root: 'btn',
      bindings: [{ selector: 'button', requireClass: 'btn' }],
    },
    { name: 'dropdown', root: 'dropdown' },
  ],
};

describe('element-component-binding', () => {
  it('passes when <button> carries .btn', () => {
    const m = buildModel(parseHtml('<button class="btn btn-primary">X</button>'), CONTRACT);
    expect(elementComponentBinding(m, CONTRACT)).toEqual([]);
  });

  it('errors when bare <button> outside any component', () => {
    const m = buildModel(parseHtml('<button>X</button>'), CONTRACT);
    const f = elementComponentBinding(m, CONTRACT);
    expect(f).toHaveLength(1);
    expect(f[0]!.message).toMatch(/btn/);
  });

  it('exempts <button> nested inside .dropdown subtree', () => {
    const m = buildModel(
      parseHtml('<div class="dropdown"><button>toggle</button></div>'),
      CONTRACT
    );
    expect(elementComponentBinding(m, CONTRACT)).toEqual([]);
  });

  it('still errors on <button> sibling of dropdown', () => {
    const m = buildModel(
      parseHtml('<div class="dropdown"></div><button>orphan</button>'),
      CONTRACT
    );
    expect(elementComponentBinding(m, CONTRACT)).toHaveLength(1);
  });
});
