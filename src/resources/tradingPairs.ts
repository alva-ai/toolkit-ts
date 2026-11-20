import type { AlvaClient } from '../client.js';
import { AlvaError } from '../error.js';
import { collectAll, type Schema, type V2Query } from '../platformApi.js';

type TradingPair = Schema<'TradingPair'>;

/** Exact filters on the pairs a ticker search finds, case-insensitive. */
export interface TradingPairFilters {
  /** The pair's exchange (US, HK, BINANCE). */
  market?: string;
  /** The instrument part of the pair symbol (spot, perp, option, etf). */
  instrumentType?: string;
  /** The kind of the pair's base, the start of its type (stock, crypto). */
  underlyingType?: string;
  quote?: string;
}

export interface TradingPairSearchParams extends TradingPairFilters {
  /** A ticker (the pair's base) or a complete pair symbol. */
  symbol: string;
  limit?: number;
}

export type TradingPairResolveParams =
  | ({ pair: string } & TradingPairFilters)
  | ({ symbol: string } & TradingPairFilters);

// A pair symbol is MARKET_TYPE_BASE_QUOTE; a base may hold underscores.
function symbolParts(pair: TradingPair): string[] {
  return pair.symbol.split('_');
}

function base(pair: TradingPair): string {
  return pair.base || symbolParts(pair).slice(2, -1).join('_');
}

function same(value: string | undefined, expected: string | undefined) {
  return (
    expected === undefined ||
    value?.toUpperCase() === expected.trim().toUpperCase()
  );
}

function matches(pair: TradingPair, filters: TradingPairFilters): boolean {
  const kind = pair.type.includes('-') ? pair.type.split('-')[0] : undefined;
  return (
    same(pair.exchange, filters.market) &&
    same(symbolParts(pair)[1], filters.instrumentType) &&
    same(kind, filters.underlyingType) &&
    same(pair.quote, filters.quote)
  );
}

function required(value: unknown, name: string): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text)
    throw new AlvaError('INVALID_ARGUMENT', `${name} is required`, 400);
  return text;
}

/** Backend's catalog of tradable market symbols (BINANCE_PERP_BTC_USDT). */
export class TradingPairsResource {
  constructor(private client: AlvaClient) {}

  /** One page of GET /trading-pairs, which takes exactly one of q, symbol, base with instrumentType, or underlyingType. */
  async list(
    query: V2Query<'/trading-pairs', 'get'>
  ): Promise<Schema<'TradingPairList'>> {
    this.client._requireAuth();
    return this.client._v2Request('GET', '/trading-pairs', { query });
  }

  /**
   * The pairs whose base is the ticker, or whose symbol is the complete
   * pair, among every page of the catalog search, with the filters applied.
   * Several results are normal.
   */
  async search(params: TradingPairSearchParams): Promise<TradingPair[]> {
    this.client._requireAuth();
    const query = required(params?.symbol, 'symbol');
    const pairs = await collectAll(
      this.client._v2Pages<TradingPair>('/trading-pairs', {
        query: { q: query },
        pageSize: 500,
      })
    );
    const found = pairs.filter(
      (p) => (p.symbol === query || same(base(p), query)) && matches(p, params)
    );
    return params.limit === undefined ? found : found.slice(0, params.limit);
  }

  /**
   * Exactly one pair: a complete pair is looked up by its symbol, a ticker is
   * searched. None is TRADING_PAIR_NOT_FOUND (404), several are
   * TRADING_PAIR_NOT_UNIQUE (409), with the candidates in details.
   */
  async resolve(params: TradingPairResolveParams): Promise<TradingPair> {
    this.client._requireAuth();
    let query: string;
    let candidates: TradingPair[];
    if ('pair' in params) {
      query = required(params.pair, 'pair');
      const page = await this.list({ symbol: [query] });
      candidates = page.items.filter(
        (p) => p.symbol === query && matches(p, params)
      );
    } else {
      query = required(params?.symbol, 'symbol');
      candidates = await this.search({ ...params, symbol: query });
    }
    if (candidates.length === 1) return candidates[0];
    const detailLimit = 50;
    throw new AlvaError(
      candidates.length === 0
        ? 'TRADING_PAIR_NOT_FOUND'
        : 'TRADING_PAIR_NOT_UNIQUE',
      candidates.length === 0
        ? `no trading pair matched "${query}"`
        : `${candidates.length} trading pairs matched "${query}"`,
      candidates.length === 0 ? 404 : 409,
      {
        query,
        candidateCount: candidates.length,
        candidates: candidates.slice(0, detailLimit),
        ...(candidates.length > detailLimit ? { truncated: true } : {}),
      }
    );
  }
}
