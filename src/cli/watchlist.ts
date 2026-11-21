import type { AlvaClient } from '../client.js';
import { AlvaError, CliUsageError } from '../error.js';
import type { Schema } from '../platformApi.js';

// Ticker symbols of `alva markets watchlist add|remove`: the watchlist holds
// Asset follows, so the CLI resolves each symbol to its Asset first.

export type TickerKind = 'STOCK' | 'ETF' | 'CRYPTO';

export interface TickerSpec {
  ticker: string;
  kind?: TickerKind;
}

const MAX_TICKERS = 50;
const MAX_TICKER_LENGTH = 40;
const LOOKUP_CONCURRENCY = 5;
const TICKER_KINDS: readonly string[] = ['STOCK', 'ETF', 'CRYPTO'];

/**
 * The listing markets a kind-restricted lookup tries, in order: a symbol
 * resolves to one listing per market, and its Asset carries the kind.
 */
const KIND_ASSET_CLASSES: Record<TickerKind, readonly Schema<'AssetClass'>[]> =
  {
    STOCK: ['US_STOCK', 'NON_US_STOCK'],
    ETF: ['US_STOCK', 'NON_US_STOCK'],
    CRYPTO: ['BINANCE_SPOT', 'HYPERLIQUID_SPOT', 'BINANCE_PERP'],
  };

function tickerKind(value: string, command: string): TickerKind {
  const kind = value.trim().toUpperCase();
  if (!TICKER_KINDS.includes(kind)) {
    throw new CliUsageError(
      `kind must be STOCK, ETF, or CRYPTO for '${command}', got '${value}'`,
      command.split(' ')[0]
    );
  }
  return kind as TickerKind;
}

/**
 * The tickers of `--tickers NVDA,BTC:crypto` (a `:kind` suffix is the kind
 * of that symbol only; `--kind` the default), upper-cased and deduplicated.
 */
export function parseTickers(
  symbols: readonly string[],
  defaultKind: string | undefined,
  command: string
): TickerSpec[] {
  const fallback =
    defaultKind === undefined ? undefined : tickerKind(defaultKind, command);
  const specs: TickerSpec[] = [];
  for (const raw of symbols) {
    const separator = raw.lastIndexOf(':');
    const ticker = (separator === -1 ? raw : raw.slice(0, separator))
      .trim()
      .toUpperCase();
    const kind =
      separator === -1
        ? fallback
        : tickerKind(raw.slice(separator + 1), command);
    if (!ticker || /\s/.test(ticker) || ticker.length > MAX_TICKER_LENGTH) {
      throw new CliUsageError(
        `ticker '${raw}' must be a non-empty symbol of at most ${MAX_TICKER_LENGTH} characters`,
        command.split(' ')[0]
      );
    }
    if (!specs.some((s) => s.ticker === ticker && s.kind === kind)) {
      specs.push(kind === undefined ? { ticker } : { ticker, kind });
    }
  }
  if (specs.length === 0 || specs.length > MAX_TICKERS) {
    throw new CliUsageError(
      `--tickers must contain between 1 and ${MAX_TICKERS} symbols`,
      command.split(' ')[0]
    );
  }
  return specs;
}

/** The Asset of a symbol: its primary listing, or the first listing of the kind. */
async function lookupTicker(
  client: AlvaClient,
  { ticker, kind }: TickerSpec
): Promise<Schema<'Asset'> | undefined> {
  for (const assetClass of kind ? KIND_ASSET_CLASSES[kind] : [undefined]) {
    let asset: Schema<'Asset'>;
    try {
      asset = await client.markets.assetBySymbol(ticker, { assetClass });
    } catch (error) {
      if (error instanceof AlvaError && error.status === 404) continue;
      throw error;
    }
    if (kind === undefined || asset.kind === kind) return asset;
  }
  return undefined;
}

/**
 * The Asset IDs the tickers name, each once (BRK.B and BRK-B may name one
 * Asset). A ticker without an Asset is NOT_FOUND naming every such ticker,
 * before anything is written.
 */
export async function resolveTickers(
  client: AlvaClient,
  specs: readonly TickerSpec[]
): Promise<string[]> {
  const assets: (Schema<'Asset'> | undefined)[] = new Array(specs.length);
  let next = 0;
  const worker = async () => {
    while (next < specs.length) {
      const index = next++;
      assets[index] = await lookupTicker(client, specs[index]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(LOOKUP_CONCURRENCY, specs.length) }, worker)
  );
  const missing = specs.filter((_, i) => assets[i] === undefined);
  if (missing.length > 0) {
    throw new AlvaError(
      'NOT_FOUND',
      missing
        .map(({ ticker, kind }) =>
          kind === undefined
            ? `no asset found for ticker ${ticker}`
            : `no ${kind} asset found for ticker ${ticker}; it may exist as another kind (retry with a different :kind suffix or none)`
        )
        .join('; '),
      404
    );
  }
  return [...new Set(assets.map((asset) => asset!.id))];
}
