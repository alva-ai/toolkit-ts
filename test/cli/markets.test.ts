import { afterEach, describe, expect, it } from 'vitest';
import { AlvaClient } from '../../src/client.js';
import { dispatchCli } from '../../src/cli/dispatch.js';
import { dispatch as embedded } from '../../src/cli/embeddedDispatch.js';
import { fakeV2, problem } from '../fakeV2.js';
import {
  ASSET,
  asset,
  earningsCalendar,
  earningsPeriod,
  earningsReport,
  narrative,
} from '../marketV2.js';

let restore = () => {};
afterEach(() => restore());

function client(): AlvaClient {
  return new AlvaClient({ apiKey: 'key', baseUrl: 'https://api.test' });
}

const HK = asset({
  id: 'asset_0b2',
  symbol: '0700',
  assetClass: 'NON_US_STOCK',
});

const PERIODS = [
  earningsPeriod({ fiscalQuarter: 'Q1', reportsOn: '2026-01-29' }),
  earningsPeriod({ fiscalQuarter: 'Q2', reportsOn: '2026-04-30' }),
  earningsPeriod({
    fiscalQuarter: 'Q4',
    reportsOn: '2026-10-29',
    status: 'UPCOMING',
    isDefault: false,
  }),
  earningsPeriod({
    fiscalYear: 2027,
    fiscalQuarter: 'Q1',
    reportsOn: null,
    status: 'UPCOMING',
    isDefault: false,
  }),
];

for (const [name, dispatch] of [
  ['terminal', dispatchCli],
  ['embedded', embedded],
] as const) {
  describe(`markets ${name} commands`, () => {
    it('reads the narrative of the US listing, else the non-US one', async () => {
      const fake = fakeV2({
        'GET /assets/by-symbol/0700': [
          () => problem(404, 'NOT_FOUND'),
          () => HK,
        ],
        'GET /assets/asset_0b2/narrative': () => narrative(),
      });
      restore = fake.restore;

      await expect(
        dispatch(client(), ['markets', 'narrative', '--ticker', '0700'])
      ).resolves.toEqual(narrative());
      expect(fake.calls.map((c) => c.query.get('assetClass'))).toEqual([
        'US_STOCK',
        'NON_US_STOCK',
        null,
      ]);
    });

    it('throws a ticker without a stock listing as its 404', async () => {
      restore = fakeV2({
        'GET /assets/by-symbol/ZZZZ': () => problem(404, 'NOT_FOUND'),
      }).restore;

      await expect(
        dispatch(client(), ['markets', 'narrative', '--ticker', 'zzzz'])
      ).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
    });

    it.each([
      [[], 'fiscalYear=2026&fiscalQuarter=Q2'],
      [['--event', 'next-confirmed'], 'fiscalYear=2026&fiscalQuarter=Q4'],
    ])(
      'reads the period of earnings event %j from the calendar',
      async (flags, query) => {
        const fake = fakeV2({
          'GET /assets/by-symbol/AAPL': () => asset(),
          [`GET /assets/${ASSET}/earnings-calendar`]: () =>
            earningsCalendar(PERIODS),
          [`GET /assets/${ASSET}/earnings`]: () => earningsReport(),
        });
        restore = fake.restore;

        await expect(
          dispatch(client(), [
            'markets',
            'earnings',
            '--ticker',
            'AAPL',
            ...flags,
          ])
        ).resolves.toEqual(earningsReport());
        expect(fake.calls.at(-1)?.query.toString()).toBe(query);
      }
    );

    it('reads an explicit fiscal period without the calendar', async () => {
      const fake = fakeV2({
        'GET /assets/by-symbol/AAPL': () => asset(),
        [`GET /assets/${ASSET}/earnings`]: () => earningsReport(),
      });
      restore = fake.restore;

      await dispatch(client(), [
        'markets',
        'earnings',
        '--ticker',
        'AAPL',
        '--fiscal-year',
        '2026',
        '--fiscal-quarter',
        'q3',
      ]);
      expect(fake.calls.map((c) => `${c.path}?${c.query}`)).toEqual([
        '/assets/by-symbol/AAPL?assetClass=US_STOCK',
        `/assets/${ASSET}/earnings?fiscalYear=2026&fiscalQuarter=Q3`,
      ]);
    });

    it('never reads another quarter for an event the calendar lacks', async () => {
      const fake = fakeV2({
        'GET /assets/by-symbol/AAPL': () => asset(),
        [`GET /assets/${ASSET}/earnings-calendar`]: () =>
          earningsCalendar(PERIODS.filter((p) => p.status === 'COMPLETED')),
      });
      restore = fake.restore;

      await expect(
        dispatch(client(), [
          'markets',
          'earnings',
          '--ticker',
          'AAPL',
          '--event',
          'next-confirmed',
        ])
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'No next-confirmed earnings event is available for AAPL',
      });
      expect(fake.calls).toHaveLength(2);
    });
  });
}
