import { afterEach, describe, expect, it } from 'vitest';
import { AlvaClient } from '../../src/client.js';
import { MarketsResource } from '../../src/resources/markets.js';
import { fakeV2, problem } from '../fakeV2.js';
import {
  ASSET,
  asset,
  earningsCalendar,
  earningsPeriod,
  earningsReport,
  narrative,
} from '../marketV2.js';

function markets() {
  return new MarketsResource(
    new AlvaClient({ apiKey: 'key', baseUrl: 'https://api.test' })
  );
}

let restore = () => {};
afterEach(() => restore());

describe('MarketsResource', () => {
  it('resolves a symbol to its Asset, one path segment', async () => {
    const brk = asset({ id: 'asset_0b2', symbol: 'BRK/B' });
    const fake = fakeV2({ 'GET /assets/by-symbol/BRK%2FB': () => brk });
    restore = fake.restore;

    await expect(
      markets().assetBySymbol('BRK/B', { assetClass: 'US_STOCK' })
    ).resolves.toEqual(brk);
    expect(fake.calls[0].query.toString()).toBe('assetClass=US_STOCK');
  });

  it('returns the narrative, calendar and report as the API answers them', async () => {
    const period = earningsPeriod({ fiscalQuarter: 'Q2', isDefault: false });
    const fake = fakeV2({
      [`GET /assets/${ASSET}/narrative`]: () => narrative(),
      [`GET /assets/${ASSET}/earnings-calendar`]: () => earningsCalendar(),
      [`GET /assets/${ASSET}/earnings`]: [
        () => earningsReport(),
        () => earningsReport(period),
      ],
    });
    restore = fake.restore;
    const resource = markets();

    await expect(resource.narrative(ASSET)).resolves.toEqual(narrative());
    await expect(resource.earningsCalendar(ASSET)).resolves.toEqual(
      earningsCalendar()
    );
    await expect(resource.earnings(ASSET)).resolves.toEqual(earningsReport());
    await expect(
      resource.earnings(ASSET, { fiscalYear: 2026, fiscalQuarter: 'Q2' })
    ).resolves.toEqual(earningsReport(period));
    expect(fake.calls.map((c) => c.query.toString())).toEqual([
      '',
      '',
      '',
      'fiscalYear=2026&fiscalQuarter=Q2',
    ]);
  });

  it('throws a missing narrative as the 404 problem', async () => {
    restore = fakeV2({
      [`GET /assets/${ASSET}/narrative`]: () => problem(404, 'NOT_FOUND'),
    }).restore;

    await expect(markets().narrative(ASSET)).rejects.toMatchObject({
      code: 'NOT_FOUND',
      status: 404,
      message: 'NOT_FOUND detail',
    });
  });
});
