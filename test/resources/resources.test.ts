import { describe, it, expect, vi } from 'vitest';
import { UserResource } from '../../src/resources/user.js';
import { RunResource } from '../../src/resources/run.js';
import { ReleaseResource } from '../../src/resources/release.js';
import { FeedResource } from '../../src/resources/feed.js';
import { PlaybooksResource } from '../../src/resources/playbooks.js';
import { SubscriptionsResource } from '../../src/resources/subscriptions.js';
import { SdkDocsResource } from '../../src/resources/sdkDocs.js';
import { CommentsResource } from '../../src/resources/comments.js';
import { RemixResource } from '../../src/resources/remix.js';
import { ScreenshotResource } from '../../src/resources/screenshot.js';
import { ChannelGroupSubscriptionsResource } from '../../src/resources/channelGroupSubscriptions.js';
import { NotificationsResource } from '../../src/resources/notifications.js';
import { NotificationPreferencesResource } from '../../src/resources/notificationPreferences.js';
import { PlaybookSkillsResource } from '../../src/resources/playbookSkills.js';
import { FunctionsResource } from '../../src/resources/functions.js';
import { AlvaClient } from '../../src/client.js';
import { AlvaError } from '../../src/error.js';

function makeClient(): AlvaClient & { _request: ReturnType<typeof vi.fn> } {
  const client = new AlvaClient({ apiKey: 'key' }) as AlvaClient & {
    _request: ReturnType<typeof vi.fn>;
  };
  client._request = vi.fn().mockResolvedValue({});
  return client;
}

describe('UserResource', () => {
  it('me() sends GET /api/v1/me', async () => {
    const client = makeClient();
    const user = new UserResource(client);
    await user.me();
    expect(client._request).toHaveBeenCalledWith('GET', '/api/v1/me');
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

describe('ReleaseResource', () => {
  it('feed() sends POST /api/v1/release/feed', async () => {
    const client = makeClient();
    const release = new ReleaseResource(client);
    await release.feed({
      name: 'btc-ema',
      version: '1.0.0',
      cronjob_id: 123,
    });
    expect(client._request).toHaveBeenCalledWith(
      'POST',
      '/api/v1/release/feed',
      {
        body: {
          name: 'btc-ema',
          version: '1.0.0',
          cronjob_id: 123,
          view_json: undefined,
          description: undefined,
        },
      }
    );
  });

  it('playbookDraft() sends POST /api/v1/draft/playbook', async () => {
    const client = makeClient();
    const release = new ReleaseResource(client);
    await release.playbookDraft({
      name: 'btc-dashboard',
      display_name: 'BTC Dashboard',
      feeds: [{ feed_id: 1 }],
    });
    expect(client._request).toHaveBeenCalledWith(
      'POST',
      '/api/v1/draft/playbook',
      {
        body: {
          name: 'btc-dashboard',
          display_name: 'BTC Dashboard',
          description: undefined,
          feeds: [{ feed_id: 1 }],
          trading_symbols: undefined,
          skill_id: undefined,
        },
      }
    );
  });

  it('playbookDraft() forwards skill_id when provided', async () => {
    const client = makeClient();
    const release = new ReleaseResource(client);
    await release.playbookDraft({
      name: 'btc-dashboard',
      display_name: 'BTC Dashboard',
      feeds: [{ feed_id: 1 }],
      skill_id: 'alva/screener',
    });
    expect(client._request).toHaveBeenCalledWith(
      'POST',
      '/api/v1/draft/playbook',
      {
        body: {
          name: 'btc-dashboard',
          display_name: 'BTC Dashboard',
          description: undefined,
          feeds: [{ feed_id: 1 }],
          trading_symbols: undefined,
          skill_id: 'alva/screener',
        },
      }
    );
  });

  it('playbook() sends POST /api/v1/release/playbook', async () => {
    const client = makeClient();
    const release = new ReleaseResource(client);
    await release.playbook({
      name: 'btc-dashboard',
      version: 'v1.0.0',
      feeds: [{ feed_id: 1 }],
      changelog: 'Initial release',
      readme_url: '/alva/home/alice/playbooks/btc-dashboard/README.md',
    });
    expect(client._request).toHaveBeenCalledWith(
      'POST',
      '/api/v1/release/playbook',
      {
        body: {
          name: 'btc-dashboard',
          version: 'v1.0.0',
          feeds: [{ feed_id: 1 }],
          changelog: 'Initial release',
          readme_url: '/alva/home/alice/playbooks/btc-dashboard/README.md',
        },
      }
    );
  });
});

describe('FeedResource', () => {
  it('stop() sends POST /api/v1/feed/:id/stop', async () => {
    const client = makeClient();
    const feed = new FeedResource(client);
    await feed.stop({ id: 42 });
    expect(client._request).toHaveBeenCalledWith(
      'POST',
      '/api/v1/feed/42/stop'
    );
  });

  it('resume() sends POST /api/v1/feed/:id/resume', async () => {
    const client = makeClient();
    const feed = new FeedResource(client);
    await feed.resume({ id: 42 });
    expect(client._request).toHaveBeenCalledWith(
      'POST',
      '/api/v1/feed/42/resume'
    );
  });

  it('delete() sends DELETE /api/v1/feed/:id', async () => {
    const client = makeClient();
    const feed = new FeedResource(client);
    await feed.delete({ id: 42 });
    expect(client._request).toHaveBeenCalledWith('DELETE', '/api/v1/feed/42');
  });

  it('feed lifecycle methods reject non-positive id without calling _request', async () => {
    const client = makeClient();
    const feed = new FeedResource(client);
    for (const action of [feed.stop, feed.resume, feed.delete]) {
      await expect(action.call(feed, { id: 0 })).rejects.toThrow(
        'feed id must be a positive integer'
      );
      await expect(action.call(feed, { id: -1 })).rejects.toThrow(
        'feed id must be a positive integer'
      );
      await expect(action.call(feed, { id: 1.5 })).rejects.toThrow(
        'feed id must be a positive integer'
      );
    }
    expect(client._request).not.toHaveBeenCalled();
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

describe('PlaybooksResource', () => {
  it('trending() sends query params and returns slim agent-friendly items', async () => {
    const client = makeClient();
    client._request.mockResolvedValue({
      playbooks: [
        {
          id: '42',
          name: 'scanner',
          display_name: 'Scanner',
          description: 'Finds setups',
          creator: { name: 'alice' },
          tags: ['macro', 'ai'],
          visibility: 'public',
          follow_count: 7,
          price_cents: 0,
          currency: 'usd',
          pricing_mode: 'ONE_TIME',
          readme: '/alva/home/alice/playbooks/scanner/README.md',
          cursor: 'cur42',
          trading_symbols: ['BTC'],
          uv: 100,
          pv: 200,
        },
      ],
      has_next: true,
    });
    const playbooks = new PlaybooksResource(client);

    const result = await playbooks.trending({
      keyword: 'scanner',
      tags: ['macro', 'ai'],
      sort: 'RECENT',
      limit: 5,
      cursor: 'abc',
    });

    expect(client._request).toHaveBeenCalledWith(
      'GET',
      '/api/v1/playbooks/trending',
      {
        query: {
          keyword: 'scanner',
          tags: 'macro,ai',
          sort: 'RECENT',
          limit: 5,
          cursor: 'abc',
        },
      }
    );
    expect(result).toEqual({
      playbooks: [
        {
          id: '42',
          ref: 'alice/scanner',
          username: 'alice',
          name: 'scanner',
          display_name: 'Scanner',
          description: 'Finds setups',
          tags: ['macro', 'ai'],
          follow_count: 7,
          url_path: '/alice/playbooks/scanner',
          readme: '/alva/home/alice/playbooks/scanner/README.md',
          cursor: 'cur42',
        },
      ],
      has_next: true,
    });
  });

  it('setVisibility() POSTs to the playbook visibility endpoint', async () => {
    const client = makeClient();
    client._request.mockResolvedValue({ playbook_path: 'alice/scanner' });
    const playbooks = new PlaybooksResource(client);

    const result = await playbooks.setVisibility({
      name: 'scanner',
      visibility: 'private',
    });

    expect(client._request).toHaveBeenCalledWith(
      'POST',
      '/api/v1/playbook/scanner/visibility',
      { body: { visibility: 'private' } }
    );
    expect(result).toEqual({ playbook_path: 'alice/scanner' });
  });

  it('setVisibility() url-encodes the playbook name', async () => {
    const client = makeClient();
    const playbooks = new PlaybooksResource(client);

    await playbooks.setVisibility({ name: 'a/b c', visibility: 'public' });

    expect(client._request).toHaveBeenCalledWith(
      'POST',
      '/api/v1/playbook/a%2Fb%20c/visibility',
      { body: { visibility: 'public' } }
    );
  });

  it('setVisibility() rejects an invalid visibility before any request', async () => {
    const client = makeClient();
    const playbooks = new PlaybooksResource(client);

    await expect(
      playbooks.setVisibility({
        name: 'scanner',
        // @ts-expect-error testing runtime guard against bad input
        visibility: 'secret',
      })
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    expect(client._request).not.toHaveBeenCalled();
  });
});

describe('SdkDocsResource', () => {
  it('doc() sends GET /api/v1/sdk/doc with name', async () => {
    const client = makeClient();
    const sdk = new SdkDocsResource(client);
    await sdk.doc({ name: '@arrays/crypto/ohlcv:v1.0.0' });
    expect(client._request).toHaveBeenCalledWith('GET', '/api/v1/sdk/doc', {
      query: { name: '@arrays/crypto/ohlcv:v1.0.0' },
    });
  });

  it('partitions() sends GET /api/v1/sdk/partitions', async () => {
    const client = makeClient();
    const sdk = new SdkDocsResource(client);
    await sdk.partitions();
    expect(client._request).toHaveBeenCalledWith(
      'GET',
      '/api/v1/sdk/partitions'
    );
  });

  it('partitionSummary() sends GET with encoded partition', async () => {
    const client = makeClient();
    const sdk = new SdkDocsResource(client);
    await sdk.partitionSummary({ partition: 'spot_market_price_and_volume' });
    expect(client._request).toHaveBeenCalledWith(
      'GET',
      '/api/v1/sdk/partitions/spot_market_price_and_volume/summary'
    );
  });
});

describe('PlaybookSkillsResource', () => {
  it('list() requests skill summaries with filters and preserves metadata fields', async () => {
    const client = makeClient();
    client._request.mockResolvedValue({
      success: true,
      data: [
        {
          username: 'alva',
          name: 'ai-digest',
          display_name: 'AI Digest',
          description: 'Summarize market news',
          disabled: false,
          header: 'Digest',
          suggest_prompt: 'Make a daily digest',
          playbook_ids: '1,2',
          order: 3,
          tags: ['research'],
          creator_uid: 0,
          updated_at: '2026-06-01T00:00:00Z',
        },
      ],
    });
    const skills = new PlaybookSkillsResource(client);

    const result = await skills.list({ tag: 'research', username: 'alva' });

    expect(client._request).toHaveBeenCalledWith('GET', '/api/v1/skills', {
      query: { tag: 'research', username: 'alva' },
    });
    expect(result.skills).toEqual([
      {
        username: 'alva',
        name: 'ai-digest',
        display_name: 'AI Digest',
        description: 'Summarize market news',
        tags: ['research'],
        creator_uid: 0,
        updated_at: '2026-06-01T00:00:00Z',
      },
    ]);
  });
});

describe('CommentsResource', () => {
  it('create() sends POST /api/v1/playbook/comment', async () => {
    const client = makeClient();
    const comments = new CommentsResource(client);
    await comments.create({
      username: 'alice',
      name: 'btc-dashboard',
      content: 'Great!',
    });
    expect(client._request).toHaveBeenCalledWith(
      'POST',
      '/api/v1/playbook/comment',
      {
        body: {
          username: 'alice',
          name: 'btc-dashboard',
          content: 'Great!',
          parent_id: undefined,
        },
      }
    );
  });

  it('pin() sends POST /api/v1/playbook/comment/pin', async () => {
    const client = makeClient();
    const comments = new CommentsResource(client);
    await comments.pin({ comment_id: 1 });
    expect(client._request).toHaveBeenCalledWith(
      'POST',
      '/api/v1/playbook/comment/pin',
      { body: { comment_id: 1 } }
    );
  });

  it('unpin() sends POST /api/v1/playbook/comment/unpin', async () => {
    const client = makeClient();
    const comments = new CommentsResource(client);
    await comments.unpin({ comment_id: 1 });
    expect(client._request).toHaveBeenCalledWith(
      'POST',
      '/api/v1/playbook/comment/unpin',
      { body: { comment_id: 1 } }
    );
  });
});

describe('NotificationsResource', () => {
  it('listPlaybook() sends GET /api/v1/playbook/:username/:name/notifications', async () => {
    const client = makeClient();
    const notifications = new NotificationsResource(client);
    await notifications.listPlaybook({
      username: 'alice',
      name: 'btc-dashboard',
      channel: 'telegram',
      status: 'sent',
      since_time: 1777355703,
      first: 5,
      cursor: 'abc',
    });
    expect(client._request).toHaveBeenCalledWith(
      'GET',
      '/api/v1/playbook/alice/btc-dashboard/notifications',
      {
        query: {
          channel: 'telegram',
          status: 'sent',
          since_time: '1777355703',
          first: '5',
          cursor: 'abc',
        },
      }
    );
  });

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

describe('NotificationPreferencesResource', () => {
  it('list() sends GET /api/v1/me/notifications/preferences', async () => {
    const client = makeClient();
    const preferences = new NotificationPreferencesResource(client);
    await preferences.list();
    expect(client._request).toHaveBeenCalledWith(
      'GET',
      '/api/v1/me/notifications/preferences'
    );
  });

  it('update() sends PATCH /api/v1/me/notifications/preferences/:key', async () => {
    const client = makeClient();
    const preferences = new NotificationPreferencesResource(client);
    await preferences.update({ key: 'session_completed', enabled: false });
    expect(client._request).toHaveBeenCalledWith(
      'PATCH',
      '/api/v1/me/notifications/preferences/session_completed',
      {
        body: { enabled: false },
      }
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
      target_type: 'playbook',
      target_id: '42',
    });
    expect(client._request).toHaveBeenCalledWith(
      'DELETE',
      '/api/v1/channel/group-subscriptions',
      {
        jsonBody:
          '{"session_id":2047213140224270336,"target_type":"playbook","target_id":42}',
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

describe('RemixResource', () => {
  it('save() sends POST /api/v1/remix', async () => {
    const client = makeClient();
    const remix = new RemixResource(client);
    await remix.save({
      child: { username: 'alice', name: 'my-playbook' },
      parents: [{ username: 'bob', name: 'src-playbook' }],
    });
    expect(client._request).toHaveBeenCalledWith('POST', '/api/v1/remix', {
      body: {
        child: { username: 'alice', name: 'my-playbook' },
        parents: [{ username: 'bob', name: 'src-playbook' }],
      },
    });
  });
});

describe('ScreenshotResource', () => {
  it('capture() sends GET /api/v1/screenshot with params', async () => {
    const client = makeClient();
    const screenshot = new ScreenshotResource(client);
    await screenshot.capture({ url: '/playbook/alice/btc-dashboard' });
    expect(client._request).toHaveBeenCalledWith('GET', '/api/v1/screenshot', {
      query: {
        url: '/playbook/alice/btc-dashboard',
        selector: undefined,
        xpath: undefined,
        compress: undefined,
        compress_quality: undefined,
        compress_max_width: undefined,
      },
    });
  });

  it('capture() forwards compress params using gateway snake_case keys', async () => {
    const client = makeClient();
    const screenshot = new ScreenshotResource(client);
    await screenshot.capture({
      url: '/playbook/alice/btc-dashboard',
      compress: true,
      compressQuality: 70,
      compressMaxWidth: 1280,
    });
    expect(client._request).toHaveBeenCalledWith('GET', '/api/v1/screenshot', {
      query: {
        url: '/playbook/alice/btc-dashboard',
        selector: undefined,
        xpath: undefined,
        compress: true,
        compress_quality: 70,
        compress_max_width: 1280,
      },
    });
  });
});

describe('SubscriptionsResource — agent surface (mono-meta#584 W3)', () => {
  it('follows() sends GET /api/v1/me/follows with pagination', async () => {
    const client = makeClient();
    const subs = new SubscriptionsResource(client);
    await subs.follows({ limit: 20, cursor: 'c1' });
    expect(client._request).toHaveBeenCalledWith('GET', '/api/v1/me/follows', {
      query: { limit: '20', cursor: 'c1' },
    });
  });

  it('unsubscribeBatch() posts string ids to unsubscribe-batch', async () => {
    const client = makeClient();
    const subs = new SubscriptionsResource(client);
    await subs.unsubscribeBatch({
      playbookIds: ['8009'],
      feedIds: ['13292'],
    });
    expect(client._request).toHaveBeenCalledWith(
      'POST',
      '/api/v1/subscriptions/unsubscribe-batch',
      { body: { playbook_ids: ['8009'], feed_ids: ['13292'] } }
    );
  });
});

describe('PlaybooksResource — discovery (mono-meta#584 W3)', () => {
  it('getByIds() sends GET /api/v1/playbooks?ids=', async () => {
    const client = makeClient();
    client._request = vi.fn().mockResolvedValue({ items: [] });
    const playbooks = new PlaybooksResource(client);
    await playbooks.getByIds(['1', '2']);
    expect(client._request).toHaveBeenCalledWith('GET', '/api/v1/playbooks', {
      query: { ids: '1,2' },
    });
  });

  it('listByOwner() sends GET /api/v1/playbooks?owner=', async () => {
    const client = makeClient();
    client._request = vi.fn().mockResolvedValue({ items: [], has_next: false });
    const playbooks = new PlaybooksResource(client);
    await playbooks.listByOwner({ owner: 'alice', limit: 10 });
    expect(client._request).toHaveBeenCalledWith('GET', '/api/v1/playbooks', {
      query: { owner: 'alice', limit: '10' },
    });
  });

  it('get({ref}) paginates the owner list until the name matches', async () => {
    const client = makeClient();
    client._request = vi
      .fn()
      .mockResolvedValueOnce({
        items: [{ id: '1', name: 'other', owner_username: 'alice' }],
        has_next: true,
        next_cursor: 'c1',
      })
      .mockResolvedValueOnce({
        items: [{ id: '2', name: 'macro', owner_username: 'alice' }],
        has_next: false,
      });
    const playbooks = new PlaybooksResource(client);
    const hit = await playbooks.get({ ref: 'alice/macro' });
    expect(hit?.id).toBe('2');
    expect(client._request).toHaveBeenCalledTimes(2);
  });

  it('get({ref}) returns null when exhausted without a match', async () => {
    const client = makeClient();
    client._request = vi.fn().mockResolvedValue({ items: [], has_next: false });
    const playbooks = new PlaybooksResource(client);
    expect(await playbooks.get({ ref: 'alice/nope' })).toBeNull();
  });
});
