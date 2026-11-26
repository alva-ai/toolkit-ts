import type { Schema } from '../platformApi.js';

type TradingPair = Schema<'TradingPair'>;

function pairLine(pair: TradingPair): string {
  return `${pair.symbol} (exchange=${pair.exchange} type=${pair.type} quote=${pair.quote})`;
}

export function formatTradingPairSearch(
  query: string,
  pairs: readonly TradingPair[]
): string {
  if (pairs.length === 0) return `No trading pairs found for "${query}".`;
  return pairs.map(pairLine).join('\n');
}

export function formatTradingPairResolved(pair: TradingPair): string {
  return [
    pair.symbol,
    `base=${pair.base}`,
    `exchange=${pair.exchange}`,
    `type=${pair.type}`,
    `quote=${pair.quote}`,
  ].join('\n');
}
