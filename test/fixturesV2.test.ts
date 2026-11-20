import { describe, expect, it } from 'vitest';
import { shapeErrors } from './contractShape.js';
import { asset, MARKET_FIXTURES } from './marketV2.js';

// The fakes of the resource tests answer contract shapes.

describe('the /api/v2 test fixtures', () => {
  it.each(MARKET_FIXTURES.map(([name, value]) => [name, value]))(
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
