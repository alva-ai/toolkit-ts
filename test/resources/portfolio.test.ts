import { afterEach, describe, expect, it } from 'vitest';
import { AlvaClient } from '../../src/client.js';
import { fakeV2, problem } from '../fakeV2.js';

const TRADING_ACCOUNT = {
  id: 'broker_account_0trex7',
  displayName: 'Paper',
  broker: { code: 'binance', name: 'Binance', logoUrl: null },
  maskedNumber: null,
  mode: 'PAPER_TRADING',
  capabilities: {},
  status: 'ACTIVE',
  statusReason: null,
  connectionHealth: 'HEALTHY',
  connectionHealthCheckedAt: null,
  dataFreshness: 'UNKNOWN',
  lastSyncedAt: null,
  connectedAt: '2026-01-02T03:04:05.000Z',
  connectionId: 'broker_authorization_0trex7',
  provider: 'DIRECT',
};

const SNAPTRADE_ACCOUNT = {
  ...TRADING_ACCOUNT,
  id: 'broker_account_0snap10',
  displayName: 'Brokerage',
  broker: { code: 'robinhood', name: 'Robinhood', logoUrl: null },
  maskedNumber: '••••1234',
  mode: 'READ_ONLY',
  status: 'SYNCING',
  statusReason: 'initial sync',
  lastSyncedAt: '2026-02-01T00:00:00.000Z',
  connectedAt: null,
  connectionId: 'broker_authorization_0snap3',
  provider: 'SNAPTRADE',
};

const SUBSCRIPTION = {
  id: 'trade_subscription_0a',
  accountId: 'broker_account_0trex7',
  playbookId: 'playbook_0btc',
  playbookVersion: '1.0.0',
  feed: 'signals',
  signalSourceId: 'automation_0signals',
  status: 'STOPPED',
  stoppedReason: 'risk rule',
  createdAt: '2026-03-01T00:00:10.500Z',
  lastSignalAt: '2026-03-02T00:00:00.000Z',
};

const usd = (amount: string) => ({ amount, currency: 'USD' });

let restore = () => {};
afterEach(() => restore());

const portfolio = () =>
  new AlvaClient({ apiKey: 'key', baseUrl: 'https://api.test' }).portfolio;

describe('PortfolioResource', () => {
  it('accounts() lists broker accounts and the copy trading of trading accounts', async () => {
    const fake = fakeV2({
      'GET /me/broker-accounts': [
        () => ({ items: [TRADING_ACCOUNT], nextPageToken: 'p2' }),
        () => ({ items: [SNAPTRADE_ACCOUNT], nextPageToken: null }),
      ],
      'GET /broker-accounts/broker_account_0trex7/trade-subscriptions': () => ({
        items: [SUBSCRIPTION],
        nextPageToken: null,
      }),
      'GET /playbooks/playbook_0btc': () => ({
        id: 'playbook_0btc',
        title: 'BTC Momentum',
        owner: { handle: 'alice' },
      }),
    });
    restore = fake.restore;

    const accounts = await portfolio().accounts();

    expect(accounts).toEqual([
      {
        id: 'broker_account_0trex7',
        provider: 'TREX',
        name: 'Paper',
        institution: 'Binance',
        readOnly: false,
        paper: true,
        exchange: 'binance',
        createdAtMs: Date.UTC(2026, 0, 2, 3, 4, 5),
        subscriptions: [
          {
            id: 'trade_subscription_0a',
            sourceUsername: 'alice',
            sourceFeed: 'signals',
            playbookId: 'playbook_0btc',
            playbookName: 'BTC Momentum',
            playbookVersion: '1.0.0',
            active: false,
            deactivateReason: 'risk rule',
            createdAt: Date.UTC(2026, 2, 1, 0, 0, 10) / 1000,
            watermark: Date.UTC(2026, 2, 2),
          },
        ],
        status: 'ACTIVE',
        connectionId: 'broker_authorization_0trex7',
      },
      {
        id: 'broker_account_0snap10',
        provider: 'SNAPTRADE',
        name: 'Brokerage',
        institution: 'Robinhood',
        identifier: '••••1234',
        readOnly: true,
        paper: false,
        subscriptions: [],
        status: 'SYNCING',
        statusReason: 'initial sync',
        lastSyncedAtMs: Date.UTC(2026, 1, 1),
        connectionId: 'broker_authorization_0snap3',
      },
    ]);
    expect(fake.calls.map((c) => c.path)).not.toContain(
      '/broker-accounts/broker_account_0snap10/trade-subscriptions'
    );
  });

  it('accounts() keeps an account whose copy trading or Playbook cannot be read', async () => {
    restore = fakeV2({
      'GET /me/broker-accounts': () => ({
        items: [
          TRADING_ACCOUNT,
          { ...TRADING_ACCOUNT, id: 'broker_account_0trex8' },
        ],
        nextPageToken: null,
      }),
      'GET /broker-accounts/broker_account_0trex7/trade-subscriptions': () =>
        problem(503, 'UNAVAILABLE'),
      'GET /broker-accounts/broker_account_0trex8/trade-subscriptions': () => ({
        items: [SUBSCRIPTION],
        nextPageToken: null,
      }),
      'GET /playbooks/playbook_0btc': () => problem(404, 'NOT_FOUND'),
    }).restore;

    const accounts = await portfolio().accounts();

    expect(accounts[0].subscriptions).toEqual([]);
    expect(accounts[1].subscriptions[0]).toMatchObject({
      sourceUsername: '',
      playbookName: '',
    });
  });

  it('accounts() fails when the account list cannot be read', async () => {
    restore = fakeV2({
      'GET /me/broker-accounts': () =>
        problem(503, 'UNAVAILABLE', {
          detail: 'some broker accounts could not be read; retry',
        }),
    }).restore;

    await expect(portfolio().accounts()).rejects.toMatchObject({
      code: 'UNAVAILABLE',
      status: 503,
    });
  });

  it('summary() rebuilds holdings from the snapshot in today’s money shape', async () => {
    restore = fakeV2({
      'GET /broker-accounts/broker_account_0snap10/snapshot': () => ({
        accountId: 'broker_account_0snap10',
        totalValue: usd('1000.5'),
        cash: { amount: '10', currency: 'cad' },
        positionValue: usd('990.5'),
        unrealizedPnl: null,
        valuationStatus: 'COMPLETE',
        valuedAt: '2026-04-01T00:00:00.000Z',
        positionsReportedAt: null,
        positions: [
          {
            symbol: 'AAPL',
            side: 'SHORT',
            quantity: '-2.5',
            averageCost: usd('100'),
            price: { amount: '120', currency: 'EUR' },
            marketValue: usd('-300'),
            valuation: {},
            unrealizedPnl: usd('-50'),
            weight: 0.25,
            instrument: 'EQUITY',
            option: null,
          },
          {
            symbol: 'BTC',
            side: 'LONG',
            quantity: '1',
            averageCost: null,
            price: null,
            marketValue: null,
            valuation: {},
            unrealizedPnl: null,
            weight: null,
            instrument: 'CRYPTO',
            option: null,
          },
        ],
      }),
    }).restore;

    await expect(
      portfolio().summary('broker_account_0snap10')
    ).resolves.toEqual({
      totalValue: { amount: 1000.5, currency: 'USD', currencySymbol: '$' },
      cash: { amount: 10, currency: 'CAD', currencySymbol: 'C$' },
      holdings: [
        {
          symbol: 'AAPL',
          side: 'SHORT',
          quantity: -2.5,
          avgCost: { amount: 100, currency: 'USD', currencySymbol: '$' },
          currentPrice: { amount: 120, currency: 'EUR', currencySymbol: '€' },
          marketValue: { amount: -300, currency: 'USD', currencySymbol: '$' },
          unrealizedPnl: { amount: -50, currency: 'USD', currencySymbol: '$' },
          allocation: 0.25,
        },
        { symbol: 'BTC', side: 'LONG', quantity: 1 },
      ],
      asOfMs: Date.UTC(2026, 3, 1),
    });
  });

  it('activities() reads one page and rebuilds each record without an ID', async () => {
    const fake = fakeV2({
      'GET /broker-accounts/broker_account_0snap10/activities': () => ({
        items: [
          {
            kind: 'DIVIDEND',
            label: 'DIV',
            sourceLabel: 'Robinhood',
            occurredAt: '2026-05-01T00:00:00.000Z',
            symbol: 'AAPL',
            side: null,
            quantity: null,
            price: null,
            amount: { amount: '1.5', currency: 'JPY' },
            fee: null,
            status: null,
            origin: 'EXTERNAL',
            description: 'Dividend',
            externalReference: 'ext-1',
            instrument: 'EQUITY',
            option: null,
          },
        ],
        nextPageToken: 'next',
      }),
    });
    restore = fake.restore;

    const result = await portfolio().activities({
      accountId: 'broker_account_0snap10',
      limit: 20,
      pageToken: 'prev',
    });

    expect(fake.calls[0].query.toString()).toBe('pageSize=20&pageToken=prev');
    expect(result).toEqual({
      activities: [
        {
          kind: 'DIVIDEND',
          type: 'DIV',
          occurredAtMs: Date.UTC(2026, 4, 1),
          symbol: 'AAPL',
          amount: { amount: 1.5, currency: 'JPY', currencySymbol: '¥' },
          sourceLabel: 'Robinhood',
          description: 'Dividend',
          externalReferenceId: 'ext-1',
        },
      ],
      nextPageToken: 'next',
    });
    expect(result.activities[0]).not.toHaveProperty('id');
  });
});
