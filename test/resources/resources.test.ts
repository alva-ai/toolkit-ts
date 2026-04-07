import { describe, it, expect, vi } from 'vitest';
import { UserResource } from '../../src/resources/user.js';
import { RunResource } from '../../src/resources/run.js';
import { ReleaseResource } from '../../src/resources/release.js';
import { SdkDocsResource } from '../../src/resources/sdkDocs.js';
import { CommentsResource } from '../../src/resources/comments.js';
import { RemixResource } from '../../src/resources/remix.js';
import { ScreenshotResource } from '../../src/resources/screenshot.js';
import { AlvaClient } from '../../src/client.js';

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
      },
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
      },
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
        },
      }
    );
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
      },
    });
  });
});
