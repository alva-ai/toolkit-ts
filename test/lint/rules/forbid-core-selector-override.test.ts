import { describe, it, expect } from 'vitest';
import { parseHtml } from '../../../src/lint/parser.js';
import { buildModel } from '../../../src/lint/model.js';
import { forbidCoreSelectorOverride } from '../../../src/lint/rules/forbid-core-selector-override.js';
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
    canonicalCssUrls: ['https://x.example/v1/full.css'],
  },
  components: [
    {
      name: 'button',
      root: 'btn',
      variants: ['btn-primary'],
      sizes: ['btn-large'],
    },
    { name: 'chart-card', root: 'chart-container' },
  ],
};

const LINK = '<link rel="stylesheet" href="https://x.example/v1/full.css">';

describe('forbid-core-selector-override', () => {
  it('is a no-op when canonical CSS is NOT linked', () => {
    const m = buildModel(
      parseHtml('<style>.btn { padding: 50px; }</style>'),
      CONTRACT
    );
    expect(forbidCoreSelectorOverride(m, CONTRACT)).toEqual([]);
  });

  it('warns when canonical CSS is linked AND inline overrides .btn', () => {
    const m = buildModel(
      parseHtml(`${LINK}<style>.btn { padding: 50px; }</style>`),
      CONTRACT
    );
    const f = forbidCoreSelectorOverride(m, CONTRACT);
    expect(f).toHaveLength(1);
    expect(f[0]!.severity).toBe('warning');
    expect(f[0]!.message).toMatch(/\.btn/);
  });

  it('does not warn for non-canonical selectors', () => {
    const m = buildModel(
      parseHtml(`${LINK}<style>.my-special-thing { padding: 50px; }</style>`),
      CONTRACT
    );
    expect(forbidCoreSelectorOverride(m, CONTRACT)).toEqual([]);
  });

  it('handles compound selectors like ".btn.btn-primary"', () => {
    const m = buildModel(
      parseHtml(`${LINK}<style>.btn.btn-primary { background: red; }</style>`),
      CONTRACT
    );
    const f = forbidCoreSelectorOverride(m, CONTRACT);
    expect(f.length).toBeGreaterThan(0);
  });

  it('handles descendant selectors like ".chart-container .chart-body"', () => {
    const m = buildModel(
      parseHtml(
        `${LINK}<style>.chart-container .chart-body { height: 999px; }</style>`
      ),
      CONTRACT
    );
    const f = forbidCoreSelectorOverride(m, CONTRACT);
    expect(f.length).toBeGreaterThan(0);
  });
});
