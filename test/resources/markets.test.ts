import { describe, expect, it, vi } from 'vitest';
import { AlvaClient } from '../../src/client.js';
import { MarketsResource } from '../../src/resources/markets.js';

function makeClient(): AlvaClient & { _request: ReturnType<typeof vi.fn> } {
  const client = new AlvaClient({ apiKey: 'key' }) as AlvaClient & {
    _request: ReturnType<typeof vi.fn>;
  };
  client._request = vi.fn();
  return client;
}

const completedPeriod = {
  fiscalYear: 2026,
  fiscalQuarter: 'Q3',
  label: 'FY2026 Q3',
  fiscalDateEnding: '2026-06-27',
  earningsDate: '2026-07-30',
  session: 'AFTER_MARKET_CLOSE',
  status: 'COMPLETED',
  isDefault: true,
};

const upcomingPeriod = {
  fiscalYear: 2026,
  fiscalQuarter: 'Q4',
  label: 'FY2026 Q4',
  fiscalDateEnding: '2026-09-26',
  earningsDate: '2026-10-29',
  session: 'AFTER_MARKET_CLOSE',
  status: 'UPCOMING',
  isDefault: false,
};

function earningsResponse(period = completedPeriod) {
  return {
    data: {
      market: {
        entity: {
          ticker: 'AAPL',
          earnings: {
            period,
            preEarningsAnalysis: {
              status: 'AVAILABLE',
              investorFocus: [],
            },
            earningsRelease: { status: 'AVAILABLE' },
            earningsTranscript: { status: 'AVAILABLE', sections: [] },
            postEarningsSummary: {
              status: 'AVAILABLE',
              buriedSignals: [],
              whatYouShouldKnow: [],
            },
          },
        },
      },
    },
  };
}

describe('MarketsResource', () => {
  it('reads current narrative, snapshots, and narrative change log', async () => {
    const client = makeClient();
    client._request.mockResolvedValue({
      data: {
        market: {
          entity: {
            ticker: 'BRK.B',
            companyInsight: {
              asOf: '2026-08-07',
              generatedAtMs: 1786032000000,
              narrative: 'Current narrative',
              peers: 'Peers',
            },
            companyInsightHistory: {
              snapshots: [],
              changeLog: [
                {
                  asOf: '2026-08-07',
                  generatedAtMs: 1786032000000,
                  narrativeChangeLog: 'Changed view',
                },
              ],
            },
          },
        },
      },
    });

    const result = await new MarketsResource(client).narrative(' brk.b ');

    expect(result.ticker).toBe('BRK.B');
    expect(result.history?.changeLog[0]?.narrativeChangeLog).toBe(
      'Changed view'
    );
    expect(client._request).toHaveBeenCalledWith('POST', '/query', {
      body: {
        query: expect.stringContaining('companyInsightHistory'),
        variables: { ticker: 'BRK.B' },
      },
    });
  });

  it('resolves latest-completed through the catalog before reading detail', async () => {
    const client = makeClient();
    client._request
      .mockResolvedValueOnce({
        data: {
          market: {
            entity: {
              ticker: 'AAPL',
              earningsPeriods: {
                periods: [upcomingPeriod, completedPeriod],
                defaultPeriod: completedPeriod,
                unresolvedEventCount: 0,
              },
            },
          },
        },
      })
      .mockResolvedValueOnce(earningsResponse());

    const result = await new MarketsResource(client).earnings({
      ticker: 'aapl',
      event: 'latest-completed',
    });

    expect(result.period.fiscalQuarter).toBe('Q3');
    expect(client._request).toHaveBeenNthCalledWith(2, 'POST', '/query', {
      body: {
        query: expect.stringContaining('preEarningsAnalysis'),
        variables: {
          ticker: 'AAPL',
          input: { fiscalYear: 2026, fiscalQuarter: 'Q3' },
        },
      },
    });
  });

  it('selects the nearest upcoming period for next-confirmed', async () => {
    const client = makeClient();
    const laterUpcoming = {
      ...upcomingPeriod,
      fiscalYear: 2027,
      fiscalQuarter: 'Q1',
      earningsDate: '2027-01-28',
    };
    client._request
      .mockResolvedValueOnce({
        data: {
          market: {
            entity: {
              ticker: 'AAPL',
              earningsPeriods: {
                periods: [laterUpcoming, upcomingPeriod, completedPeriod],
                defaultPeriod: completedPeriod,
                unresolvedEventCount: 0,
              },
            },
          },
        },
      })
      .mockResolvedValueOnce(earningsResponse(upcomingPeriod));

    await new MarketsResource(client).earnings({
      ticker: 'AAPL',
      event: 'next-confirmed',
    });

    expect(client._request).toHaveBeenNthCalledWith(2, 'POST', '/query', {
      body: {
        query: expect.any(String),
        variables: {
          ticker: 'AAPL',
          input: { fiscalYear: 2026, fiscalQuarter: 'Q4' },
        },
      },
    });
  });

  it('reads an explicit fiscal period without fetching the catalog', async () => {
    const client = makeClient();
    client._request.mockResolvedValue(earningsResponse());

    await new MarketsResource(client).earnings({
      ticker: 'AAPL',
      fiscalYear: 2026,
      fiscalQuarter: 'Q3',
    });

    expect(client._request).toHaveBeenCalledTimes(1);
    expect(client._request).toHaveBeenCalledWith('POST', '/query', {
      body: {
        query: expect.stringContaining('earnings(input: $input)'),
        variables: {
          ticker: 'AAPL',
          input: { fiscalYear: 2026, fiscalQuarter: 'Q3' },
        },
      },
    });
  });

  it('reports when the requested event does not exist', async () => {
    const client = makeClient();
    client._request.mockResolvedValue({
      data: {
        market: {
          entity: {
            ticker: 'AAPL',
            earningsPeriods: {
              periods: [completedPeriod],
              defaultPeriod: completedPeriod,
              unresolvedEventCount: 0,
            },
          },
        },
      },
    });

    await expect(
      new MarketsResource(client).earnings({
        ticker: 'AAPL',
        event: 'next-confirmed',
      })
    ).rejects.toMatchObject({
      code: 'MARKETS_EARNINGS_EVENT_NOT_FOUND',
      status: 404,
    });
  });

  it('validates direct SDK parameters before calling GraphQL', async () => {
    const client = makeClient();
    const markets = new MarketsResource(client);

    await expect(
      markets.earnings({
        ticker: 'AAPL',
        fiscalYear: 2026,
      } as never)
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT', status: 400 });
    await expect(
      markets.earnings({
        ticker: 'AAPL',
        event: 'next-confirmed',
        fiscalYear: 2026,
        fiscalQuarter: 'Q3',
      } as never)
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT', status: 400 });
    expect(client._request).not.toHaveBeenCalled();
  });

  it('surfaces GraphQL errors', async () => {
    const client = makeClient();
    client._request.mockResolvedValue({
      errors: [{ message: 'company service unavailable' }],
    });

    await expect(
      new MarketsResource(client).narrative('AAPL')
    ).rejects.toMatchObject({
      code: 'GRAPHQL_ERROR',
      message: 'company service unavailable',
    });
  });
});
