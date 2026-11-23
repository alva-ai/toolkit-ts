import { afterEach, describe, expect, it, vi } from 'vitest';
import { AlvaClient } from '../../src/client.js';
import { dispatchCli, handleBroker } from '../../src/cli/dispatch.js';
import { dispatch as dispatchEmbedded } from '../../src/cli/embeddedDispatch.js';
import { CliUsageError } from '../../src/error.js';
import { fakeV2, problem } from '../fakeV2.js';
import { page } from '../marketV2.js';
import {
  ACCOUNT,
  brokerAccount,
  equitySeries,
  order,
  orderExecution,
  riskRules,
  snapshot,
  tradeSubscription,
} from '../portfolioV2.js';

const REQUEST_ID = '123e4567-e89b-42d3-a456-426614174000';

function client(): AlvaClient {
  return new AlvaClient({ apiKey: 'test-key', baseUrl: 'https://api.test' });
}

let restore = () => {};
afterEach(() => restore());

describe('trading CLI on /api/v2', () => {
  it('lists the trading accounts and reads a snapshot, terminal and embedded', async () => {
    const accounts = page([brokerAccount()]);
    const fake = fakeV2({
      'GET /me/broker-accounts': () => accounts,
      [`GET /broker-accounts/${ACCOUNT}/snapshot`]: () => snapshot(),
    });
    restore = fake.restore;

    await expect(
      dispatchCli(client(), ['trading', 'accounts'])
    ).resolves.toEqual(accounts);
    await expect(
      dispatchEmbedded(client(), ['trading', 'accounts'])
    ).resolves.toEqual(accounts);
    await dispatchCli(client(), ['portfolio', 'accounts']);
    await expect(
      dispatchCli(client(), ['trading', 'portfolio', '--account-id', ACCOUNT])
    ).resolves.toEqual(snapshot());
    expect(fake.calls.map((c) => `${c.path}?${c.query}`)).toEqual([
      '/me/broker-accounts?modes=PAPER_TRADING&modes=LIVE_TRADING&modes=BROKER_CONFIRMATION',
      '/me/broker-accounts?modes=PAPER_TRADING&modes=LIVE_TRADING&modes=BROKER_CONFIRMATION',
      '/me/broker-accounts?',
      `/broker-accounts/${ACCOUNT}/snapshot?`,
    ]);
  });

  it('filters orders by origin and an RFC 3339 --since, and refuses retired flags', async () => {
    const fake = fakeV2({
      [`GET /broker-accounts/${ACCOUNT}/orders`]: () => page([order()]),
    });
    restore = fake.restore;
    const orders = ['trading', 'orders', '--account-id', ACCOUNT];

    await expect(
      dispatchCli(client(), [
        ...orders,
        '--origin',
        'alva_direct',
        '--since',
        '2026-11-01T00:00:00Z',
        '--limit',
        '10',
      ])
    ).resolves.toEqual(page([order()]));
    expect(fake.calls[0].query.toString()).toBe(
      'origin=ALVA_DIRECT&from=2026-11-01T00%3A00%3A00.000Z&pageSize=10'
    );
    await expect(
      dispatchCli(client(), [...orders, '--since', '1761955200'])
    ).rejects.toThrow(/RFC 3339.*Unix timestamps are no longer accepted/);
    await expect(
      dispatchEmbedded(client(), [
        'portfolio',
        'orders',
        '--account-id',
        ACCOUNT,
        '--source',
        'manual',
      ])
    ).rejects.toThrow(/--origin/);
    await expect(
      dispatchCli(client(), [...orders, '--origin', 'robot'])
    ).rejects.toBeInstanceOf(CliUsageError);
    expect(fake.calls).toHaveLength(1);
  });

  it('reads the equity series for a range and refuses the 0.x window flags', async () => {
    const fake = fakeV2({
      [`GET /broker-accounts/${ACCOUNT}/equity`]: () => equitySeries(),
    });
    restore = fake.restore;
    const equity = ['portfolio', 'equity-history', '--account-id', ACCOUNT];

    await expect(
      dispatchEmbedded(client(), [...equity, '--range', 'one_week'])
    ).resolves.toEqual(equitySeries());
    expect(fake.calls[0].query.toString()).toBe('range=ONE_WEEK');
    for (const flag of ['--timeframe', '--since-ms', '--until-ms']) {
      await expect(
        dispatchEmbedded(client(), [...equity, flag, '1'])
      ).rejects.toThrow(/use --range/);
    }
    expect(fake.calls).toHaveLength(1);
  });

  it('subscribes by signal source ID, and executes the latest signal on /api/v1', async () => {
    const fake = fakeV2({
      [`POST /broker-accounts/${ACCOUNT}/trade-subscriptions`]: () =>
        tradeSubscription(),
    });
    restore = fake.restore;
    const subscribe = [
      'trading',
      'subscribe',
      '--account-id',
      ACCOUNT,
      '--playbook-id',
      'playbook_0a1',
    ];

    await expect(
      dispatchCli(client(), [
        ...subscribe,
        '--signal-source-id',
        'automation_0a1',
      ])
    ).resolves.toEqual(tradeSubscription());
    expect(fake.calls[0].body).toEqual({
      playbookId: 'playbook_0a1',
      signalSourceId: 'automation_0a1',
      initialOrders: 'NONE',
    });
    await expect(
      dispatchCli(client(), [
        ...subscribe,
        '--source-username',
        'alice',
        '--source-feed',
        'targets',
      ])
    ).rejects.toThrow(/--signal-source-id/);

    const c = client();
    const legacy = vi.spyOn(c.v1.trading, 'subscribe').mockResolvedValue({
      id: '9',
    } as never);
    await dispatchCli(c, [
      'trading',
      'subscribe',
      '--account-id',
      '42',
      '--playbook-id',
      '7',
      '--source-username',
      'alice',
      '--source-feed',
      'targets',
      '--playbook-version',
      'v1.0.0',
      '--execute-latest',
    ]);
    expect(legacy).toHaveBeenCalledWith({
      accountId: '42',
      sourceUsername: 'alice',
      sourceFeed: 'targets',
      playbookId: '7',
      playbookVersion: 'v1.0.0',
    });
    expect(fake.calls).toHaveLength(1);
  });

  it('places an OrderInstruction with the caller key; embedded plans it unless --live', async () => {
    const route = `POST /broker-accounts/${ACCOUNT}/orders`;
    const fake = fakeV2({ [route]: () => orderExecution() });
    restore = fake.restore;
    const instruction =
      '{"type":"ALLOCATE","weights":[{"symbol":"BINANCE_PERP_BTC_USDT","weight":"0.1"}]}';
    const weights = [{ symbol: 'BINANCE_PERP_BTC_USDT', weight: '0.1' }];

    await expect(
      dispatchCli(client(), [
        'trading',
        'execute',
        '--account-id',
        ACCOUNT,
        '--instruction',
        instruction,
        '--idempotency-key',
        REQUEST_ID,
      ])
    ).resolves.toEqual(orderExecution());
    const signals = [
      'trading',
      'signals',
      'execute',
      '--account-id',
      ACCOUNT,
      '--instruction',
      instruction,
    ];
    await dispatchEmbedded(client(), signals);
    await dispatchEmbedded(client(), [...signals, '--live']);

    expect(fake.calls.map((c) => c.body)).toEqual([
      { type: 'ALLOCATE', weights },
      { type: 'ALLOCATE', weights, dryRun: true },
      { type: 'ALLOCATE', weights },
    ]);
    expect(fake.calls[0].headers['Idempotency-Key']).toBe(`"${REQUEST_ID}"`);
    await expect(
      dispatchCli(client(), [
        'trading',
        'execute',
        '--account-id',
        ACCOUNT,
        '--signal',
        '{"date":1,"instruction":{"type":"allocate"}}',
      ])
    ).rejects.toThrow(/--signal is no longer a flag.*--instruction/);
    await expect(
      dispatchCli(client(), ['trading', 'execute', '--account-id', ACCOUNT])
    ).rejects.toThrow(/--instruction is required/);
    expect(fake.calls).toHaveLength(3);
  });

  it('patches every risk rule with decimal values', async () => {
    const fake = fakeV2({ 'PATCH /me/risk-rules': () => riskRules() });
    restore = fake.restore;

    await expect(
      dispatchCli(client(), [
        'trading',
        'update-risk-rules',
        '--max-single-order-value',
        '10000',
        '--max-single-order-enabled',
        'true',
        '--max-daily-turnover-value',
        '2500.50',
        '--max-daily-turnover-enabled',
        'false',
        '--max-daily-orders-value',
        '100',
        '--max-daily-orders-enabled',
        'true',
      ])
    ).resolves.toEqual(riskRules());
    expect(fake.calls[0].body).toEqual({
      maxOrderValue: { value: '10000', enabled: true },
      maxDailyTurnover: { value: '2500.5', enabled: false },
      maxDailyOrders: { value: '100', enabled: true },
    });
  });

  it('replaces only the rules it names, each one whole', async () => {
    const fake = fakeV2({ 'PATCH /me/risk-rules': () => riskRules() });
    restore = fake.restore;

    await dispatchCli(client(), [
      'trading',
      'update-risk-rules',
      '--max-daily-orders-value',
      '50',
      '--max-daily-orders-enabled',
      'false',
    ]);
    expect(fake.calls.map((c) => [c.method, c.path, c.body])).toEqual([
      [
        'PATCH',
        '/me/risk-rules',
        { maxDailyOrders: { enabled: false, value: '50' } },
      ],
    ]);
  });

  it.each([
    [
      ['--max-daily-orders-value', '50'],
      "--max-daily-orders-enabled is required with --max-daily-orders-value for 'trading update-risk-rules': a rule is sent whole",
    ],
    [
      [
        '--max-daily-orders-value',
        '50',
        '--max-daily-orders-enabled',
        'true',
        '--max-single-order-enabled',
        'false',
      ],
      "--max-single-order-value is required with --max-single-order-enabled for 'trading update-risk-rules': a rule is sent whole",
    ],
    [
      [
        '--max-daily-turnover-value',
        '10',
        '--max-daily-turnover-enabled',
        'on',
      ],
      "--max-daily-turnover-enabled must be true or false for 'trading update-risk-rules', got 'on'",
    ],
    [[], /'trading update-risk-rules' requires a rule/],
  ])(
    'refuses %j before sending: half a rule is not a rule',
    async (flags, message) => {
      const fake = fakeV2({});
      restore = fake.restore;

      const sent = dispatchCli(client(), [
        'trading',
        'update-risk-rules',
        ...flags,
      ]);
      await expect(sent).rejects.toBeInstanceOf(CliUsageError);
      await expect(sent).rejects.toThrow(message);
      expect(fake.calls).toHaveLength(0);
    }
  );
});

describe('broker invocations on /api/v2', () => {
  it('posts the argv and hands the envelope and exit code to the writer', async () => {
    const fake = fakeV2({
      'POST /broker/invocations': () => ({
        envelope: { schemaVersion: 2, status: 'rejected' },
        exitCode: 1,
      }),
    });
    restore = fake.restore;
    const writeBrokerResult = vi.fn().mockResolvedValue(undefined);

    await handleBroker(client(), ['quote', '--venue', 'binance'], {
      writeBrokerResult,
    });

    expect(fake.calls[0].body).toEqual({
      argv: ['quote', '--venue', 'binance'],
    });
    expect(writeBrokerResult).toHaveBeenCalledWith(
      { schemaVersion: 2, status: 'rejected' },
      1
    );
  });

  it.each([
    [['balance', '--account-id', ACCOUNT, '--venue', 'binance']],
    [['balance', `--account-id=${ACCOUNT}`, '--venue', 'binance']],
  ])('names the account with accountId, never argv: %j', async (argv) => {
    const fake = fakeV2({
      'POST /broker/invocations': () => ({ envelope: {}, exitCode: 0 }),
    });
    restore = fake.restore;

    await handleBroker(client(), argv, {
      writeBrokerResult: vi.fn().mockResolvedValue(undefined),
    });

    expect(fake.calls[0].body).toEqual({
      accountId: ACCOUNT,
      argv: ['balance', '--venue', 'binance'],
    });
  });

  it.each([
    [['balance', '--account-id']],
    [['balance', '--account-id', '--venue', 'binance']],
    [['balance', '--account-id', ACCOUNT, '--account-id=broker_account_0b2']],
  ])('refuses an --account-id without one value: %j', async (argv) => {
    const fake = fakeV2({});
    restore = fake.restore;

    await expect(
      handleBroker(client(), argv, { writeBrokerResult: vi.fn() })
    ).rejects.toBeInstanceOf(CliUsageError);
    expect(fake.calls).toHaveLength(0);
  });

  it('turns a refused invocation into the network envelope with exit 2', async () => {
    restore = fakeV2({
      'POST /broker/invocations': () =>
        problem(403, 'INSUFFICIENT_PERMISSION', {
          detail: 'this credential lacks trading:write',
          requiredPermission: 'trading:write',
        }),
    }).restore;
    const writeBrokerResult = vi.fn().mockResolvedValue(undefined);

    await handleBroker(client(), ['order', 'cancel', '--dry-run'], {
      writeBrokerResult,
    });

    expect(writeBrokerResult).toHaveBeenCalledWith(
      {
        schemaVersion: 2,
        status: 'error',
        reason: {
          code: 'network',
          message: 'this credential lacks trading:write',
        },
      },
      2
    );
  });
});
