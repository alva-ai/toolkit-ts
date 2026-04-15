import { describe, it, expect, vi } from 'vitest';
import {
  dispatch,
  handleConfigure,
  CLI_VERSION,
  isVersionOlderThan,
} from '../src/cli/index.js';
import { AlvaClient } from '../src/client.js';
import { CliUsageError } from '../src/error.js';

vi.mock('fs', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, readFileSync: vi.fn(actual.readFileSync as (...args: unknown[]) => unknown) };
});
import * as fs from 'fs';

function makeClient(): AlvaClient {
  const client = new AlvaClient({ apiKey: 'test-key' });
  // Mock all resource methods
  client.user.me = vi
    .fn()
    .mockResolvedValue({ id: 1, username: 'alice', subscription_tier: 'free' });
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
  client.deploy.listRuns = vi.fn().mockResolvedValue({ runs: [] });
  client.deploy.getRunLogs = vi.fn().mockResolvedValue({ logs: '' });
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
    expect(result).toEqual({
      id: 1,
      username: 'alice',
      subscription_tier: 'free',
    });
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

  it('dispatches deploy runs with --id', async () => {
    const client = makeClient();
    await dispatch(client, ['deploy', 'runs', '--id', '42']);
    expect(client.deploy.listRuns).toHaveBeenCalledWith(
      expect.objectContaining({ cronjob_id: 42 })
    );
  });

  it('dispatches deploy run-logs with --id and --run-id', async () => {
    const client = makeClient();
    await dispatch(client, [
      'deploy',
      'run-logs',
      '--id',
      '42',
      '--run-id',
      '7',
    ]);
    expect(client.deploy.getRunLogs).toHaveBeenCalledWith(
      expect.objectContaining({ cronjob_id: 42, run_id: 7 })
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

  it('dispatches run with --local-file', async () => {
    const mock = vi.mocked(fs.readFileSync).mockReturnValue('console.log("hello")');
    const client = makeClient();
    await dispatch(client, ['run', '--local-file', '/tmp/script.js']);
    expect(mock).toHaveBeenCalledWith('/tmp/script.js', 'utf-8');
    expect(client.run.execute).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'console.log("hello")' })
    );
    mock.mockReset();
  });

  it('dispatches run with --local-file and --args', async () => {
    const mock = vi.mocked(fs.readFileSync).mockReturnValue('require("env").args');
    const client = makeClient();
    await dispatch(client, [
      'run',
      '--local-file',
      '/tmp/script.js',
      '--args',
      '{"symbol":"BTC"}',
    ]);
    expect(mock).toHaveBeenCalledWith('/tmp/script.js', 'utf-8');
    expect(client.run.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'require("env").args',
        args: { symbol: 'BTC' },
      })
    );
    mock.mockReset();
  });

  it('throws CliUsageError when --code and --local-file are both provided', async () => {
    const client = makeClient();
    await expect(
      dispatch(client, [
        'run',
        '--code',
        '1+1',
        '--local-file',
        '/tmp/script.js',
      ])
    ).rejects.toSatisfy(
      (err: unknown) => err instanceof CliUsageError && err.command === 'run'
    );
  });

  it('throws CliUsageError when --local-file and --entry-path are both provided', async () => {
    const client = makeClient();
    await expect(
      dispatch(client, [
        'run',
        '--local-file',
        '/tmp/script.js',
        '--entry-path',
        '~/feeds/my-feed/v1/src/index.js',
      ])
    ).rejects.toSatisfy(
      (err: unknown) => err instanceof CliUsageError && err.command === 'run'
    );
  });

  it('throws CliUsageError when --code and --entry-path are both provided', async () => {
    const client = makeClient();
    await expect(
      dispatch(client, [
        'run',
        '--code',
        '1+1',
        '--entry-path',
        '~/feeds/my-feed/v1/src/index.js',
      ])
    ).rejects.toSatisfy(
      (err: unknown) => err instanceof CliUsageError && err.command === 'run'
    );
  });

  it('throws Error when --local-file points to non-existent file', async () => {
    const mock = vi.mocked(fs.readFileSync).mockImplementation(() => {
      const err = new Error(
        "ENOENT: no such file or directory, open '/tmp/nope.js'"
      );
      (err as NodeJS.ErrnoException).code = 'ENOENT';
      throw err;
    });
    const client = makeClient();
    await expect(
      dispatch(client, ['run', '--local-file', '/tmp/nope.js'])
    ).rejects.toThrow('ENOENT');
    mock.mockReset();
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

  it('throws on unknown group with help hint', async () => {
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

  it('throws CliUsageError with command="fs" when --path missing for fs read', async () => {
    const client = makeClient();
    await expect(dispatch(client, ['fs', 'read'])).rejects.toSatisfy(
      (err: unknown) => err instanceof CliUsageError && err.command === 'fs'
    );
  });

  it('throws CliUsageError with command="deploy" when --id is non-numeric for deploy get', async () => {
    const client = makeClient();
    await expect(
      dispatch(client, ['deploy', 'get', '--id', 'abc'])
    ).rejects.toSatisfy(
      (err: unknown) => err instanceof CliUsageError && err.command === 'deploy'
    );
  });

  it('throws CliUsageError with command="fs" for missing fs subcommand', async () => {
    const client = makeClient();
    await expect(dispatch(client, ['fs'])).rejects.toSatisfy(
      (err: unknown) => err instanceof CliUsageError && err.command === 'fs'
    );
  });

  it('throws CliUsageError with command="deploy" for missing deploy subcommand', async () => {
    const client = makeClient();
    await expect(dispatch(client, ['deploy'])).rejects.toSatisfy(
      (err: unknown) => err instanceof CliUsageError && err.command === 'deploy'
    );
  });

  it('throws CliUsageError with command="fs" for unknown fs subcommand', async () => {
    const client = makeClient();
    await expect(dispatch(client, ['fs', 'foo'])).rejects.toSatisfy(
      (err: unknown) => err instanceof CliUsageError && err.command === 'fs'
    );
  });

  it('throws CliUsageError with command=undefined for unknown top-level command', async () => {
    const client = makeClient();
    await expect(dispatch(client, ['foo'])).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof CliUsageError && err.command === undefined
    );
  });

  it('throws CliUsageError with command="secrets" for missing secrets subcommand', async () => {
    const client = makeClient();
    await expect(dispatch(client, ['secrets'])).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof CliUsageError && err.command === 'secrets'
    );
  });

  it('throws CliUsageError with command="trading" for missing trading subcommand', async () => {
    const client = makeClient();
    await expect(dispatch(client, ['trading'])).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof CliUsageError && err.command === 'trading'
    );
  });

  it('throws CliUsageError with command="auth" for unknown auth subcommand', async () => {
    const client = makeClient();
    await expect(dispatch(client, ['auth', 'foo'])).rejects.toSatisfy(
      (err: unknown) => err instanceof CliUsageError && err.command === 'auth'
    );
  });
});

describe('whoami', () => {
  it('dispatches whoami and returns user info with meta', async () => {
    const client = makeClient();
    const result = (await dispatch(client, ['whoami'], {
      profile: 'staging',
      baseUrl: 'http://staging',
    })) as Record<string, unknown>;
    expect(client.user.me).toHaveBeenCalled();
    expect(result.username).toBe('alice');
    expect(result.subscription_tier).toBe('free');
    expect(result._meta).toEqual({
      profile: 'staging',
      endpoint: 'http://staging',
    });
  });

  it('defaults meta profile to "default"', async () => {
    const client = makeClient();
    const result = (await dispatch(client, ['whoami'])) as Record<
      string,
      unknown
    >;
    expect((result._meta as Record<string, unknown>).profile).toBe('default');
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
      expect.objectContaining({
        apiKey: 'my-key',
        status: 'configured',
        profile: 'default',
      })
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
        profile: 'default',
      })
    );
  });

  it('calls writeConfig with --profile', async () => {
    const deps = {
      env: {} as Record<string, string | undefined>,
      homedir: () => '/home/test',
      mkdir: vi.fn().mockResolvedValue(undefined),
      writeFile: vi.fn().mockResolvedValue(undefined),
      readFile: vi.fn().mockRejectedValue(new Error('ENOENT')),
    };
    const result = await handleConfigure(
      [
        'configure',
        '--profile',
        'staging',
        '--api-key',
        'stg-key',
        '--base-url',
        'http://stg',
      ],
      deps
    );
    expect(result).toEqual(
      expect.objectContaining({
        apiKey: 'stg-key',
        baseUrl: 'http://stg',
        profile: 'staging',
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

  it('throws CliUsageError with command="configure" when --api-key is missing', async () => {
    const deps = {
      env: {} as Record<string, string | undefined>,
      homedir: () => '/home/test',
      mkdir: vi.fn(),
      writeFile: vi.fn(),
      readFile: vi.fn(),
    };
    await expect(handleConfigure(['configure'], deps)).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof CliUsageError && err.command === 'configure'
    );
  });
});

describe('auth help', () => {
  it('top-level help mentions auth', async () => {
    const client = makeClient();
    const result = (await dispatch(client, ['--help'])) as {
      _help: boolean;
      text: string;
    };
    expect(result.text).toContain('auth');
  });

  it('auth --help returns help text', async () => {
    const client = makeClient();
    const result = (await dispatch(client, ['auth', '--help'])) as {
      _help: boolean;
      text: string;
    };
    expect(result._help).toBe(true);
    expect(result.text).toContain('auth');
    expect(result.text).toContain('login');
  });

  it('auth login --help returns help text', async () => {
    const client = makeClient();
    const result = (await dispatch(client, ['auth', 'login', '--help'])) as {
      _help: boolean;
      text: string;
    };
    expect(result._help).toBe(true);
    expect(result.text).toContain('auth');
    expect(result.text).toContain('login');
  });

  it('auth without subcommand shows help', async () => {
    const client = makeClient();
    const result = (await dispatch(client, ['auth'])) as {
      _help: boolean;
      text: string;
    };
    expect(result._help).toBe(true);
    expect(result.text).toContain('auth');
    expect(result.text).toContain('login');
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

  it('top-level help mentions --profile and whoami', async () => {
    const client = makeClient();
    const result = (await dispatch(client, ['--help'])) as {
      _help: boolean;
      text: string;
    };
    expect(result.text).toContain('--profile');
    expect(result.text).toContain('whoami');
  });

  it('returns per-command help for fs --help', async () => {
    const client = makeClient();
    const result = (await dispatch(client, ['fs', '--help'])) as {
      _help: boolean;
      text: string;
    };
    expect(result._help).toBe(true);
    expect(result.text).toContain('alva fs');
    expect(result.text).toContain('read');
    expect(result.text).toContain('write');
    expect(result.text).toContain('--path');
    expect(result.text).toContain('@last');
    expect(result.text).toContain('special:user:*');
  });

  it('returns per-command help for deploy --help', async () => {
    const client = makeClient();
    const result = (await dispatch(client, ['deploy', '--help'])) as {
      _help: boolean;
      text: string;
    };
    expect(result._help).toBe(true);
    expect(result.text).toContain('create');
    expect(result.text).toContain('--cron');
    expect(result.text).toContain('--push-notify');
    expect(result.text).toContain('Recommended cron schedules');
  });

  it('returns per-command help for secrets --help', async () => {
    const client = makeClient();
    const result = (await dispatch(client, ['secrets', '--help'])) as {
      _help: boolean;
      text: string;
    };
    expect(result._help).toBe(true);
    expect(result.text).toContain('--name');
    expect(result.text).toContain('--value');
    expect(result.text).toContain('secret-manager');
  });

  it('returns per-command help for run --help', async () => {
    const client = makeClient();
    const result = (await dispatch(client, ['run', '--help'])) as {
      _help: boolean;
      text: string;
    };
    expect(result._help).toBe(true);
    expect(result.text).toContain('--code');
    expect(result.text).toContain('--entry-path');
    expect(result.text).toContain('--local-file');
    expect(result.text).toContain('require(');
  });

  it('returns per-command help for remix --help', async () => {
    const client = makeClient();
    const result = (await dispatch(client, ['remix', '--help'])) as {
      _help: boolean;
      text: string;
    };
    expect(result._help).toBe(true);
    expect(result.text).toContain('--child-username');
    expect(result.text).toContain('--parents');
  });

  it('returns per-command help for screenshot --help', async () => {
    const client = makeClient();
    const result = (await dispatch(client, ['screenshot', '--help'])) as {
      _help: boolean;
      text: string;
    };
    expect(result._help).toBe(true);
    expect(result.text).toContain('--url');
    expect(result.text).toContain('--out');
  });

  it('returns per-command help for configure --help', async () => {
    const client = makeClient();
    const result = (await dispatch(client, ['configure', '--help'])) as {
      _help: boolean;
      text: string;
    };
    expect(result._help).toBe(true);
    expect(result.text).toContain('--profile');
    expect(result.text).toContain('profiles');
  });

  it('returns per-command help for whoami --help', async () => {
    const client = makeClient();
    const result = (await dispatch(client, ['whoami', '--help'])) as {
      _help: boolean;
      text: string;
    };
    expect(result._help).toBe(true);
    expect(result.text).toContain('whoami');
  });

  it('returns per-command help for sdk --help with partition names', async () => {
    const client = makeClient();
    const result = (await dispatch(client, ['sdk', '--help'])) as {
      _help: boolean;
      text: string;
    };
    expect(result.text).toContain('spot_market_price_and_volume');
    expect(result.text).toContain('equity_fundamentals');
  });

  it('returns per-command help for release --help with workflow', async () => {
    const client = makeClient();
    const result = (await dispatch(client, ['release', '--help'])) as {
      _help: boolean;
      text: string;
    };
    expect(result.text).toContain('playbook-draft');
    expect(result.text).toContain('--trading-symbols');
    expect(result.text).toContain('Display name');
  });
});

describe('CLI_VERSION', () => {
  it('falls back to dev when __VERSION__ is not defined at build time', () => {
    expect(CLI_VERSION).toBe('dev');
  });
});

describe('isVersionOlderThan', () => {
  it('returns true when a < b', () => {
    expect(isVersionOlderThan('0.1.0', '0.1.2')).toBe(true);
  });

  it('returns false when equal', () => {
    expect(isVersionOlderThan('0.1.2', '0.1.2')).toBe(false);
  });

  it('returns false when a > b (minor)', () => {
    expect(isVersionOlderThan('0.2.0', '0.1.2')).toBe(false);
  });

  it('returns false when a > b (major)', () => {
    expect(isVersionOlderThan('1.0.0', '0.9.9')).toBe(false);
  });

  it('returns false for malformed first arg', () => {
    expect(isVersionOlderThan('bad', '0.1.0')).toBe(false);
  });

  it('returns false for malformed second arg', () => {
    expect(isVersionOlderThan('0.1.0', 'bad')).toBe(false);
  });

  it('handles two-part versions (missing patch)', () => {
    expect(isVersionOlderThan('0.1', '0.1.1')).toBe(true);
  });

  it('returns false for empty strings', () => {
    expect(isVersionOlderThan('', '0.1.0')).toBe(false);
  });
});

describe('whoami version check', () => {
  it('sets _warning when CLI is older than min version', async () => {
    const client = makeClient();
    client.user.me = vi.fn().mockResolvedValue({
      id: 1,
      username: 'alice',
      subscription_tier: 'free',
      toolkit_min_version: '99.0.0',
    });
    const result = (await dispatch(client, ['whoami'], {
      cliVersion: '0.1.2',
    })) as Record<string, unknown>;
    expect(result._warning).toBeDefined();
    expect(result._warning as string).toContain('upgrade');
  });

  it('no _warning when CLI version >= min version', async () => {
    const client = makeClient();
    client.user.me = vi.fn().mockResolvedValue({
      id: 1,
      username: 'alice',
      subscription_tier: 'free',
      toolkit_min_version: '0.1.0',
    });
    const result = (await dispatch(client, ['whoami'], {
      cliVersion: '0.1.2',
    })) as Record<string, unknown>;
    expect(result._warning).toBeUndefined();
  });

  it('no _warning when server omits toolkit_min_version', async () => {
    const client = makeClient();
    client.user.me = vi.fn().mockResolvedValue({
      id: 1,
      username: 'alice',
      subscription_tier: 'free',
    });
    const result = (await dispatch(client, ['whoami'], {
      cliVersion: '0.1.2',
    })) as Record<string, unknown>;
    expect(result._warning).toBeUndefined();
  });

  it('no _warning when server returns malformed version', async () => {
    const client = makeClient();
    client.user.me = vi.fn().mockResolvedValue({
      id: 1,
      username: 'alice',
      subscription_tier: 'free',
      toolkit_min_version: 'bad',
    });
    const result = (await dispatch(client, ['whoami'], {
      cliVersion: '0.1.2',
    })) as Record<string, unknown>;
    expect(result._warning).toBeUndefined();
  });
});
