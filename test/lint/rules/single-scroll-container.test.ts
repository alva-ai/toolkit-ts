import { describe, it, expect } from 'vitest';
import { parseHtml } from '../../../src/lint/parser.js';
import { buildModel } from '../../../src/lint/model.js';
import { singleScrollContainer } from '../../../src/lint/rules/single-scroll-container.js';
import type { Contract } from '../../../src/lint/types.js';

const CONTRACT: Contract = {
  version: 1,
  global: {
    requiredContainer: { selector: '.playbook-container', mustExist: true },
    scroll: { soleScrollContainer: ['body', 'html'] },
    typography: {
      fontFamilyRootMustInclude: 'Delight',
      fontWeightAllowed: [400, 500],
    },
    links: { anchorRequiredAttrs: ['target', 'rel'] },
  },
  components: [],
};

describe('single-scroll-container', () => {
  it('passes when only body has overflow-y: auto', () => {
    const m = buildModel(
      parseHtml('<style>body { overflow-y: auto; }</style>'),
      CONTRACT
    );
    expect(singleScrollContainer(m, CONTRACT)).toEqual([]);
  });

  it('errors when .playbook-container has overflow-y: scroll', () => {
    const m = buildModel(
      parseHtml('<style>.playbook-container { overflow-y: scroll; }</style>'),
      CONTRACT
    );
    const f = singleScrollContainer(m, CONTRACT);
    expect(f).toHaveLength(1);
    expect(f[0]!.selector).toBe('.playbook-container');
  });
});
