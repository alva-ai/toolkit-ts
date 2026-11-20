import { afterEach, describe, expect, it, vi } from 'vitest';
import { AlvaClient } from '../../src/client.js';
import { fakeV2, problem } from '../fakeV2.js';
import { page } from '../marketV2.js';
import {
  ACCOUNT,
  equitySeries,
  order,
  orderExecution,
  riskRules,
  SUBSCRIPTION,
  tradeSubscription,
} from '../portfolioV2.js';

const REQUEST_ID = '123e4567-e89b-42d3-a456-426614174000';

let restore = () => {};
afterEach(() => restore());

function client() {
  return new AlvaClient({ apiKey: 'key', baseUrl: 'https://api.test' });
}

describe('TradingResource', () => {
  it('orders() filters by origin and DateTime window, and returns the page as is', async () => {
    const orders = page([order()], 'p2');
    const fake = fakeV2({
      [`GET /broker-accounts/${ACCOUNT}/orders`]: () => orders,
    });
    restore = fake.restore;

    await expect(
      client().trading.orders(ACCOUNT, {
        origin: 'ALVA_INSTRUCTION',
        from: '2026-11-01T00:00:00Z',
        to: '2026-11-02T00:00:00Z',
        pageSize: 10,
      })
    ).resolves.toEqual(orders);
    expect(fake.calls[0].query.toString()).toBe(
      'origin=ALVA_INSTRUCTION&from=2026-11-01T00%3A00%3A00Z&to=2026-11-02T00%3A00%3A00Z&pageSize=10'
    );
  });

  it('placeOrders() posts the instruction on the orders route with the caller key', async () => {
    const fake = fakeV2({
      [`POST /broker-accounts/${ACCOUNT}/orders`]: () => orderExecution(),
    });
    restore = fake.restore;
    const instruction = {
      type: 'ALLOCATE' as const,
      weights: [{ symbol: 'BINANCE_PERP_BTC_USDT', weight: '0.1' }],
      dryRun: true,
    };

    await expect(
      client().trading.placeOrders(ACCOUNT, instruction, {
        idempotencyKey: REQUEST_ID,
      })
    ).resolves.toEqual(orderExecution());
    expect(fake.calls[0].body).toEqual(instruction);
    expect(fake.calls[0].headers['Idempotency-Key']).toBe(`"${REQUEST_ID}"`);
  });

  it('placeOrders() retries an unknown outcome with the same key', async () => {
    const fake = fakeV2({
      [`POST /broker-accounts/${ACCOUNT}/orders`]: [
        () => problem(504, 'DEADLINE_EXCEEDED'),
        () => problem(409, 'CONFLICT', { reason: 'IDEMPOTENCY_KEY_IN_USE' }),
        () => orderExecution(),
      ],
    });
    restore = fake.restore;
    vi.useFakeTimers();
    try {
      const pending = client().trading.placeOrders(ACCOUNT, { type: 'ORDERS' });
      await vi.runAllTimersAsync();
      await expect(pending).resolves.toEqual(orderExecution());
    } finally {
      vi.useRealTimers();
    }
    const keys = fake.calls.map((c) => c.headers['Idempotency-Key']);
    expect(keys).toHaveLength(3);
    expect(new Set(keys).size).toBe(1);
    expect(keys[0]).toMatch(/^"[0-9a-f-]{36}"$/);
  });

  it('subscribe(), subscriptions() and unsubscribe() use the copy-trading routes', async () => {
    const stopped = tradeSubscription({ status: 'STOPPED' });
    const fake = fakeV2({
      [`POST /broker-accounts/${ACCOUNT}/trade-subscriptions`]: () =>
        tradeSubscription(),
      [`GET /broker-accounts/${ACCOUNT}/trade-subscriptions`]: () =>
        page([tradeSubscription()]),
      [`POST /trade-subscriptions/${SUBSCRIPTION}/cancel`]: () => stopped,
    });
    restore = fake.restore;
    const trading = client().trading;
    const body = {
      playbookId: 'playbook_0a1',
      signalSourceId: 'automation_0a1',
      playbookVersion: 'v1.0.0',
      initialOrders: 'NONE' as const,
    };

    await expect(
      trading.subscribe(ACCOUNT, body, { idempotencyKey: REQUEST_ID })
    ).resolves.toEqual(tradeSubscription());
    await expect(
      trading.subscriptions(ACCOUNT, { status: 'ACTIVE' })
    ).resolves.toEqual(page([tradeSubscription()]));
    await expect(trading.unsubscribe(SUBSCRIPTION)).resolves.toEqual(stopped);
    expect(fake.calls[0].body).toEqual(body);
    expect(fake.calls[0].headers['Idempotency-Key']).toBe(`"${REQUEST_ID}"`);
    expect(fake.calls[1].query.toString()).toBe('status=ACTIVE');
    expect(fake.calls[2].body).toBeUndefined();
  });

  it('equity() reads a preset range and returns the series as is', async () => {
    const fake = fakeV2({
      [`GET /broker-accounts/${ACCOUNT}/equity`]: () => equitySeries(),
    });
    restore = fake.restore;

    await expect(
      client().trading.equity(ACCOUNT, { range: 'ONE_WEEK' })
    ).resolves.toEqual(equitySeries());
    expect(fake.calls[0].query.toString()).toBe('range=ONE_WEEK');
  });

  it('riskRules() reads and updateRiskRules() merge-patches the rules', async () => {
    const fake = fakeV2({
      'GET /me/risk-rules': () => riskRules(),
      'PATCH /me/risk-rules': () => riskRules(),
    });
    restore = fake.restore;
    const patch = { maxDailyTurnover: { enabled: true, value: '5000' } };

    await expect(client().trading.riskRules()).resolves.toEqual(riskRules());
    await expect(client().trading.updateRiskRules(patch)).resolves.toEqual(
      riskRules()
    );
    expect(fake.calls[1].body).toEqual(patch);
    expect(fake.calls[1].headers['Content-Type']).toBe(
      'application/merge-patch+json'
    );
  });

  it('updateRiskRules() throws a loosening refusal as its problem', async () => {
    restore = fakeV2({
      'PATCH /me/risk-rules': () =>
        problem(403, 'INSUFFICIENT_PERMISSION', {
          detail: 'raising a cap needs trading_limits:write',
          requiredPermission: 'trading_limits:write',
        }),
    }).restore;

    await expect(
      client().trading.updateRiskRules({
        maxOrderValue: { enabled: false, value: null },
      })
    ).rejects.toMatchObject({
      code: 'INSUFFICIENT_PERMISSION',
      requiredPermission: 'trading_limits:write',
      message: 'raising a cap needs trading_limits:write',
    });
  });
});

describe('client.v1.trading', () => {
  it('subscribe() executes the latest signal on /api/v1 with its numeric IDs', async () => {
    const c = client();
    const legacy = vi.spyOn(c, '_request').mockResolvedValue({ id: '9' });
    const params = {
      accountId: '42',
      sourceUsername: 'alice',
      sourceFeed: 'targets',
      playbookId: '7',
      playbookVersion: 'v1.0.0',
    };

    await expect(c.v1.trading.subscribe(params)).resolves.toEqual({ id: '9' });
    expect(legacy).toHaveBeenCalledWith('POST', '/api/v1/trading/subscribe', {
      body: { ...params, executeLatest: true },
    });
  });
});
