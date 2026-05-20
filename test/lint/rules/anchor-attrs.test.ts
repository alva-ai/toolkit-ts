import { describe, it, expect } from 'vitest';
import { parseHtml } from '../../../src/lint/parser.js';
import { buildModel } from '../../../src/lint/model.js';
import { anchorAttrs } from '../../../src/lint/rules/anchor-attrs.js';
import type { Contract } from '../../../src/lint/types.js';

const CONTRACT: Contract = {
  version: 1,
  global: {
    requiredContainer: { selector: '.playbook-container', mustExist: true },
    scroll: { soleScrollContainer: ['body'] },
    typography: {
      fontFamilyRootMustInclude: 'Delight',
      fontWeightAllowed: [400, 500],
    },
    links: { anchorRequiredAttrs: ['target', 'rel'] },
  },
  components: [],
};

describe('anchor-attrs', () => {
  it('passes when <a href> has both target and rel', () => {
    const m = buildModel(
      parseHtml('<a href="/x" target="_blank" rel="noopener">x</a>'),
      CONTRACT
    );
    expect(anchorAttrs(m, CONTRACT)).toEqual([]);
  });

  it('errors when missing target', () => {
    const m = buildModel(
      parseHtml('<a href="/x" rel="noopener">x</a>'),
      CONTRACT
    );
    expect(anchorAttrs(m, CONTRACT)).toHaveLength(1);
  });

  it('errors when missing rel', () => {
    const m = buildModel(
      parseHtml('<a href="/x" target="_blank">x</a>'),
      CONTRACT
    );
    expect(anchorAttrs(m, CONTRACT)).toHaveLength(1);
  });

  it('ignores <a> without href', () => {
    const m = buildModel(parseHtml('<a>noop</a>'), CONTRACT);
    expect(anchorAttrs(m, CONTRACT)).toEqual([]);
  });
});
