/** @deprecated Arrays no longer uses endpoint subscription tiers. */
export type SkillEndpointTier = 'public' | 'alternative' | 'unstructured';

export interface SkillEndpointMetadata {
  skill: string;
  file: string;
  method: string;
  path: string;
  /** @deprecated Arrays no longer uses endpoint subscription tiers. */
  tier?: SkillEndpointTier;
  /** @deprecated Arrays no longer uses endpoint subscription tiers. */
  required_subscription_tier?: 'free' | 'pro';
  /** @deprecated Arrays no longer uses endpoint subscription tiers. */
  access?: 'free_and_pro' | 'pro_only';
  /** @deprecated Arrays no longer uses endpoint subscription tiers. */
  pro_required?: boolean;
}

const SKILL_ENDPOINT_METADATA: SkillEndpointMetadata[] = [
  {
    skill: 'arrays-data-api-crypto-futures-data',
    file: 'binance-perp-usdt-kline',
    method: 'GET',
    path: '/api/v1/crypto/binance/perp/usdt/kline',
  },
  {
    skill: 'arrays-data-api-spot-market-price-and-volume',
    file: 'binance-spot-usdt-kline',
    method: 'GET',
    path: '/api/v1/crypto/binance/spot/usdt/kline',
  },
  {
    skill: 'arrays-data-api-crypto-metrics-and-screener',
    file: 'fear-greed-index',
    method: 'GET',
    path: '/api/v1/crypto/fear-greed-index',
  },
  {
    skill: 'arrays-data-api-crypto-futures-data',
    file: 'funding-rate',
    method: 'GET',
    path: '/api/v1/crypto/funding-rate',
  },
  {
    skill: 'arrays-data-api-crypto-futures-data',
    file: 'hyperliquid-perp-usdc-kline',
    method: 'GET',
    path: '/api/v1/crypto/hyperliquid/perp/usdc/kline',
  },
  {
    skill: 'arrays-data-api-spot-market-price-and-volume',
    file: 'hyperliquid-spot-usdc-kline',
    method: 'GET',
    path: '/api/v1/crypto/hyperliquid/spot/usdc/kline',
  },
  {
    skill: 'arrays-data-api-crypto-futures-data',
    file: 'long-short-ratio',
    method: 'GET',
    path: '/api/v1/crypto/long-short-ratio',
  },
  {
    skill: 'arrays-data-api-crypto-metrics-and-screener',
    file: 'crypto-market-cap',
    method: 'GET',
    path: '/api/v1/crypto/market-cap',
  },
  {
    skill: 'arrays-data-api-crypto-metrics-and-screener',
    file: 'market-metrics',
    method: 'GET',
    path: '/api/v1/crypto/market-metrics',
  },
  {
    skill: 'arrays-data-api-crypto-futures-data',
    file: 'open-interest',
    method: 'GET',
    path: '/api/v1/crypto/open-interest',
  },
  {
    skill: 'arrays-data-api-crypto-metrics-and-screener',
    file: 'screener-metrics',
    method: 'GET',
    path: '/api/v1/crypto/screener/metrics',
  },
  {
    skill: 'arrays-data-api-crypto-metrics-and-screener',
    file: 'screener-metrics-timerange',
    method: 'GET',
    path: '/api/v1/crypto/screener/metrics/timerange',
  },
  {
    skill: 'arrays-data-api-crypto-metrics-and-screener',
    file: 'crypto-detail',
    method: 'GET',
    path: '/api/v1/crypto/detail',
  },
  {
    skill: 'arrays-data-api-etf-fundamentals',
    file: 'country-weightings',
    method: 'GET',
    path: '/api/v1/etf/country-weightings',
  },
  {
    skill: 'arrays-data-api-etf-fundamentals',
    file: 'holdings',
    method: 'GET',
    path: '/api/v1/etf/holdings',
  },
  {
    skill: 'arrays-data-api-etf-fundamentals',
    file: 'info',
    method: 'GET',
    path: '/api/v1/etf/info',
  },
  {
    skill: 'arrays-data-api-etf-fundamentals',
    file: 'sector-weightings',
    method: 'GET',
    path: '/api/v1/etf/sector-weightings',
  },
  {
    skill: 'arrays-data-api-macro-and-economics',
    file: 'macro-commodity-historical',
    method: 'GET',
    path: '/api/v1/macro/commodity/historical',
  },
  {
    skill: 'arrays-data-api-macro-and-economics',
    file: 'macro-commodity-real-time',
    method: 'GET',
    path: '/api/v1/macro/commodity/real-time',
  },
  {
    skill: 'arrays-data-api-macro-and-economics',
    file: 'macro-commodity-symbol-list',
    method: 'GET',
    path: '/api/v1/macro/commodity/symbols',
  },
  {
    skill: 'arrays-data-api-macro-and-economics',
    file: 'economic-indicators',
    method: 'GET',
    path: '/api/v1/macro/economic-indicators',
  },
  {
    skill: 'arrays-data-api-macro-and-economics',
    file: 'macro-forex-historical',
    method: 'GET',
    path: '/api/v1/macro/forex/historical',
  },
  {
    skill: 'arrays-data-api-macro-and-economics',
    file: 'macro-forex-real-time',
    method: 'GET',
    path: '/api/v1/macro/forex/real-time',
  },
  {
    skill: 'arrays-data-api-macro-and-economics',
    file: 'macro-forex-symbol-list',
    method: 'GET',
    path: '/api/v1/macro/forex/symbols',
  },
  {
    skill: 'arrays-data-api-macro-and-economics',
    file: 'macro-index-historical',
    method: 'GET',
    path: '/api/v1/macro/index/historical',
  },
  {
    skill: 'arrays-data-api-macro-and-economics',
    file: 'macro-index-real-time',
    method: 'GET',
    path: '/api/v1/macro/index/real-time',
  },
  {
    skill: 'arrays-data-api-macro-and-economics',
    file: 'rates',
    method: 'GET',
    path: '/api/v1/macro/treasury-rates',
  },
  {
    skill: 'arrays-data-api-equity-fundamentals',
    file: 'company-balance-sheets',
    method: 'GET',
    path: '/api/v1/stocks/company/balance-sheets',
  },
  {
    skill: 'arrays-data-api-equity-fundamentals',
    file: 'company-cashflow-statements',
    method: 'GET',
    path: '/api/v1/stocks/company/cashflow-statements',
  },
  {
    skill: 'arrays-data-api-equity-fundamentals',
    file: 'company-detail',
    method: 'GET',
    path: '/api/v1/stocks/company/detail',
  },
  {
    skill: 'arrays-data-api-equity-fundamentals',
    file: 'company-income-statements',
    method: 'GET',
    path: '/api/v1/stocks/company/income-statements',
  },
  {
    skill: 'arrays-data-api-equity-fundamentals',
    file: 'company-kpi',
    method: 'GET',
    path: '/api/v1/stocks/company/kpi',
  },
  {
    skill: 'arrays-data-api-equity-events',
    file: 'crowdfunding-offerings',
    method: 'GET',
    path: '/api/v1/stocks/crowdfunding/offerings',
  },
  {
    skill: 'arrays-data-api-equity-events',
    file: 'dividends',
    method: 'GET',
    path: '/api/v1/stocks/dividends',
  },
  {
    skill: 'arrays-data-api-equity-events',
    file: 'earnings-calendar',
    method: 'GET',
    path: '/api/v1/stocks/earnings-calendar',
  },
  {
    skill: 'arrays-data-api-equity-events',
    file: 'equity-offering',
    method: 'GET',
    path: '/api/v1/stocks/equity-offering',
  },
  {
    skill: 'arrays-data-api-stock-metrics',
    file: 'financial-metrics',
    method: 'GET',
    path: '/api/v1/stocks/financial-metrics',
  },
  {
    skill: 'arrays-data-api-equity-fundamentals',
    file: 'fiscal-dates',
    method: 'GET',
    path: '/api/v1/stocks/fiscal-dates',
  },
  {
    skill: 'arrays-data-api-equity-fundamentals',
    file: 'fiscal-dates-range',
    method: 'GET',
    path: '/api/v1/stocks/fiscal-dates/range',
  },
  {
    skill: 'arrays-data-api-equity-events',
    file: 'ipo-calendar',
    method: 'GET',
    path: '/api/v1/stocks/ipo-calendar',
  },
  {
    skill: 'arrays-data-api-equity-events',
    file: 'ipo-confirmed-calendar',
    method: 'GET',
    path: '/api/v1/stocks/ipo-confirmed-calendar',
  },
  {
    skill: 'arrays-data-api-spot-market-price-and-volume',
    file: 'stocks-kline',
    method: 'GET',
    path: '/api/v1/stocks/kline',
  },
  {
    skill: 'arrays-data-api-stock-metrics',
    file: 'market-metrics',
    method: 'GET',
    path: '/api/v1/stocks/market-metrics',
  },
  {
    skill: 'arrays-data-api-equity-events',
    file: 'mergers-acquisitions',
    method: 'GET',
    path: '/api/v1/stocks/mergers-acquisitions',
  },
  {
    skill: 'arrays-data-api-equity-fundamentals',
    file: 'outstanding-shares',
    method: 'GET',
    path: '/api/v1/stocks/outstanding-shares',
  },
  {
    skill: 'arrays-data-api-stock-metrics',
    file: 'ratings',
    method: 'GET',
    path: '/api/v1/stocks/ratings',
  },
  {
    skill: 'arrays-data-api-stock-screener',
    file: 'basic-info-screener',
    method: 'GET',
    path: '/api/v1/stocks/screener/basic-info/{sub}',
  },
  {
    skill: 'arrays-data-api-stock-screener',
    file: 'event-screener',
    method: 'GET',
    path: '/api/v1/stocks/screener/events',
  },
  {
    skill: 'arrays-data-api-stock-screener',
    file: 'screener-financial-metrics',
    method: 'GET',
    path: '/api/v1/stocks/screener/financial-metrics',
  },
  {
    skill: 'arrays-data-api-stock-screener',
    file: 'screener-financial-metrics-timerange',
    method: 'GET',
    path: '/api/v1/stocks/screener/financial-metrics/timerange',
  },
  {
    skill: 'arrays-data-api-stock-screener',
    file: 'screener-technical-metrics',
    method: 'GET',
    path: '/api/v1/stocks/screener/technical-metrics',
  },
  {
    skill: 'arrays-data-api-stock-screener',
    file: 'screener-technical-metrics-timerange',
    method: 'GET',
    path: '/api/v1/stocks/screener/technical-metrics/timerange',
  },
  {
    skill: 'arrays-data-api-equity-events',
    file: 'sec-earnings-release',
    method: 'GET',
    path: '/api/v1/stocks/sec-earnings-release',
  },
  {
    skill: 'arrays-data-api-equity-fundamentals',
    file: 'shares-float',
    method: 'GET',
    path: '/api/v1/stocks/shares-float',
  },
  {
    skill: 'arrays-data-api-equity-events',
    file: 'splits',
    method: 'GET',
    path: '/api/v1/stocks/splits',
  },
  {
    skill: 'arrays-data-api-crypto-exchange-flow',
    file: 'exchange-flows',
    method: 'GET',
    path: '/api/v1/crypto/exchange-flows',
  },
  {
    skill: 'arrays-data-api-company-crypto-holdings',
    file: 'crypto-holdings',
    method: 'GET',
    path: '/api/v1/crypto/holdings',
  },
  {
    skill: 'arrays-data-api-crypto-metrics-and-screener',
    file: 'metrics-inflow-cdd',
    method: 'GET',
    path: '/api/v1/crypto/metrics/inflow-cdd',
  },
  {
    skill: 'arrays-data-api-crypto-metrics-and-screener',
    file: 'metrics-leverage-ratio',
    method: 'GET',
    path: '/api/v1/crypto/metrics/leverage-ratio',
  },
  {
    skill: 'arrays-data-api-crypto-metrics-and-screener',
    file: 'metrics-miner-to-exchange',
    method: 'GET',
    path: '/api/v1/crypto/metrics/miner-to-exchange',
  },
  {
    skill: 'arrays-data-api-crypto-metrics-and-screener',
    file: 'metrics-mvrv',
    method: 'GET',
    path: '/api/v1/crypto/metrics/mvrv',
  },
  {
    skill: 'arrays-data-api-crypto-metrics-and-screener',
    file: 'metrics-nupl',
    method: 'GET',
    path: '/api/v1/crypto/metrics/nupl',
  },
  {
    skill: 'arrays-data-api-crypto-metrics-and-screener',
    file: 'metrics-puell-multiple',
    method: 'GET',
    path: '/api/v1/crypto/metrics/puell-multiple',
  },
  {
    skill: 'arrays-data-api-crypto-metrics-and-screener',
    file: 'metrics-realized-price',
    method: 'GET',
    path: '/api/v1/crypto/metrics/realized-price',
  },
  {
    skill: 'arrays-data-api-crypto-metrics-and-screener',
    file: 'metrics-sopr',
    method: 'GET',
    path: '/api/v1/crypto/metrics/sopr',
  },
  {
    skill: 'arrays-data-api-crypto-metrics-and-screener',
    file: 'metrics-ssr',
    method: 'GET',
    path: '/api/v1/crypto/metrics/ssr',
  },
  {
    skill: 'arrays-data-api-crypto-metrics-and-screener',
    file: 'metrics-whale-ratio',
    method: 'GET',
    path: '/api/v1/crypto/metrics/whale-ratio',
  },
  {
    skill: 'arrays-data-api-crypto-metrics-and-screener',
    file: 'crypto-supply',
    method: 'GET',
    path: '/api/v1/crypto/supply',
  },
  {
    skill: 'arrays-data-api-crypto-futures-data',
    file: 'taker-buy-sell-volume',
    method: 'GET',
    path: '/api/v1/crypto/taker-buy-sell-volume',
  },
  {
    skill: 'arrays-data-api-crypto-metrics-and-screener',
    file: 'unlock-events',
    method: 'GET',
    path: '/api/v1/crypto/unlock-events',
  },
  {
    skill: 'arrays-data-api-etf-fundamentals',
    file: 'flow',
    method: 'GET',
    path: '/api/v1/etf/flow',
  },
  {
    skill: 'arrays-data-api-options',
    file: 'contracts',
    method: 'GET',
    path: '/api/v1/options/contracts',
  },
  {
    skill: 'arrays-data-api-options',
    file: 'kline',
    method: 'GET',
    path: '/api/v1/options/kline',
  },
  {
    skill: 'arrays-data-api-options',
    file: 'greeks',
    method: 'GET',
    path: '/api/v1/options/greeks',
  },
  {
    skill: 'arrays-data-api-options',
    file: 'chain',
    method: 'GET',
    path: '/api/v1/options/chain',
  },
  {
    skill: 'arrays-data-api-equity-fundamentals',
    file: 'company-executives',
    method: 'GET',
    path: '/api/v1/stocks/company/executives',
  },
  {
    skill: 'arrays-data-api-equity-estimates-and-targets',
    file: 'company-price-target-consensus',
    method: 'GET',
    path: '/api/v1/stocks/company/price-target-consensus',
  },
  {
    skill: 'arrays-data-api-equity-estimates-and-targets',
    file: 'company-price-target-news',
    method: 'GET',
    path: '/api/v1/stocks/company/price-target-news',
  },
  {
    skill: 'arrays-data-api-equity-estimates-and-targets',
    file: 'company-price-target-summary',
    method: 'GET',
    path: '/api/v1/stocks/company/price-target-summary',
  },
  {
    skill: 'arrays-data-api-equity-ownership-and-flow',
    file: 'congress-recent-trades',
    method: 'GET',
    path: '/api/v1/stocks/congress/recent-trades',
  },
  {
    skill: 'arrays-data-api-stock-metrics',
    file: 'darkpool',
    method: 'GET',
    path: '/api/v1/stocks/darkpool',
  },
  {
    skill: 'arrays-data-api-equity-estimates-and-targets',
    file: 'estimates-guidance',
    method: 'GET',
    path: '/api/v1/stocks/estimates-guidance',
  },
  {
    skill: 'arrays-data-api-equity-ownership-and-flow',
    file: 'insider-transactions',
    method: 'GET',
    path: '/api/v1/stocks/insider/transactions',
  },
  {
    skill: 'arrays-data-api-equity-ownership-and-flow',
    file: 'institution-holder',
    method: 'GET',
    path: '/api/v1/stocks/institution-holder',
  },
  {
    skill: 'arrays-data-api-polymarket',
    file: 'activity',
    method: 'GET',
    path: 'polymarket:/activity',
  },
  {
    skill: 'arrays-data-api-polymarket',
    file: 'book',
    method: 'GET',
    path: 'polymarket:/book',
  },
  {
    skill: 'arrays-data-api-polymarket',
    file: 'closed-positions',
    method: 'GET',
    path: 'polymarket:/closed-positions',
  },
  {
    skill: 'arrays-data-api-polymarket',
    file: 'events',
    method: 'GET',
    path: 'polymarket:/events',
  },
  {
    skill: 'arrays-data-api-polymarket',
    file: 'holders',
    method: 'GET',
    path: 'polymarket:/holders',
  },
  {
    skill: 'arrays-data-api-polymarket',
    file: 'markets',
    method: 'GET',
    path: 'polymarket:/markets',
  },
  {
    skill: 'arrays-data-api-polymarket',
    file: 'midpoint',
    method: 'GET',
    path: 'polymarket:/midpoint',
  },
  {
    skill: 'arrays-data-api-polymarket',
    file: 'oi',
    method: 'GET',
    path: 'polymarket:/oi',
  },
  {
    skill: 'arrays-data-api-polymarket',
    file: 'positions',
    method: 'GET',
    path: 'polymarket:/positions',
  },
  {
    skill: 'arrays-data-api-polymarket',
    file: 'price',
    method: 'GET',
    path: 'polymarket:/price',
  },
  {
    skill: 'arrays-data-api-polymarket',
    file: 'prices-history',
    method: 'GET',
    path: 'polymarket:/prices-history',
  },
  {
    skill: 'arrays-data-api-polymarket',
    file: 'public-search',
    method: 'GET',
    path: 'polymarket:/public-search',
  },
  {
    skill: 'arrays-data-api-polymarket',
    file: 'series',
    method: 'GET',
    path: 'polymarket:/series',
  },
  {
    skill: 'arrays-data-api-polymarket',
    file: 'sports',
    method: 'GET',
    path: 'polymarket:/sports',
  },
  {
    skill: 'arrays-data-api-polymarket',
    file: 'spread',
    method: 'GET',
    path: 'polymarket:/spread',
  },
  {
    skill: 'arrays-data-api-polymarket',
    file: 'tags',
    method: 'GET',
    path: 'polymarket:/tags',
  },
  {
    skill: 'arrays-data-api-polymarket',
    file: 'trades',
    method: 'GET',
    path: 'polymarket:/trades',
  },
  {
    skill: 'arrays-data-api-polymarket',
    file: 'value',
    method: 'GET',
    path: 'polymarket:/value',
  },
  {
    skill: 'arrays-data-api-equity-events',
    file: 'earnings-transcript',
    method: 'GET',
    path: '/api/v1/stocks/earnings-transcript',
  },
  {
    skill: 'arrays-data-api-news',
    file: 'market-news',
    method: 'GET',
    path: '/api/v1/stocks/market-news',
  },
  {
    skill: 'arrays-data-api-social-feeds',
    file: 'x-by-handle',
    method: 'GET',
    path: '/api/v1/social-feeds/x/by-handle',
  },
  {
    skill: 'arrays-data-api-social-feeds',
    file: 'x-by-url',
    method: 'GET',
    path: '/api/v1/social-feeds/x/by-url',
  },
  {
    skill: 'arrays-data-api-social-feeds',
    file: 'x-entities-handle',
    method: 'GET',
    path: '/api/v1/social-feeds/x/entities/handle/{twitter_handle}',
  },
  {
    skill: 'arrays-data-api-social-feeds',
    file: 'x-entities-handles',
    method: 'GET',
    path: '/api/v1/social-feeds/x/entities/handles',
  },
  {
    skill: 'arrays-data-api-equity-fundamentals',
    file: 'company-detail-non-us',
    method: 'GET',
    path: '/api/v1/stocks/non-us/company/detail',
  },
  {
    skill: 'arrays-data-api-social-feeds',
    file: 'x-search',
    method: 'GET',
    path: '/api/v1/social-feeds/x/search',
  },
  {
    skill: 'arrays-data-api-spot-market-price-and-volume',
    file: 'stocks-non-us-kline',
    method: 'GET',
    path: '/api/v1/stocks/non-us/kline',
  },
  {
    skill: 'arrays-data-api-semiconductor-price',
    file: 'dram-spot-price',
    method: 'GET',
    path: '/api/v1/other/semiconductor/dram-spot-price',
  },
  {
    skill: 'arrays-data-api-semiconductor-price',
    file: 'dram-contract-price',
    method: 'GET',
    path: '/api/v1/other/semiconductor/dram-contract-price',
  },
  {
    skill: 'arrays-data-api-semiconductor-price',
    file: 'nand-flash-spot-price',
    method: 'GET',
    path: '/api/v1/other/semiconductor/nand-flash-spot-price',
  },
  {
    skill: 'arrays-data-api-semiconductor-price',
    file: 'nand-flash-contract-price',
    method: 'GET',
    path: '/api/v1/other/semiconductor/nand-flash-contract-price',
  },
  {
    skill: 'arrays-data-api-semiconductor-price',
    file: 'memory-card-price',
    method: 'GET',
    path: '/api/v1/other/semiconductor/memory-card-price',
  },
  {
    skill: 'arrays-data-api-semiconductor-price',
    file: 'dxi-index',
    method: 'GET',
    path: '/api/v1/other/semiconductor/dxi-index',
  },
  {
    skill: 'arrays-data-api-equity-ownership-and-flow',
    file: 'short-interest',
    method: 'GET',
    path: '/api/v1/stocks/short-interest',
  },
  {
    skill: 'arrays-data-api-social-feeds',
    file: 'x-handles',
    method: 'POST',
    path: '/api/v1/social-feeds/x/handles',
  },
  {
    skill: 'arrays-data-api-equity-events',
    file: 'event-transcripts',
    method: 'GET',
    path: '/api/v1/stocks/event-transcripts',
  },
  {
    skill: 'arrays-data-api-macro-and-economics',
    file: 'macro-index-symbol-list',
    method: 'GET',
    path: '/api/v1/macro/index/symbols',
  },
  {
    skill: 'arrays-data-api-podcast-transcripts',
    file: 'podcast-shows',
    method: 'GET',
    path: '/api/v1/other/podcast/shows',
  },
  {
    skill: 'arrays-data-api-podcast-transcripts',
    file: 'podcast-transcripts',
    method: 'GET',
    path: '/api/v1/other/podcast/transcripts',
  },
  {
    skill: 'arrays-data-api-podcast-transcripts',
    file: 'podcast-persons',
    method: 'GET',
    path: '/api/v1/persons',
  },
];

export function getSkillEndpointMetadata(
  skill: string,
  file: string
): SkillEndpointMetadata | undefined {
  return SKILL_ENDPOINT_METADATA.find(
    (item) => item.skill === skill && item.file === file
  );
}

export function listSkillEndpointMetadata(
  skill: string
): SkillEndpointMetadata[] {
  return SKILL_ENDPOINT_METADATA.filter((item) => item.skill === skill);
}

export function countSkillEndpointMetadata(): number {
  return SKILL_ENDPOINT_METADATA.length;
}
