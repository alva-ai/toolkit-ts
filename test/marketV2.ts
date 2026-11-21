import type { Schema } from '../src/platformApi.js';

// /api/v2 fixtures of the market domain (assets, company context, trading
// pairs, X, company news feeds), as the gateway answers them; every builder
// is listed in MARKET_FIXTURES, which test/fixturesV2.test.ts checks against
// the contract.

export const ASSET = 'asset_0a1';

export function asset(
  overrides: Partial<Schema<'Asset'>> = {}
): Schema<'Asset'> {
  return {
    id: ASSET,
    symbol: 'AAPL',
    name: 'Apple Inc.',
    kind: 'STOCK',
    assetClass: 'US_STOCK',
    categories: ['US_STOCK'],
    logo: null,
    venue: { code: 'NASDAQ', name: 'Nasdaq', logo: null },
    quote: null,
    ...overrides,
  };
}

export function narrativeSnapshot(
  overrides: Partial<Schema<'NarrativeSnapshot'>> = {}
): Schema<'NarrativeSnapshot'> {
  return {
    asOf: '2026-08-07',
    generatedAt: '2026-08-07T00:00:00.000Z',
    body: 'Current narrative',
    summary: 'One line',
    focus: null,
    bullCase: null,
    bearCase: null,
    peers: 'MSFT, GOOGL',
    ...overrides,
  };
}

export function narrative(): Schema<'AssetNarrative'> {
  return {
    latest: narrativeSnapshot(),
    history: [
      narrativeSnapshot({
        asOf: '2026-08-01',
        generatedAt: '2026-08-01T00:00:00.000Z',
        body: 'Older narrative',
        peers: null,
      }),
    ],
    changes: [
      {
        asOf: '2026-08-07',
        generatedAt: '2026-08-07T00:00:00.000Z',
        summary: 'Margins improved',
      },
    ],
  };
}

export function earningsPeriod(
  overrides: Partial<Schema<'EarningsPeriod'>> = {}
): Schema<'EarningsPeriod'> {
  return {
    fiscalYear: 2026,
    fiscalQuarter: 'Q3',
    label: 'FY2026 Q3',
    periodEnd: '2026-06-27',
    reportsOn: '2026-07-30',
    timing: 'AFTER_MARKET_CLOSE',
    status: 'COMPLETED',
    isDefault: true,
    ...overrides,
  };
}

export function earningsCalendar(
  periods: Schema<'EarningsPeriod'>[] = [earningsPeriod()]
): Schema<'EarningsCalendar'> {
  return {
    periods,
    defaultPeriod: periods.find((p) => p.isDefault) ?? null,
    unresolvedEventCount: 2,
  };
}

export function earningsReport(
  period: Schema<'EarningsPeriod'> = earningsPeriod()
): Schema<'EarningsReport'> {
  return {
    period,
    preview: {
      availability: 'AVAILABLE',
      asOf: '2026-07-29',
      summary: 'Preview',
      whatWouldChangeView: null,
      mainQuestion: 'Margins?',
      investorFocus: ['iPhone'],
      consensusAndGuidance: null,
      stockSetup: null,
      eventRisk: null,
      whatWouldDriveUpside: null,
      bullCase: 'Bull',
      baseCase: 'Base',
      bearCase: 'Bear',
      keyAsymmetry: null,
      consensus: { estimateCount: 31, observedAt: '2026-07-28T12:00:00.000Z' },
    },
    release: {
      availability: 'AVAILABLE',
      releasedOn: '2026-07-30',
      url: 'https://example.com/release',
    },
    transcript: {
      availability: 'NOT_AVAILABLE_YET',
      heldOn: '2026-07-30',
      publishedAt: '2026-07-31T01:02:03.000Z',
      sections: [
        {
          name: 'Q&A',
          entries: [{ speaker: 'Tim', title: 'CEO', content: 'Hi' }],
        },
      ],
    },
    recap: {
      availability: 'UNAVAILABLE',
      asOf: null,
      reportedCurrency: 'USD',
      evidence: 'POST_CALL',
      openingQuote: null,
      openingQuoteSpeaker: null,
      openingQuoteTitle: null,
      openingQuoteNote: null,
      buriedSignals: [],
      whatYouShouldKnow: ['Services grew'],
      consensus: null,
    },
  };
}

export function tradingPair(
  overrides: Partial<Schema<'TradingPair'>> = {}
): Schema<'TradingPair'> {
  return {
    id: 'trading_pair_0a1',
    symbol: 'US_SPOT_RKLB_USD',
    base: 'RKLB',
    quote: 'USD',
    exchange: 'US',
    type: 'stock-spot',
    feeRate: '0.001',
    description: 'Rocket Lab',
    logo: 'https://cdn.example.com/rklb.png',
    ...overrides,
  };
}

export function xConnection(
  overrides: Partial<Schema<'XConnection'>> = {}
): Schema<'XConnection'> {
  return {
    connected: true,
    canReadFollowing: true,
    canReadPosts: false,
    ...overrides,
  };
}

export function xAccount(): Schema<'XAccount'> {
  return { id: 'x_account_0a1', username: 'alice', name: 'Alice' };
}

export function xPost(
  overrides: Partial<Schema<'XPost'>> = {}
): Schema<'XPost'> {
  return {
    id: 'x_post_0a1',
    text: 'Hello',
    authorId: 'x_account_0a1',
    createdAt: '2026-11-01T10:00:00.000Z',
    url: 'https://x.com/alice/status/1',
    ...overrides,
  };
}

export function companyNewsFeed(): Schema<'CompanyNewsFeed'> {
  return { id: 'automation_0a1', cronjobId: 'cronjob_0a1' };
}

export function page<T>(
  items: T[],
  nextPageToken: string | null = null
): { items: T[]; nextPageToken: string | null } {
  return { items, nextPageToken };
}

export const MARKET_FIXTURES = [
  ['Asset', asset()],
  ['AssetNarrative', narrative()],
  ['EarningsCalendar', earningsCalendar()],
  ['EarningsReport', earningsReport()],
  ['TradingPairList', page([tradingPair()], 'p2')],
  ['XConnection', xConnection()],
  ['XAccountList', page([xAccount()])],
  ['XPostList', page([xPost(), xPost({ authorId: null, createdAt: null })])],
  ['CompanyNewsFeed', companyNewsFeed()],
] as const;
