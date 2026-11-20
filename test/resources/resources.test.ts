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
import { creditEntry, wallet } from '../billingV2.js';
import { page } from '../marketV2.js';

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
  const FN = {
    id: 'playbook_function_0analyze',
    playbookId: 'playbook_0abc',
    name: 'analyze',
    entryScriptPath: '/alva/home/alice/playbooks/p/udf/analyze.js',
    paramsSchema: null,
    allowCharges: false,
    disabled: false,
    runAsAccountId: null,
    createdAt: '2026-06-05T00:00:00.000Z',
    updatedAt: '2026-06-06T00:00:00.000Z',
  };
  const ALLOWANCE = {
    id: 'allowance_0a',
    playbookId: 'playbook_0abc',
    amount: '25',
    used: '5',
    remaining: '20',
    createdAt: '2023-11-14T22:13:20.000Z',
    updatedAt: '2023-11-14T22:13:21.000Z',
  };
  const page = (items: unknown[], nextPageToken: string | null = null) => ({
    items,
    nextPageToken,
  });
  let fake: ReturnType<typeof fakeV2> | undefined;
  afterEach(() => fake?.restore());
  const functions = () =>
    new FunctionsResource(new AlvaClient({ apiKey: 'key' }));

  it('register() posts the function to its Playbook and rebuilds the v1 shape', async () => {
    fake = fakeV2({
      'POST /playbooks/playbook_0abc/functions': () => ({
        ...FN,
        paramsSchema: '{"type":"object"}',
        allowCharges: true,
        runAsAccountId: 'account_0sa',
      }),
    });

    const result = await functions().register({
      playbook_id: 'playbook_0abc',
      function_name: 'analyze',
      entry_script_path: FN.entryScriptPath,
      params_schema: '{"type":"object"}',
      allow_charges: true,
      run_as_user_id: 'account_0sa',
    });

    expect(fake.calls[0].body).toEqual({
      name: 'analyze',
      entryScriptPath: FN.entryScriptPath,
      paramsSchema: '{"type":"object"}',
      allowCharges: true,
      runAsAccountId: 'account_0sa',
    });
    expect(result).toEqual({
      function: {
        id: 'playbook_function_0analyze',
        playbook_id: 'playbook_0abc',
        function_name: 'analyze',
        entry_script_path: FN.entryScriptPath,
        created_at: '2026-06-05T00:00:00.000Z',
        updated_at: '2026-06-06T00:00:00.000Z',
        disabled: false,
        params_schema: '{"type":"object"}',
        allow_charges: true,
        run_as_user_id: 'account_0sa',
      },
    });
  });

  it('register() refuses the v1 "0" that cleared run_as before any request', async () => {
    fake = fakeV2({});
    await expect(
      functions().register({
        playbook_id: 'playbook_0abc',
        function_name: 'analyze',
        entry_script_path: FN.entryScriptPath,
        run_as_user_id: '0',
      })
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT', status: 400 });
    expect(fake.calls).toHaveLength(0);
  });

  it('list() reads every page of the Playbook functions', async () => {
    fake = fakeV2({
      'GET /playbooks/playbook_0abc/functions': [
        () => page([FN], 'p2'),
        () => page([{ ...FN, id: 'playbook_function_0b', name: 'b' }]),
      ],
    });

    const result = await functions().list({ playbook_id: 'playbook_0abc' });

    expect(
      result.functions.map((f) => [f.function_name, f.params_schema])
    ).toEqual([
      ['analyze', ''],
      ['b', ''],
    ]);
    expect(result.functions[0]).not.toHaveProperty('run_as_user_id');
    expect(fake.calls[1].query.get('pageToken')).toBe('p2');
  });

  it('delete() finds the function by name and deletes it by ID', async () => {
    fake = fakeV2({
      'GET /playbooks/playbook_0abc/functions': () => page([FN]),
      'DELETE /functions/playbook_function_0analyze': () => ({}),
    });

    await functions().delete({
      playbook_id: 'playbook_0abc',
      function_name: 'analyze',
    });

    expect(fake.calls[0].query.get('name')).toBe('analyze');
    expect(fake.calls.map((c) => c.method)).toEqual(['GET', 'DELETE']);
  });

  it('delete() reports a missing function as NOT_FOUND', async () => {
    fake = fakeV2({
      'GET /playbooks/playbook_0abc/functions': () => page([]),
    });

    await expect(
      functions().delete({ playbook_id: 'playbook_0abc', function_name: 'x' })
    ).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
    expect(fake.calls).toHaveLength(1);
  });

  it('invoke() looks the function up once, sends parametersJson and parses the result', async () => {
    const invocation = () => ({
      resultJson: '{"ok":true}',
      logs: 'log',
      creditsUsedTotal: '3',
      creditsChargedOwner: '1',
      creditsChargedConsumer: '2',
    });
    fake = fakeV2({
      'GET /playbooks/playbook_0abc/functions': () => page([FN]),
      'POST /functions/playbook_function_0analyze/invocations': [
        invocation,
        invocation,
      ],
    });
    const resource = functions();
    const params = {
      playbook_id: 'playbook_0abc',
      function_name: 'analyze',
      parameters: { ticker: 'AAPL' },
    };

    const result = await resource.invoke(params);
    await resource.invoke(params);

    expect(result).toEqual({
      result: { ok: true },
      logs: 'log',
      credits_used_total: 3,
      credits_charged_owner: 1,
      credits_charged_consumer: 2,
    });
    expect(fake.calls.map((c) => c.method)).toEqual(['GET', 'POST', 'POST']);
    expect(fake.calls[1].body).toEqual({ parametersJson: '{"ticker":"AAPL"}' });
  });

  const NEW_FN = { ...FN, id: 'playbook_function_0new' };
  const emptyInvocation = () => ({
    resultJson: 'null',
    logs: '',
    creditsUsedTotal: '0',
    creditsChargedOwner: '0',
    creditsChargedConsumer: '0',
  });
  const analyze = { playbook_id: 'playbook_0abc', function_name: 'analyze' };

  it('register() keeps the returned ID for the calls by name', async () => {
    fake = fakeV2({
      'POST /playbooks/playbook_0abc/functions': () => NEW_FN,
      'POST /functions/playbook_function_0new/invocations': emptyInvocation,
    });
    const resource = functions();

    await resource.register({
      ...analyze,
      entry_script_path: FN.entryScriptPath,
    });
    await resource.invoke(analyze);

    expect(fake.calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      'POST /playbooks/playbook_0abc/functions',
      'POST /functions/playbook_function_0new/invocations',
    ]);
  });

  it('delete() forgets the ID, so the next call looks the name up again', async () => {
    fake = fakeV2({
      'GET /playbooks/playbook_0abc/functions': [
        () => page([FN]),
        () => page([NEW_FN]),
      ],
      'DELETE /functions/playbook_function_0analyze': () => ({}),
      'POST /functions/playbook_function_0new/invocations': emptyInvocation,
    });
    const resource = functions();

    await resource.delete(analyze);
    await resource.invoke(analyze);

    expect(fake.calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      'GET /playbooks/playbook_0abc/functions',
      'DELETE /functions/playbook_function_0analyze',
      'GET /playbooks/playbook_0abc/functions',
      'POST /functions/playbook_function_0new/invocations',
    ]);
  });

  it('getAllowance() reads the allowance of one Playbook, or null', async () => {
    fake = fakeV2({
      'GET /me/allowances': [() => page([ALLOWANCE]), () => page([])],
    });
    const resource = functions();

    await expect(
      resource.getAllowance({ playbook_id: 'playbook_0abc' })
    ).resolves.toEqual({
      id: 'allowance_0a',
      playbook_id: 'playbook_0abc',
      amount: 25,
      used: 5,
      remaining: 20,
      created_at_ms: 1700000000000,
      updated_at_ms: 1700000001000,
    });
    await expect(
      resource.getAllowance({ playbook_id: 'playbook_0abc' })
    ).resolves.toBeNull();
    expect(fake.calls[0].query.get('playbookId')).toBe('playbook_0abc');
  });

  it('listAllowances() reads every page', async () => {
    fake = fakeV2({
      'GET /me/allowances': [
        () => page([ALLOWANCE], 'p2'),
        () => page([{ ...ALLOWANCE, id: 'allowance_0b' }]),
      ],
    });

    const result = await functions().listAllowances();

    expect(result.allowances.map((a) => a.id)).toEqual([
      'allowance_0a',
      'allowance_0b',
    ]);
  });

  it('createAllowance() sets the cap in whole credits', async () => {
    fake = fakeV2({ 'POST /me/allowances': () => ALLOWANCE });

    const result = await functions().createAllowance({
      playbook_id: 'playbook_0abc',
      amount: 25,
    });

    expect(fake.calls[0].body).toEqual({
      playbookId: 'playbook_0abc',
      credits: '25',
    });
    expect(result.allowance.remaining).toBe(20);
  });

  it('revokeAllowance() deletes the Playbook allowance by ID, and is done when there is none', async () => {
    fake = fakeV2({
      'GET /me/allowances': [() => page([ALLOWANCE]), () => page([])],
      'DELETE /me/allowances/allowance_0a': () => ({}),
    });
    const resource = functions();

    await expect(
      resource.revokeAllowance({ playbook_id: 'playbook_0abc' })
    ).resolves.toEqual({ ok: true });
    await expect(
      resource.revokeAllowance({ playbook_id: 'playbook_0abc' })
    ).resolves.toEqual({ ok: true });
    expect(fake.calls.map((c) => c.method)).toEqual(['GET', 'DELETE', 'GET']);
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
