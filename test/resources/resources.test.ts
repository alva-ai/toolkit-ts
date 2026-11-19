import { describe, it, expect, vi } from 'vitest';
import { RunResource } from '../../src/resources/run.js';
import { AutomationResource } from '../../src/resources/automation.js';
import { AlertsResource } from '../../src/resources/alerts.js';
import { SubscriptionsResource } from '../../src/resources/subscriptions.js';
import { ChannelGroupSubscriptionsResource } from '../../src/resources/channelGroupSubscriptions.js';
import { NotificationsResource } from '../../src/resources/notifications.js';
import { FunctionsResource } from '../../src/resources/functions.js';
import { CreditsResource } from '../../src/resources/credits.js';
import { AlvaClient } from '../../src/client.js';
import { AlvaError } from '../../src/error.js';

function makeClient(): AlvaClient & { _request: ReturnType<typeof vi.fn> } {
  const client = new AlvaClient({ apiKey: 'key' }) as AlvaClient & {
    _request: ReturnType<typeof vi.fn>;
  };
  client._request = vi.fn().mockResolvedValue({});
  return client;
}

describe('CreditsResource', () => {
  it('wallet() sends a viewer-scoped POST /query request', async () => {
    const client = makeClient();
    client._request.mockResolvedValue({
      data: {
        viewer: {
          creditWallet: { balance: 100, totalRemaining: 100, todayUsed: 3 },
        },
      },
    });
    const credits = new CreditsResource(client);

    const result = await credits.wallet();

    expect(result).toEqual({ balance: 100, totalRemaining: 100, todayUsed: 3 });
    expect(client._request).toHaveBeenCalledWith('POST', '/query', {
      body: {
        query: expect.stringContaining('viewer'),
      },
    });
    const body = client._request.mock.calls[0][2]?.body as {
      query: string;
    };
    expect(body.query).toContain('creditWallet');
    expect(body.query).not.toContain('userId');
  });

  it('items() sends time-window, session, and pagination input to viewer.creditWallet.items', async () => {
    const client = makeClient();
    client._request.mockResolvedValue({
      data: {
        viewer: {
          creditWallet: {
            balance: 100,
            totalRemaining: 100,
            todayUsed: 3,
            items: {
              pageInfo: {
                hasNextPage: false,
                hasPreviousPage: false,
                startCursor: null,
                endCursor: null,
              },
              edges: [],
            },
          },
        },
      },
    });
    const credits = new CreditsResource(client);

    await credits.items({
      startAtMs: 1782172800000,
      endAtMs: 1782259200000,
      sessionId: '2069373335591239680',
      first: 10,
      after: 'cursor-1',
    });

    expect(client._request).toHaveBeenCalledWith('POST', '/query', {
      body: {
        query: expect.stringContaining('CreditWalletItemConnectionInput'),
        variables: {
          input: {
            startAtMs: 1782172800000,
            endAtMs: 1782259200000,
            sessionId: '2069373335591239680',
            first: 10,
            after: 'cursor-1',
          },
        },
      },
    });
    const body = client._request.mock.calls[0][2]?.body as {
      query: string;
    };
    expect(body.query).toContain('items(input: $input)');
    expect(body.query).not.toContain('userId');
  });

  it('surfaces GraphQL errors as AlvaError', async () => {
    const client = makeClient();
    client._request.mockResolvedValue({
      errors: [{ message: 'endAtMs must be greater than startAtMs' }],
    });
    const credits = new CreditsResource(client);

    await expect(credits.wallet()).rejects.toMatchObject({
      name: 'AlvaError',
      code: 'GRAPHQL_ERROR',
      message: 'endAtMs must be greater than startAtMs',
    });
  });
});

describe('RunResource', () => {
  it('execute() with code sends POST /api/v1/run', async () => {
    const client = makeClient();
    const run = new RunResource(client);
    await run.execute({ code: '1+1' });
    expect(client._request).toHaveBeenCalledWith('POST', '/api/v1/run', {
      body: {
        code: '1+1',
        entry_path: undefined,
        working_dir: undefined,
        args: undefined,
        max_heap_size_mb: undefined,
      },
      timeoutMs: undefined,
    });
  });

  it('execute() with entry_path sends POST /api/v1/run', async () => {
    const client = makeClient();
    const run = new RunResource(client);
    await run.execute({ entry_path: '~/s.js' });
    expect(client._request).toHaveBeenCalledWith('POST', '/api/v1/run', {
      body: {
        code: undefined,
        entry_path: '~/s.js',
        working_dir: undefined,
        args: undefined,
        max_heap_size_mb: undefined,
      },
      timeoutMs: undefined,
    });
  });

  it('execute() preserves serialized string IDs supplied by the CLI', async () => {
    const client = makeClient();
    const run = new RunResource(client);
    await run._executeSerializedArgs(
      { code: '1+1' },
      '{"channel_id":"2087608331744604161"}'
    );
    expect(client._request).toHaveBeenCalledWith('POST', '/api/v1/run', {
      jsonBody: '{"code":"1+1","args":{"channel_id":"2087608331744604161"}}',
      timeoutMs: undefined,
    });
  });

  it('execute() rejects malformed serialized args before sending', async () => {
    const client = makeClient();
    const run = new RunResource(client);
    await expect(
      run._executeSerializedArgs({ code: '1+1' }, '{"broken":')
    ).rejects.toThrow();
    expect(client._request).not.toHaveBeenCalled();
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
      const client = makeClient();
      const run = new RunResource(client);
      await expect(
        run.execute({
          code: '1+1',
          args: args as Record<string, unknown>,
        })
      ).rejects.toThrow();
      expect(client._request).not.toHaveBeenCalled();
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
    const client = makeClient();
    const run = new RunResource(client);
    await expect(
      run._executeSerializedArgs({ code: '1+1' }, args)
    ).rejects.toThrow();
    expect(client._request).not.toHaveBeenCalled();
  });

  it.each([
    '{"min":-9007199254740991,"max":9007199254740991}',
    '{"fraction":1000000000000000.1}',
    '{"smallScientific":9.007199254740991e15}',
    '{"normalizedScientific":0.00000000000000009e32}',
  ])(
    'execute() accepts serialized numbers within the safe range: %s',
    async (args) => {
      const client = makeClient();
      const run = new RunResource(client);
      await run._executeSerializedArgs({ code: '1+1' }, args);
      expect(client._request).toHaveBeenCalled();
    }
  );

  it('execute() forwards max_heap_size_mb when provided', async () => {
    const client = makeClient();
    const run = new RunResource(client);
    await run.execute({ code: '1+1', max_heap_size_mb: 512 });
    expect(client._request).toHaveBeenCalledWith('POST', '/api/v1/run', {
      body: {
        code: '1+1',
        entry_path: undefined,
        working_dir: undefined,
        args: undefined,
        max_heap_size_mb: 512,
      },
      timeoutMs: undefined,
    });
  });

  it('execute() forwards timeout_ms as client timeout only', async () => {
    const client = makeClient();
    const run = new RunResource(client);
    await run.execute({ code: '1+1', timeout_ms: 900000 });
    expect(client._request).toHaveBeenCalledWith('POST', '/api/v1/run', {
      body: {
        code: '1+1',
        entry_path: undefined,
        working_dir: undefined,
        args: undefined,
        max_heap_size_mb: undefined,
      },
      timeoutMs: 900000,
    });
  });
});

describe('AutomationResource', () => {
  it('list() delegates to feed.list()', async () => {
    const client = makeClient();
    client.feed.list = vi
      .fn()
      .mockResolvedValue({ feeds: [], has_more: false });
    const automation = new AutomationResource(client);
    await automation.list({ limit: 20, cursor: 'abc', status: 'all' });
    expect(client.feed.list).toHaveBeenCalledWith({
      limit: 20,
      cursor: 'abc',
      status: 'all',
    });
  });

  it('publish() delegates to release.feed()', async () => {
    const client = makeClient();
    client.release.feed = vi.fn().mockResolvedValue({ feed_id: 1 });
    const automation = new AutomationResource(client);
    await automation.publish({
      name: 'btc-ema',
      version: '1.0.0',
      cronjob_id: 42,
    });
    expect(client.release.feed).toHaveBeenCalledWith({
      name: 'btc-ema',
      version: '1.0.0',
      cronjob_id: 42,
    });
  });

  it('inspect() sends GET /api/v1/automation/:id', async () => {
    const client = makeClient();
    const automation = new AutomationResource(client);
    await automation.inspect({ id: 42 });
    expect(client._request).toHaveBeenCalledWith(
      'GET',
      '/api/v1/automation/42'
    );
  });

  it('preserves int64 automation ids on inspect', async () => {
    const client = makeClient();
    const automation = new AutomationResource(client);
    const id = '9007199254740993';

    await automation.inspect({ id });

    expect(client._request).toHaveBeenCalledWith(
      'GET',
      `/api/v1/automation/${id}`
    );
  });

  it('update() sends an ID-scoped PATCH and preserves explicit empty fields', async () => {
    const client = makeClient();
    const automation = new AutomationResource(client);
    await automation.update({
      id: '2077624515435917312',
      version: '1.0.1',
      description: '',
      trigger: true,
    });
    expect(client._request).toHaveBeenCalledWith(
      'PATCH',
      '/api/v1/automation/2077624515435917312',
      {
        body: {
          version: '1.0.1',
          cronjob_id: undefined,
          description: '',
          changelog: undefined,
          agent_type: undefined,
          trigger: true,
        },
      }
    );
  });

  it('lifecycle methods delegate to feed lifecycle methods', async () => {
    const client = makeClient();
    client.feed.stop = vi
      .fn()
      .mockResolvedValue({ id: '42', status: 'PAUSED' });
    client.feed.resume = vi
      .fn()
      .mockResolvedValue({ id: '42', status: 'ACTIVE' });
    client.feed.delete = vi.fn().mockResolvedValue({ id: '42' });
    const automation = new AutomationResource(client);

    await automation.stop({ id: 42 });
    await automation.resume({ id: 43 });
    await automation.delete({ id: 44 });

    expect(client.feed.stop).toHaveBeenCalledWith({ id: 42 });
    expect(client.feed.resume).toHaveBeenCalledWith({ id: 43 });
    expect(client.feed.delete).toHaveBeenCalledWith({ id: 44 });
  });

  it('inspect() rejects non-positive id without calling _request', async () => {
    const client = makeClient();
    const automation = new AutomationResource(client);

    await expect(automation.inspect({ id: 0 })).rejects.toThrow(
      'automation id must be a positive integer'
    );

    expect(client._request).not.toHaveBeenCalled();
  });

  it('update() rejects non-positive id and no-op requests', async () => {
    const client = makeClient();
    const automation = new AutomationResource(client);

    await expect(
      automation.update({ id: '0', description: 'x' })
    ).rejects.toThrow('automation id must be a positive integer string');
    await expect(automation.update({ id: '42' })).rejects.toThrow(
      'automation update requires at least one field or trigger=true'
    );
    expect(client._request).not.toHaveBeenCalled();
  });

  it('delivery.get() reads the viewer-scoped aggregate over GraphQL', async () => {
    const client = makeClient();
    client._request.mockResolvedValue({
      data: {
        automation: {
          alertDelivery: {
            isEnabled: true,
            alvaChannels: [{ id: '17' }],
            email: {
              isEnabled: true,
              isAvailable: true,
              address: 'alice@example.com',
            },
          },
        },
      },
    });
    const automation = new AutomationResource(client);

    const result = await automation.delivery.get({ id: '42' });

    expect(result.email.address).toBe('alice@example.com');
    expect(client._request).toHaveBeenCalledWith('POST', '/query', {
      body: {
        query: expect.stringContaining('ToolkitAutomationAlertDelivery'),
        variables: { automationId: '42' },
      },
    });
  });

  it('delivery.update() sends only explicitly provided destination fields', async () => {
    const client = makeClient();
    client._request.mockResolvedValue({
      data: {
        updateAutomationAlertDelivery: {
          automation: { id: '42' },
          alertDelivery: {
            isEnabled: true,
            email: { isEnabled: true, isAvailable: true, address: null },
          },
        },
      },
    });
    const automation = new AutomationResource(client);

    await automation.delivery.update({ id: '42', emailEnabled: true });

    expect(client._request).toHaveBeenCalledWith('POST', '/query', {
      body: {
        query: expect.stringContaining('@include(if: $includeAlvaChannels)'),
        variables: {
          input: { automationId: '42', emailEnabled: true },
          includeAlvaChannels: false,
          includeEmail: true,
        },
      },
    });
  });

  it('delivery.update() validates no-op and channel ids before I/O', async () => {
    const client = makeClient();
    const automation = new AutomationResource(client);

    await expect(automation.delivery.update({ id: '42' })).rejects.toThrow(
      'requires alvaChannelIds or emailEnabled'
    );
    await expect(
      automation.delivery.update({ id: '42', alvaChannelIds: ['topic'] })
    ).rejects.toThrow('Alva channel ids must be positive integer strings');
    expect(client._request).not.toHaveBeenCalled();
  });

  it('delivery.get() reports empty and malformed GraphQL responses', async () => {
    const client = makeClient();
    const automation = new AutomationResource(client);

    client._request.mockResolvedValueOnce(null);
    await expect(automation.delivery.get({ id: '42' })).rejects.toMatchObject({
      code: 'GRAPHQL_EMPTY_RESPONSE',
      message: 'GraphQL response was empty',
    });

    client._request.mockResolvedValueOnce({ errors: [null, {}] });
    await expect(automation.delivery.get({ id: '42' })).rejects.toMatchObject({
      code: 'GRAPHQL_ERROR',
      message: 'GraphQL request failed',
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

describe('SubscriptionsResource — agent surface (mono-meta#584 W3)', () => {
  it('followPlaybook() and unfollowPlaybook() use follow-only playbook routes', async () => {
    const client = makeClient();
    const subs = new SubscriptionsResource(client);
    await subs.followPlaybook({ username: 'alice', name: 'btc-dashboard' });
    await subs.unfollowPlaybook({ username: 'alice', name: 'btc-dashboard' });
    expect(client._request).toHaveBeenNthCalledWith(
      1,
      'POST',
      '/api/v1/follows/playbook/alice/btc-dashboard'
    );
    expect(client._request).toHaveBeenNthCalledWith(
      2,
      'DELETE',
      '/api/v1/follows/playbook/alice/btc-dashboard'
    );
  });

  it('follows() sends GET /api/v1/me/follows with pagination', async () => {
    const client = makeClient();
    const subs = new SubscriptionsResource(client);
    await subs.follows({ limit: 20, cursor: 'c1' });
    expect(client._request).toHaveBeenCalledWith('GET', '/api/v1/me/follows', {
      query: { limit: '20', cursor: 'c1' },
    });
  });

  it('subscribeFeed() posts an explicit channel id and preserves empty-body compatibility', async () => {
    const client = makeClient();
    const subs = new SubscriptionsResource(client);

    await subs.subscribeFeed({
      username: 'alice',
      name: 'btc-ema',
      channelId: '42',
    });
    await subs.subscribeFeed({ username: 'alice', name: 'btc-ema' });

    expect(client._request).toHaveBeenNthCalledWith(
      1,
      'POST',
      '/api/v1/subscriptions/feed/alice/btc-ema',
      { body: { channel_id: '42' } }
    );
    expect(client._request).toHaveBeenNthCalledWith(
      2,
      'POST',
      '/api/v1/subscriptions/feed/alice/btc-ema'
    );
  });

  it('subscribeBatch() posts feed ids and channel id', async () => {
    const client = makeClient();
    const subs = new SubscriptionsResource(client);
    await subs.subscribeBatch({ feedIds: ['13292'], channelId: '42' });
    expect(client._request).toHaveBeenCalledWith(
      'POST',
      '/api/v1/subscriptions/subscribe-batch',
      { body: { feed_ids: ['13292'], channel_id: '42' } }
    );
  });

  it('unsubscribeBatch() posts feed ids to unsubscribe-batch', async () => {
    const client = makeClient();
    const subs = new SubscriptionsResource(client);
    await subs.unsubscribeBatch({ feedIds: ['13292'] });
    expect(client._request).toHaveBeenCalledWith(
      'POST',
      '/api/v1/subscriptions/unsubscribe-batch',
      { body: { feed_ids: ['13292'] } }
    );
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
