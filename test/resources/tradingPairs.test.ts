import { afterEach, describe, expect, it } from 'vitest';
import { AlvaClient } from '../../src/client.js';
import { TradingPairsResource } from '../../src/resources/tradingPairs.js';
import { fakeV2 } from '../fakeV2.js';

function pair(fields: Record<string, unknown>) {
  return {
    id: `trading_pair_0${String(fields.symbol)}`,
    description: null,
    logo: null,
    feeRate: '0.001',
    ...fields,
  };
}

function page(items: unknown[], nextPageToken: string | null = null) {
  return { items, nextPageToken };
}

function tradingPairs() {
  return new TradingPairsResource(
    new AlvaClient({ apiKey: 'test-key', baseUrl: 'https://api.test' })
  );
}

let restore = () => {};
afterEach(() => restore());

describe('TradingPairsResource', () => {
  it('reads every page, then normalizes, filters, and deduplicates', async () => {
    const rklb = pair({
      base: 'RKLB',
      quote: 'USD',
      symbol: 'US_SPOT_RKLB_USD',
      exchange: 'US',
      type: 'stock-spot',
      description: 'Rocket Lab',
      logo: 'https://cdn.test/rklb.png',
    });
    const fake = fakeV2({
      'GET /trading-pairs': [
        () => page([rklb], 'p2'),
        () =>
          page([
            rklb,
            pair({
              base: 'RKLB',
              quote: 'USDC',
              symbol: 'HYPERLIQUID_PERP_RKLB_USDC',
              exchange: 'HYPERLIQUID',
              type: 'stock-perp',
            }),
          ]),
      ],
    });
    restore = fake.restore;

    const result = await tradingPairs().search({
      symbol: ' RKLB ',
      market: 'US',
      instrumentType: 'spot',
      underlyingType: 'stock',
      quote: 'USD',
    });

    expect(fake.calls.map((c) => c.query.toString())).toEqual([
      'q=RKLB&pageSize=500',
      'q=RKLB&pageSize=500&pageToken=p2',
    ]);
    expect(result).toEqual({
      query: 'RKLB',
      candidates: [
        {
          symbol: 'RKLB',
          tradingPair: 'US_SPOT_RKLB_USD',
          market: 'US',
          instrumentType: 'spot',
          underlyingType: 'stock',
          quote: 'USD',
          type: 'stock-spot',
          description: 'Rocket Lab',
          feeRate: 0.001,
          symbolIconUrl: 'https://cdn.test/rklb.png',
        },
      ],
    });
  });

  it('resolves a complete pair through ticker search and exact matching', async () => {
    const fake = fakeV2({
      'GET /trading-pairs': () =>
        page([
          pair({
            base: 'M_COIN',
            quote: 'USD',
            symbol: 'COINBASE_SPOT_M_COIN_USD',
            exchange: 'coinbase',
            type: 'spot',
          }),
        ]),
    });
    restore = fake.restore;

    await expect(
      tradingPairs().resolve({ pair: 'COINBASE_SPOT_M_COIN_USD' })
    ).resolves.toMatchObject({
      tradingPair: 'COINBASE_SPOT_M_COIN_USD',
      symbol: 'M_COIN',
      market: 'coinbase',
      instrumentType: 'spot',
    });
    expect(fake.calls[0].query.get('q')).toBe('M_COIN');
  });

  it('infers an underscored symbol when the item has no base', async () => {
    restore = fakeV2({
      'GET /trading-pairs': () =>
        page([
          pair({
            symbol: 'COINBASE_SPOT_M_COIN_USD',
            base: '',
            quote: 'USD',
            exchange: 'COINBASE',
            type: 'crypto-spot',
          }),
        ]),
    }).restore;

    await expect(
      tradingPairs().search({ symbol: 'M_COIN' })
    ).resolves.toMatchObject({
      candidates: [
        expect.objectContaining({
          symbol: 'M_COIN',
          tradingPair: 'COINBASE_SPOT_M_COIN_USD',
        }),
      ],
    });
  });

  it('returns a typed error for missing runtime parameters', async () => {
    const fake = fakeV2({});
    restore = fake.restore;
    const resource = tradingPairs();

    await expect(
      resource.search({ symbol: undefined as never })
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT', status: 400 });
    await expect(
      resource.resolve({ pair: undefined as never })
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT', status: 400 });
    expect(fake.calls).toHaveLength(0);
  });

  it('fails closed when resolve is not unique', async () => {
    restore = fakeV2({
      'GET /trading-pairs': () =>
        page([
          pair({
            base: 'BTC',
            quote: 'USDT',
            symbol: 'BINANCE_SPOT_BTC_USDT',
            exchange: 'BINANCE',
            type: 'crypto-spot',
          }),
          pair({
            base: 'BTC',
            quote: 'USDC',
            symbol: 'COINBASE_SPOT_BTC_USDC',
            exchange: 'COINBASE',
            type: 'crypto-spot',
          }),
        ]),
    }).restore;

    await expect(
      tradingPairs().resolve({ symbol: 'BTC', limit: 1 } as never)
    ).rejects.toMatchObject({
      code: 'TRADING_PAIR_NOT_UNIQUE',
      status: 409,
      details: {
        query: 'BTC',
        candidates: expect.arrayContaining([
          expect.objectContaining({ tradingPair: 'BINANCE_SPOT_BTC_USDT' }),
          expect.objectContaining({ tradingPair: 'COINBASE_SPOT_BTC_USDC' }),
        ]),
      },
    });
  });
});
