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

  it('passes (legacy trust-the-link) when bundleCss is not resolved', () => {
    // Backwards compat: contract built without orchestrator never has bundleCss.
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

describe('font-family-root — bundle verification', () => {
  const CONTRACT_WITH_CANONICAL_AND_BUNDLE = (bundleCss: string): Contract => ({
    ...CONTRACT,
    global: {
      ...CONTRACT.global,
      canonicalCssUrls: ['https://x.example/v1/full.css'],
    },
    bundleCss,
  });

  it('passes when canonical is linked AND bundle declares root font-family', () => {
    const bundle = `
      body { font-family: "Delight", -apple-system, sans-serif; }
      .btn { color: red; }
    `;
    const c = CONTRACT_WITH_CANONICAL_AND_BUNDLE(bundle);
    const m = buildModel(
      parseHtml(
        '<link rel="stylesheet" href="https://x.example/v1/full.css"><body></body>'
      ),
      c
    );
    expect(fontFamilyRoot(m, c)).toEqual([]);
  });

  it('errors when canonical is linked but bundle lacks root font-family', () => {
    // The exact bug #441 was guarding against: bundle on CDN drifted from
    // contract promise. Linter should refuse to auto-pass.
    const bundle = `
      body { -webkit-font-smoothing: antialiased; }
      .btn { font-family: "Delight", sans-serif; }
    `;
    const c = CONTRACT_WITH_CANONICAL_AND_BUNDLE(bundle);
    const m = buildModel(
      parseHtml(
        '<link rel="stylesheet" href="https://x.example/v1/full.css"><body></body>'
      ),
      c
    );
    const findings = fontFamilyRoot(m, c);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toMatch(/bundle/i);
    expect(findings[0]!.message).toMatch(/drifted/i);
  });

  it('errors when bundle has body font-family but with wrong family', () => {
    const bundle = `body { font-family: Helvetica, Arial; }`;
    const c = CONTRACT_WITH_CANONICAL_AND_BUNDLE(bundle);
    const m = buildModel(
      parseHtml(
        '<link rel="stylesheet" href="https://x.example/v1/full.css"><body></body>'
      ),
      c
    );
    expect(fontFamilyRoot(m, c)).toHaveLength(1);
  });

  it('falls through to inline check when canonical is NOT linked, even if bundle is present', () => {
    const bundle = `body { font-family: "Delight"; }`;
    const c = CONTRACT_WITH_CANONICAL_AND_BUNDLE(bundle);
    // Playbook links a different stylesheet — bundle verification does not run
    const m = buildModel(parseHtml('<body></body>'), c);
    expect(fontFamilyRoot(m, c)).toHaveLength(1);
  });
});
