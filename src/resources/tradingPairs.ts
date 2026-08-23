import type { AlvaClient } from '../client.js';
import { AlvaError } from '../error.js';

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

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
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

function normalizeCandidate(
  raw: RawRecord,
  outerSymbol?: string
): TradingPairCandidate | undefined {
  const tradingPair =
    stringValue(raw.trading_pair) ??
    stringValue(raw.tradingPair) ??
    stringValue(raw.symbol);
  if (tradingPair === undefined) return undefined;

  const type = stringValue(raw.type);
  const parts = pairParts(tradingPair);
  const symbol =
    stringValue(raw.base) ??
    outerSymbol ??
    (parts.length >= 3 ? parts[2] : tradingPair);
  const market =
    stringValue(raw.market) ?? stringValue(raw.exchange) ?? parts[0] ?? '';
  const quote = stringValue(raw.quote) ?? parts[parts.length - 1] ?? '';
  const instrumentType =
    stringValue(raw.instrument_type) ??
    stringValue(raw.instrumentType) ??
    inferInstrumentType(type, tradingPair);
  const underlyingType =
    stringValue(raw.underlying_type) ??
    stringValue(raw.underlyingType) ??
    inferUnderlyingType(type);

  return {
    symbol,
    tradingPair,
    market,
    instrumentType,
    ...(underlyingType === undefined ? {} : { underlyingType }),
    quote,
    ...(type === undefined ? {} : { type }),
    ...(stringValue(raw.description) === undefined
      ? {}
      : { description: stringValue(raw.description) }),
    ...(numberValue(raw.fee_rate) === undefined
      ? numberValue(raw.feeRate) === undefined
        ? {}
        : { feeRate: numberValue(raw.feeRate) }
      : { feeRate: numberValue(raw.fee_rate) }),
    ...(stringValue(raw.symbol_icon_url) === undefined
      ? stringValue(raw.symbolIconUrl) === undefined
        ? {}
        : { symbolIconUrl: stringValue(raw.symbolIconUrl) }
      : { symbolIconUrl: stringValue(raw.symbol_icon_url) }),
  };
}

function flattenResponse(value: unknown): TradingPairCandidate[] {
  if (!isRecord(value)) return [];

  const flat = value.trading_pairs;
  if (Array.isArray(flat)) {
    return flat.flatMap((item) =>
      isRecord(item)
        ? [normalizeCandidate(item)].filter(
            (candidate): candidate is TradingPairCandidate =>
              candidate !== undefined
          )
        : []
    );
  }

  const data = value.data;
  if (!Array.isArray(data)) return [];
  const candidates: TradingPairCandidate[] = [];
  for (const symbolGroup of data) {
    if (!isRecord(symbolGroup)) continue;
    const symbol = stringValue(symbolGroup.symbol);
    const groups = symbolGroup.trading_pairs;
    if (!Array.isArray(groups)) continue;
    for (const group of groups) {
      if (!isRecord(group) || !Array.isArray(group.pairs)) continue;
      for (const pair of group.pairs) {
        if (!isRecord(pair)) continue;
        const candidate = normalizeCandidate(
          {
            ...pair,
            instrument_type: pair.instrument_type ?? group.instrument_type,
          },
          symbol
        );
        if (candidate !== undefined) candidates.push(candidate);
      }
    }
  }
  return candidates;
}

function matchesQuery(candidate: TradingPairCandidate, query: string): boolean {
  const expected = query.trim();
  // A complete pair is an identity and must match byte-for-byte. Ticker
  // discovery remains case-insensitive for normal human input.
  if (expected.includes('_')) return candidate.tradingPair === expected;
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

function pairSearchParams(
  pair: string,
  params: Omit<TradingPairSearchParams, 'symbol'>
): TradingPairSearchParams {
  const parts = pair.split('_');
  const market = parts[0];
  const instrumentType = parts[1];
  const symbol = parts[2];
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
    const query = params.symbol.trim();
    if (!query)
      throw new AlvaError('INVALID_ARGUMENT', 'symbol is required', 400);

    // `strict=true` is part of the canonical-source contract. Older servers
    // ignore unknown query parameters; the backend must honor it before this
    // command is enabled for production Agent traffic.
    const response = await this.client._request(
      'GET',
      '/api/v1/trading-pairs/search',
      { query: { q: query, strict: true } }
    );
    const candidates = dedupe(flattenResponse(response))
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
      | ({ pair: string } & Omit<TradingPairSearchParams, 'symbol'>)
      | TradingPairSearchParams
  ): Promise<TradingPairCandidate> {
    const pair = 'pair' in params ? params.pair.trim() : undefined;
    const searchParams: TradingPairSearchParams =
      pair === undefined
        ? (params as TradingPairSearchParams)
        : pairSearchParams(pair, params);
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
