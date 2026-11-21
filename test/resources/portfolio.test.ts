import { afterEach, describe, expect, it } from 'vitest';
import { AlvaClient } from '../../src/client.js';
import { fakeV2, problem } from '../fakeV2.js';
import { page } from '../marketV2.js';
import { ACCOUNT, activity, brokerAccount, snapshot } from '../portfolioV2.js';

let restore = () => {};
afterEach(() => restore());

function client() {
  return new AlvaClient({ apiKey: 'key', baseUrl: 'https://api.test' });
}

describe('PortfolioResource', () => {
  it('accounts() returns one page of broker accounts with the route filters', async () => {
    const accounts = page([brokerAccount()], 'p2');
    const fake = fakeV2({ 'GET /me/broker-accounts': () => accounts });
    restore = fake.restore;

    await expect(client().portfolio.accounts()).resolves.toEqual(accounts);
    await client().portfolio.accounts({
      modes: ['PAPER_TRADING', 'LIVE_TRADING'],
      copyTradingOnly: true,
      pageToken: 'p2',
    });
    expect(fake.calls.map((c) => c.query.toString())).toEqual([
      '',
      'modes=PAPER_TRADING&modes=LIVE_TRADING&copyTradingOnly=true&pageToken=p2',
    ]);
  });

  it('snapshot() and activities() return the account reads as the API answers them', async () => {
    const activities = page([activity()], 'p2');
    const fake = fakeV2({
      [`GET /broker-accounts/${ACCOUNT}/snapshot`]: () => snapshot(),
      [`GET /broker-accounts/${ACCOUNT}/activities`]: () => activities,
    });
    restore = fake.restore;
    const portfolio = client().portfolio;

    await expect(portfolio.snapshot(ACCOUNT)).resolves.toEqual(snapshot());
    await expect(
      portfolio.activities(ACCOUNT, { pageSize: 20, pageToken: 'p1' })
    ).resolves.toEqual(activities);
    expect(fake.calls[1].query.toString()).toBe('pageSize=20&pageToken=p1');
  });

  it('throws a refused read as its problem', async () => {
    restore = fakeV2({
      'GET /me/broker-accounts': () =>
        problem(403, 'PERMISSION_DENIED', { reason: 'GROUP_SESSION_REFUSED' }),
    }).restore;

    await expect(client().portfolio.accounts()).rejects.toMatchObject({
      code: 'PERMISSION_DENIED',
      reason: 'GROUP_SESSION_REFUSED',
      status: 403,
    });
  });
});
