import { describe, expect, it, vi } from 'vitest';
import { AlvaClient } from '../../src/client.js';
import { TradingPairsResource } from '../../src/resources/tradingPairs.js';

function makeClient(): AlvaClient & { _request: ReturnType<typeof vi.fn> } {
  const client = new AlvaClient({ apiKey: 'test-key' }) as AlvaClient & {
    _request: ReturnType<typeof vi.fn>;
  };
  client._request = vi.fn();
  return client;
}

describe('TradingPairsResource', () => {
  it('normalizes, filters, and deduplicates the gateway response', async () => {
    const client = makeClient();
    client._request.mockResolvedValue({
      trading_pairs: [
        {
          base: 'RKLB',
          quote: 'USD',
          symbol: 'US_SPOT_RKLB_USD',
          exchange: 'US',
          type: 'stock-spot',
        },
        {
          base: 'RKLB',
          quote: 'USD',
          symbol: 'US_SPOT_RKLB_USD',
          exchange: 'US',
          type: 'stock-spot',
        },
        {
          base: 'RKLB',
          quote: 'USDC',
          symbol: 'HYPERLIQUID_PERP_RKLB_USDC',
          exchange: 'HYPERLIQUID',
          type: 'stock-perp',
        },
      ],
    });

    const result = await new TradingPairsResource(client).search({
      symbol: 'RKLB',
      market: 'US',
      instrumentType: 'spot',
      underlyingType: 'stock',
      quote: 'USD',
    });

    expect(client._request).toHaveBeenCalledWith(
      'GET',
      '/api/v1/trading-pairs/search',
      { query: { q: 'RKLB', strict: true } }
    );
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
        },
      ],
    });
  });

  it('flattens the native Arrays response without changing tradingPair', async () => {
    const client = makeClient();
    client._request.mockResolvedValue({
      success: true,
      data: [
        {
          symbol: 'RKLB',
          alias: [],
          trading_pairs: [
            {
              instrument_type: 'spot',
              pairs: [
                {
                  trading_pair: 'US_SPOT_RKLB_USD',
                  underlying_type: 'stock',
                  market: 'US',
                  quote: 'USD',
                  type: 'stock-spot',
                },
              ],
            },
          ],
        },
      ],
    });

    await expect(
      new TradingPairsResource(client).resolve({
        pair: 'US_SPOT_RKLB_USD',
      })
    ).resolves.toMatchObject({
      tradingPair: 'US_SPOT_RKLB_USD',
      symbol: 'RKLB',
      market: 'US',
      instrumentType: 'spot',
      underlyingType: 'stock',
      quote: 'USD',
    });
  });

  it('resolves a complete pair through ticker search and exact matching', async () => {
    const client = makeClient();
    client._request.mockResolvedValue({
      trading_pairs: [
        {
          base: 'M_COIN',
          quote: 'USD',
          symbol: 'COINBASE_SPOT_M_COIN_USD',
          exchange: 'COINBASE',
          type: 'spot',
        },
      ],
    });

    await expect(
      new TradingPairsResource(client).resolve({
        pair: 'COINBASE_SPOT_M_COIN_USD',
      })
    ).resolves.toMatchObject({ tradingPair: 'COINBASE_SPOT_M_COIN_USD' });

    expect(client._request).toHaveBeenCalledWith(
      'GET',
      '/api/v1/trading-pairs/search',
      { query: { q: 'M_COIN', strict: true } }
    );
  });

  it('infers an underscored symbol when the gateway omits the base field', async () => {
    const client = makeClient();
    client._request.mockResolvedValue({
      trading_pairs: [
        {
          trading_pair: 'COINBASE_SPOT_M_COIN_USD',
          quote: 'USD',
          exchange: 'COINBASE',
          instrument_type: 'spot',
        },
      ],
    });

    await expect(
      new TradingPairsResource(client).search({ symbol: 'M_COIN' })
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
    const client = makeClient();
    const resource = new TradingPairsResource(client);

    await expect(
      resource.search({ symbol: undefined as never })
    ).rejects.toMatchObject({
      code: 'INVALID_ARGUMENT',
      status: 400,
    });
    await expect(
      resource.resolve({ pair: undefined as never })
    ).rejects.toMatchObject({
      code: 'INVALID_ARGUMENT',
      status: 400,
    });
    expect(client._request).not.toHaveBeenCalled();
  });

  it('fails closed when resolve is not unique', async () => {
    const client = makeClient();
    client._request.mockResolvedValue({
      trading_pairs: [
        {
          base: 'BTC',
          quote: 'USDT',
          symbol: 'BINANCE_SPOT_BTC_USDT',
          exchange: 'BINANCE',
          type: 'crypto-spot',
        },
        {
          base: 'BTC',
          quote: 'USDC',
          symbol: 'COINBASE_SPOT_BTC_USDC',
          exchange: 'COINBASE',
          type: 'crypto-spot',
        },
      ],
    });

    await expect(
      new TradingPairsResource(client).resolve({ symbol: 'BTC' })
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
