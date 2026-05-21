import { describe, it, expect } from 'vitest';
import { parseHtml } from '../../../src/lint/parser.js';
import { buildModel } from '../../../src/lint/model.js';
import { fontFamilyRoot } from '../../../src/lint/rules/font-family-root.js';
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

describe('font-family-root', () => {
  it('passes when body has Delight in font-family', () => {
    const m = buildModel(
      parseHtml('<style>body { font-family: Delight, -apple-system; }</style>'),
      CONTRACT
    );
    expect(fontFamilyRoot(m, CONTRACT)).toEqual([]);
  });

  it('errors when root font-family lacks Delight', () => {
    const m = buildModel(
      parseHtml('<style>body { font-family: Arial; }</style>'),
      CONTRACT
    );
    expect(fontFamilyRoot(m, CONTRACT)).toHaveLength(1);
  });

  it('errors when body has no font-family rule at all', () => {
    const m = buildModel(parseHtml('<body></body>'), CONTRACT);
    expect(fontFamilyRoot(m, CONTRACT)).toHaveLength(1);
  });
});

describe('font-family-root — canonical CSS auto-pass', () => {
  const CONTRACT_WITH_CANONICAL: Contract = {
    ...CONTRACT,
    global: {
      ...CONTRACT.global,
      canonicalCssUrls: ['https://x.example/v1/full.css'],
    },
  };

  it('passes when canonical CSS is linked even without inline root font-family', () => {
    const m = buildModel(
      parseHtml(
        '<link rel="stylesheet" href="https://x.example/v1/full.css"><body></body>'
      ),
      CONTRACT_WITH_CANONICAL
    );
    expect(fontFamilyRoot(m, CONTRACT_WITH_CANONICAL)).toEqual([]);
  });

  it('still fails when canonical CSS is NOT linked and inline is missing', () => {
    const m = buildModel(parseHtml('<body></body>'), CONTRACT_WITH_CANONICAL);
    expect(fontFamilyRoot(m, CONTRACT_WITH_CANONICAL)).toHaveLength(1);
  });
});
