import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { RunResource } from '../../src/resources/run.js';
import { AlertsResource } from '../../src/resources/alerts.js';
import { ChannelGroupSubscriptionsResource } from '../../src/resources/channelGroupSubscriptions.js';
import { NotificationsResource } from '../../src/resources/notifications.js';
import { FunctionsResource } from '../../src/resources/functions.js';
import { CreditsResource } from '../../src/resources/credits.js';
import { AlvaClient } from '../../src/client.js';
import { AlvaError } from '../../src/error.js';
import { fakeV2, problem } from '../fakeV2.js';

function makeClient(): AlvaClient & { _request: ReturnType<typeof vi.fn> } {
  const client = new AlvaClient({ apiKey: 'key' }) as AlvaClient & {
    _request: ReturnType<typeof vi.fn>;
  };
  client._request = vi.fn().mockResolvedValue({});
  return client;
}

describe('CreditsResource', () => {
  const WALLET = {
    balance: '100',
    todayUsed: '3',
    balances: [{ kind: 'DAILY', remaining: '100', expiresAt: null }],
  };
  let fake: ReturnType<typeof fakeV2> | undefined;
  afterEach(() => fake?.restore());
  const credits = () => new CreditsResource(new AlvaClient({ apiKey: 'key' }));

  it('wallet() reads GET /api/v2/me/wallet and keeps the v1 totals', async () => {
    fake = fakeV2({ 'GET /me/wallet': () => WALLET });

    await expect(credits().wallet()).resolves.toEqual({
      balance: 100,
      totalRemaining: 100,
      todayUsed: 3,
    });
  });

  it('items() sends the window, session and page, and rebuilds the v1 connection', async () => {
    fake = fakeV2({
      'GET /me/wallet': () => WALLET,
      'GET /me/credit-entries': () => ({
        items: [
          {
            id: 'credit_entry_0a',
            amount: '-5',
            reason: 'CHAT',
            title: 'Ask',
            grantKind: null,
            sessionId: 'session_0a',
            playbookId: null,
            automationId: null,
            occurredAt: '2026-06-23T01:00:00.000Z',
          },
          {
            id: 'credit_entry_0b',
            amount: '200',
            reason: 'DAILY_GRANT',
            title: null,
            grantKind: 'DAILY',
            sessionId: null,
            playbookId: 'playbook_0p',
            automationId: 'automation_0f',
            occurredAt: '2026-06-23T00:00:00.000Z',
          },
          {
            id: 'credit_entry_0c',
            amount: '-1',
            reason: 'OTHER',
            title: null,
            grantKind: null,
            sessionId: null,
            playbookId: null,
            automationId: null,
            occurredAt: '2026-06-22T23:00:00.000Z',
          },
        ],
        nextPageToken: 'page-2',
      }),
    });

    const result = await credits().items({
      startAtMs: 1782172800000,
      endAtMs: 1782259200000,
      sessionId: 'session_0a',
      first: 10,
      after: 'page-1',
    });

    const entries = fake.calls.find((c) => c.path === '/me/credit-entries');
    expect(Object.fromEntries(entries!.query)).toEqual({
      from: '2026-06-23T00:00:00.000Z',
      to: '2026-06-24T00:00:00.000Z',
      sessionId: 'session_0a',
      pageSize: '10',
      pageToken: 'page-1',
    });
    expect(result).toEqual({
      balance: 100,
      totalRemaining: 100,
      todayUsed: 3,
      items: {
        pageInfo: {
          hasNextPage: true,
          hasPreviousPage: false,
          startCursor: null,
          endCursor: 'page-2',
        },
        edges: [
          {
            cursor: '',
            node: {
              id: 'credit_entry_0a',
              sessionId: 'session_0a',
              playbookId: null,
              feedId: null,
              op: 'debit',
              source: 'ask',
              amount: 5,
              title: 'Ask',
              createdAtMs: Date.UTC(2026, 5, 23, 1),
            },
          },
          {
            cursor: '',
            node: {
              id: 'credit_entry_0b',
              sessionId: null,
              playbookId: 'playbook_0p',
              feedId: 'automation_0f',
              op: 'credit',
              source: 'daily_reset',
              amount: 200,
              createdAtMs: Date.UTC(2026, 5, 23),
            },
          },
          {
            cursor: 'page-2',
            node: expect.objectContaining({ op: 'debit', source: 'other' }),
          },
        ],
      },
    });
  });

  it('items() ends the list on a null next token', async () => {
    fake = fakeV2({
      'GET /me/wallet': () => WALLET,
      'GET /me/credit-entries': () => ({ items: [], nextPageToken: null }),
    });

    const result = await credits().items({ startAtMs: 0, endAtMs: 1 });

    expect(result.items).toEqual({
      pageInfo: {
        hasNextPage: false,
        hasPreviousPage: false,
        startCursor: null,
        endCursor: null,
      },
      edges: [],
    });
  });

  it('surfaces problems as AlvaError', async () => {
    fake = fakeV2({
      'GET /me/wallet': () =>
        problem(403, 'INSUFFICIENT_PERMISSION', {
          requiredPermission: 'billing:read',
        }),
    });

    await expect(credits().wallet()).rejects.toMatchObject({
      name: 'AlvaError',
      code: 'INSUFFICIENT_PERMISSION',
      requiredPermission: 'billing:read',
    });
  });
});

describe('RunResource', () => {
  const RUN = {
    status: 'SUCCEEDED',
    returnValue: '2',
    logs: 'log line',
    error: null,
    durationMs: 12,
    creditsUsed: '3',
    subscriptionRequired: false,
    entitlementFailure: null,
  };
  let fake: ReturnType<typeof fakeV2>;
  beforeEach(() => {
    fake = fakeV2({ 'POST /runs': () => RUN });
  });
  afterEach(() => fake.restore());
  const run = () => new RunResource(new AlvaClient({ apiKey: 'key' }));
  const sent = () => fake.calls[0]?.body;

  it('execute() with code sends POST /api/v2/runs and rebuilds the v1 result', async () => {
    await expect(run().execute({ code: '1+1' })).resolves.toEqual({
      result: '2',
      logs: 'log line',
      stats: { credits_used: 3, duration_ms: 12 },
      status: 'completed',
      error: null,
    });
    expect(sent()).toEqual({ code: '1+1' });
  });

  it('execute() with entry_path drops working_dir, which /api/v2 refuses with it', async () => {
    await run().execute({ entry_path: '~/s.js', working_dir: '~/w' });
    expect(sent()).toEqual({ entryPath: '~/s.js' });
    fake.calls.length = 0;
    await run().execute({ code: '1', working_dir: '~/w' });
    expect(sent()).toEqual({ code: '1', workingDir: '~/w' });
  });

  it('execute() reports a failed run that needs a higher plan', async () => {
    fake.restore();
    fake = fakeV2({
      'POST /runs': () => ({
        ...RUN,
        status: 'FAILED',
        error: 'needs pro',
        subscriptionRequired: true,
        entitlementFailure: {
          resource: '@alva/data',
          category: 'market',
          requiredTier: 'PRO',
        },
      }),
    });
    await expect(run().execute({ code: '1' })).resolves.toMatchObject({
      status: 'failed',
      error: 'needs pro',
      reject_reason: 'SUBSCRIPTION_ENTITLEMENT_REQUIRED',
      upgrade_url: 'https://alva.ai/pricing',
      entitlement_failure: {
        resource: '@alva/data',
        category: 'market',
        required_tier: 'PRO',
      },
    });
  });

  it('execute() preserves serialized string IDs supplied by the CLI', async () => {
    await run()._executeSerializedArgs(
      { code: '1+1' },
      '{"channel_id":"2087608331744604161"}'
    );
    expect(sent()).toEqual({
      code: '1+1',
      args: { channel_id: '2087608331744604161' },
    });
  });

  it('execute() sends the serialized args byte for byte', async () => {
    const c = new AlvaClient({ apiKey: 'key' });
    const request = vi.spyOn(c, '_v2Request').mockResolvedValue(RUN);
    await new RunResource(c)._executeSerializedArgs(
      { code: '1+1' },
      '{"fraction":1000000000000000.1}'
    );
    expect(request).toHaveBeenCalledWith('POST', '/runs', {
      jsonBody: '{"code":"1+1","args":{"fraction":1000000000000000.1}}',
      timeoutMs: undefined,
    });
  });

  it('execute() rejects malformed serialized args before sending', async () => {
    await expect(
      run()._executeSerializedArgs({ code: '1+1' }, '{"broken":')
    ).rejects.toThrow();
    expect(fake.calls).toHaveLength(0);
  });

  it.each([
    {
      name: 'unsafe integer',
      args: { channel_id: 2087608331744604200 },
    },
    { name: 'NaN', args: { value: Number.NaN } },
    { name: 'Infinity', args: { value: Number.POSITIVE_INFINITY } },
    { name: 'boxed number', args: { value: new Number(1) } },
    {
      name: 'toJSON object',
      args: { toJSON: () => ({ channel_id: 2087608331744604200 }) },
    },
    {
      name: 'accessor',
      args: Object.defineProperty({}, 'value', {
        enumerable: true,
        get: () => 1,
      }),
    },
    { name: 'array root', args: [] },
    { name: 'null root', args: null },
  ])(
    'execute() rejects $name from the structured SDK API',
    async ({ args }) => {
      await expect(
        run().execute({
          code: '1+1',
          args: args as Record<string, unknown>,
        })
      ).rejects.toThrow();
      expect(fake.calls).toHaveLength(0);
    }
  );

  it.each([
    '{"channel_id":2087608331744604161}',
    '{"channel_id":9.007199254740992e15}',
    '{"nested":[{"channel_id":2087608331744604161}]}',
    'null',
    '[]',
    '1',
  ])('execute() rejects unsafe serialized args: %s', async (args) => {
    await expect(
      run()._executeSerializedArgs({ code: '1+1' }, args)
    ).rejects.toThrow();
    expect(fake.calls).toHaveLength(0);
  });

  it.each([
    '{"min":-9007199254740991,"max":9007199254740991}',
    '{"fraction":1000000000000000.1}',
    '{"smallScientific":9.007199254740991e15}',
    '{"normalizedScientific":0.00000000000000009e32}',
  ])(
    'execute() accepts serialized numbers within the safe range: %s',
    async (args) => {
      await run()._executeSerializedArgs({ code: '1+1' }, args);
      expect(fake.calls).toHaveLength(1);
    }
  );

  it('execute() forwards max_heap_size_mb when provided', async () => {
    await run().execute({ code: '1+1', max_heap_size_mb: 512 });
    expect(sent()).toEqual({ code: '1+1', maxHeapSizeMb: 512 });
  });

  it('execute() forwards timeout_ms as client timeout only', async () => {
    const c = new AlvaClient({ apiKey: 'key' });
    const request = vi.spyOn(c, '_v2Request').mockResolvedValue(RUN);
    await new RunResource(c).execute({ code: '1+1', timeout_ms: 900000 });
    expect(request).toHaveBeenCalledWith('POST', '/runs', {
      body: {
        code: '1+1',
        entryPath: undefined,
        workingDir: undefined,
        args: undefined,
        maxHeapSizeMb: undefined,
      },
      timeoutMs: 900000,
    });
  });
});

describe('FunctionsResource', () => {
  it('register() sends POST /api/v1/service/functions', async () => {
    const client = makeClient();
    const functions = new FunctionsResource(client);
    await functions.register({
      playbook_id: 123,
      function_name: 'analyze',
      entry_script_path:
        '/alva/home/alice/playbooks/my-playbook/udf/analyze.js',
      params_schema: '{"type":"object"}',
      allow_charges: false,
    });
    expect(client._request).toHaveBeenCalledWith(
      'POST',
      '/api/v1/service/functions',
      {
        body: {
          playbook_id: 123,
          function_name: 'analyze',
          entry_script_path:
            '/alva/home/alice/playbooks/my-playbook/udf/analyze.js',
          params_schema: '{"type":"object"}',
          allow_charges: false,
        },
      }
    );
  });

  it('list() sends GET /api/v1/service/functions', async () => {
    const client = makeClient();
    const functions = new FunctionsResource(client);
    await functions.list({ playbook_id: 123 });
    expect(client._request).toHaveBeenCalledWith(
      'GET',
      '/api/v1/service/functions',
      {
        query: { playbook_id: 123 },
      }
    );
  });

  it('delete() sends DELETE /api/v1/service/functions', async () => {
    const client = makeClient();
    const functions = new FunctionsResource(client);
    await functions.delete({ playbook_id: 123, function_name: 'analyze' });
    expect(client._request).toHaveBeenCalledWith(
      'DELETE',
      '/api/v1/service/functions',
      {
        query: { playbook_id: 123, function_name: 'analyze' },
      }
    );
  });

  it('invoke() sends POST /api/v1/service/invoke and parses result JSON', async () => {
    const client = makeClient();
    client._request.mockResolvedValue({
      result: '{"ok":true}',
      logs: '',
      credits_used_total: 0,
      credits_charged_owner: 0,
      credits_charged_consumer: 0,
    });
    const functions = new FunctionsResource(client);
    const result = await functions.invoke({
      playbook_id: 123,
      function_name: 'analyze',
      parameters: { ticker: 'AAPL' },
    });
    expect(client._request).toHaveBeenCalledWith(
      'POST',
      '/api/v1/service/invoke',
      {
        body: {
          playbook_id: 123,
          function_name: 'analyze',
          parameters_json: '{"ticker":"AAPL"}',
        },
      }
    );
    expect(result.result).toEqual({ ok: true });
  });

  it('getAllowance() sends GET /api/v1/service/allowance and normalizes timestamps', async () => {
    const allowance = {
      id: '1',
      consumer_uid: '42',
      playbook_id: '123',
      amount: 25,
      used: 0,
      remaining: 25,
      created_at: { seconds: '1700000000', nanos: 123000000 },
      updated_at_ms: 1700000001000,
    };
    const client = makeClient();
    client._request.mockResolvedValue({ allowance });
    const functions = new FunctionsResource(client);
    const result = await functions.getAllowance({ playbook_id: 123 });
    expect(client._request).toHaveBeenCalledWith(
      'GET',
      '/api/v1/service/allowance',
      {
        query: { playbook_id: 123 },
      }
    );
    expect(result).toEqual({
      id: '1',
      consumer_uid: '42',
      playbook_id: '123',
      amount: 25,
      used: 0,
      remaining: 25,
      created_at_ms: 1700000000123,
      updated_at_ms: 1700000001000,
    });
  });

  it('listAllowances() sends GET /api/v1/service/allowances', async () => {
    const client = makeClient();
    client._request.mockResolvedValue({ allowances: [] });
    const functions = new FunctionsResource(client);
    const result = await functions.listAllowances();
    expect(client._request).toHaveBeenCalledWith(
      'GET',
      '/api/v1/service/allowances'
    );
    expect(result).toEqual({ allowances: [] });
  });

  it('createAllowance() sends POST /api/v1/service/allowance', async () => {
    const allowance = {
      id: '1',
      consumer_uid: '42',
      playbook_id: '123',
      amount: 25,
      used: 0,
      remaining: 25,
      created_at_ms: 1700000000000,
      updated_at_ms: 1700000000000,
    };
    const client = makeClient();
    client._request.mockResolvedValue({ allowance });
    const functions = new FunctionsResource(client);
    const result = await functions.createAllowance({
      playbook_id: 123,
      amount: 25,
    });
    expect(client._request).toHaveBeenCalledWith(
      'POST',
      '/api/v1/service/allowance',
      {
        body: { playbook_id: 123, amount: 25 },
      }
    );
    expect(result).toEqual({ allowance });
  });

  it('revokeAllowance() sends DELETE /api/v1/service/allowance', async () => {
    const client = makeClient();
    client._request.mockResolvedValue({});
    const functions = new FunctionsResource(client);
    const result = await functions.revokeAllowance({ playbook_id: 123 });
    expect(client._request).toHaveBeenCalledWith(
      'DELETE',
      '/api/v1/service/allowance',
      {
        query: { playbook_id: 123 },
      }
    );
    expect(result).toEqual({ ok: true });
  });
});

describe('NotificationsResource', () => {
  it('listFeed() sends GET /api/v1/feed/:username/:name/notifications', async () => {
    const client = makeClient();
    const notifications = new NotificationsResource(client);
    await notifications.listFeed({
      username: 'alice',
      name: 'btc-ema',
    });
    expect(client._request).toHaveBeenCalledWith(
      'GET',
      '/api/v1/feed/alice/btc-ema/notifications',
      { query: {} }
    );
  });
});

describe('ChannelGroupSubscriptionsResource', () => {
  it('context() sends GET /api/v1/channel/group-subscriptions/context', async () => {
    const client = makeClient();
    const groups = new ChannelGroupSubscriptionsResource(client);
    await groups.context({ session_id: '2047213140224270336' });
    expect(client._request).toHaveBeenCalledWith(
      'GET',
      '/api/v1/channel/group-subscriptions/context',
      {
        query: { session_id: '2047213140224270336' },
      }
    );
  });

  it('list() sends GET /api/v1/channel/group-subscriptions', async () => {
    const client = makeClient();
    const groups = new ChannelGroupSubscriptionsResource(client);
    await groups.list({ session_id: '2047213140224270336' });
    expect(client._request).toHaveBeenCalledWith(
      'GET',
      '/api/v1/channel/group-subscriptions',
      {
        query: { session_id: '2047213140224270336' },
      }
    );
  });

  it('subscribe() preserves int64 session id in raw JSON', async () => {
    const client = makeClient();
    const groups = new ChannelGroupSubscriptionsResource(client);
    await groups.subscribe({
      session_id: '2047213140224270336',
      target_type: 'feed',
      target_id: '8169',
    });
    expect(client._request).toHaveBeenCalledWith(
      'POST',
      '/api/v1/channel/group-subscriptions',
      {
        jsonBody:
          '{"session_id":2047213140224270336,"target_type":"feed","target_id":8169}',
      }
    );
  });

  it('unsubscribe() sends DELETE /api/v1/channel/group-subscriptions', async () => {
    const client = makeClient();
    const groups = new ChannelGroupSubscriptionsResource(client);
    await groups.unsubscribe({
      session_id: '2047213140224270336',
      target_type: 'feed',
      target_id: '42',
    });
    expect(client._request).toHaveBeenCalledWith(
      'DELETE',
      '/api/v1/channel/group-subscriptions',
      {
        jsonBody:
          '{"session_id":2047213140224270336,"target_type":"feed","target_id":42}',
      }
    );
  });

  it('rejects unsafe numeric ids before JSON serialization can round them', async () => {
    const client = makeClient();
    const groups = new ChannelGroupSubscriptionsResource(client);
    await expect(
      groups.subscribe({
        session_id: 2047213140224270300,
        target_type: 'feed',
        target_id: 8169,
      })
    ).rejects.toBeInstanceOf(AlvaError);
    expect(client._request).not.toHaveBeenCalled();
  });
});

describe('AlertsResource', () => {
  it('list() delegates to subscriptions.list()', async () => {
    const client = makeClient();
    client.subscriptions.list = vi.fn().mockResolvedValue({ items: [] });
    const alerts = new AlertsResource(client);
    await alerts.list({ first: 20, cursor: 'c1' });
    expect(client.subscriptions.list).toHaveBeenCalledWith({
      first: 20,
      cursor: 'c1',
    });
  });

  it('follows() delegates to subscriptions.follows()', async () => {
    const client = makeClient();
    client.subscriptions.follows = vi
      .fn()
      .mockResolvedValue({ items: [], has_next: false });
    const alerts = new AlertsResource(client);
    await alerts.follows({ limit: 20, cursor: 'c1' });
    expect(client.subscriptions.follows).toHaveBeenCalledWith({
      limit: 20,
      cursor: 'c1',
    });
  });

  it('automation alert methods delegate to feed subscription methods', async () => {
    const client = makeClient();
    client.subscriptions.subscribeFeed = vi.fn().mockResolvedValue({});
    client.subscriptions.unsubscribeFeed = vi
      .fn()
      .mockResolvedValue({ ok: true });
    const alerts = new AlertsResource(client);

    await alerts.enableAutomation({
      username: 'alice',
      name: 'btc-ema',
      channelId: '7',
    });
    await alerts.disableAutomation({ username: 'alice', name: 'btc-ema' });

    expect(client.subscriptions.subscribeFeed).toHaveBeenCalledWith({
      username: 'alice',
      name: 'btc-ema',
      channelId: '7',
    });
    expect(client.subscriptions.unsubscribeFeed).toHaveBeenCalledWith({
      username: 'alice',
      name: 'btc-ema',
    });
  });

  it('enableBatch() delegates to subscriptions.subscribeBatch()', async () => {
    const client = makeClient();
    client.subscriptions.subscribeBatch = vi
      .fn()
      .mockResolvedValue({ subscriptions: [] });
    const alerts = new AlertsResource(client);
    await alerts.enableBatch({ feedIds: ['42'], channelId: '7' });
    expect(client.subscriptions.subscribeBatch).toHaveBeenCalledWith({
      feedIds: ['42'],
      channelId: '7',
    });
  });

  it('disableBatch() delegates to subscriptions.unsubscribeBatch()', async () => {
    const client = makeClient();
    client.subscriptions.unsubscribeBatch = vi
      .fn()
      .mockResolvedValue({ results: [], ok_count: 0 });
    const alerts = new AlertsResource(client);
    await alerts.disableBatch({ feedIds: ['42'] });
    expect(client.subscriptions.unsubscribeBatch).toHaveBeenCalledWith({
      feedIds: ['42'],
    });
  });

  it('historyAutomation delegates to feed notification history', async () => {
    const client = makeClient();
    client.notifications.listFeed = vi
      .fn()
      .mockResolvedValue({ items: [], next_cursor: '', feed_path: '~/f' });
    const alerts = new AlertsResource(client);

    await alerts.historyAutomation({ username: 'alice', name: 'btc-ema' });

    expect(client.notifications.listFeed).toHaveBeenCalledWith({
      username: 'alice',
      name: 'btc-ema',
    });
  });

  it('preference methods delegate to notification preferences', async () => {
    const client = makeClient();
    client.notificationPreferences.list = vi
      .fn()
      .mockResolvedValue({ settings: [] });
    client.notificationPreferences.update = vi.fn().mockResolvedValue({
      setting: { key: 'session_completed', enabled: false },
    });
    const alerts = new AlertsResource(client);

    await alerts.preferences();
    await alerts.updatePreference({ key: 'session_completed', enabled: false });

    expect(client.notificationPreferences.list).toHaveBeenCalled();
    expect(client.notificationPreferences.update).toHaveBeenCalledWith({
      key: 'session_completed',
      enabled: false,
    });
  });
});
