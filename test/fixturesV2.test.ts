import { describe, expect, it } from 'vitest';
import { shapeErrors } from './contractShape.js';
import { BILLING_FIXTURES } from './billingV2.js';
import { asset, MARKET_FIXTURES } from './marketV2.js';
import { RUNTIME_FIXTURES } from './runtimeV2.js';

const FIXTURES = [...MARKET_FIXTURES, ...BILLING_FIXTURES, ...RUNTIME_FIXTURES];

// The fakes of the resource tests answer contract shapes.

describe('the /api/v2 test fixtures', () => {
  it.each(FIXTURES.map(([name, value]) => [name, value]))(
    '%s conforms to the contract',
    (name, value) => {
      expect(shapeErrors(name as never, value as never)).toEqual([]);
    }
  );

  it('reports a fixture that does not conform', () => {
    const broken = { ...asset(), id: 'asset_0l', extra: 1 } as never;
    delete (broken as { kind?: unknown }).kind;
    expect(shapeErrors('Asset', broken)).toEqual([
      'Asset.kind: missing',
      'Asset.id: "asset_0l" fails ^asset_0[0-9a-hjkmnp-tv-z]+$',
      'Asset.extra: not in the schema',
    ]);
  });
});
