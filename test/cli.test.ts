import { describe, it, expect, vi } from 'vitest';
import {
  dispatch,
  handleConfigure,
  CLI_VERSION,
  isVersionOlderThan,
  stripGlobalFlags,
} from '../src/cli/index.js';
import { AlvaClient } from '../src/client.js';
import { CliUsageError } from '../src/error.js';

vi.mock('fs', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    readFileSync: vi.fn(actual.readFileSync as (...args: unknown[]) => unknown),
  };
});
import * as fs from 'fs';

function makeClient(): AlvaClient {
  const client = new AlvaClient({ apiKey: 'test-key' });
  // Mock all resource methods
  client.user.me = vi.fn().mockResolvedValue({
    id: '9007199254740993',
    username: 'alice',
    subscription_tier: 'free',
  });
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
  client.deploy.trigger = vi
    .fn()
    .mockResolvedValue({ workflow_run_id: 'wf-test' });
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
  client.feed.stop = vi.fn().mockResolvedValue({ id: '42', status: 'PAUSED' });
  client.feed.resume = vi
    .fn()
    .mockResolvedValue({ id: '42', status: 'ACTIVE' });
  client.feed.delete = vi.fn().mockResolvedValue({ id: '42' });
  client.playbooks.trending = vi
    .fn()
    .mockResolvedValue({ playbooks: [], has_next: false });
  client.playbooks.getByIds = vi.fn().mockResolvedValue({ items: [] });
  client.playbooks.get = vi.fn().mockResolvedValue(null);
  client.playbooks.listByOwner = vi
    .fn()
    .mockResolvedValue({ items: [], has_next: false });
  client.subscriptions.follows = vi
    .fn()
    .mockResolvedValue({ items: [], has_next: false });
  client.subscriptions.unsubscribeBatch = vi
    .fn()
    .mockResolvedValue({ results: [], ok_count: 0 });
  client.release.playbookDraft = vi.fn().mockResolvedValue({ playbook_id: 1 });
  client.release.playbook = vi.fn().mockResolvedValue({ playbook_id: 1 });
  client.sdk.doc = vi.fn().mockResolvedValue({ name: 'x', doc: '' });
  client.sdk.partitions = vi.fn().mockResolvedValue({ partitions: [] });
  client.sdk.partitionSummary = vi.fn().mockResolvedValue({ summary: '' });
  client.dataSkills.list = vi.fn().mockResolvedValue({ skills: [] });
  client.dataSkills.summary = vi
    .fn()
    .mockResolvedValue({ name: 'x', description: '', content: '' });
  client.dataSkills.endpoint = vi
    .fn()
    .mockResolvedValue({ name: 'x', description: '', content: '' });
  client.playbookSkills.list = vi.fn().mockResolvedValue({ skills: [] });
  client.playbookSkills.tags = vi.fn().mockResolvedValue({ tags: [] });
  client.playbookSkills.get = vi.fn().mockResolvedValue({
    username: 'alva',
    name: 'ai-digest',
    display_name: 'AI Digest',
    description: '',
    tags: [],
    creator_uid: 1,
    updated_at: '',
    files: [],
  });
  client.playbookSkills.file = vi.fn().mockResolvedValue({
    username: 'alva',
    name: 'ai-digest',
    path: 'README.md',
    content: '',
    updated_at: '',
  });
  client.arraysJwt.status = vi.fn().mockResolvedValue({
    exists: true,
    expires_at: 1800000000,
    renewal_needed: false,
    tier: 'SUBSCRIPTION_TIER_PRO',
  });
  client.comments.create = vi.fn().mockResolvedValue({ id: 1 });
  client.comments.pin = vi.fn().mockResolvedValue({ id: 1 });
  client.comments.unpin = vi.fn().mockResolvedValue({ id: 1 });
  client.notifications.listPlaybook = vi
    .fn()
    .mockResolvedValue({ items: [], next_cursor: '', playbook_path: '~/p' });
  client.notifications.listFeed = vi
    .fn()
    .mockResolvedValue({ items: [], next_cursor: '', feed_path: '~/f' });
  client.notificationPreferences.list = vi
    .fn()
    .mockResolvedValue({ settings: [] });
  client.notificationPreferences.update = vi.fn().mockResolvedValue({
    setting: { key: 'session_completed', enabled: false },
  });
  client.feedback.submit = vi.fn().mockResolvedValue({
    feedback_id: 123,
    notion_page_id: 'page-123',
    notion_url: 'https://notion.so/page-123',
  });
  client.channelGroupSubscriptions.context = vi
    .fn()
    .mockResolvedValue({ subscriptions: [] });
  client.channelGroupSubscriptions.list = vi
    .fn()
    .mockResolvedValue({ subscriptions: [] });
  client.channelGroupSubscriptions.subscribe = vi
    .fn()
    .mockResolvedValue({ ok: true, subscriptions: [] });
  client.channelGroupSubscriptions.unsubscribe = vi
    .fn()
    .mockResolvedValue({ ok: true, subscriptions: [] });
  client.remix.save = vi.fn().mockResolvedValue(undefined);
  client.screenshot.capture = vi.fn().mockResolvedValue(new ArrayBuffer(8));
  client.functions.register = vi.fn().mockResolvedValue({
    function: { function_name: 'analyze', playbook_id: 123 },
  });
  client.functions.list = vi.fn().mockResolvedValue({ functions: [] });
  client.functions.delete = vi.fn().mockResolvedValue(undefined);
  client.functions.invoke = vi.fn().mockResolvedValue({
    result: { ok: true },
    logs: '',
    credits_used_total: 0,
    credits_charged_owner: 0,
    credits_charged_consumer: 0,
  });
  client.functions.getAllowance = vi.fn().mockResolvedValue({
    id: '1',
    consumer_uid: '42',
    playbook_id: '123',
    amount: 25,
    used: 0,
    remaining: 25,
    created_at_ms: 1700000000000,
    updated_at_ms: 1700000000000,
  });
  client.functions.listAllowances = vi
    .fn()
    .mockResolvedValue({ allowances: [] });
  client.functions.createAllowance = vi.fn().mockResolvedValue({
    allowance: {
      id: '1',
      consumer_uid: '42',
      playbook_id: '123',
      amount: 25,
      used: 0,
      remaining: 25,
      created_at_ms: 1700000000000,
      updated_at_ms: 1700000000000,
    },
  });
  client.functions.revokeAllowance = vi.fn().mockResolvedValue({ ok: true });
  return client;
}

describe('CLI dispatch', () => {
  it('dispatches user me', async () => {
    const client = makeClient();
    const result = await dispatch(client, ['user', 'me']);
    expect(client.user.me).toHaveBeenCalled();
    expect(result).toEqual({
      id: '9007199254740993',
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

  it('dispatches deploy trigger with --id and returns workflow_run_id', async () => {
    const client = makeClient();
    const result = await dispatch(client, ['deploy', 'trigger', '--id', '42']);
    expect(client.deploy.trigger).toHaveBeenCalledWith({ id: 42 });
    expect(result).toEqual({ workflow_run_id: 'wf-test' });
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
    const mock = vi
      .mocked(fs.readFileSync)
      .mockReturnValue('console.log("hello")');
    const client = makeClient();
    await dispatch(client, ['run', '--local-file', '/tmp/script.js']);
    expect(mock).toHaveBeenCalledWith('/tmp/script.js', 'utf-8');
    expect(client.run.execute).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'console.log("hello")' })
    );
    mock.mockReset();
  });

  it('dispatches run with --local-file and --args', async () => {
    const mock = vi
      .mocked(fs.readFileSync)
      .mockReturnValue('require("env").args');
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

  it('dispatches run with --max-heap-size-mb', async () => {
    const client = makeClient();
    await dispatch(client, [
      'run',
      '--code',
      '1+1',
      '--max-heap-size-mb',
      '512',
    ]);
    expect(client.run.execute).toHaveBeenCalledWith(
      expect.objectContaining({ code: '1+1', max_heap_size_mb: 512 })
    );
  });

  it('omits max_heap_size_mb when --max-heap-size-mb is not provided', async () => {
    const client = makeClient();
    await dispatch(client, ['run', '--code', '1+1']);
    expect(client.run.execute).toHaveBeenCalledWith(
      expect.objectContaining({ max_heap_size_mb: undefined })
    );
  });

  it('throws CliUsageError when --max-heap-size-mb is below range', async () => {
    const client = makeClient();
    await expect(
      dispatch(client, ['run', '--code', '1+1', '--max-heap-size-mb', '0'])
    ).rejects.toSatisfy(
      (err: unknown) => err instanceof CliUsageError && err.command === 'run'
    );
  });

  it('throws CliUsageError when --max-heap-size-mb is above range', async () => {
    const client = makeClient();
    await expect(
      dispatch(client, ['run', '--code', '1+1', '--max-heap-size-mb', '2049'])
    ).rejects.toSatisfy(
      (err: unknown) => err instanceof CliUsageError && err.command === 'run'
    );
  });

  it('throws CliUsageError when --max-heap-size-mb is non-integer', async () => {
    const client = makeClient();
    await expect(
      dispatch(client, ['run', '--code', '1+1', '--max-heap-size-mb', '1.5'])
    ).rejects.toSatisfy(
      (err: unknown) => err instanceof CliUsageError && err.command === 'run'
    );
  });

  it('run --help documents --max-heap-size-mb', async () => {
    const client = makeClient();
    const result = (await dispatch(client, ['run', '--help'])) as {
      _help: boolean;
      text: string;
    };
    expect(result.text).toContain('--max-heap-size-mb');
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

  it('dispatches feed delete', async () => {
    const client = makeClient();
    await dispatch(client, ['feed', 'delete', '--id', '42']);
    expect(client.feed.delete).toHaveBeenCalledWith({ id: 42 });
  });

  it('dispatches feed stop', async () => {
    const client = makeClient();
    await dispatch(client, ['feed', 'stop', '--id', '42']);
    expect(client.feed.stop).toHaveBeenCalledWith({ id: 42 });
  });

  it('dispatches feed resume', async () => {
    const client = makeClient();
    await dispatch(client, ['feed', 'resume', '--id', '42']);
    expect(client.feed.resume).toHaveBeenCalledWith({ id: 42 });
  });

  it('feed stop requires --id', async () => {
    const client = makeClient();
    await expect(dispatch(client, ['feed', 'stop'])).rejects.toThrow(
      "--id is required for 'feed stop'"
    );
  });

  it('feed resume requires --id', async () => {
    const client = makeClient();
    await expect(dispatch(client, ['feed', 'resume'])).rejects.toThrow(
      "--id is required for 'feed resume'"
    );
  });

  it('feed delete requires --id', async () => {
    const client = makeClient();
    await expect(dispatch(client, ['feed', 'delete'])).rejects.toThrow(
      "--id is required for 'feed delete'"
    );
  });

  it('feed delete rejects non-numeric --id', async () => {
    const client = makeClient();
    await expect(
      dispatch(client, ['feed', 'delete', '--id', 'abc'])
    ).rejects.toThrow("--id must be a number for 'feed delete', got 'abc'");
  });

  it('dispatches playbooks trending with agent-friendly filters', async () => {
    const client = makeClient();
    await dispatch(client, [
      'playbooks',
      'trending',
      '--keyword',
      'scanner',
      '--tags',
      'macro,ai',
      '--sort',
      'recent',
      '--limit',
      '5',
      '--cursor',
      'abc',
    ]);
    expect(client.playbooks.trending).toHaveBeenCalledWith({
      keyword: 'scanner',
      tags: ['macro', 'ai'],
      sort: 'RECENT',
      limit: 5,
      cursor: 'abc',
      current: undefined,
    });
  });

  it('dispatches functions register with inline params schema', async () => {
    const client = makeClient();
    await dispatch(client, [
      'functions',
      'register',
      '--playbook-id',
      '123',
      '--function-name',
      'analyze',
      '--entry-script-path',
      '/alva/home/alice/playbooks/my-playbook/udf/analyze.js',
      '--params-schema',
      '{"type":"object"}',
      '--no-allow-charges',
    ]);
    expect(client.functions.register).toHaveBeenCalledWith({
      playbook_id: 123,
      function_name: 'analyze',
      entry_script_path:
        '/alva/home/alice/playbooks/my-playbook/udf/analyze.js',
      params_schema: '{"type":"object"}',
      allow_charges: false,
    });
  });

  it('dispatches functions register with params schema file', async () => {
    const mock = vi
      .mocked(fs.readFileSync)
      .mockReturnValue('{"type":"object"}');
    const client = makeClient();
    await dispatch(client, [
      'functions',
      'register',
      '--playbook-id',
      '123',
      '--function-name',
      'analyze',
      '--entry-script-path',
      '/alva/home/alice/playbooks/my-playbook/udf/analyze.js',
      '--params-schema-file',
      '/tmp/schema.json',
      '--allow-charges',
    ]);
    expect(mock).toHaveBeenCalledWith('/tmp/schema.json', 'utf-8');
    expect(client.functions.register).toHaveBeenCalledWith(
      expect.objectContaining({
        params_schema: '{"type":"object"}',
        allow_charges: true,
      })
    );
    mock.mockReset();
  });

  it('functions register rejects both schema flags', async () => {
    const client = makeClient();
    await expect(
      dispatch(client, [
        'functions',
        'register',
        '--playbook-id',
        '123',
        '--function-name',
        'analyze',
        '--entry-script-path',
        '/alva/home/alice/playbooks/my-playbook/udf/analyze.js',
        '--params-schema',
        '{"type":"object"}',
        '--params-schema-file',
        '/tmp/schema.json',
      ])
    ).rejects.toThrow(
      '--params-schema and --params-schema-file are mutually exclusive'
    );
  });

  it('dispatches functions list', async () => {
    const client = makeClient();
    await dispatch(client, ['functions', 'list', '--playbook-id', '123']);
    expect(client.functions.list).toHaveBeenCalledWith({ playbook_id: 123 });
  });

  it('dispatches functions delete', async () => {
    const client = makeClient();
    await dispatch(client, [
      'functions',
      'delete',
      '--playbook-id',
      '123',
      '--function-name',
      'analyze',
    ]);
    expect(client.functions.delete).toHaveBeenCalledWith({
      playbook_id: 123,
      function_name: 'analyze',
    });
  });

  it('dispatches functions invoke with params JSON', async () => {
    const client = makeClient();
    await dispatch(client, [
      'functions',
      'invoke',
      '--playbook-id',
      '123',
      '--function-name',
      'analyze',
      '--params',
      '{"ticker":"AAPL"}',
    ]);
    expect(client.functions.invoke).toHaveBeenCalledWith({
      playbook_id: 123,
      function_name: 'analyze',
      parameters: { ticker: 'AAPL' },
    });
  });

  it('functions invoke rejects invalid params JSON', async () => {
    const client = makeClient();
    await expect(
      dispatch(client, [
        'functions',
        'invoke',
        '--playbook-id',
        '123',
        '--function-name',
        'analyze',
        '--params',
        '{nope}',
      ])
    ).rejects.toThrow("--params must be valid JSON for 'functions invoke'");
  });

  it('dispatches functions allowance get', async () => {
    const client = makeClient();
    await dispatch(client, [
      'functions',
      'allowance',
      'get',
      '--playbook-id',
      '123',
    ]);
    expect(client.functions.getAllowance).toHaveBeenCalledWith({
      playbook_id: 123,
    });
  });

  it('dispatches functions allowance list', async () => {
    const client = makeClient();
    await dispatch(client, ['functions', 'allowance', 'list']);
    expect(client.functions.listAllowances).toHaveBeenCalled();
  });

  it('dispatches functions allowance create', async () => {
    const client = makeClient();
    await dispatch(client, [
      'functions',
      'allowance',
      'create',
      '--playbook-id',
      '123',
      '--amount',
      '25',
    ]);
    expect(client.functions.createAllowance).toHaveBeenCalledWith({
      playbook_id: 123,
      amount: 25,
    });
  });

  it('functions allowance create rejects non-positive amount', async () => {
    const client = makeClient();
    await expect(
      dispatch(client, [
        'functions',
        'allowance',
        'create',
        '--playbook-id',
        '123',
        '--amount',
        '0',
      ])
    ).rejects.toThrow(
      "--amount must be a positive integer for 'functions allowance create'"
    );
  });

  it('dispatches functions allowance revoke', async () => {
    const client = makeClient();
    await dispatch(client, [
      'functions',
      'allowance',
      'revoke',
      '--playbook-id',
      '123',
    ]);
    expect(client.functions.revokeAllowance).toHaveBeenCalledWith({
      playbook_id: 123,
    });
  });

  it('functions --help documents register and allowance', async () => {
    const client = makeClient();
    const result = (await dispatch(client, ['functions', '--help'])) as {
      _help: boolean;
      text: string;
    };
    expect(result.text).toContain('functions register');
    expect(result.text).toContain('functions allowance create');
    expect(result.text).toContain('--entry-script-path');
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

  it('dispatches release playbook-draft', async () => {
    const client = makeClient();
    await dispatch(client, [
      'release',
      'playbook-draft',
      '--name',
      'btc-dashboard',
      '--display-name',
      'BTC Trend Dashboard',
      '--feeds',
      '[{"feed_id":100}]',
    ]);
    expect(client.release.playbookDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'btc-dashboard',
        display_name: 'BTC Trend Dashboard',
        feeds: [{ feed_id: 100 }],
      })
    );
  });

  it('dispatches release playbook-draft with --skill-id', async () => {
    const client = makeClient();
    await dispatch(client, [
      'release',
      'playbook-draft',
      '--name',
      'btc-dashboard',
      '--display-name',
      'BTC Trend Dashboard',
      '--feeds',
      '[{"feed_id":100}]',
      '--skill-id',
      'alva/screener',
    ]);
    expect(client.release.playbookDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'btc-dashboard',
        skill_id: 'alva/screener',
      })
    );
  });

  it('release playbook (publish) still requires --changelog', async () => {
    const client = makeClient();
    await expect(
      dispatch(client, [
        'release',
        'playbook',
        '--name',
        'btc-dashboard',
        '--version',
        'v1.0.0',
        '--feeds',
        '[{"feed_id":100}]',
      ])
    ).rejects.toThrow(/changelog/);
  });

  it('release playbook (publish) requires --readme-url', async () => {
    const client = makeClient();
    await expect(
      dispatch(client, [
        'release',
        'playbook',
        '--name',
        'btc-dashboard',
        '--version',
        'v1.0.0',
        '--feeds',
        '[{"feed_id":100}]',
        '--changelog',
        'Initial release',
      ])
    ).rejects.toThrow(/readme-url/);
  });

  it('dispatches release playbook with --readme-url', async () => {
    const client = makeClient();
    // The release-playbook code path now hard-gates on the design linter,
    // which (a) reads ~/playbooks/<name>/index.html via ALFS and
    // (b) fetches the active design contract from the CDN. Stub both so
    // the test stays hermetic.
    client.fs.read = vi
      .fn()
      .mockResolvedValue(
        '<html><head><style>body{font-family:Delight}</style></head>' +
          '<body><div class="playbook-container"><p>ok</p></div></body></html>'
      );
    const TEST_CONTRACT_YAML = `
version: 1
global:
  required-container: { selector: ".playbook-container", must-exist: true }
  scroll: { sole-scroll-container: ["body"] }
  typography: { font-family-root-must-include: "Delight", font-weight-allowed: [400, 500] }
  links: { anchor-required-attrs: ["target", "rel"] }
components: {}
`;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(TEST_CONTRACT_YAML),
    } as unknown as Response);
    await dispatch(client, [
      'release',
      'playbook',
      '--name',
      'btc-dashboard',
      '--version',
      'v1.0.0',
      '--feeds',
      '[{"feed_id":100}]',
      '--changelog',
      'Initial release',
      '--readme-url',
      '/alva/home/alice/playbooks/btc-dashboard/README.md',
    ]);
    expect(client.release.playbook).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'btc-dashboard',
        version: 'v1.0.0',
        feeds: [{ feed_id: 100 }],
        changelog: 'Initial release',
        readme_url: '/alva/home/alice/playbooks/btc-dashboard/README.md',
      })
    );
    expect(client.fs.read).toHaveBeenCalledWith({
      path: '~/playbooks/btc-dashboard/index.html',
    });
    fetchSpy.mockRestore();
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

  it('dispatches notification-history list-playbook', async () => {
    const client = makeClient();
    await dispatch(client, [
      'notification-history',
      'list-playbook',
      '--username',
      'alice',
      '--name',
      'btc-dashboard',
      '--channel',
      'telegram',
      '--status',
      'sent',
      '--since',
      '1777355703',
      '--first',
      '5',
      '--cursor',
      'abc',
    ]);
    expect(client.notifications.listPlaybook).toHaveBeenCalledWith({
      username: 'alice',
      name: 'btc-dashboard',
      channel: 'telegram',
      status: 'sent',
      since_time: 1777355703,
      first: 5,
      cursor: 'abc',
    });
  });

  it('dispatches notification-history list-feed', async () => {
    const client = makeClient();
    await dispatch(client, [
      'notification-history',
      'list-feed',
      '--username',
      'alice',
      '--name',
      'btc-ema',
    ]);
    expect(client.notifications.listFeed).toHaveBeenCalledWith({
      username: 'alice',
      name: 'btc-ema',
      channel: undefined,
      status: undefined,
      since_time: undefined,
      first: undefined,
      cursor: undefined,
    });
  });

  it('dispatches notification-preferences list', async () => {
    const client = makeClient();
    await dispatch(client, ['notification-preferences', 'list']);
    expect(client.notificationPreferences.list).toHaveBeenCalled();
  });

  it('dispatches notification-preferences disable-session-completed', async () => {
    const client = makeClient();
    await dispatch(client, [
      'notification-preferences',
      'disable-session-completed',
    ]);
    expect(client.notificationPreferences.update).toHaveBeenCalledWith({
      key: 'session_completed',
      enabled: false,
    });
  });

  it('dispatches notification-preferences enable-session-completed', async () => {
    const client = makeClient();
    await dispatch(client, [
      'notification-preferences',
      'enable-session-completed',
    ]);
    expect(client.notificationPreferences.update).toHaveBeenCalledWith({
      key: 'session_completed',
      enabled: true,
    });
  });

  it('dispatches feedback submit', async () => {
    const client = makeClient();
    const result = await dispatch(client, [
      'feedback',
      'submit',
      '--summary',
      'runtime failed',
      '--details',
      'command returned a platform error',
      '--category',
      'runtime',
      '--severity',
      'high',
      '--evidence-json',
      '{"command":"alva run foo.js"}',
      '--context-json',
      '{"session_id":"s1"}',
    ]);
    expect(client.feedback.submit).toHaveBeenCalledWith({
      source: undefined,
      category: 'runtime',
      severity: 'high',
      summary: 'runtime failed',
      details: 'command returned a platform error',
      evidence: { command: 'alva run foo.js' },
      context: { session_id: 's1' },
    });
    expect(result).toEqual({
      feedback_id: 123,
      notion_page_id: 'page-123',
      notion_url: 'https://notion.so/page-123',
    });
  });

  it('dispatches feedback submit with optional metadata omitted', async () => {
    const client = makeClient();
    const result = await dispatch(client, [
      'feedback',
      'submit',
      '--summary',
      'runtime failed',
    ]);
    expect(client.feedback.submit).toHaveBeenCalledWith({
      source: undefined,
      category: undefined,
      severity: undefined,
      summary: 'runtime failed',
      details: undefined,
      evidence: undefined,
      context: undefined,
    });
    expect(result).toEqual({
      feedback_id: 123,
      notion_page_id: 'page-123',
      notion_url: 'https://notion.so/page-123',
    });
  });

  it('rejects stale feedback dedupe flag', async () => {
    const client = makeClient();
    await expect(
      dispatch(client, [
        'feedback',
        'submit',
        '--summary',
        'runtime failed',
        '--dedupe-key',
        'session-1/runtime',
      ])
    ).rejects.toThrow('--dedupe-key is no longer supported');
    expect(client.feedback.submit).not.toHaveBeenCalled();
  });

  it('dispatches channel group-subscriptions context', async () => {
    const client = makeClient();
    await dispatch(client, [
      'channel',
      'group-subscriptions',
      'context',
      '--session-id',
      '123',
    ]);
    expect(client.channelGroupSubscriptions.context).toHaveBeenCalledWith({
      session_id: '123',
    });
  });

  it('dispatches channel group-subscriptions subscribe', async () => {
    const client = makeClient();
    await dispatch(client, [
      'channel',
      'group-subscriptions',
      'subscribe',
      '--session-id',
      '123',
      '--target-type',
      'feed',
      '--target-id',
      '8169',
    ]);
    expect(client.channelGroupSubscriptions.subscribe).toHaveBeenCalledWith({
      session_id: '123',
      target_type: 'feed',
      target_id: '8169',
    });
  });

  it('dispatches channel group-subscriptions unsubscribe', async () => {
    const client = makeClient();
    await dispatch(client, [
      'channel',
      'group-subscriptions',
      'unsubscribe',
      '--session-id',
      '123',
      '--target-type',
      'playbook',
      '--target-id',
      '42',
    ]);
    expect(client.channelGroupSubscriptions.unsubscribe).toHaveBeenCalledWith({
      session_id: '123',
      target_type: 'playbook',
      target_id: '42',
    });
  });

  it('throws CliUsageError when channel group target type is invalid', async () => {
    const client = makeClient();
    await expect(
      dispatch(client, [
        'channel',
        'group-subscriptions',
        'subscribe',
        '--session-id',
        '123',
        '--target-type',
        'dashboard',
        '--target-id',
        '8169',
      ])
    ).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof CliUsageError && err.command === 'channel'
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

  it('throws CliUsageError with command="notification-history" for missing notification-history subcommand', async () => {
    const client = makeClient();
    await expect(dispatch(client, ['notification-history'])).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof CliUsageError && err.command === 'notification-history'
    );
  });

  it('throws CliUsageError with command="notification-preferences" for missing notification-preferences subcommand', async () => {
    const client = makeClient();
    await expect(
      dispatch(client, ['notification-preferences'])
    ).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof CliUsageError &&
        err.command === 'notification-preferences'
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
    expect(result._meta).toMatchObject({
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

  it('includes arrays_jwt in _meta on status success', async () => {
    const client = makeClient();
    const result = (await dispatch(client, ['whoami'])) as Record<
      string,
      unknown
    >;
    expect(client.arraysJwt.status).toHaveBeenCalled();
    const meta = result._meta as Record<string, unknown>;
    expect(meta.arrays_jwt).toEqual({
      exists: true,
      expires_at: 1800000000,
      renewal_needed: false,
      tier: 'SUBSCRIPTION_TIER_PRO',
    });
  });

  it('omits arrays_jwt when status RPC fails', async () => {
    const client = makeClient();
    client.arraysJwt.status = vi.fn().mockRejectedValue(new Error('network'));
    const result = (await dispatch(client, ['whoami'])) as Record<
      string,
      unknown
    >;
    const meta = result._meta as Record<string, unknown>;
    expect(meta.arrays_jwt).toBeUndefined();
    expect(result.id).toBeDefined();
    expect(result.username).toBe('alice');
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
      runHooks: vi.fn().mockResolvedValue(undefined),
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
      runHooks: vi.fn().mockResolvedValue(undefined),
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
      runHooks: vi.fn().mockResolvedValue(undefined),
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

  it('invokes runHooks with client built from input (test #12)', async () => {
    const runHooks = vi.fn().mockResolvedValue(undefined);
    const deps = {
      env: {} as Record<string, string | undefined>,
      homedir: () => '/home/test',
      mkdir: vi.fn().mockResolvedValue(undefined),
      writeFile: vi.fn().mockResolvedValue(undefined),
      readFile: vi.fn().mockRejectedValue(new Error('ENOENT')),
      runHooks,
    };
    const result = await handleConfigure(
      ['configure', '--api-key', 'alva_x', '--base-url', 'http://x.test'],
      deps
    );
    expect(result).toEqual(
      expect.objectContaining({ status: 'configured', apiKey: 'alva_x' })
    );
    expect(runHooks).toHaveBeenCalledTimes(1);
    const clientArg = runHooks.mock.calls[0][0] as AlvaClient;
    expect(clientArg).toBeInstanceOf(AlvaClient);
    expect(clientArg.apiKey).toBe('alva_x');
    expect(clientArg.baseUrl).toBe('http://x.test');
  });

  it('tolerates runHooks rejection (test #13)', async () => {
    const runHooks = vi.fn().mockRejectedValue(new Error('boom'));
    const stderrSpy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);
    try {
      const deps = {
        env: {} as Record<string, string | undefined>,
        homedir: () => '/home/test',
        mkdir: vi.fn().mockResolvedValue(undefined),
        writeFile: vi.fn().mockResolvedValue(undefined),
        readFile: vi.fn().mockRejectedValue(new Error('ENOENT')),
        runHooks,
      };
      const result = await handleConfigure(
        ['configure', '--api-key', 'alva_x'],
        deps
      );
      expect(result).toEqual(
        expect.objectContaining({ status: 'configured', apiKey: 'alva_x' })
      );
      const combined = stderrSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(combined).toContain('warning: post-configure hooks crashed: boom');
    } finally {
      stderrSpy.mockRestore();
    }
  });

  it('skips hooks on write failure (test #14)', async () => {
    const runHooks = vi.fn().mockResolvedValue(undefined);
    const deps = {
      env: {} as Record<string, string | undefined>,
      homedir: () => '/home/test',
      mkdir: vi.fn().mockResolvedValue(undefined),
      writeFile: vi.fn().mockRejectedValue(new Error('EACCES')),
      readFile: vi.fn().mockRejectedValue(new Error('ENOENT')),
      runHooks,
    };
    await expect(
      handleConfigure(['configure', '--api-key', 'alva_x'], deps)
    ).rejects.toThrow(/EACCES/);
    expect(runHooks).not.toHaveBeenCalled();
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

  it('top-level help mentions channel group subscriptions', async () => {
    const client = makeClient();
    const result = (await dispatch(client, ['--help'])) as {
      _help: boolean;
      text: string;
    };
    expect(result.text).toContain('channel');
    expect(result.text).toContain('group-subscriptions');
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
    expect(result.text.toLowerCase()).toContain('arrays_jwt');
  });

  it('returns per-command help for sdk --help with partition names', async () => {
    const client = makeClient();
    const result = (await dispatch(client, ['sdk', '--help'])) as {
      _help: boolean;
      text: string;
    };
    expect(result.text).toContain('feed_widgets');
    expect(result.text).toContain('unified_search');
  });

  it('returns per-command help for channel --help', async () => {
    const client = makeClient();
    const result = (await dispatch(client, ['channel', '--help'])) as {
      _help: boolean;
      text: string;
    };
    expect(result.text).toContain('group-subscriptions');
    expect(result.text).toContain('--session-id');
    expect(result.text).toContain('--target-type');
  });

  it('returns per-command help for notification-history --help', async () => {
    const client = makeClient();
    const result = (await dispatch(client, [
      'notification-history',
      '--help',
    ])) as {
      _help: boolean;
      text: string;
    };
    expect(result.text).toContain('audit/history');
    expect(result.text).toContain('list-playbook');
    expect(result.text).toContain('list-feed');
  });

  it('returns per-command help for notification-preferences --help', async () => {
    const client = makeClient();
    const result = (await dispatch(client, [
      'notification-preferences',
      '--help',
    ])) as {
      _help: boolean;
      text: string;
    };
    expect(result.text).toContain('disable-session-completed');
    expect(result.text).toContain('enabled by default');
  });

  it('returns per-command help for feedback --help', async () => {
    const client = makeClient();
    const result = (await dispatch(client, ['feedback', '--help'])) as {
      _help: boolean;
      text: string;
    };
    expect(result.text).toContain('user-confirmed');
    expect(result.text).toContain('submit');
    expect(result.text).toContain('--evidence-json');
    expect(result.text).toContain('Optional structured diagnostics');
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

  // --- Cases 3-21: targeted help-text assertions ---

  it('case 3: user line lists (me) inline', async () => {
    const client = makeClient();
    const result = (await dispatch(client, ['--help'])) as {
      _help: boolean;
      text: string;
    };
    expect(result.text).toContain('(me)');
  });

  it('case 4: deploy line lists runs and run-logs', async () => {
    const client = makeClient();
    const result = (await dispatch(client, ['--help'])) as {
      _help: boolean;
      text: string;
    };
    expect(result.text).toContain('runs');
    expect(result.text).toContain('run-logs');
  });

  it('case 5: auth line uses (login) format', async () => {
    const client = makeClient();
    const result = (await dispatch(client, ['--help'])) as {
      _help: boolean;
      text: string;
    };
    expect(result.text).toContain('(login)');
  });

  it('case 6: deploy --help lists runs and run-logs', async () => {
    const client = makeClient();
    const result = (await dispatch(client, ['deploy', '--help'])) as {
      _help: boolean;
      text: string;
    };
    expect(result.text).toContain('runs');
    expect(result.text).toContain('run-logs');
  });

  it('case 7: deploy --help has Runs flags section with --first', async () => {
    const client = makeClient();
    const result = (await dispatch(client, ['deploy', '--help'])) as {
      _help: boolean;
      text: string;
    };
    expect(result.text).toMatch(/Runs flags:[\s\S]*?--first/);
  });

  it('case 8: deploy --help has Run-logs flags section with --run-id', async () => {
    const client = makeClient();
    const result = (await dispatch(client, ['deploy', '--help'])) as {
      _help: boolean;
      text: string;
    };
    expect(result.text).toMatch(/Run-logs flags:[\s\S]*?--run-id/);
  });

  it('case 9: fs --help has symlink example', async () => {
    const client = makeClient();
    const result = (await dispatch(client, ['fs', '--help'])) as {
      _help: boolean;
      text: string;
    };
    expect(result.text).toContain('alva fs symlink');
  });

  it('case 10: fs --help has readlink example', async () => {
    const client = makeClient();
    const result = (await dispatch(client, ['fs', '--help'])) as {
      _help: boolean;
      text: string;
    };
    expect(result.text).toContain('alva fs readlink');
  });

  it('case 11: fs --help per-sub flags for read', async () => {
    const client = makeClient();
    const result = (await dispatch(client, ['fs', '--help'])) as {
      _help: boolean;
      text: string;
    };
    expect(result.text).toContain('--offset');
    expect(result.text).toContain('--size');
  });

  it('case 12: fs --help per-sub flags for write', async () => {
    const client = makeClient();
    const result = (await dispatch(client, ['fs', '--help'])) as {
      _help: boolean;
      text: string;
    };
    expect(result.text).toContain('--data');
    expect(result.text).toContain('--file');
  });

  it('case 13: fs --help per-sub flags for rename', async () => {
    const client = makeClient();
    const result = (await dispatch(client, ['fs', '--help'])) as {
      _help: boolean;
      text: string;
    };
    expect(result.text).toContain('--old-path');
    expect(result.text).toContain('--new-path');
  });

  it('case 14: fs --help per-sub flags for copy', async () => {
    const client = makeClient();
    const result = (await dispatch(client, ['fs', '--help'])) as {
      _help: boolean;
      text: string;
    };
    expect(result.text).toContain('--src-path');
    expect(result.text).toContain('--dst-path');
  });

  it('case 15: fs --help per-sub flags for symlink', async () => {
    const client = makeClient();
    const result = (await dispatch(client, ['fs', '--help'])) as {
      _help: boolean;
      text: string;
    };
    expect(result.text).toContain('--target-path');
    expect(result.text).toContain('--link-path');
  });

  it('case 16: fs --help per-sub flags for chmod', async () => {
    const client = makeClient();
    const result = (await dispatch(client, ['fs', '--help'])) as {
      _help: boolean;
      text: string;
    };
    expect(result.text).toContain('--mode');
  });

  it('case 17: fs --help per-sub flags for grant/revoke', async () => {
    const client = makeClient();
    const result = (await dispatch(client, ['fs', '--help'])) as {
      _help: boolean;
      text: string;
    };
    expect(result.text).toContain('--subject');
    expect(result.text).toContain('--permission');
  });

  it('case 18: fs --help shell-quoting note', async () => {
    const client = makeClient();
    const result = (await dispatch(client, ['fs', '--help'])) as {
      _help: boolean;
      text: string;
    };
    expect(result.text).toMatch(/quote[\s\S]*?tilde|tilde[\s\S]*?quote/i);
  });

  it('case 19: fs --help quoted tilde example', async () => {
    const client = makeClient();
    const result = (await dispatch(client, ['fs', '--help'])) as {
      _help: boolean;
      text: string;
    };
    expect(result.text).toContain('"~/');
  });

  it('case 20: run --help quoted tilde example', async () => {
    const client = makeClient();
    const result = (await dispatch(client, ['run', '--help'])) as {
      _help: boolean;
      text: string;
    };
    expect(result.text).toContain('"~/');
  });

  it('case 21: deploy --help quoted tilde example', async () => {
    const client = makeClient();
    const result = (await dispatch(client, ['deploy', '--help'])) as {
      _help: boolean;
      text: string;
    };
    expect(result.text).toContain('"~/');
  });
});

describe('help-text drift guard', () => {
  // Groups with subcommand dispatch. Flag-only top-level commands (run,
  // remix, screenshot, whoami, configure) are excluded — they have no
  // subcommand enumeration.
  const DISPATCHABLE_SUBCOMMANDS: Record<string, string[]> = {
    user: ['me'],
    fs: [
      'read',
      'write',
      'stat',
      'readdir',
      'mkdir',
      'remove',
      'rename',
      'copy',
      'symlink',
      'readlink',
      'chmod',
      'grant',
      'revoke',
    ],
    deploy: [
      'create',
      'list',
      'get',
      'update',
      'delete',
      'pause',
      'resume',
      'runs',
      'run-logs',
    ],
    release: ['feed', 'playbook-draft', 'playbook'],
    playbooks: ['trending'],
    secrets: ['create', 'list', 'get', 'update', 'delete'],
    sdk: ['doc', 'partitions', 'partition-summary'],
    'data-skills': ['list', 'summary', 'endpoint'],
    skillhub: ['list', 'tags', 'get', 'file'],
    comments: ['create', 'pin', 'unpin'],
    feedback: ['submit'],
    trading: [
      'accounts',
      'portfolio',
      'orders',
      'subscriptions',
      'equity-history',
      'risk-rules',
      'subscribe',
      'unsubscribe',
      'execute',
      'update-risk-rules',
    ],
    auth: ['login'],
  };

  it('case 1: group help contains every subcommand', async () => {
    const client = makeClient();
    for (const [group, subs] of Object.entries(DISPATCHABLE_SUBCOMMANDS)) {
      const result = (await dispatch(client, [group, '--help'])) as {
        _help: boolean;
        text: string;
      };
      for (const sub of subs) {
        expect(result.text.includes(sub)).toBe(true);
      }
    }
  });

  it('case 2: top-level help contains every subcommand inline on its group line', async () => {
    const client = makeClient();
    const result = (await dispatch(client, ['--help'])) as {
      _help: boolean;
      text: string;
    };
    const lines = result.text.split('\n');
    for (const [group, subs] of Object.entries(DISPATCHABLE_SUBCOMMANDS)) {
      const groupLine = lines.find((line) => line.includes(group));
      expect(groupLine).toBeDefined();
      for (const sub of subs) {
        expect(groupLine!.includes(sub)).toBe(true);
      }
    }
  });
});

describe('data-skills dispatch', () => {
  it('throws CliUsageError when data-skills has no subcommand', async () => {
    const client = makeClient();
    await expect(dispatch(client, ['data-skills'])).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof CliUsageError && err.command === 'data-skills'
    );
  });

  it('dispatches data-skills list', async () => {
    const client = makeClient();
    await dispatch(client, ['data-skills', 'list']);
    expect(client.dataSkills.list).toHaveBeenCalled();
  });

  it('dispatches data-skills summary with positional name', async () => {
    const client = makeClient();
    await dispatch(client, ['data-skills', 'summary', 'x']);
    expect(client.dataSkills.summary).toHaveBeenCalledWith({ name: 'x' });
  });

  it('throws when data-skills summary missing positional name', async () => {
    const client = makeClient();
    await expect(
      dispatch(client, ['data-skills', 'summary'])
    ).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof CliUsageError && err.command === 'data-skills'
    );
  });

  it('dispatches data-skills endpoint with positional skill and file', async () => {
    const client = makeClient();
    await dispatch(client, ['data-skills', 'endpoint', 'x', 'p']);
    expect(client.dataSkills.endpoint).toHaveBeenCalledWith({
      name: 'x',
      file: 'p',
    });
  });

  it('throws when data-skills endpoint missing positional file', async () => {
    const client = makeClient();
    await expect(
      dispatch(client, ['data-skills', 'endpoint', 'x'])
    ).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof CliUsageError && err.command === 'data-skills'
    );
  });

  it('throws when data-skills endpoint missing positional name', async () => {
    const client = makeClient();
    await expect(
      dispatch(client, ['data-skills', 'endpoint'])
    ).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof CliUsageError && err.command === 'data-skills'
    );
  });

  it('throws on unknown data-skills subcommand', async () => {
    const client = makeClient();
    await expect(dispatch(client, ['data-skills', 'bogus'])).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof CliUsageError && err.command === 'data-skills'
    );
  });

  it('data-skills list returns readable string by default', async () => {
    const client = makeClient();
    client.dataSkills.list = vi.fn().mockResolvedValue({
      skills: [
        {
          name: 'alpha',
          description: 'alpha desc',
          metadata: {
            endpoint_count: 2,
            endpoint_tier_counts: { public: 1, unstructured: 1 },
            pro_count: 1,
          },
        },
        {
          name: 'beta',
          description: 'beta desc',
          metadata: {
            endpoint_count: 3,
            endpoint_tier_counts: { public: 3 },
            pro_count: 0,
          },
        },
      ],
    });
    const result = await dispatch(client, ['data-skills', 'list']);
    expect(typeof result).toBe('string');
    const text = result as string;
    expect(text).toContain('alpha');
    expect(text).toContain('alpha desc');
    expect(text).toContain('2 endpoints');
    expect(text).toContain('1 pro');
    // beta has zero pro endpoints — pro tag must be omitted, not "0 pro"
    expect(text).not.toContain('0 pro');
  });

  it('data-skills list --json returns raw object', async () => {
    const client = makeClient();
    client.dataSkills.list = vi
      .fn()
      .mockResolvedValue({ skills: [{ name: 'a', description: 'd' }] });
    const result = await dispatch(client, ['data-skills', 'list', '--json']);
    expect(result).toEqual({ skills: [{ name: 'a', description: 'd' }] });
  });

  it('data-skills summary returns markdown content directly by default', async () => {
    const client = makeClient();
    client.dataSkills.summary = vi.fn().mockResolvedValue({
      name: 'sk',
      description: 'desc',
      content: '# Header\n\nbody line',
    });
    const result = await dispatch(client, ['data-skills', 'summary', 'sk']);
    expect(typeof result).toBe('string');
    const text = result as string;
    expect(text).toContain('# sk');
    expect(text).toContain('desc');
    expect(text).toContain('# Header');
    expect(text).toContain('body line');
    expect(text).not.toContain('\\n');
  });

  it('data-skills summary --json returns raw object', async () => {
    const client = makeClient();
    client.dataSkills.summary = vi
      .fn()
      .mockResolvedValue({ name: 'sk', description: 'd', content: 'c' });
    const result = await dispatch(client, [
      'data-skills',
      'summary',
      'sk',
      '--json',
    ]);
    expect(result).toEqual({ name: 'sk', description: 'd', content: 'c' });
  });

  it('data-skills endpoint returns markdown content directly by default', async () => {
    const client = makeClient();
    client.dataSkills.endpoint = vi.fn().mockResolvedValue({
      name: 'sk',
      description: 'desc',
      content: 'endpoint body',
    });
    const result = await dispatch(client, [
      'data-skills',
      'endpoint',
      'sk',
      'f',
    ]);
    expect(typeof result).toBe('string');
    expect(result as string).toContain('endpoint body');
  });

  it('data-skills --help returns help text', async () => {
    const client = makeClient();
    const result = (await dispatch(client, ['data-skills', '--help'])) as {
      _help: boolean;
      text: string;
    };
    expect(result._help).toBe(true);
    expect(result.text).toContain('Browse the Arrays backend');
  });

  it('top-level --help lists data-skills', async () => {
    const client = makeClient();
    const result = (await dispatch(client, ['--help'])) as {
      _help: boolean;
      text: string;
    };
    expect(result.text).toContain('data-skills');
  });
});

describe('skillhub dispatch', () => {
  it('dispatches skillhub list', async () => {
    const client = makeClient();
    await dispatch(client, ['skillhub', 'list']);
    expect(client.playbookSkills.list).toHaveBeenCalled();
  });

  it('dispatches skillhub list with --tag filter', async () => {
    const client = makeClient();
    await dispatch(client, ['skillhub', 'list', '--tag', 'research']);
    expect(client.playbookSkills.list).toHaveBeenCalledWith({
      tag: 'research',
      username: undefined,
    });
  });

  it('dispatches skillhub tags', async () => {
    const client = makeClient();
    await dispatch(client, ['skillhub', 'tags']);
    expect(client.playbookSkills.tags).toHaveBeenCalled();
  });

  it('dispatches skillhub get with positional id', async () => {
    const client = makeClient();
    await dispatch(client, ['skillhub', 'get', 'alva/ai-digest']);
    expect(client.playbookSkills.get).toHaveBeenCalledWith('alva/ai-digest');
  });

  it('dispatches skillhub file with positional id and path', async () => {
    const client = makeClient();
    await dispatch(client, ['skillhub', 'file', 'alva/ai-digest', 'README.md']);
    expect(client.playbookSkills.file).toHaveBeenCalledWith(
      'alva/ai-digest',
      'README.md'
    );
  });

  it('throws when skillhub get missing positional id', async () => {
    const client = makeClient();
    await expect(dispatch(client, ['skillhub', 'get'])).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof CliUsageError && err.command === 'skillhub'
    );
  });

  it('throws when skillhub file missing positional path', async () => {
    const client = makeClient();
    await expect(
      dispatch(client, ['skillhub', 'file', 'alva/ai-digest'])
    ).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof CliUsageError && err.command === 'skillhub'
    );
  });

  it('treats --json as missing positional for skillhub get (--guard)', async () => {
    const client = makeClient();
    await expect(
      dispatch(client, ['skillhub', 'get', '--json'])
    ).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof CliUsageError && err.command === 'skillhub'
    );
  });
});

describe('stripGlobalFlags', () => {
  it('removes --arrays-endpoint <v>', () => {
    expect(
      stripGlobalFlags(['--arrays-endpoint', 'https://x', 'skillhub', 'list'])
    ).toEqual(['skillhub', 'list']);
  });

  it('removes --arrays-endpoint=<v>', () => {
    expect(
      stripGlobalFlags(['--arrays-endpoint=https://x', 'skillhub', 'list'])
    ).toEqual(['skillhub', 'list']);
  });

  it('preserves non-global args', () => {
    expect(
      stripGlobalFlags(['--api-key', 'k', 'skillhub', 'summary', '--name', 'x'])
    ).toEqual(['skillhub', 'summary', '--name', 'x']);
  });

  it('is idempotent on already-clean argv', () => {
    expect(stripGlobalFlags(['skillhub', 'list'])).toEqual([
      'skillhub',
      'list',
    ]);
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
      id: '9007199254740993',
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
      id: '9007199254740993',
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
      id: '9007199254740993',
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
      id: '9007199254740993',
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

describe('arrays token dispatch', () => {
  it('dispatches arrays token ensure', async () => {
    const client = makeClient();
    const mockResp = {
      expires_at: 1,
      tier: 'SUBSCRIPTION_TIER_FREE',
      renewed: true,
    };
    client.arraysJwt.ensure = vi.fn().mockResolvedValue(mockResp);
    const result = await dispatch(client, ['arrays', 'token', 'ensure']);
    expect(client.arraysJwt.ensure).toHaveBeenCalledTimes(1);
    expect(result).toEqual(mockResp);
  });

  it('dispatches arrays token status', async () => {
    const client = makeClient();
    const mockResp = {
      exists: true,
      expires_at: 1,
      tier: 'SUBSCRIPTION_TIER_FREE',
      renewal_needed: false,
    };
    client.arraysJwt.status = vi.fn().mockResolvedValue(mockResp);
    const result = await dispatch(client, ['arrays', 'token', 'status']);
    expect(client.arraysJwt.status).toHaveBeenCalledTimes(1);
    expect(result).toEqual(mockResp);
  });

  it('throws on unknown arrays token leaf with helpful message', async () => {
    const client = makeClient();
    await expect(
      dispatch(client, ['arrays', 'token', 'bogus'])
    ).rejects.toThrow(/arrays token/);
    await expect(
      dispatch(client, ['arrays', 'token', 'bogus'])
    ).rejects.toThrow(/--help/);
  });

  it('throws on unknown arrays subgroup with helpful message', async () => {
    const client = makeClient();
    await expect(dispatch(client, ['arrays', 'bogus'])).rejects.toThrow(
      /arrays/
    );
    await expect(dispatch(client, ['arrays', 'bogus'])).rejects.toThrow(
      /--help/
    );
  });

  it('arrays --help returns help object listing ensure and status', async () => {
    const client = makeClient();
    const result = (await dispatch(client, ['arrays', '--help'])) as {
      _help: boolean;
      text: string;
    };
    expect(result._help).toBe(true);
    expect(result.text).toMatch(/ensure/);
    expect(result.text).toMatch(/status/);
  });

  it('arrays token --help returns help object', async () => {
    const client = makeClient();
    const result = (await dispatch(client, ['arrays', 'token', '--help'])) as {
      _help: boolean;
      text: string;
    };
    expect(result._help).toBe(true);
    expect(result.text).toMatch(/ensure/);
    expect(result.text).toMatch(/status/);
  });

  it('old arrays-jwt verb is no longer recognized', async () => {
    const client = makeClient();
    await expect(dispatch(client, ['arrays-jwt', 'ensure'])).rejects.toThrow(
      /Unknown command/
    );
  });
});

describe('alva lint playbook', () => {
  it('returns non-zero when HTML violates a rule', async () => {
    const nodeFs = await import('fs');
    const nodePath = await import('path');
    const nodeOs = await import('os');
    const { handleLintPlaybook } = await import('../src/cli/lint.js');
    const tmp = nodePath.join(nodeOs.tmpdir(), 'bad-' + Date.now() + '.html');
    nodeFs.writeFileSync(tmp, '<html><body><p>no container</p></body></html>');
    const result = await handleLintPlaybook({
      file: tmp,
      format: 'json',
      contractYaml: `
version: 1
global:
  required-container: { selector: ".playbook-container", must-exist: true }
  scroll: { sole-scroll-container: ["body"] }
  typography: { font-family-root-must-include: "Delight", font-weight-allowed: [400, 500] }
  links: { anchor-required-attrs: ["target", "rel"] }
components: {}
`,
    });
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('required-container');
    nodeFs.unlinkSync(tmp);
  });
});

describe('lintBeforeRelease', () => {
  it('throws when HTML violates a rule', async () => {
    const { lintBeforeRelease } = await import('../src/cli/lint.js');
    const contractYaml = `
version: 1
global:
  required-container: { selector: ".playbook-container", must-exist: true }
  scroll: { sole-scroll-container: ["body"] }
  typography: { font-family-root-must-include: "Delight", font-weight-allowed: [400, 500] }
  links: { anchor-required-attrs: ["target", "rel"] }
components: {}
`;
    await expect(
      lintBeforeRelease({
        client: {} as never,
        playbookName: 'irrelevant',
        contractYaml,
        html: '<html><body><p>no container</p></body></html>',
      })
    ).rejects.toThrow(/Release blocked by design lint/);
  });

  it('returns the report when no errors', async () => {
    const { lintBeforeRelease } = await import('../src/cli/lint.js');
    const contractYaml = `
version: 1
global:
  required-container: { selector: ".playbook-container", must-exist: true }
  scroll: { sole-scroll-container: ["body"] }
  typography: { font-family-root-must-include: "Delight", font-weight-allowed: [400, 500] }
  links: { anchor-required-attrs: ["target", "rel"] }
components: {}
`;
    const r = await lintBeforeRelease({
      client: {} as never,
      playbookName: 'x',
      contractYaml,
      html:
        '<html><head><style>body{font-family:Delight}</style></head>' +
        '<body><div class="playbook-container"><p>ok</p></div></body></html>',
    });
    expect(r.summary.errors).toBe(0);
  });

  it('with bypassLint=true: does NOT throw, returns report, prints to stderr', async () => {
    const { lintBeforeRelease } = await import('../src/cli/lint.js');
    const contractYaml = `
version: 1
global:
  required-container: { selector: ".playbook-container", must-exist: true }
  scroll: { sole-scroll-container: ["body"] }
  typography: { font-family-root-must-include: "Delight", font-weight-allowed: [400, 500] }
  links: { anchor-required-attrs: ["target", "rel"] }
components: {}
`;
    const stderrChunks: string[] = [];
    const origWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((chunk: string | Uint8Array) => {
      stderrChunks.push(typeof chunk === 'string' ? chunk : chunk.toString());
      return true;
    }) as typeof process.stderr.write;

    try {
      const r = await lintBeforeRelease({
        client: {} as never,
        playbookName: 'irrelevant',
        contractYaml,
        bypassLint: true,
        html: '<html><body><p>no container</p></body></html>',
      });
      expect(r.summary.errors).toBeGreaterThan(0);
      const stderr = stderrChunks.join('');
      expect(stderr).toMatch(/--bypass-lint bypassing/);
      expect(stderr).toMatch(/required-container/);
    } finally {
      process.stderr.write = origWrite;
    }
  });
});

describe('CLI dispatch — subscriptions/playbooks agent surface (mono-meta#584 W3)', () => {
  it('dispatches subscriptions follows with pagination flags', async () => {
    const client = makeClient();
    await dispatch(client, [
      'subscriptions',
      'follows',
      '--limit',
      '20',
      '--cursor',
      'c1',
    ]);
    expect(client.subscriptions.follows).toHaveBeenCalledWith({
      limit: 20,
      cursor: 'c1',
    });
  });

  it('dispatches subscriptions unsubscribe with comma-separated ids', async () => {
    const client = makeClient();
    await dispatch(client, [
      'subscriptions',
      'unsubscribe',
      '--playbook-ids',
      '8009,8010',
      '--feed-ids',
      '13292',
    ]);
    expect(client.subscriptions.unsubscribeBatch).toHaveBeenCalledWith({
      playbookIds: ['8009', '8010'],
      feedIds: ['13292'],
    });
  });

  it('rejects subscriptions unsubscribe without ids', async () => {
    const client = makeClient();
    await expect(
      dispatch(client, ['subscriptions', 'unsubscribe'])
    ).rejects.toThrow(/playbook-ids or --feed-ids/);
    expect(client.subscriptions.unsubscribeBatch).not.toHaveBeenCalled();
  });

  it('dispatches playbooks get --ids as a batch', async () => {
    const client = makeClient();
    await dispatch(client, ['playbooks', 'get', '--ids', '1,2']);
    expect(client.playbooks.getByIds).toHaveBeenCalledWith(['1', '2']);
  });

  it('dispatches playbooks get --ref', async () => {
    const client = makeClient();
    await dispatch(client, ['playbooks', 'get', '--ref', 'alice/macro']);
    expect(client.playbooks.get).toHaveBeenCalledWith({ ref: 'alice/macro' });
  });

  it('dispatches playbooks list --owner', async () => {
    const client = makeClient();
    await dispatch(client, [
      'playbooks',
      'list',
      '--owner',
      'alice',
      '--limit',
      '10',
    ]);
    expect(client.playbooks.listByOwner).toHaveBeenCalledWith({
      owner: 'alice',
      limit: 10,
      cursor: undefined,
    });
  });
});
