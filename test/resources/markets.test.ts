import { afterEach, describe, expect, it } from 'vitest';
import { AlvaClient } from '../../src/client.js';
import { MarketsResource } from '../../src/resources/markets.js';
import { fakeV2, problem } from '../fakeV2.js';

const AAPL = { id: 'asset_0aapl', symbol: 'AAPL', name: 'Apple' };

const completedPeriod = {
  fiscalYear: 2026,
  fiscalQuarter: 'Q3',
  label: 'FY2026 Q3',
  periodEnd: '2026-06-27',
  reportsOn: '2026-07-30',
  timing: 'AFTER_MARKET_CLOSE',
  status: 'COMPLETED',
  isDefault: true,
};

const upcomingPeriod = {
  fiscalYear: 2026,
  fiscalQuarter: 'Q4',
  label: 'FY2026 Q4',
  periodEnd: '2026-09-26',
  reportsOn: '2026-10-29',
  timing: null,
  status: 'UPCOMING',
  isDefault: false,
};

function calendar(periods: unknown[], defaultPeriod: unknown = null) {
  return { periods, defaultPeriod, unresolvedEventCount: 2 };
}

function report(period = completedPeriod) {
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

function markets() {
  return new MarketsResource(
    new AlvaClient({ apiKey: 'key', baseUrl: 'https://api.test' })
  );
}

let restore = () => {};
afterEach(() => restore());

describe('MarketsResource', () => {
  it('reads the narrative of the stock asset a ticker names', async () => {
    const fake = fakeV2({
      'GET /assets/by-symbol/BRK.B': () => ({
        id: 'asset_0brk',
        symbol: 'BRK.B',
      }),
      'GET /assets/asset_0brk/narrative': () => ({
        latest: {
          asOf: '2026-08-07',
          generatedAt: '2026-08-07T00:00:00.000Z',
          body: 'Current narrative',
          summary: 'One line',
          focus: null,
          bullCase: null,
          bearCase: null,
          peers: null,
        },
        history: [
          {
            asOf: '2026-08-01',
            generatedAt: '2026-08-01T00:00:00.000Z',
            body: 'Older narrative',
            peers: 'Peers',
          },
        ],
        changes: [
          {
            asOf: '2026-08-07',
            generatedAt: '2026-08-07T00:00:00.000Z',
            summary: 'Changed view',
          },
        ],
      }),
    });
    restore = fake.restore;

    const result = await markets().narrative(' brk.b ');

    expect(result).toEqual({
      ticker: 'BRK.B',
      current: {
        asOf: '2026-08-07',
        generatedAtMs: Date.UTC(2026, 7, 7),
        narrative: 'Current narrative',
        peers: '',
      },
      history: {
        snapshots: [
          {
            asOf: '2026-08-01',
            generatedAtMs: Date.UTC(2026, 7, 1),
            narrative: 'Older narrative',
          },
        ],
        changeLog: [
          {
            asOf: '2026-08-07',
            generatedAtMs: Date.UTC(2026, 7, 7),
            narrativeChangeLog: 'Changed view',
          },
        ],
      },
    });
    expect(fake.calls[0].query.get('assetClass')).toBe('US_STOCK');
  });

  it('falls back to a non-US listing and reports a missing narrative as empty', async () => {
    const fake = fakeV2({
      'GET /assets/by-symbol/0700.HK': [
        () => problem(404, 'NOT_FOUND'),
        () => ({ id: 'asset_0tencent', symbol: '0700.HK' }),
      ],
      'GET /assets/asset_0tencent/narrative': () => problem(404, 'NOT_FOUND'),
    });
    restore = fake.restore;

    await expect(markets().narrative('0700.hk')).resolves.toEqual({
      ticker: '0700.HK',
      current: null,
      history: null,
    });
    expect(fake.calls.map((c) => c.query.get('assetClass'))).toEqual([
      'US_STOCK',
      'NON_US_STOCK',
      null,
    ]);
  });

  it('reports a ticker without a stock listing as MARKETS_ENTITY_NOT_FOUND', async () => {
    restore = fakeV2({
      'GET /assets/by-symbol/NOPE': () => problem(404, 'NOT_FOUND'),
    }).restore;

    await expect(markets().narrative('nope')).rejects.toMatchObject({
      code: 'MARKETS_ENTITY_NOT_FOUND',
      status: 404,
      details: { ticker: 'NOPE' },
    });
  });

  it('rebuilds the earnings catalog from the calendar', async () => {
    restore = fakeV2({
      'GET /assets/by-symbol/AAPL': () => AAPL,
      'GET /assets/asset_0aapl/earnings-calendar': () =>
        calendar([upcomingPeriod, completedPeriod], completedPeriod),
    }).restore;

    const catalog = await markets().earningsPeriods('aapl');

    expect(catalog).toEqual({
      periods: [
        {
          fiscalYear: 2026,
          fiscalQuarter: 'Q4',
          label: 'FY2026 Q4',
          fiscalDateEnding: '2026-09-26',
          earningsDate: '2026-10-29',
          session: null,
          status: 'UPCOMING',
          isDefault: false,
        },
        {
          fiscalYear: 2026,
          fiscalQuarter: 'Q3',
          label: 'FY2026 Q3',
          fiscalDateEnding: '2026-06-27',
          earningsDate: '2026-07-30',
          session: 'AFTER_MARKET_CLOSE',
          status: 'COMPLETED',
          isDefault: true,
        },
      ],
      defaultPeriod: expect.objectContaining({ fiscalQuarter: 'Q3' }),
      unresolvedEventCount: 2,
    });
  });

  it('reports a stock without a calendar as MARKETS_EARNINGS_NOT_COVERED', async () => {
    restore = fakeV2({
      'GET /assets/by-symbol/AAPL': () => AAPL,
      'GET /assets/asset_0aapl/earnings-calendar': () =>
        problem(404, 'NOT_FOUND'),
    }).restore;

    await expect(markets().earningsPeriods('AAPL')).rejects.toMatchObject({
      code: 'MARKETS_EARNINGS_NOT_COVERED',
      status: 404,
    });
  });

  it('resolves latest-completed through the calendar and rebuilds the report', async () => {
    const fake = fakeV2({
      'GET /assets/by-symbol/AAPL': () => AAPL,
      'GET /assets/asset_0aapl/earnings-calendar': () =>
        calendar([upcomingPeriod, completedPeriod], {
          ...upcomingPeriod,
          isDefault: true,
        }),
      'GET /assets/asset_0aapl/earnings': () => report(),
    });
    restore = fake.restore;

    const result = await markets().earnings({
      ticker: 'aapl',
      event: 'latest-completed',
    });

    const read = fake.calls[2];
    expect(read.query.get('fiscalYear')).toBe('2026');
    expect(read.query.get('fiscalQuarter')).toBe('Q3');
    expect(result.ticker).toBe('AAPL');
    expect(result.period.fiscalDateEnding).toBe('2026-06-27');
    expect(result.preEarningsAnalysis).toMatchObject({
      status: 'AVAILABLE',
      mainQuestion: 'Margins?',
      investorFocus: ['iPhone'],
      consensusN: 31,
      consensusObservedAt: '2026-07-28T12:00:00.000Z',
    });
    expect(result.preEarningsAnalysis).not.toHaveProperty('availability');
    expect(result.earningsRelease).toEqual({
      status: 'AVAILABLE',
      releaseDate: '2026-07-30',
      url: 'https://example.com/release',
    });
    expect(result.earningsTranscript).toEqual({
      status: 'NOT_AVAILABLE_YET',
      date: '2026-07-30',
      publishedAtMs: Date.UTC(2026, 6, 31, 1, 2, 3),
      sections: [
        {
          name: 'Q&A',
          entries: [{ speaker: 'Tim', title: 'CEO', content: 'Hi' }],
        },
      ],
    });
    expect(result.postEarningsSummary).toMatchObject({
      status: 'UNAVAILABLE',
      evidenceState: 'POST_CALL',
      reportedCurrency: 'USD',
      whatYouShouldKnow: ['Services grew'],
      consensusN: null,
      consensusObservedAt: null,
    });
    expect(result.postEarningsSummary).not.toHaveProperty('evidence');
  });

  it('selects the newest completed and the nearest upcoming period', async () => {
    const olderCompleted = {
      ...completedPeriod,
      fiscalQuarter: 'Q2',
      reportsOn: '2026-04-30',
    };
    const laterUpcoming = {
      ...upcomingPeriod,
      fiscalYear: 2027,
      fiscalQuarter: 'Q1',
      reportsOn: '2027-01-28',
    };
    const periods = [
      olderCompleted,
      laterUpcoming,
      upcomingPeriod,
      completedPeriod,
    ];
    const fake = fakeV2({
      'GET /assets/by-symbol/AAPL': () => AAPL,
      'GET /assets/asset_0aapl/earnings-calendar': () => calendar(periods),
      'GET /assets/asset_0aapl/earnings': () => report(),
    });
    restore = fake.restore;

    await markets().earnings({ ticker: 'AAPL' });
    await markets().earnings({ ticker: 'AAPL', event: 'next-confirmed' });

    const reads = fake.calls.filter((c) => c.path.endsWith('/earnings'));
    expect(
      reads.map((c) => [
        c.query.get('fiscalYear'),
        c.query.get('fiscalQuarter'),
      ])
    ).toEqual([
      ['2026', 'Q3'],
      ['2026', 'Q4'],
    ]);
  });

  it.each([
    {
      name: 'only upcoming periods',
      periods: [upcomingPeriod],
      event: 'latest-completed',
    },
    { name: 'an empty catalog', periods: [], event: 'latest-completed' },
    {
      name: 'only completed periods',
      periods: [completedPeriod],
      event: 'next-confirmed',
    },
  ] as const)(
    'reports no $event event with $name',
    async ({ periods, event }) => {
      const fake = fakeV2({
        'GET /assets/by-symbol/AAPL': () => AAPL,
        'GET /assets/asset_0aapl/earnings-calendar': () =>
          calendar([...periods]),
      });
      restore = fake.restore;

      await expect(
        markets().earnings({ ticker: 'AAPL', event })
      ).rejects.toMatchObject({
        code: 'MARKETS_EARNINGS_EVENT_NOT_FOUND',
        status: 404,
      });
      expect(fake.calls).toHaveLength(2);
    }
  );

  it('reads an explicit fiscal period without the calendar', async () => {
    const fake = fakeV2({
      'GET /assets/by-symbol/AAPL': () => AAPL,
      'GET /assets/asset_0aapl/earnings': () => report(),
    });
    restore = fake.restore;

    await markets().earnings({
      ticker: 'AAPL',
      fiscalYear: 2025,
      fiscalQuarter: 'Q1',
    });

    expect(fake.calls).toHaveLength(2);
    expect(fake.calls[1].query.toString()).toBe(
      'fiscalYear=2025&fiscalQuarter=Q1'
    );
  });

  it('reports a period without a report as MARKETS_EARNINGS_NOT_COVERED', async () => {
    restore = fakeV2({
      'GET /assets/by-symbol/AAPL': () => AAPL,
      'GET /assets/asset_0aapl/earnings': () => problem(404, 'NOT_FOUND'),
    }).restore;

    await expect(
      markets().earnings({
        ticker: 'AAPL',
        fiscalYear: 2025,
        fiscalQuarter: 'Q1',
      })
    ).rejects.toMatchObject({
      code: 'MARKETS_EARNINGS_NOT_COVERED',
      details: { ticker: 'AAPL', fiscalYear: 2025, fiscalQuarter: 'Q1' },
    });
  });

  it('validates direct SDK parameters before any request', async () => {
    const fake = fakeV2({});
    restore = fake.restore;

    await expect(
      markets().earnings({ ticker: 'AAPL', fiscalYear: 2026 } as never)
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT', status: 400 });
    await expect(
      markets().earnings({
        ticker: 'AAPL',
        event: 'next-confirmed',
        fiscalYear: 2026,
        fiscalQuarter: 'Q3',
      } as never)
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT', status: 400 });
    expect(fake.calls).toHaveLength(0);
  });

  it('surfaces other problems unchanged', async () => {
    restore = fakeV2({
      'GET /assets/by-symbol/AAPL': () => AAPL,
      'GET /assets/asset_0aapl/narrative': () =>
        problem(503, 'UNAVAILABLE', { detail: 'company service unavailable' }),
    }).restore;

    await expect(markets().narrative('AAPL')).rejects.toMatchObject({
      code: 'UNAVAILABLE',
      status: 503,
      message: 'company service unavailable',
    });
  });
});
