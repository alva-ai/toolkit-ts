import type { AlvaClient } from '../client.js';
import { AlvaError } from '../error.js';
import { collectAll } from '../platformApi.js';
import type { AlvaId } from '../types.js';

export interface TradingPairCandidate {
  /** Underlying ticker returned by the market catalog. */
  symbol: string;
  /** Complete canonical identity used by OHLCV, Altra, and orders. */
  tradingPair: string;
  market: string;
  instrumentType: string;
  underlyingType?: string;
  quote: string;
  type?: string;
  description?: string;
  feeRate?: number;
  symbolIconUrl?: string;
}

export interface TradingPairSearchParams {
  symbol: string;
  market?: string;
  instrumentType?: string;
  underlyingType?: string;
  quote?: string;
  limit?: number;
}

export interface TradingPairSearchResponse {
  query: string;
  candidates: TradingPairCandidate[];
  truncated?: boolean;
}

type RawRecord = Record<string, unknown>;

function isRecord(value: unknown): value is RawRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

function upper(value: string | undefined): string | undefined {
  return value === undefined ? undefined : value.trim().toUpperCase();
}

function pairParts(pair: string): string[] {
  return pair.split('_');
}

function inferInstrumentType(
  rawType: string | undefined,
  tradingPair: string
): string {
  const type = rawType?.toLowerCase();
  if (type?.includes('spot')) return 'spot';
  if (type?.includes('perp')) return 'perp';
  if (type?.includes('option')) return 'option';
  return pairParts(tradingPair)[1]?.toLowerCase() ?? '';
}

function inferUnderlyingType(rawType: string | undefined): string | undefined {
  if (rawType === undefined) return undefined;
  const prefix = rawType.split('-')[0]?.trim().toLowerCase();
  return prefix && prefix !== rawType.toLowerCase() ? prefix : undefined;
}

// One item of GET /api/v2/trading-pairs (alva-gateway pkg/v2/api/market).
interface WireTradingPair {
  id: AlvaId;
  symbol: string;
  base: string;
  quote: string;
  exchange: string;
  type: string;
  feeRate: string;
  description: string | null;
  logo: string | null;
}

function toCandidate(item: WireTradingPair): TradingPairCandidate | undefined {
  const tradingPair = stringValue(item.symbol);
  if (tradingPair === undefined) return undefined;

  const type = stringValue(item.type);
  const parts = pairParts(tradingPair);
  const symbol =
    stringValue(item.base) ??
    (parts.length >= 4
      ? parts.slice(2, -1).join('_')
      : parts.length === 3
        ? parts[2]
        : tradingPair);
  const underlyingType = inferUnderlyingType(type);
  const description = stringValue(item.description);
  const feeRate = Number(item.feeRate);
  const symbolIconUrl = stringValue(item.logo);

  return {
    symbol,
    tradingPair,
    market: stringValue(item.exchange) ?? parts[0] ?? '',
    instrumentType: inferInstrumentType(type, tradingPair),
    ...(underlyingType === undefined ? {} : { underlyingType }),
    quote: stringValue(item.quote) ?? parts[parts.length - 1] ?? '',
    ...(type === undefined ? {} : { type }),
    ...(description === undefined ? {} : { description }),
    ...(typeof item.feeRate === 'string' && Number.isFinite(feeRate)
      ? { feeRate }
      : {}),
    ...(symbolIconUrl === undefined ? {} : { symbolIconUrl }),
  };
}

function matchesQuery(candidate: TradingPairCandidate, query: string): boolean {
  const expected = query.trim();
  // A complete pair is an identity and must match byte-for-byte. If the
  // query is a ticker containing underscores, fall through to ticker matching.
  if (candidate.tradingPair === expected) return true;
  return upper(candidate.symbol) === upper(expected);
}

function matchesFilter(
  value: string | undefined,
  expected: string | undefined
): boolean {
  return expected === undefined || upper(value) === upper(expected);
}

function dedupe(candidates: TradingPairCandidate[]): TradingPairCandidate[] {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (seen.has(candidate.tradingPair)) return false;
    seen.add(candidate.tradingPair);
    return true;
  });
}

type TradingPairResolveFilters = Omit<
  TradingPairSearchParams,
  'symbol' | 'limit'
>;

function resolveFilters(params: unknown): TradingPairResolveFilters {
  const record = isRecord(params) ? params : {};
  return {
    market: typeof record.market === 'string' ? record.market : undefined,
    instrumentType:
      typeof record.instrumentType === 'string'
        ? record.instrumentType
        : undefined,
    underlyingType:
      typeof record.underlyingType === 'string'
        ? record.underlyingType
        : undefined,
    quote: typeof record.quote === 'string' ? record.quote : undefined,
  };
}

function pairSearchParams(
  pair: string,
  params: TradingPairResolveFilters
): TradingPairSearchParams {
  const parts = pair.split('_');
  const market = parts[0];
  const instrumentType = parts[1];
  const symbol =
    parts.length >= 4
      ? parts.slice(2, -1).join('_')
      : parts.length === 3
        ? parts[2]
        : undefined;
  const quote = parts.at(-1);
  if (!market || !instrumentType || !symbol || !quote) {
    return { symbol: pair, ...params };
  }

  return {
    symbol,
    market: params.market ?? market,
    instrumentType: params.instrumentType ?? instrumentType,
    underlyingType: params.underlyingType,
    quote: params.quote ?? quote,
  };
}

export class TradingPairsResource {
  constructor(private client: AlvaClient) {}

  async search(
    params: TradingPairSearchParams
  ): Promise<TradingPairSearchResponse> {
    this.client._requireAuth();
    const rawSymbol = isRecord(params) ? params.symbol : undefined;
    const query = typeof rawSymbol === 'string' ? rawSymbol.trim() : '';
    if (!query)
      throw new AlvaError('INVALID_ARGUMENT', 'symbol is required', 400);

    const pairs = await collectAll(
      this.client._v2Pages<WireTradingPair>('/trading-pairs', {
        query: { q: query },
        pageSize: 500,
      })
    );
    const candidates = dedupe(
      pairs.flatMap((pair) => {
        const candidate = toCandidate(pair);
        return candidate === undefined ? [] : [candidate];
      })
    )
      .filter((candidate) => matchesQuery(candidate, query))
      .filter((candidate) => matchesFilter(candidate.market, params.market))
      .filter((candidate) =>
        matchesFilter(candidate.instrumentType, params.instrumentType)
      )
      .filter((candidate) =>
        matchesFilter(candidate.underlyingType, params.underlyingType)
      )
      .filter((candidate) => matchesFilter(candidate.quote, params.quote));
    const limit = params.limit;
    if (limit !== undefined && candidates.length > limit) {
      return { query, candidates: candidates.slice(0, limit), truncated: true };
    }
    return { query, candidates };
  }

  async resolve(
    params:
      | ({ pair: string } & TradingPairResolveFilters)
      | Omit<TradingPairSearchParams, 'limit'>
  ): Promise<TradingPairCandidate> {
    const record: RawRecord = isRecord(params) ? params : {};
    const pair =
      typeof record.pair === 'string' ? record.pair.trim() : undefined;
    const filters = resolveFilters(params);
    const searchParams: TradingPairSearchParams =
      pair === undefined
        ? {
            symbol: typeof record.symbol === 'string' ? record.symbol : '',
            ...filters,
          }
        : pairSearchParams(pair, filters);
    const result = await this.search(searchParams);
    const candidates =
      pair === undefined
        ? result.candidates
        : result.candidates.filter(
            (candidate) => candidate.tradingPair === pair
          );
    if (candidates.length !== 1) {
      const detailLimit = 50;
      throw new AlvaError(
        candidates.length === 0
          ? 'TRADING_PAIR_NOT_FOUND'
          : 'TRADING_PAIR_NOT_UNIQUE',
        candidates.length === 0
          ? `no canonical trading pair matched "${pair ?? searchParams.symbol}"`
          : `multiple canonical trading pairs matched "${searchParams.symbol}"`,
        candidates.length === 0 ? 404 : 409,
        {
          query: pair ?? searchParams.symbol,
          candidateCount: candidates.length,
          candidates: candidates.slice(0, detailLimit),
          ...(candidates.length > detailLimit ? { truncated: true } : {}),
        }
      );
    }
    return candidates[0]!;
  }
}
