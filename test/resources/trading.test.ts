import { afterEach, describe, expect, it, vi } from 'vitest';
import { AlvaClient } from '../../src/client.js';
import { fakeV2, problem } from '../fakeV2.js';

const ACCOUNT = {
  id: 'broker_account_0trex7',
  displayName: 'Paper',
  broker: { code: 'binance_spot', name: 'Binance Spot', logoUrl: null },
  maskedNumber: '••••7777',
  mode: 'PAPER_TRADING',
  status: 'ACTIVE',
  statusReason: null,
  lastSyncedAt: null,
  connectedAt: '2026-01-02T03:04:05.000Z',
  connectionId: null,
  provider: 'DIRECT',
};

const SUBSCRIPTION = {
  id: 'trade_subscription_0a',
  accountId: 'broker_account_0trex7',
  playbookId: 'playbook_0btc',
  playbookVersion: '1.0.0',
  feed: 'signals',
  signalSourceId: 'automation_0signals',
  status: 'ACTIVE',
  stoppedReason: null,
  createdAt: '2026-03-01T00:00:00.000Z',
  lastSignalAt: null,
};

const PLAYBOOK = {
  id: 'playbook_0btc',
  title: 'BTC Momentum',
  owner: { handle: 'alice' },
};

const usd = (amount: string) => ({ amount, currency: 'USD' });
const page = (items: unknown[], nextPageToken: string | null = null) => ({
  items,
  nextPageToken,
});

let restore = () => {};
afterEach(() => {
  restore();
  vi.useRealTimers();
});

const client = () =>
  new AlvaClient({ apiKey: 'key', baseUrl: 'https://api.test' });
const trading = () => client().trading;

describe('TradingResource', () => {
  it('accounts() keeps trading accounts and embeds their copy trading', async () => {
    restore = fakeV2({
      'GET /me/broker-accounts': () =>
        page([
          ACCOUNT,
          { ...ACCOUNT, id: 'broker_account_0snap', provider: 'SNAPTRADE' },
        ]),
      'GET /broker-accounts/broker_account_0trex7/trade-subscriptions': () =>
        page([
          SUBSCRIPTION,
          { ...SUBSCRIPTION, id: 'trade_subscription_0b', status: 'STOPPED' },
        ]),
      'GET /playbooks/playbook_0btc': () => PLAYBOOK,
    }).restore;

    await expect(trading().accounts()).resolves.toEqual([
      {
        id: 'broker_account_0trex7',
        name: 'Paper',
        exchange: 'binance_spot',
        paper: true,
        identifier: '••••7777',
        createdAtMs: Date.UTC(2026, 0, 2, 3, 4, 5),
        subscriptions: [
          {
            id: 'trade_subscription_0a',
            sourceUsername: 'alice',
            sourceFeed: 'signals',
            playbookId: 'playbook_0btc',
            playbookName: 'BTC Momentum',
            active: true,
          },
          expect.objectContaining({
            id: 'trade_subscription_0b',
            active: false,
          }),
        ],
      },
    ]);
  });

  it('portfolio() rebuilds trex numbers, with no equity unless every holding was valued', async () => {
    const snapshot = (valuationStatus: string) => ({
      accountId: 'broker_account_0trex7',
      totalValue: usd('1000'),
      cash: usd('250.5'),
      unrealizedPnl: usd('-3'),
      valuationStatus,
      valuedAt: null,
      positions: [
        {
          symbol: 'BINANCE_SPOT_BTC_USDT',
          side: 'LONG',
          quantity: '0.5',
          averageCost: usd('60000'),
          price: usd('61000'),
          marketValue: usd('30500'),
          unrealizedPnl: usd('500'),
          weight: 0.9,
        },
      ],
    });
    restore = fakeV2({
      'GET /broker-accounts/broker_account_0trex7/snapshot': [
        () => snapshot('COMPLETE'),
        () => snapshot('PARTIAL'),
      ],
    }).restore;
    const t = trading();

    await expect(t.portfolio('broker_account_0trex7')).resolves.toEqual({
      equity: 1000,
      cash: 250.5,
      unrealizedPnl: -3,
      assets: [
        {
          symbol: 'BINANCE_SPOT_BTC_USDT',
          side: 'long',
          quantity: 0.5,
          entryPrice: 60000,
          currentPrice: 61000,
          marketValue: 30500,
          unrealizedPnl: 500,
          allocation: 0.9,
        },
      ],
    });
    await expect(t.portfolio('broker_account_0trex7')).resolves.toMatchObject({
      equity: null,
    });
  });

  it('orders() filters by origin and time, and names the copy trading Playbook', async () => {
    const fake = fakeV2({
      'GET /broker-accounts/broker_account_0trex7/orders': () =>
        page([
          {
            id: 'order_0a',
            accountId: 'broker_account_0trex7',
            externalReference: 'binance-123',
            symbol: 'BTC/USDT',
            side: 'BUY',
            status: 'PARTIALLY_FILLED',
            rejectReason: null,
            requestedQuantity: '2',
            filledQuantity: '1.5',
            averagePrice: usd('60000'),
            origin: 'ALVA_INSTRUCTION',
            tradeSubscriptionId: 'trade_subscription_0a',
            option: null,
            placedAt: '2026-03-03T00:00:00.000Z',
          },
          {
            id: 'order_0b',
            accountId: 'broker_account_0trex7',
            externalReference: 'binance-124',
            symbol: 'BTC/USDT',
            side: null,
            status: 'REJECTED',
            rejectReason: 'insufficient funds',
            requestedQuantity: '1',
            filledQuantity: '0',
            averagePrice: null,
            origin: 'ALVA_DIRECT',
            tradeSubscriptionId: null,
            option: null,
            placedAt: null,
          },
        ]),
      'GET /broker-accounts/broker_account_0trex7/trade-subscriptions': () =>
        page([SUBSCRIPTION]),
      'GET /playbooks/playbook_0btc': () => PLAYBOOK,
    });
    restore = fake.restore;

    const orders = await trading().orders({
      accountId: 'broker_account_0trex7',
      origin: 'ALVA_INSTRUCTION',
      since: 1772496000,
      limit: 10,
    });

    expect(Object.fromEntries(fake.calls[0].query)).toEqual({
      origin: 'ALVA_INSTRUCTION',
      since: '2026-03-03T00:00:00.000Z',
      pageSize: '10',
    });
    expect(orders).toEqual([
      {
        orderId: 'binance-123',
        symbol: 'BTC/USDT',
        side: 'buy',
        requestedQty: 2,
        filledQty: 1.5,
        price: 60000,
        status: 'partial',
        source: 'ALVA_INSTRUCTION',
        sourcePlaybook: 'BTC Momentum',
        subscriptionId: 'trade_subscription_0a',
        dryRun: false,
        createdAtMs: Date.UTC(2026, 2, 3),
      },
      {
        orderId: 'binance-124',
        symbol: 'BTC/USDT',
        side: '',
        requestedQty: 1,
        filledQty: 0,
        price: 0,
        status: 'rejected',
        rejectReason: 'insufficient funds',
        source: 'ALVA_DIRECT',
        sourcePlaybook: '',
        dryRun: false,
        createdAtMs: 0,
      },
    ]);
  });

  it('orders() refuses trex’s source filter and reads no subscriptions without copy trading', async () => {
    const fake = fakeV2({
      'GET /broker-accounts/broker_account_0trex7/orders': () => page([]),
    });
    restore = fake.restore;

    await expect(
      trading().orders({ accountId: 'broker_account_0trex7', source: 'manual' })
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT', status: 400 });
    await expect(
      trading().orders({ accountId: 'broker_account_0trex7' })
    ).resolves.toEqual([]);
    expect(fake.calls).toHaveLength(1);
  });

  it('subscriptions() lists every page with the Playbook owner as source', async () => {
    restore = fakeV2({
      'GET /broker-accounts/broker_account_0trex7/trade-subscriptions': [
        () => page([SUBSCRIPTION], 'p2'),
        () =>
          page([
            {
              ...SUBSCRIPTION,
              id: 'trade_subscription_0b',
              playbookId: null,
              status: 'STOPPED',
              stoppedReason: 'unsubscribed',
              lastSignalAt: '2026-03-05T00:00:00.000Z',
            },
          ]),
      ],
      'GET /playbooks/playbook_0btc': () => PLAYBOOK,
    }).restore;

    await expect(
      trading().subscriptions('broker_account_0trex7')
    ).resolves.toEqual([
      {
        id: 'trade_subscription_0a',
        accountId: 'broker_account_0trex7',
        sourceUsername: 'alice',
        sourceFeed: 'signals',
        active: true,
        playbookId: 'playbook_0btc',
        playbookVersion: '1.0.0',
        createdAtMs: Date.UTC(2026, 2, 1),
        watermark: 0,
      },
      {
        id: 'trade_subscription_0b',
        accountId: 'broker_account_0trex7',
        sourceUsername: '',
        sourceFeed: 'signals',
        active: false,
        deactivateReason: 'unsubscribed',
        playbookId: '',
        playbookVersion: '1.0.0',
        createdAtMs: Date.UTC(2026, 2, 1),
        watermark: Date.UTC(2026, 2, 5),
      },
    ]);
  });

  it('equityHistory() picks the range holding sinceMs and keeps trex units', async () => {
    vi.useFakeTimers({ now: Date.UTC(2026, 5, 30), toFake: ['Date'] });
    const point = (day: number, value: string, pnl: string, pct: string) => ({
      startsAt: new Date(Date.UTC(2026, 5, day)).toISOString(),
      value: usd(value),
      pnl: usd(pnl),
      pnlPercent: pct,
    });
    const fake = fakeV2({
      'GET /broker-accounts/broker_account_0trex7/equity': () => ({
        accountId: 'broker_account_0trex7',
        range: 'ONE_MONTH',
        points: [
          point(9, '100', '0', '0'),
          point(10, '110', '10', '10'),
          point(20, '99', '-11', '-10'),
          point(29, '100', '1', '1.0101'),
        ],
      }),
    });
    restore = fake.restore;

    const points = await trading().equityHistory({
      accountId: 'broker_account_0trex7',
      timeframe: '1d',
      sinceMs: Date.UTC(2026, 5, 10),
      untilMs: Date.UTC(2026, 5, 20),
    });

    expect(fake.calls[0].query.get('range')).toBe('ONE_MONTH');
    expect(points).toEqual([
      {
        timestamp: Date.UTC(2026, 5, 10) / 1000,
        equity: 110,
        pnl: 10,
        pnlPct: 0.1,
      },
      {
        timestamp: Date.UTC(2026, 5, 20) / 1000,
        equity: 99,
        pnl: -11,
        pnlPct: -0.1,
      },
    ]);
  });

  it('equityHistory() sends an explicit range, reads ALL by default, and refuses other buckets', async () => {
    const fake = fakeV2({
      'GET /broker-accounts/broker_account_0trex7/equity': () => ({
        accountId: 'broker_account_0trex7',
        range: 'ALL',
        points: [],
      }),
    });
    restore = fake.restore;
    const t = trading();

    await t.equityHistory({
      accountId: 'broker_account_0trex7',
      range: 'ONE_WEEK',
    });
    await t.equityHistory({ accountId: 'broker_account_0trex7' });
    await expect(
      t.equityHistory({ accountId: 'broker_account_0trex7', timeframe: '1h' })
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });

    expect(fake.calls.map((c) => c.query.toString())).toEqual([
      'range=ONE_WEEK',
      '',
    ]);
  });

  it('riskRules() and updateRiskRules() map maxSingleOrder to maxOrderValue', async () => {
    const rules = {
      maxOrderValue: { enabled: true, value: '250' },
      maxDailyTurnover: { enabled: false, value: '0' },
      maxDailyOrders: { enabled: true, value: '20' },
    };
    const fake = fakeV2({
      'GET /me/risk-rules': () => rules,
      'PATCH /me/risk-rules': () => rules,
    });
    restore = fake.restore;
    const t = trading();
    const expected = {
      maxSingleOrder: { value: 250, enabled: true },
      maxDailyTurnover: { value: 0, enabled: false },
      maxDailyOrders: { value: 20, enabled: true },
    };

    await expect(t.riskRules()).resolves.toEqual(expected);
    await expect(t.updateRiskRules(expected)).resolves.toEqual(expected);

    const patch = fake.calls[1];
    expect(patch.headers['Content-Type']).toBe('application/merge-patch+json');
    expect(patch.body).toEqual({
      maxOrderValue: { enabled: true, value: '250' },
      maxDailyTurnover: { enabled: false, value: '0' },
      maxDailyOrders: { enabled: true, value: '20' },
    });
  });

  it('updateRiskRules() explains a loosening refused for lack of trading_limits:write', async () => {
    restore = fakeV2({
      'PATCH /me/risk-rules': () =>
        problem(403, 'INSUFFICIENT_PERMISSION', {
          detail: 'raising a risk limit needs trading_limits:write',
          requiredPermission: 'trading_limits:write',
        }),
    }).restore;

    await expect(
      trading().updateRiskRules({
        maxSingleOrder: { value: 1e6, enabled: true },
        maxDailyTurnover: { value: 1e6, enabled: true },
        maxDailyOrders: { value: 1000, enabled: true },
      })
    ).rejects.toMatchObject({
      code: 'INSUFFICIENT_PERMISSION',
      status: 403,
      requiredPermission: 'trading_limits:write',
      message: expect.stringContaining('may only tighten risk rules'),
    });
  });

  it('subscribe() copies a feed by its Automation ID without initial orders', async () => {
    const fake = fakeV2({
      'POST /broker-accounts/broker_account_0trex7/trade-subscriptions': () =>
        SUBSCRIPTION,
      'GET /playbooks/playbook_0btc': () => PLAYBOOK,
    });
    restore = fake.restore;

    const s = await trading().subscribe({
      accountId: 'broker_account_0trex7',
      sourceUsername: '',
      sourceFeed: '',
      playbookId: 'playbook_0btc',
      playbookVersion: '1.0.0',
      signalSourceId: 'automation_0signals',
    });

    expect(fake.calls[0].body).toEqual({
      playbookId: 'playbook_0btc',
      signalSourceId: 'automation_0signals',
      playbookVersion: '1.0.0',
      initialOrders: 'NONE',
    });
    expect(fake.calls[0].headers['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/);
    expect(s).toMatchObject({
      id: 'trade_subscription_0a',
      sourceUsername: 'alice',
      active: true,
    });
  });

  it('subscribe() finds the caller’s own feed by name', async () => {
    const fake = fakeV2({
      'GET /me': () => ({ username: 'Alice' }),
      'GET /me/automations': [
        () => page([{ id: 'automation_0other', name: 'other' }], 'p2'),
        () => page([{ id: 'automation_0signals', name: 'signals' }]),
      ],
      'POST /broker-accounts/broker_account_0trex7/trade-subscriptions': () =>
        SUBSCRIPTION,
      'GET /playbooks/playbook_0btc': () => problem(404, 'NOT_FOUND'),
    });
    restore = fake.restore;

    const s = await trading().subscribe({
      accountId: 'broker_account_0trex7',
      sourceUsername: 'alice',
      sourceFeed: 'signals',
      playbookId: 'playbook_0btc',
      playbookVersion: '1.0.0',
    });

    const post = fake.calls.find((c) => c.method === 'POST');
    expect(post?.body).toMatchObject({ signalSourceId: 'automation_0signals' });
    expect(s.sourceUsername).toBe('alice');
  });

  it('subscribe() refuses another user’s feed by name and a missing own feed', async () => {
    const fake = fakeV2({
      'GET /me': [() => ({ username: 'bob' }), () => ({ username: 'alice' })],
      'GET /me/automations': () => page([]),
    });
    restore = fake.restore;
    const params = {
      accountId: 'broker_account_0trex7',
      sourceUsername: 'alice',
      sourceFeed: 'signals',
      playbookId: 'playbook_0btc',
      playbookVersion: '1.0.0',
    };

    await expect(trading().subscribe(params)).rejects.toMatchObject({
      code: 'INVALID_ARGUMENT',
      message: expect.stringContaining('signalSourceId'),
    });
    await expect(trading().subscribe(params)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(fake.calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('subscribe() with executeLatest stays on /api/v1', async () => {
    const c = client();
    const request = vi.spyOn(c, '_request').mockResolvedValue({ id: '5' });
    const v2 = vi.spyOn(c, '_v2Request');

    await c.trading.subscribe({
      accountId: '7',
      sourceUsername: 'alice',
      sourceFeed: 'signals',
      playbookId: '3',
      playbookVersion: '1.0.0',
      executeLatest: true,
    });

    expect(request).toHaveBeenCalledWith('POST', '/api/v1/trading/subscribe', {
      body: {
        accountId: '7',
        sourceUsername: 'alice',
        sourceFeed: 'signals',
        playbookId: '3',
        playbookVersion: '1.0.0',
        executeLatest: true,
      },
    });
    expect(v2).not.toHaveBeenCalled();
  });

  it('unsubscribe() cancels the trade subscription', async () => {
    const fake = fakeV2({
      'POST /trade-subscriptions/trade_subscription_0a/cancel': () => ({
        ...SUBSCRIPTION,
        status: 'STOPPED',
      }),
    });
    restore = fake.restore;

    await expect(
      trading().unsubscribe('trade_subscription_0a')
    ).resolves.toEqual({
      unsubscribedId: 'trade_subscription_0a',
    });
    expect(fake.calls[0].body).toBeUndefined();
  });

  it('execute() stays on /api/v1', async () => {
    const c = client();
    const request = vi
      .spyOn(c, '_request')
      .mockResolvedValue({ status: 'ok', orders: [] });
    const params = { accountId: '7', signalJson: '{}', dryRun: true };

    await c.trading.execute(params);

    expect(request).toHaveBeenCalledWith('POST', '/api/v1/trading/execute', {
      body: params,
    });
  });
});
