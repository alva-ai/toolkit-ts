import type {
  TradingPairCandidate,
  TradingPairSearchResponse,
} from '../resources/tradingPairs.js';

function candidateLine(candidate: TradingPairCandidate): string {
  const metadata = [
    `market=${candidate.market}`,
    `instrument=${candidate.instrumentType}`,
    candidate.underlyingType === undefined
      ? undefined
      : `underlying=${candidate.underlyingType}`,
    `quote=${candidate.quote}`,
  ].filter((value): value is string => value !== undefined);
  return `${candidate.tradingPair} (${metadata.join(' ')})`;
}

export function formatTradingPairSearch(
  result: TradingPairSearchResponse
): string {
  if (result.candidates.length === 0) {
    return `No trading pairs found for "${result.query}".`;
  }
  const lines = result.candidates.map(candidateLine);
  if (result.truncated === true) {
    lines.push(
      `... results truncated at ${result.candidates.length} candidates`
    );
  }
  return lines.join('\n');
}

export function formatTradingPairResolved(
  result: TradingPairCandidate
): string {
  return [
    result.tradingPair,
    `symbol=${result.symbol}`,
    `market=${result.market}`,
    `instrument=${result.instrumentType}`,
    ...(result.underlyingType === undefined
      ? []
      : [`underlying=${result.underlyingType}`]),
    `quote=${result.quote}`,
  ].join('\n');
}
