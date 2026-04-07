import { describe, it, expect, vi } from 'vitest';
import { dispatch, handleConfigure } from '../src/cli/index.js';
import { AlvaClient } from '../src/client.js';

function makeClient(): AlvaClient {
  const client = new AlvaClient({ apiKey: 'test-key' });
  // Mock all resource methods
  client.user.me = vi.fn().mockResolvedValue({ id: 1, username: 'alice' });
  client.fs.read = vi.fn().mockResolvedValue({ data: 'hello' });
  client.fs.stat = vi.fn().mockResolvedValue({ name: 'f', size: 0 });
  client.fs.readdir = vi.fn().mockResolvedValue({ entries: [] });
  client.fs.write = vi.fn().mockResolvedValue({ bytes_written: 2 });
  client.fs.mkdir = vi.fn().mockResolvedValue(undefined);
  client.fs.remove = vi.fn().mockResolvedValue(undefined);
  client.fs.rename = vi.fn().mockResolvedValue(undefined);
  client.fs.copy = vi.fn().mockResolvedValue(undefined);
  client.fs.symlink = vi.fn().mockResolvedValue(undefined);
  client.fs.readlink = vi.fn().mockResolvedValue({ target: '/t' });
  client.fs.chmod = vi.fn().mockResolvedValue(undefined);
  client.fs.grant = vi.fn().mockResolvedValue(undefined);
  client.fs.revoke = vi.fn().mockResolvedValue(undefined);
  client.deploy.list = vi.fn().mockResolvedValue({ cronjobs: [] });
  client.deploy.create = vi.fn().mockResolvedValue({ id: 1 });
  client.deploy.get = vi.fn().mockResolvedValue({ id: 1 });
  client.deploy.update = vi.fn().mockResolvedValue({ id: 1 });
  client.deploy.delete = vi.fn().mockResolvedValue(undefined);
  client.deploy.pause = vi.fn().mockResolvedValue(undefined);
  client.deploy.resume = vi.fn().mockResolvedValue(undefined);
  client.secrets.create = vi.fn().mockResolvedValue(undefined);
  client.secrets.list = vi.fn().mockResolvedValue({ secrets: [] });
  client.secrets.get = vi.fn().mockResolvedValue({ name: 'K', value: 'V' });
  client.secrets.update = vi.fn().mockResolvedValue(undefined);
  client.secrets.delete = vi.fn().mockResolvedValue(undefined);
  client.run.execute = vi
    .fn()
    .mockResolvedValue({ result: '2', status: 'completed' });
  client.release.feed = vi.fn().mockResolvedValue({ feed_id: 1 });
  client.release.playbookDraft = vi.fn().mockResolvedValue({ playbook_id: 1 });
  client.release.playbook = vi.fn().mockResolvedValue({ playbook_id: 1 });
  client.sdk.doc = vi.fn().mockResolvedValue({ name: 'x', doc: '' });
  client.sdk.partitions = vi.fn().mockResolvedValue({ partitions: [] });
  client.sdk.partitionSummary = vi.fn().mockResolvedValue({ summary: '' });
  client.comments.create = vi.fn().mockResolvedValue({ id: 1 });
  client.comments.pin = vi.fn().mockResolvedValue({ id: 1 });
  client.comments.unpin = vi.fn().mockResolvedValue({ id: 1 });
  client.remix.save = vi.fn().mockResolvedValue(undefined);
  client.screenshot.capture = vi.fn().mockResolvedValue(new ArrayBuffer(8));
  return client;
}

describe('CLI dispatch', () => {
  it('dispatches user me', async () => {
    const client = makeClient();
    const result = await dispatch(client, ['user', 'me']);
    expect(client.user.me).toHaveBeenCalled();
    expect(result).toEqual({ id: 1, username: 'alice' });
  });

  it('dispatches fs read with --path', async () => {
    const client = makeClient();
    await dispatch(client, ['fs', 'read', '--path', '~/f']);
    expect(client.fs.read).toHaveBeenCalledWith(
      expect.objectContaining({ path: '~/f' })
    );
  });

  it('dispatches deploy list with --limit', async () => {
    const client = makeClient();
    await dispatch(client, ['deploy', 'list', '--limit', '5']);
    expect(client.deploy.list).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 5 })
    );
  });

  it('dispatches secrets create with --name and --value', async () => {
    const client = makeClient();
    await dispatch(client, [
      'secrets',
      'create',
      '--name',
      'K',
      '--value',
      'V',
    ]);
    expect(client.secrets.create).toHaveBeenCalledWith({
      name: 'K',
      value: 'V',
    });
  });

  it('dispatches run with --code', async () => {
    const client = makeClient();
    await dispatch(client, ['run', '--code', '1+1']);
    expect(client.run.execute).toHaveBeenCalledWith(
      expect.objectContaining({ code: '1+1' })
    );
  });

  it('dispatches release feed', async () => {
    const client = makeClient();
    await dispatch(client, [
      'release',
      'feed',
      '--name',
      'btc',
      '--version',
      '1.0',
      '--cronjob-id',
      '5',
    ]);
    expect(client.release.feed).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'btc', version: '1.0', cronjob_id: 5 })
    );
  });

  it('dispatches sdk partitions', async () => {
    const client = makeClient();
    await dispatch(client, ['sdk', 'partitions']);
    expect(client.sdk.partitions).toHaveBeenCalled();
  });

  it('dispatches sdk doc with --name', async () => {
    const client = makeClient();
    await dispatch(client, ['sdk', 'doc', '--name', 'ohlcv']);
    expect(client.sdk.doc).toHaveBeenCalledWith({ name: 'ohlcv' });
  });

  it('dispatches comments create', async () => {
    const client = makeClient();
    await dispatch(client, [
      'comments',
      'create',
      '--username',
      'alice',
      '--name',
      'pb',
      '--content',
      'Nice!',
    ]);
    expect(client.comments.create).toHaveBeenCalledWith(
      expect.objectContaining({
        username: 'alice',
        name: 'pb',
        content: 'Nice!',
      })
    );
  });

  it('dispatches remix', async () => {
    const client = makeClient();
    await dispatch(client, [
      'remix',
      '--child-username',
      'alice',
      '--child-name',
      'my-pb',
      '--parents',
      '[{"username":"bob","name":"src"}]',
    ]);
    expect(client.remix.save).toHaveBeenCalledWith({
      child: { username: 'alice', name: 'my-pb' },
      parents: [{ username: 'bob', name: 'src' }],
    });
  });

  it('dispatches deploy create with --no-push-notify', async () => {
    const client = makeClient();
    await dispatch(client, [
      'deploy',
      'create',
      '--name',
      'j',
      '--path',
      '~/j.js',
      '--cron',
      '* * * * *',
      '--no-push-notify',
    ]);
    expect(client.deploy.create).toHaveBeenCalledWith(
      expect.objectContaining({ push_notify: false })
    );
  });

  it('throws on unknown group', async () => {
    const client = makeClient();
    await expect(dispatch(client, ['unknown'])).rejects.toThrow(
      /Unknown command/
    );
  });

  it('throws on missing subcommand', async () => {
    const client = makeClient();
    await expect(dispatch(client, ['fs'])).rejects.toThrow(
      /Missing subcommand/
    );
  });

  it('throws on missing required flag', async () => {
    const client = makeClient();
    await expect(dispatch(client, ['fs', 'read'])).rejects.toThrow(
      /--path is required/
    );
  });

  it('throws on missing required flag for secrets', async () => {
    const client = makeClient();
    await expect(dispatch(client, ['secrets', 'create'])).rejects.toThrow(
      /--name is required/
    );
  });
});

describe('handleConfigure', () => {
  it('calls writeConfig with --api-key', async () => {
    const deps = {
      env: {} as Record<string, string | undefined>,
      homedir: () => '/home/test',
      mkdir: vi.fn().mockResolvedValue(undefined),
      writeFile: vi.fn().mockResolvedValue(undefined),
      readFile: vi.fn().mockRejectedValue(new Error('ENOENT')),
    };
    const result = await handleConfigure(
      ['configure', '--api-key', 'my-key'],
      deps
    );
    expect(result).toEqual(
      expect.objectContaining({ apiKey: 'my-key', status: 'configured' })
    );
    expect(deps.writeFile).toHaveBeenCalled();
  });

  it('calls writeConfig with --api-key and --base-url', async () => {
    const deps = {
      env: {} as Record<string, string | undefined>,
      homedir: () => '/home/test',
      mkdir: vi.fn().mockResolvedValue(undefined),
      writeFile: vi.fn().mockResolvedValue(undefined),
      readFile: vi.fn().mockRejectedValue(new Error('ENOENT')),
    };
    const result = await handleConfigure(
      ['configure', '--api-key', 'k', '--base-url', 'http://x'],
      deps
    );
    expect(result).toEqual(
      expect.objectContaining({
        apiKey: 'k',
        baseUrl: 'http://x',
        status: 'configured',
      })
    );
  });

  it('throws when --api-key is missing', async () => {
    const deps = {
      env: {} as Record<string, string | undefined>,
      homedir: () => '/home/test',
      mkdir: vi.fn(),
      writeFile: vi.fn(),
      readFile: vi.fn(),
    };
    await expect(handleConfigure(['configure'], deps)).rejects.toThrow(
      /--api-key is required/
    );
  });
});

describe('help text', () => {
  it('dispatch returns help object when no args', async () => {
    const client = makeClient();
    const result = (await dispatch(client, [])) as {
      _help: boolean;
      text: string;
    };
    expect(result._help).toBe(true);
    expect(result.text).toContain('Usage: alva');
  });

  it('dispatch returns help object for --help', async () => {
    const client = makeClient();
    const result = (await dispatch(client, ['--help'])) as {
      _help: boolean;
      text: string;
    };
    expect(result._help).toBe(true);
    expect(result.text).toContain('Usage: alva');
  });
});
