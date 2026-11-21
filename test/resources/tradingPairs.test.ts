import { afterEach, describe, expect, it } from 'vitest';
import { AlvaClient } from '../../src/client.js';
import { TradingPairsResource } from '../../src/resources/tradingPairs.js';
import { fakeV2 } from '../fakeV2.js';
import { page, tradingPair } from '../marketV2.js';

function tradingPairs() {
  return new TradingPairsResource(
    new AlvaClient({ apiKey: 'test-key', baseUrl: 'https://api.test' })
  );
}

const RKLB = tradingPair();
const RKLB_PERP = tradingPair({
  id: 'trading_pair_0a2',
  symbol: 'HYPERLIQUID_PERP_RKLB_USDC',
  quote: 'USDC',
  exchange: 'HYPERLIQUID',
  type: 'stock-perp',
});
const RKLBX = tradingPair({
  id: 'trading_pair_0a3',
  symbol: 'US_SPOT_RKLBX_USD',
  base: 'RKLBX',
});

let restore = () => {};
afterEach(() => restore());

describe('TradingPairsResource', () => {
  it('returns one page of the catalog as the API answers it', async () => {
    const fake = fakeV2({
      'GET /trading-pairs': () => page([RKLB], 'p2'),
    });
    restore = fake.restore;

    await expect(
      tradingPairs().list({ symbol: ['US_SPOT_RKLB_USD', 'X'], pageSize: 5 })
    ).resolves.toEqual(page([RKLB], 'p2'));
    expect(fake.calls[0].query.toString()).toBe(
      'symbol=US_SPOT_RKLB_USD&symbol=X&pageSize=5'
    );
  });

  it('searches every page, keeps exact tickers and applies the filters', async () => {
    const fake = fakeV2({
      'GET /trading-pairs': [
        () => page([RKLB, RKLBX], 'p2'),
        () => page([RKLB_PERP]),
      ],
    });
    restore = fake.restore;

    await expect(tradingPairs().search({ symbol: ' rklb ' })).resolves.toEqual([
      RKLB,
      RKLB_PERP,
    ]);
    expect(fake.calls.map((c) => c.query.toString())).toEqual([
      'q=rklb&pageSize=500',
      'q=rklb&pageSize=500&pageToken=p2',
    ]);

    restore();
    restore = fakeV2({
      'GET /trading-pairs': () => page([RKLB, RKLBX, RKLB_PERP]),
    }).restore;
    await expect(
      tradingPairs().search({
        symbol: 'RKLB',
        market: 'hyperliquid',
        instrumentType: 'perp',
        underlyingType: 'stock',
        quote: 'usdc',
      })
    ).resolves.toEqual([RKLB_PERP]);
    await expect(
      tradingPairs().search({ symbol: 'RKLB', limit: 1 })
    ).resolves.toEqual([RKLB]);
  });

  it('reads an underscored base from the pair symbol when the base is empty', async () => {
    const coin = tradingPair({
      symbol: 'COINBASE_SPOT_M_COIN_USD',
      base: '',
      exchange: 'COINBASE',
      type: 'crypto-spot',
    });
    restore = fakeV2({ 'GET /trading-pairs': () => page([coin]) }).restore;

    await expect(tradingPairs().search({ symbol: 'M_COIN' })).resolves.toEqual([
      coin,
    ]);
  });

  it('resolves a complete pair by its symbol', async () => {
    const fake = fakeV2({ 'GET /trading-pairs': () => page([RKLB]) });
    restore = fake.restore;

    await expect(
      tradingPairs().resolve({ pair: 'US_SPOT_RKLB_USD' })
    ).resolves.toEqual(RKLB);
    expect(fake.calls[0].query.toString()).toBe('symbol=US_SPOT_RKLB_USD');
    await expect(
      tradingPairs().resolve({ pair: 'US_SPOT_RKLB_USD', market: 'HK' })
    ).rejects.toMatchObject({ code: 'TRADING_PAIR_NOT_FOUND', status: 404 });
  });

  it('fails closed when a ticker resolves to several pairs', async () => {
    restore = fakeV2({
      'GET /trading-pairs': () => page([RKLB, RKLB_PERP]),
    }).restore;

    await expect(
      tradingPairs().resolve({ symbol: 'RKLB' })
    ).rejects.toMatchObject({
      code: 'TRADING_PAIR_NOT_UNIQUE',
      status: 409,
      details: {
        query: 'RKLB',
        candidateCount: 2,
        candidates: [RKLB, RKLB_PERP],
      },
    });
  });

  it('refuses a missing symbol or pair before any request', async () => {
    const fake = fakeV2({});
    restore = fake.restore;
    const resource = tradingPairs();

    await expect(
      resource.search({ symbol: undefined as never })
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT', status: 400 });
    await expect(resource.resolve({ pair: ' ' })).rejects.toMatchObject({
      code: 'INVALID_ARGUMENT',
      status: 400,
    });
    expect(fake.calls).toHaveLength(0);
  });
});
