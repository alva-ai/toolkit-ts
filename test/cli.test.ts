import { describe, it, expect, vi } from 'vitest';
import { dispatch, handleConfigure } from '../src/cli/index.js';
import { AlvaClient } from '../src/client.js';

function makeClient(): AlvaClient {
  const client = new AlvaClient({ apiKey: 'test-key' });
  // Mock all resource methods
  client.user.me = vi.fn().mockResolvedValue({ id: 1, username: 'alice' });
  client.fs.read = vi.fn().mockResolvedValue({ data: 'hello' });
  client.deploy.list = vi.fn().mockResolvedValue({ cronjobs: [] });
  client.secrets.create = vi.fn().mockResolvedValue(undefined);
  client.run.execute = vi
    .fn()
    .mockResolvedValue({ result: '2', status: 'completed' });
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
