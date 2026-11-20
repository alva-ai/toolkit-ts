import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { RunResource } from '../../src/resources/run.js';
import { AlertsResource } from '../../src/resources/alerts.js';
import { ChannelGroupSubscriptionsResource } from '../../src/resources/channelGroupSubscriptions.js';
import { FunctionsResource } from '../../src/resources/functions.js';
import { CreditsResource } from '../../src/resources/credits.js';
import { AlvaClient } from '../../src/client.js';
import { AlvaError } from '../../src/error.js';
import { fakeV2, problem } from '../fakeV2.js';
import { allowance, creditEntry, PLAYBOOK, wallet } from '../billingV2.js';
import { page } from '../marketV2.js';
import {
  FUNCTION,
  functionInvocation,
  playbookFunction,
  run,
  RUNTIME_FIXTURES,
} from '../runtimeV2.js';

const REQUEST_ID = '123e4567-e89b-42d3-a456-426614174000';
import { aDelivery } from '../accountV2.js';

function makeClient(): AlvaClient & { _request: ReturnType<typeof vi.fn> } {
  const client = new AlvaClient({ apiKey: 'key' }) as AlvaClient & {
    _request: ReturnType<typeof vi.fn>;
  };
  client._request = vi.fn().mockResolvedValue({});
  return client;
}

describe('CreditsResource', () => {
  let fake: ReturnType<typeof fakeV2> | undefined;
  afterEach(() => fake?.restore());
  const credits = () => new CreditsResource(new AlvaClient({ apiKey: 'key' }));

  it('wallet() returns GET /api/v2/me/wallet as the API answers it', async () => {
    fake = fakeV2({ 'GET /me/wallet': () => wallet() });

    await expect(credits().wallet()).resolves.toEqual(wallet());
  });

  it('entries() sends the route query and returns the page unchanged', async () => {
    const entries = page([creditEntry()], 'page-2');
    fake = fakeV2({ 'GET /me/credit-entries': () => entries });

    await expect(
      credits().entries({
        from: '2026-06-23T00:00:00.000Z',
        to: '2026-06-24T00:00:00.000Z',
        sessionId: 'session_0a1',
        reason: ['CHAT', 'PLAYBOOK'],
        direction: 'DEBIT',
        pageSize: 10,
        pageToken: 'page-1',
      })
    ).resolves.toEqual(entries);
    expect(fake.calls[0].query.toString()).toBe(
      'from=2026-06-23T00%3A00%3A00.000Z&to=2026-06-24T00%3A00%3A00.000Z&sessionId=session_0a1&reason=CHAT&reason=PLAYBOOK&direction=DEBIT&pageSize=10&pageToken=page-1'
    );
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
  const RUN = run();
  let fake: ReturnType<typeof fakeV2>;
  beforeEach(() => {
    fake = fakeV2({ 'POST /runs': () => RUN });
  });
  afterEach(() => fake.restore());
  const runs = () => new RunResource(new AlvaClient({ apiKey: 'key' }));
  const sent = () => fake.calls[0]?.body;

  it('execute() sends the RunRequest and returns the Run unchanged', async () => {
    await expect(
      runs().execute({ entryPath: '~/s.js', maxHeapSizeMb: 512 })
    ).resolves.toEqual(RUN);
    expect(sent()).toEqual({ entryPath: '~/s.js', maxHeapSizeMb: 512 });
  });

  it('execute() returns a failed run that needs a higher plan as data', async () => {
    const failed = RUNTIME_FIXTURES[1][1];
    fake.restore();
    fake = fakeV2({ 'POST /runs': () => failed });
    await expect(runs().execute({ code: '1' })).resolves.toEqual(failed);
  });

  it('execute() sends the caller key on every attempt and the timeout per attempt', async () => {
    const c = new AlvaClient({ apiKey: 'key' });
    const request = vi.spyOn(c, '_v2Request').mockResolvedValue(RUN);
    await new RunResource(c).execute(
      { code: '1+1' },
      { idempotencyKey: REQUEST_ID, timeoutMs: 900000 }
    );
    expect(request).toHaveBeenCalledWith('POST', '/runs', {
      body: { code: '1+1' },
      idempotencyKey: REQUEST_ID,
      timeoutMs: 900000,
    });
    fake.restore();
    fake = fakeV2({
      'POST /runs': [() => problem(503, 'UNAVAILABLE'), () => RUN],
    });
    vi.useFakeTimers();
    try {
      const pending = runs().execute(
        { code: '1+1' },
        { idempotencyKey: REQUEST_ID }
      );
      await vi.runAllTimersAsync();
      await expect(pending).resolves.toEqual(RUN);
    } finally {
      vi.useRealTimers();
    }
    expect(fake.calls.map((c) => c.headers['Idempotency-Key'])).toEqual([
      `"${REQUEST_ID}"`,
      `"${REQUEST_ID}"`,
    ]);
  });

  it('execute() preserves serialized string IDs supplied by the CLI', async () => {
    await runs()._executeSerializedArgs(
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
      idempotencyKey: undefined,
      timeoutMs: undefined,
    });
  });

  it('execute() rejects malformed serialized args before sending', async () => {
    await expect(
      runs()._executeSerializedArgs({ code: '1+1' }, '{"broken":')
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
        runs().execute({
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
      runs()._executeSerializedArgs({ code: '1+1' }, args)
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
      await runs()._executeSerializedArgs({ code: '1+1' }, args);
      expect(fake.calls).toHaveLength(1);
    }
  );
});

describe('FunctionsResource', () => {
  let fake: ReturnType<typeof fakeV2> | undefined;
  afterEach(() => fake?.restore());
  const functions = () =>
    new FunctionsResource(new AlvaClient({ apiKey: 'key' }));

  it('register() posts the body to its Playbook and returns the function', async () => {
    const fn = playbookFunction({
      paramsSchema: '{"type":"object"}',
      runAsAccountId: 'account_0a1',
    });
    fake = fakeV2({ [`POST /playbooks/${PLAYBOOK}/functions`]: () => fn });
    const body = {
      name: 'quote',
      entryScriptPath: '~/fn/quote.js',
      paramsSchema: '{"type":"object"}',
      allowCharges: true,
      runAsAccountId: 'account_0a1',
    };

    await expect(functions().register(PLAYBOOK, body)).resolves.toEqual(fn);
    expect(fake.calls[0].body).toEqual(body);
  });

  it('list() returns one page of the Playbook functions, filtered by name', async () => {
    const functionsPage = page([playbookFunction()], 'p2');
    fake = fakeV2({
      [`GET /playbooks/${PLAYBOOK}/functions`]: () => functionsPage,
    });

    await expect(
      functions().list(PLAYBOOK, { name: 'quote', pageSize: 100 })
    ).resolves.toEqual(functionsPage);
    expect(fake.calls[0].query.toString()).toBe('name=quote&pageSize=100');
  });

  it('delete() and revokeAllowance() delete by ID', async () => {
    fake = fakeV2({
      [`DELETE /functions/${FUNCTION}`]: () => ({}),
      'DELETE /me/allowances/allowance_0a1': () => ({}),
    });

    await expect(functions().delete(FUNCTION)).resolves.toBeUndefined();
    await expect(
      functions().revokeAllowance('allowance_0a1')
    ).resolves.toBeUndefined();
    expect(fake.calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      `DELETE /functions/${FUNCTION}`,
      'DELETE /me/allowances/allowance_0a1',
    ]);
  });

  it('invoke() sends the parameters text and the caller key, and returns the invocation', async () => {
    fake = fakeV2({
      [`POST /functions/${FUNCTION}/invocations`]: () => functionInvocation(),
    });

    await expect(
      functions().invoke(
        FUNCTION,
        { parametersJson: '{"symbol":"BTC"}' },
        { idempotencyKey: REQUEST_ID }
      )
    ).resolves.toEqual(functionInvocation());
    expect(fake.calls[0].body).toEqual({ parametersJson: '{"symbol":"BTC"}' });
    expect(fake.calls[0].headers['Idempotency-Key']).toBe(`"${REQUEST_ID}"`);
  });

  it('getAllowance() returns the Playbook allowance, or null without one', async () => {
    fake = fakeV2({
      'GET /me/allowances': [() => page([allowance()]), () => page([])],
    });

    await expect(functions().getAllowance(PLAYBOOK)).resolves.toEqual(
      allowance()
    );
    await expect(functions().getAllowance(PLAYBOOK)).resolves.toBeNull();
    expect(fake.calls[0].query.toString()).toBe(`playbookId=${PLAYBOOK}`);
  });

  it('listAllowances() and createAllowance() use the allowance routes as is', async () => {
    fake = fakeV2({
      'GET /me/allowances': () => page([allowance()]),
      'POST /me/allowances': () => allowance(),
    });

    await expect(functions().listAllowances()).resolves.toEqual(
      page([allowance()])
    );
    await expect(
      functions().createAllowance({ playbookId: PLAYBOOK, credits: '100' })
    ).resolves.toEqual(allowance());
    expect(fake.calls[1].body).toEqual({
      playbookId: PLAYBOOK,
      credits: '100',
    });
  });

  it('surfaces a refused allowance write with its required permission', async () => {
    fake = fakeV2({
      'POST /me/allowances': () =>
        problem(403, 'INSUFFICIENT_PERMISSION', {
          requiredPermission: 'billing:write',
        }),
    });

    await expect(
      functions().createAllowance({ playbookId: PLAYBOOK, credits: '1' })
    ).rejects.toMatchObject({
      code: 'INSUFFICIENT_PERMISSION',
      requiredPermission: 'billing:write',
    });
  });
});

describe('NotificationsResource', () => {
  let restore: (() => void) | undefined;
  afterEach(() => restore?.());

  it('list() returns the NotificationDeliveryList page of an automation', async () => {
    const page = { items: [aDelivery()], nextPageToken: null };
    const fake = fakeV2({ 'GET /me/notification-deliveries': () => page });
    restore = fake.restore;
    const client = new AlvaClient({ apiKey: 'key' });
    expect(
      await client.notifications.list({
        automationId: 'automation_0abc',
        status: 'SENT',
        since: '2026-11-20T00:00:00Z',
      })
    ).toEqual(page);
    expect(Object.fromEntries(fake.calls[0].query)).toEqual({
      automationId: 'automation_0abc',
      status: 'SENT',
      since: '2026-11-20T00:00:00Z',
    });
  });

  it('client.v1.notifications.listFeed() reads /api/v1 by owner and name', async () => {
    const client = makeClient();
    await client.v1.notifications.listFeed({
      username: 'alice',
      name: 'btc-ema',
      since_time: 1700000000,
    });
    expect(client._request).toHaveBeenCalledWith(
      'GET',
      '/api/v1/feed/alice/btc-ema/notifications',
      { query: { since_time: '1700000000' } }
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

  it('history() delegates to notifications.list()', async () => {
    const client = makeClient();
    client.notifications.list = vi
      .fn()
      .mockResolvedValue({ items: [], nextPageToken: null });
    const alerts = new AlertsResource(client);
    const query = { automationId: 'automation_0abc' };

    await alerts.history(query);

    expect(client.notifications.list).toHaveBeenCalledWith(query);
  });

  it('preference methods delegate to notification preferences', async () => {
    const client = makeClient();
    client.notificationPreferences.get = vi
      .fn()
      .mockResolvedValue({ sessionCompleted: null });
    client.notificationPreferences.update = vi
      .fn()
      .mockResolvedValue({ sessionCompleted: false });
    const alerts = new AlertsResource(client);

    await alerts.preferences();
    await alerts.updatePreferences({ sessionCompleted: false });

    expect(client.notificationPreferences.get).toHaveBeenCalled();
    expect(client.notificationPreferences.update).toHaveBeenCalledWith({
      sessionCompleted: false,
    });
  });
});
