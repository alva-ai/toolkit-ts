import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { runInNewContext } from 'node:vm';
import {
  dispatch,
  handleConfigure,
  CLI_VERSION,
  DEFAULT_RUN_TIMEOUT_MS,
  isVersionOlderThan,
  stripGlobalFlags,
} from '../src/cli/index.js';
import { dispatch as dispatchEmbedded } from '../src/cli/embeddedDispatch.js';
import { AlvaClient } from '../src/client.js';
import { encodeBase64 } from '../src/base64.js';
import { CliUsageError } from '../src/error.js';
import { allowance } from './billingV2.js';
import { FUNCTION, functionInvocation, playbookFunction } from './runtimeV2.js';
import { aPlaybook } from './contentV2.js';
import { v2 } from './v2Schema.js';

const AUTOMATION = v2('Automation', {
  id: 'automation_0a',
  name: 'btc-ema',
  description: null,
  status: 'PAUSED',
  schedule: { cron: '0 * * * *', timezone: 'UTC' },
  stats: {
    totalRuns: 3,
    succeededRuns: 3,
    failedRuns: 0,
    lastRunAt: null,
    lastRunStatus: null,
  },
  sendsAlerts: true,
  agentType: null,
  cronjobId: 'cronjob_0a',
  flow: null,
  flowConfigPath: null,
});
const AUTOMATION_VERSION = v2('AutomationVersion', {
  automationId: 'automation_0a',
  cronjobId: 'cronjob_0a',
  major: 1,
  name: 'btc-ema',
  version: '1.0.0',
});
const COMMENT = v2('Comment', {
  id: 'comment_0a',
  playbookId: 'playbook_0abc',
  parentId: null,
  body: 'Great',
  author: null,
  agentName: null,
  pinnedAt: null,
  createdAt: null,
  updatedAt: null,
});
import {
  aDelivery,
  aFeedback,
  aMe,
  aScreenshot,
  aSecret,
} from './accountV2.js';
import {
  aCronjob,
  aDelivery as anAutomationDelivery,
  anAutomation,
  aSchedule,
} from './automationV2.js';
import { fakeV2 } from './fakeV2.js';
import { aPlaybookFollow, aSubscription } from './socialV2.js';

vi.mock('fs', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    readFileSync: vi.fn(actual.readFileSync as (...args: unknown[]) => unknown),
  };
});
import * as fs from 'fs';

vi.mock('undici', () => {
  class Agent {
    options: unknown;

    constructor(options: unknown) {
      this.options = options;
    }
  }
  return {
    Agent,
    setGlobalDispatcher: vi.fn(),
  };
});
import { setGlobalDispatcher } from 'undici';

const originalRunTimeoutEnv = process.env.ALVA_RUN_TIMEOUT_MS;

beforeEach(() => {
  delete process.env.ALVA_RUN_TIMEOUT_MS;
  vi.mocked(setGlobalDispatcher).mockClear();
});

afterEach(() => {
  if (originalRunTimeoutEnv === undefined) {
    delete process.env.ALVA_RUN_TIMEOUT_MS;
  } else {
    process.env.ALVA_RUN_TIMEOUT_MS = originalRunTimeoutEnv;
  }
});

/** An fs.read answer of `content`: text, or bytes. */
function fileContent(content: string | Uint8Array) {
  const bytes =
    typeof content === 'string' ? new TextEncoder().encode(content) : content;
  return {
    data: bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength
    ),
    contentType: 'application/octet-stream',
    contentRange: null,
  };
}

function makeClient(
  originSessionId?: string,
  originSessionKind?: string
): AlvaClient {
  const client = new AlvaClient({
    apiKey: 'test-key',
    originSessionId,
    originSessionKind,
  });
  // Mock all resource methods
  client.user.me = vi
    .fn()
    .mockResolvedValue(aMe({ toolkitMinVersion: '0.1.0' }));
  client.fs.read = vi.fn().mockResolvedValue(fileContent('hello'));
  client.fs.stat = vi.fn().mockResolvedValue({ name: 'f', sizeBytes: 0 });
  client.fs.readdir = vi.fn().mockResolvedValue({ entries: [] });
  client.fs.write = vi.fn().mockResolvedValue({ bytesWritten: 2 });
  client.fs.mkdir = vi.fn().mockResolvedValue({});
  client.fs.remove = vi.fn().mockResolvedValue({});
  client.fs.rename = vi.fn().mockResolvedValue({});
  client.fs.copy = vi.fn().mockResolvedValue({});
  client.fs.symlink = vi.fn().mockResolvedValue({});
  client.fs.readlink = vi.fn().mockResolvedValue({ targetPath: '/t' });
  client.fs.chmod = vi.fn().mockResolvedValue({});
  client.fs.grant = vi.fn().mockResolvedValue({});
  client.fs.revoke = vi.fn().mockResolvedValue({});
  client.deploy.list = vi
    .fn()
    .mockResolvedValue({ items: [], nextPageToken: null });
  client.deploy.create = vi
    .fn()
    .mockResolvedValue(aCronjob({ id: 'cronjob_0p1' }));
  client.deploy.get = vi.fn().mockResolvedValue(aCronjob());
  client.deploy.update = vi.fn().mockResolvedValue(aCronjob());
  client.deploy.delete = vi.fn().mockResolvedValue({});
  client.deploy.pause = vi
    .fn()
    .mockResolvedValue(aCronjob({ status: 'PAUSED' }));
  client.deploy.resume = vi.fn().mockResolvedValue(aCronjob());
  client.deploy.trigger = vi
    .fn()
    .mockResolvedValue({ dispatchId: 'cronjob_dispatch_0d' });
  client.deploy.listRuns = vi
    .fn()
    .mockResolvedValue({ items: [], nextPageToken: null });
  client.deploy.runStats = vi.fn().mockResolvedValue({
    totalRuns: 0,
    succeededRuns: 0,
    failedRuns: 0,
    skippedRuns: 0,
    lastRunAt: null,
    lastSucceededAt: null,
  });
  client.deploy.getDispatch = vi.fn().mockResolvedValue({
    id: 'cronjob_dispatch_0d',
    cronjobId: 'cronjob_0c',
    state: 'PENDING',
    run: null,
  });
  client.deploy.getRunLogs = vi
    .fn()
    .mockResolvedValue({ logs: '', error: null });
  client.secrets.create = vi.fn().mockResolvedValue(aSecret());
  client.secrets.list = vi
    .fn()
    .mockResolvedValue({ items: [aSecret()], nextPageToken: null });
  client.v1.secrets.get = vi.fn().mockResolvedValue({ name: 'K', value: 'V' });
  client.secrets.update = vi.fn().mockResolvedValue(aSecret());
  client.secrets.delete = vi.fn().mockResolvedValue({});
  client.run.execute = vi
    .fn()
    .mockResolvedValue({ returnValue: '2', status: 'SUCCEEDED' });
  client.run._executeSerializedArgs = vi
    .fn()
    .mockResolvedValue({ returnValue: '2', status: 'SUCCEEDED' });
  client.release.feed = vi.fn().mockResolvedValue(AUTOMATION_VERSION);
  client.feed.list = vi.fn().mockResolvedValue({
    items: [],
    nextPageToken: null,
  });
  client.feed.stop = vi.fn().mockResolvedValue(AUTOMATION);
  client.feed.resume = vi.fn().mockResolvedValue(AUTOMATION);
  client.feed.delete = vi.fn().mockResolvedValue({});
  client.feed.setVisibility = vi
    .fn()
    .mockResolvedValue({ id: 'automation_0a', visibility: 'PUBLIC' });
  client.automation.list = vi.fn().mockResolvedValue({
    items: [
      {
        id: 'automation_0a',
        name: 'btc-ema',
        status: 'ACTIVE',
        schedule: { cron: '0 * * * *', timezone: 'UTC' },
        flow: null,
        lastRunAt: null,
        totalRuns: 3,
        usedByCount: 1,
      },
    ],
    nextPageToken: 'next',
  });
  client.automation.inspect = vi.fn().mockResolvedValue(anAutomation());
  client.automation.publish = vi.fn().mockResolvedValue(AUTOMATION_VERSION);
  client.automation.update = vi.fn().mockResolvedValue({
    automationId: 'automation_0abc',
    name: 'btc',
    major: 1,
    version: '1.0.1',
    cronjobId: 'cronjob_0p420',
  });
  client.automation.delivery.get = vi
    .fn()
    .mockResolvedValue(anAutomationDelivery());
  client.automation.delivery.update = vi.fn().mockResolvedValue(anAutomation());
  client.automation.stop = vi.fn().mockResolvedValue(AUTOMATION);
  client.automation.resume = vi
    .fn()
    .mockResolvedValue({ ...AUTOMATION, status: 'ACTIVE' });
  client.automation.delete = vi.fn().mockResolvedValue({});
  client.schedules.agentChannelId = vi.fn().mockResolvedValue('channel_0ch');
  client.schedules.list = vi
    .fn()
    .mockResolvedValue({ items: [aSchedule()], nextPageToken: null });
  client.schedules.put = vi.fn().mockResolvedValue(aSchedule());
  client.schedules.pause = vi
    .fn()
    .mockResolvedValue(aSchedule({ status: 'PAUSED' }));
  client.schedules.resume = vi.fn().mockResolvedValue(aSchedule());
  client.schedules.delete = vi.fn().mockResolvedValue({});
  client.credits.wallet = vi.fn().mockResolvedValue({
    balance: '100',
    todayUsed: '3',
    balances: [],
  });
  client.credits.entries = vi
    .fn()
    .mockResolvedValue({ items: [], nextPageToken: null });
  client.playbooks.trending = vi
    .fn()
    .mockResolvedValue({ items: [], nextPageToken: null });
  client.playbooks.getByIds = vi.fn().mockResolvedValue([]);
  client.playbooks.get = vi.fn().mockResolvedValue(null);
  client.playbooks.getBySlug = vi.fn().mockResolvedValue(aPlaybook());
  client.playbooks.update = vi.fn().mockResolvedValue(aPlaybook());
  client.playbooks.listByOwner = vi
    .fn()
    .mockResolvedValue({ items: [], nextPageToken: null });
  client.playbooks.listOwn = vi
    .fn()
    .mockResolvedValue({ items: [], nextPageToken: null });
  client.user._username = vi.fn().mockResolvedValue('alice');
  client.subscriptions.follows = vi
    .fn()
    .mockResolvedValue({ items: [], nextPageToken: null });
  client.subscriptions.followPlaybook = vi
    .fn()
    .mockResolvedValue(aPlaybookFollow());
  client.subscriptions.unfollowPlaybook = vi
    .fn()
    .mockResolvedValue(aPlaybookFollow({ following: false }));
  client.v1.subscriptions.subscribeFeed = vi.fn().mockResolvedValue({
    subscription: {
      target: { type: 'FEED', id: '42' },
      created_at_ms: 1700000000000,
      updated_at_ms: 1700000000000,
    },
    feed_path: '/alva/home/alice/feeds/btc-ema',
  });
  client.v1.subscriptions.unsubscribeFeed = vi
    .fn()
    .mockResolvedValue({ ok: true });
  client.subscriptions.subscribeBatch = vi
    .fn()
    .mockResolvedValue({ subscriptions: [aSubscription()] });
  client.subscriptions.list = vi
    .fn()
    .mockResolvedValue({ items: [aSubscription()], nextPageToken: 'next' });
  client.subscriptions.unsubscribeBatch = vi.fn().mockResolvedValue([]);
  client.alerts.list = vi.fn().mockResolvedValue({
    items: [aSubscription({ channelId: 'channel_0ch' })],
    nextPageToken: 'next',
  });
  client.alerts.follows = vi
    .fn()
    .mockResolvedValue({ items: [], nextPageToken: null });
  client.alerts.enableBatch = vi
    .fn()
    .mockResolvedValue({ subscriptions: [aSubscription()] });
  client.alerts.disableBatch = vi.fn().mockResolvedValue([]);
  client.alerts.history = vi
    .fn()
    .mockResolvedValue({ items: [aDelivery()], nextPageToken: null });
  client.alerts.preferences = vi
    .fn()
    .mockResolvedValue({ sessionCompleted: null });
  client.alerts.updatePreferences = vi
    .fn()
    .mockResolvedValue({ sessionCompleted: false });
  client.release.playbookDraft = vi.fn().mockResolvedValue({
    id: 'draft_0a',
    playbook: aPlaybook(),
    url: null,
  });
  client.release.playbook = vi.fn().mockResolvedValue({
    id: 'release_0a',
    playbook: aPlaybook(),
    url: null,
    version: 'v1.0.0',
  });
  client.sdk.doc = vi.fn().mockResolvedValue({ name: 'x', doc: '' });
  client.sdk.partitions = vi
    .fn()
    .mockResolvedValue({ items: [], nextPageToken: null });
  client.sdk.partitionSummary = vi.fn().mockResolvedValue({
    id: 'sdk_partition_0a',
    name: 'feed_widgets',
    summary: '',
  });
  client.dataSkills.list = vi.fn().mockResolvedValue({ skills: [] });
  client.dataSkills.summary = vi
    .fn()
    .mockResolvedValue({ name: 'x', description: '', content: '' });
  client.dataSkills.endpoint = vi
    .fn()
    .mockResolvedValue({ name: 'x', description: '', content: '' });
  client.playbookSkills.list = vi
    .fn()
    .mockResolvedValue({ items: [], nextPageToken: null });
  client.playbookSkills.tags = vi
    .fn()
    .mockResolvedValue({ items: [], nextPageToken: null });
  client.playbookSkills.get = vi.fn().mockResolvedValue({
    id: 'skill_0a',
    name: 'ai-digest',
    displayName: 'AI Digest',
    description: '',
    tags: [],
    owner: { id: null, handle: 'alva', displayName: null, avatarUrl: null },
    header: null,
    iconUrl: null,
    promptTemplate: null,
    updatedAt: null,
    files: [],
  });
  client.playbookSkills.file = vi.fn().mockResolvedValue({
    skillId: 'skill_0a',
    path: 'README.md',
    content: '',
    updatedAt: null,
  });
  client.arraysJwt.status = vi.fn().mockResolvedValue({
    exists: true,
    expiresAt: '2027-01-15T08:00:00.000Z',
    renewalNeeded: false,
    tier: 'PRO',
  });
  client.comments.create = vi.fn().mockResolvedValue(COMMENT);
  client.comments.pin = vi.fn().mockResolvedValue(COMMENT);
  client.comments.unpin = vi.fn().mockResolvedValue(COMMENT);
  client.v1.notifications.listFeed = vi
    .fn()
    .mockResolvedValue({ items: [], next_cursor: '', feed_path: '~/f' });
  client.notificationPreferences.get = vi
    .fn()
    .mockResolvedValue({ sessionCompleted: null });
  client.notificationPreferences.update = vi
    .fn()
    .mockResolvedValue({ sessionCompleted: false });
  client.feedback.submit = vi.fn().mockResolvedValue(aFeedback());
  client.v1.channelGroupSubscriptions.context = vi
    .fn()
    .mockResolvedValue({ subscriptions: [] });
  client.v1.channelGroupSubscriptions.list = vi
    .fn()
    .mockResolvedValue({ subscriptions: [] });
  client.v1.channelGroupSubscriptions.subscribe = vi
    .fn()
    .mockResolvedValue({ ok: true, subscriptions: [] });
  client.v1.channelGroupSubscriptions.unsubscribe = vi
    .fn()
    .mockResolvedValue({ ok: true, subscriptions: [] });
  client.remix.save = vi.fn().mockResolvedValue(aPlaybook());
  client.screenshot.capture = vi
    .fn()
    .mockResolvedValue(aScreenshot(encodeBase64(new Uint8Array(8))));
  client.functions.register = vi.fn().mockResolvedValue(playbookFunction());
  client.functions.list = vi.fn().mockResolvedValue({
    items: [playbookFunction({ name: 'analyze' })],
    nextPageToken: null,
  });
  client.functions.delete = vi.fn().mockResolvedValue(undefined);
  client.functions.invoke = vi.fn().mockResolvedValue(functionInvocation());
  client.functions.getAllowance = vi.fn().mockResolvedValue(allowance());
  client.functions.listAllowances = vi
    .fn()
    .mockResolvedValue({ items: [], nextPageToken: null });
  client.functions.createAllowance = vi.fn().mockResolvedValue(allowance());
  client.functions.revokeAllowance = vi.fn().mockResolvedValue(undefined);
  return client;
}

describe('CLI dispatch', () => {
  it('dispatches user me', async () => {
    const client = makeClient();
    const result = await dispatch(client, ['user', 'me']);
    expect(client.user.me).toHaveBeenCalled();
    expect(result).toEqual(aMe({ toolkitMinVersion: '0.1.0' }));
  });

  it('dispatches fs read with --path and prints UTF-8 bytes as text', async () => {
    const client = makeClient();
    expect(await dispatch(client, ['fs', 'read', '--path', '~/f'])).toBe(
      'hello'
    );
    expect(client.fs.read).toHaveBeenCalledWith(
      { path: '~/f' },
      { range: undefined }
    );
  });

  it('fs read turns --offset and --size into one byte range', async () => {
    const client = makeClient();
    await dispatch(client, [
      'fs',
      'read',
      '--path',
      '~/f',
      '--offset',
      '10',
      '--size',
      '5',
    ]);
    await dispatch(client, ['fs', 'read', '--path', '~/f', '--offset', '10']);
    await dispatch(client, ['fs', 'read', '--path', '~/f', '--size', '5']);
    expect(vi.mocked(client.fs.read).mock.calls.map((c) => c[1])).toEqual([
      { range: 'bytes=10-14' },
      { range: 'bytes=10-' },
      { range: 'bytes=0-4' },
    ]);
  });

  it('fs read prints bytes that are not UTF-8 as bytes', async () => {
    const client = makeClient();
    client.fs.read = vi
      .fn()
      .mockResolvedValue(fileContent(new Uint8Array([0xff, 0xfe])));
    const result = await dispatch(client, ['fs', 'read', '--path', '~/b']);
    expect(new Uint8Array(result as ArrayBuffer)).toEqual(
      new Uint8Array([0xff, 0xfe])
    );
  });

  it('fs read without an API key reads publicly through client.v1', async () => {
    const client = new AlvaClient({});
    client.v1.fs.read = vi.fn().mockResolvedValue('public');
    expect(
      await dispatch(client, ['fs', 'read', '--path', '/alva/home/a/f'])
    ).toBe('public');
    expect(client.v1.fs.read).toHaveBeenCalledWith({
      path: '/alva/home/a/f',
      offset: undefined,
      size: undefined,
    });
  });

  it('dispatches fs write --append for text data', async () => {
    const client = makeClient();
    await dispatch(client, [
      'fs',
      'write',
      '--path',
      '~/f',
      '--data',
      'next',
      '--append',
    ]);
    expect(client.fs.write).toHaveBeenCalledWith(
      { path: '~/f', mode: 'APPEND', mkdirParents: true },
      'next',
      { contentType: 'text/plain; charset=utf-8' }
    );
  });

  it('dispatches fs write --append for local file data', async () => {
    const mock = vi
      .mocked(fs.readFileSync)
      .mockReturnValue(Buffer.from('next'));
    const client = makeClient();
    await dispatch(client, [
      'fs',
      'write',
      '--path',
      '~/f',
      '--file',
      '/tmp/next.txt',
      '--append',
    ]);
    expect(client.fs.write).toHaveBeenCalledWith(
      { path: '~/f', mode: 'APPEND', mkdirParents: true },
      Buffer.from('next')
    );
    mock.mockReset();
  });

  it('dispatches deploy list with --limit and --cursor as the page query', async () => {
    const client = makeClient();
    await dispatch(client, [
      'deploy',
      'list',
      '--limit',
      '5',
      '--cursor',
      'p2',
    ]);
    expect(client.deploy.list).toHaveBeenCalledWith({
      pageSize: 5,
      pageToken: 'p2',
    });
  });

  it('dispatches deploy runs with --id and the opaque cursor unchanged', async () => {
    const client = makeClient();
    await dispatch(client, [
      'deploy',
      'runs',
      '--id',
      'cronjob_0c',
      '--first',
      '5',
      '--cursor',
      'next.page.token',
    ]);
    expect(client.deploy.listRuns).toHaveBeenCalledWith('cronjob_0c', {
      pageSize: 5,
      pageToken: 'next.page.token',
    });
  });

  it('dispatches deploy run-stats with --id', async () => {
    const client = makeClient();
    await dispatch(client, ['deploy', 'run-stats', '--id', 'cronjob_0c']);
    expect(client.deploy.runStats).toHaveBeenCalledWith('cronjob_0c');
  });

  it('dispatches deploy trigger with --id and returns the DispatchReceipt', async () => {
    const client = makeClient();
    const result = await dispatch(client, [
      'deploy',
      'trigger',
      '--id',
      'cronjob_0c',
    ]);
    expect(client.deploy.trigger).toHaveBeenCalledWith('cronjob_0c');
    expect(result).toEqual({ dispatchId: 'cronjob_dispatch_0d' });
  });

  it('dispatches deploy run-status with the dispatch of that cronjob', async () => {
    const client = makeClient();
    const result = await dispatch(client, [
      'deploy',
      'run-status',
      '--id',
      'cronjob_0c',
      '--workflow-run-id',
      'cronjob_dispatch_0d',
    ]);
    expect(client.deploy.getDispatch).toHaveBeenCalledWith(
      'cronjob_dispatch_0d'
    );
    expect(result).toEqual({
      id: 'cronjob_dispatch_0d',
      cronjobId: 'cronjob_0c',
      state: 'PENDING',
      run: null,
    });
    await expect(
      dispatch(client, [
        'deploy',
        'run-status',
        '--id',
        'cronjob_0other',
        '--workflow-run-id',
        'cronjob_dispatch_0d',
      ])
    ).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
  });

  it('dispatches deploy run-logs with --run-id', async () => {
    const client = makeClient();
    await dispatch(client, [
      'deploy',
      'run-logs',
      '--id',
      'cronjob_0c',
      '--run-id',
      'run_0r',
    ]);
    expect(client.deploy.getRunLogs).toHaveBeenCalledWith('run_0r');
  });

  it('dispatches schedule list through the explicit Channel scope, every page', async () => {
    const client = makeClient();
    expect(
      await dispatch(client, ['schedule', 'list', '--channel-id', 'channel_0x'])
    ).toEqual({ items: [aSchedule()], nextPageToken: null });
    expect(client.schedules.list).toHaveBeenCalledWith('channel_0x', {
      pageSize: 100,
      pageToken: undefined,
    });
    expect(client.schedules.agentChannelId).not.toHaveBeenCalled();
  });

  it('schedule put resolves the default Agent Channel and builds the PutScheduleBody', async () => {
    const client = makeClient();
    await dispatch(client, [
      'schedule',
      'put',
      '--name',
      'market-open',
      '--message',
      'Review the market open',
      '--cron',
      '30 9 * * 1-5',
      '--timezone',
      'America/New_York',
      '--starts-at',
      '2026-07-15T08:00:00-04:00',
      '--until',
      '2026-07-15T10:00:00-04:00',
      '--max-occurrences',
      '5',
    ]);
    expect(client.schedules.put).toHaveBeenCalledWith('channel_0ch', {
      name: 'market-open',
      message: 'Review the market open',
      rule: {
        kind: 'CRON',
        cron: '30 9 * * 1-5',
        timezone: 'America/New_York',
      },
      startsAt: '2026-07-15T12:00:00.000Z',
      endsAt: '2026-07-15T14:00:00.000Z',
      maxOccurrences: 5,
    });
  });

  it('schedule put sends --every in seconds and --after as an absolute AT', async () => {
    const client = makeClient();
    vi.useFakeTimers({ now: Date.parse('2026-07-15T12:00:00.250Z') });
    try {
      for (const rule of [
        ['--every', 'P1DT1H'],
        ['--after', 'PT90S'],
      ]) {
        await dispatch(client, [
          'schedule',
          'put',
          '--name',
          'n',
          '--message',
          'm',
          ...rule,
        ]);
      }
    } finally {
      vi.useRealTimers();
    }
    expect(
      vi.mocked(client.schedules.put).mock.calls.map((c) => c[1].rule)
    ).toEqual([
      { kind: 'EVERY', everySeconds: 90000 },
      { kind: 'AT', fireAt: '2026-07-15T12:01:31.000Z' },
    ]);
    await expect(
      dispatch(client, [
        'schedule',
        'put',
        '--name',
        'n',
        '--message',
        'm',
        '--every',
        'PT30S',
      ])
    ).rejects.toThrow(/at least 60 whole seconds/);
  });

  it('dispatches schedule lifecycle operations by the ID the name selects', async () => {
    const client = makeClient();
    await dispatch(client, ['schedule', 'pause', '--name', 'heartbeat']);
    await dispatch(client, ['schedule', 'resume', '--name', 'heartbeat']);
    expect(
      await dispatch(client, ['schedule', 'delete', '--name', 'heartbeat'])
    ).toEqual({});
    expect(client.schedules.list).toHaveBeenCalledWith('channel_0ch', {
      name: 'heartbeat',
    });
    expect(client.schedules.pause).toHaveBeenCalledWith('schedule_0s');
    expect(client.schedules.resume).toHaveBeenCalledWith('schedule_0s');
    expect(client.schedules.delete).toHaveBeenCalledWith('schedule_0s');
  });

  it('schedule put rejects mixed rules before the resource call', async () => {
    const client = makeClient();
    await expect(
      dispatch(client, [
        'schedule',
        'put',
        '--name',
        'mixed',
        '--message',
        'x',
        '--after',
        'PT1H',
        '--every',
        'PT1H',
      ])
    ).rejects.toThrow(/exactly one/);
    expect(client.schedules.put).not.toHaveBeenCalled();
    expect(client.schedules.agentChannelId).not.toHaveBeenCalled();
  });

  it('schedule put rejects timezone for non-cron rules', async () => {
    const client = makeClient();
    await expect(
      dispatch(client, [
        'schedule',
        'put',
        '--name',
        'heartbeat',
        '--message',
        'x',
        '--every',
        'PT1H',
        '--timezone',
        'UTC',
      ])
    ).rejects.toThrow(/only valid with --cron/);
    expect(client.schedules.put).not.toHaveBeenCalled();
    expect(client.schedules.agentChannelId).not.toHaveBeenCalled();
  });

  it('schedule put validates required fields before resolving the default channel', async () => {
    const client = makeClient();
    await expect(
      dispatch(client, [
        'schedule',
        'put',
        '--name',
        'missing-message',
        '--every',
        'PT1H',
      ])
    ).rejects.toThrow(/--message/);
    expect(client.schedules.agentChannelId).not.toHaveBeenCalled();
  });

  it('schedule put accepts lowercase RFC3339 timezone markers', async () => {
    const client = makeClient();
    await dispatch(client, [
      'schedule',
      'put',
      '--name',
      'lowercase-time',
      '--message',
      'x',
      '--at',
      '2026-08-11t04:00:00z',
    ]);
    expect(client.schedules.put).toHaveBeenCalledWith(
      'channel_0ch',
      expect.objectContaining({
        rule: { kind: 'AT', fireAt: '2026-08-11T04:00:00.000Z' },
      })
    );
  });

  it('sends the schedule body through the real resource and transport', async () => {
    const fake = fakeV2({
      'POST /channels/channel_0ch/schedules': () => aSchedule(),
    });
    try {
      const client = new AlvaClient({ apiKey: 'test-key' });
      await dispatch(client, [
        'schedule',
        'put',
        '--channel-id',
        'channel_0ch',
        '--name',
        'one-shot',
        '--message',
        'Run once',
        '--at',
        '2026-07-15T08:00:00-04:00',
      ]);
      expect(fake.calls[0].body).toEqual({
        name: 'one-shot',
        message: 'Run once',
        rule: { kind: 'AT', fireAt: '2026-07-15T12:00:00.000Z' },
      });
    } finally {
      fake.restore();
    }
  });

  it.each([
    ['until', '--until'],
    ['max occurrences', '--max-occurrences'],
  ])(
    'schedule put rejects an explicitly empty %s bound',
    async (_label, flag) => {
      const client = makeClient();
      await expect(
        dispatch(client, [
          'schedule',
          'put',
          '--name',
          'bounded',
          '--message',
          'x',
          '--every',
          'PT1H',
          flag,
          '',
        ])
      ).rejects.toThrow();
      expect(client.schedules.put).not.toHaveBeenCalled();
    }
  );

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

  it('secrets list reads every page into one page that ends the list', async () => {
    const client = makeClient();
    const second = aSecret({ id: 'secret_0k2', name: 'B' });
    client.secrets.list = vi
      .fn()
      .mockResolvedValueOnce({ items: [aSecret()], nextPageToken: 'p2' })
      .mockResolvedValueOnce({ items: [second], nextPageToken: null });
    expect(await dispatch(client, ['secrets', 'list'])).toEqual({
      items: [aSecret(), second],
      nextPageToken: null,
    });
    expect(vi.mocked(client.secrets.list).mock.calls).toEqual([
      [{ pageSize: 200, pageToken: undefined }],
      [{ pageSize: 200, pageToken: 'p2' }],
    ]);
  });

  it('secrets get reads the value through client.v1', async () => {
    const client = makeClient();
    expect(await dispatch(client, ['secrets', 'get', '--name', 'K'])).toEqual({
      name: 'K',
      value: 'V',
    });
    expect(client.v1.secrets.get).toHaveBeenCalledWith({ name: 'K' });
  });

  it('secrets delete finds the Secret ID by name', async () => {
    const client = makeClient();
    client.secrets.list = vi.fn().mockResolvedValue({
      items: [aSecret({ id: 'secret_0x', name: 'OTHER' }), aSecret()],
      nextPageToken: null,
    });
    expect(
      await dispatch(client, ['secrets', 'delete', '--name', 'KEY'])
    ).toEqual({});
    expect(client.secrets.delete).toHaveBeenCalledWith('secret_0k1');
    await expect(
      dispatch(client, ['secrets', 'delete', '--name', 'NOPE'])
    ).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
    expect(client.secrets.delete).toHaveBeenCalledTimes(1);
  });

  it('dispatches service-account grant with an upper-case permission', async () => {
    const client = makeClient();
    client.serviceAccount.grant = vi.fn().mockResolvedValue({});
    await dispatch(client, [
      'service-account',
      'grant',
      '--id',
      'account_0sa',
      '--path',
      '~/feeds/x/',
      '--permission',
      'read',
    ]);
    expect(client.serviceAccount.grant).toHaveBeenCalledWith('account_0sa', {
      path: '~/feeds/x/',
      permission: 'READ',
    });
  });

  it('dispatches service-account revoke by grant ID', async () => {
    const client = makeClient();
    client.serviceAccount.revoke = vi.fn().mockResolvedValue({});
    await dispatch(client, [
      'service-account',
      'revoke',
      '--id',
      'account_0sa',
      '--grant-id',
      'service_account_grant_0g',
    ]);
    expect(client.serviceAccount.revoke).toHaveBeenCalledWith(
      'account_0sa',
      'service_account_grant_0g'
    );
    await expect(
      dispatch(client, ['service-account', 'revoke', '--id', 'account_0sa'])
    ).rejects.toThrow(/--grant-id/);
  });

  it('dispatches run with --code', async () => {
    const client = makeClient();
    await dispatch(client, ['run', '--code', '1+1']);
    expect(client.run.execute).toHaveBeenCalledWith(
      expect.objectContaining({ code: '1+1' }),
      expect.anything()
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
      expect.objectContaining({ code: 'console.log("hello")' }),
      expect.anything()
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
    expect(client.run._executeSerializedArgs).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'require("env").args',
      }),
      '{"symbol":"BTC"}',
      expect.anything()
    );
    mock.mockReset();
  });

  it('preserves string IDs in run --args', async () => {
    const client = makeClient();
    const args = '{"channel_id":"2087608331744604161"}';
    await dispatch(client, ['run', '--code', '1+1', '--args', args]);
    expect(client.run._executeSerializedArgs).toHaveBeenCalledWith(
      expect.objectContaining({ code: '1+1' }),
      args,
      expect.anything()
    );
  });

  it('dispatches run with --args-stdin preserving exact large UTF-8 text', async () => {
    const client = makeClient();
    // Keep whitespace and escape spelling noncanonical so reserialization
    // would change the bytes and fail this boundary assertion.
    const args = `{
  "evidence": "${'\\u96ea'.repeat(150_000)}",
  "channel_id": "2087608331744604161"
}`;
    const readStdin = vi.fn().mockResolvedValue(args);

    await dispatch(
      client,
      ['run', '--code', 'require("env").args', '--args-stdin'],
      undefined,
      { readStdin }
    );

    expect(readStdin).toHaveBeenCalledTimes(1);
    expect(client.run._executeSerializedArgs).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'require("env").args' }),
      args,
      expect.anything()
    );
    expect(client.run.execute).not.toHaveBeenCalled();
  });

  it.each(['', '{bad', 'null', '[]', '{"channel_id":2087608331744604161}'])(
    'rejects invalid --args-stdin before dispatch: %s',
    async (args) => {
      const client = makeClient();
      const readStdin = vi.fn().mockResolvedValue(args);

      await expect(
        dispatch(client, ['run', '--code', '1+1', '--args-stdin'], undefined, {
          readStdin,
        })
      ).rejects.toThrow(/--args-stdin/);
      expect(readStdin).toHaveBeenCalledTimes(1);
      expect(client.run._executeSerializedArgs).not.toHaveBeenCalled();
      expect(client.run.execute).not.toHaveBeenCalled();
    }
  );

  it('rejects conflicting run argument transports before reading stdin', async () => {
    const client = makeClient();
    const readStdin = vi.fn().mockResolvedValue('{"symbol":"BTC"}');

    await expect(
      dispatch(
        client,
        ['run', '--code', '1+1', '--args', '{"symbol":"BTC"}', '--args-stdin'],
        undefined,
        { readStdin }
      )
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof CliUsageError &&
        error.command === 'run' &&
        error.message.includes('mutually exclusive')
    );
    expect(readStdin).not.toHaveBeenCalled();
    expect(client.run._executeSerializedArgs).not.toHaveBeenCalled();
  });

  it('rejects --args-stdin when the runtime has no stdin adapter', async () => {
    const client = makeClient();

    await expect(
      dispatch(client, ['run', '--code', '1+1', '--args-stdin'], undefined, {
        readStdin: undefined,
      })
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof CliUsageError &&
        error.command === 'run' &&
        error.message.includes('--args-stdin requires')
    );
    expect(client.run._executeSerializedArgs).not.toHaveBeenCalled();
  });

  it('rejects --args-stdin when an adapter returns no value', async () => {
    const client = makeClient();
    const readStdin = (() =>
      Promise.resolve(undefined)) as unknown as () => Promise<string>;

    await expect(
      dispatch(client, ['run', '--code', '1+1', '--args-stdin'], undefined, {
        readStdin,
      })
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof CliUsageError &&
        error.command === 'run' &&
        error.message.includes('JSON input')
    );
    expect(client.run._executeSerializedArgs).not.toHaveBeenCalled();
    expect(client.run.execute).not.toHaveBeenCalled();
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
      expect.objectContaining({ code: '1+1', maxHeapSizeMb: 512 }),
      expect.anything()
    );
  });

  it('dispatches run with the default timeout', async () => {
    const client = makeClient();
    await dispatch(client, ['run', '--code', '1+1']);
    expect(client.run.execute).toHaveBeenCalledWith(
      expect.objectContaining({ code: '1+1' }),
      { timeoutMs: DEFAULT_RUN_TIMEOUT_MS }
    );
  });

  it('dispatches run with --timeout-ms', async () => {
    const client = makeClient();
    await dispatch(client, ['run', '--code', '1+1', '--timeout-ms', '900000']);
    expect(client.run.execute).toHaveBeenCalledWith(
      expect.objectContaining({ code: '1+1' }),
      { timeoutMs: 900000 }
    );
    expect(setGlobalDispatcher).toHaveBeenCalledTimes(1);
    const dispatcher = vi.mocked(setGlobalDispatcher).mock.calls[0][0] as {
      options: unknown;
    };
    expect(dispatcher.options).toEqual({
      headersTimeout: 900000,
      bodyTimeout: 900000,
    });
  });

  it('uses ALVA_RUN_TIMEOUT_MS when --timeout-ms is absent', async () => {
    process.env.ALVA_RUN_TIMEOUT_MS = '750000';
    const client = makeClient();
    await dispatch(client, ['run', '--code', '1+1']);
    expect(client.run.execute).toHaveBeenCalledWith(
      expect.objectContaining({ code: '1+1' }),
      { timeoutMs: 750000 }
    );
  });

  it('lets --timeout-ms override ALVA_RUN_TIMEOUT_MS', async () => {
    process.env.ALVA_RUN_TIMEOUT_MS = '750000';
    const client = makeClient();
    await dispatch(client, ['run', '--code', '1+1', '--timeout-ms', '900000']);
    expect(client.run.execute).toHaveBeenCalledWith(
      expect.objectContaining({ code: '1+1' }),
      { timeoutMs: 900000 }
    );
  });

  it('omits maxHeapSizeMb when --max-heap-size-mb is not provided', async () => {
    const client = makeClient();
    await dispatch(client, ['run', '--code', '1+1']);
    expect(client.run.execute).toHaveBeenCalledWith(
      expect.objectContaining({ maxHeapSizeMb: undefined }),
      expect.anything()
    );
  });

  it('sends --working-dir with --code only, as 0.x did', async () => {
    const client = makeClient();
    await dispatch(client, [
      'run',
      '--entry-path',
      '~/s.js',
      '--working-dir',
      '~/w',
    ]);
    await dispatch(client, ['run', '--code', '1', '--working-dir', '~/w']);
    expect(vi.mocked(client.run.execute).mock.calls.map(([r]) => r)).toEqual([
      expect.objectContaining({ entryPath: '~/s.js', workingDir: undefined }),
      expect.objectContaining({ code: '1', workingDir: '~/w' }),
    ]);
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

  it('throws CliUsageError when --timeout-ms is non-integer', async () => {
    const client = makeClient();
    await expect(
      dispatch(client, ['run', '--code', '1+1', '--timeout-ms', '1.5'])
    ).rejects.toSatisfy(
      (err: unknown) => err instanceof CliUsageError && err.command === 'run'
    );
  });

  it('throws CliUsageError when ALVA_RUN_TIMEOUT_MS is invalid', async () => {
    process.env.ALVA_RUN_TIMEOUT_MS = 'nope';
    const client = makeClient();
    await expect(dispatch(client, ['run', '--code', '1+1'])).rejects.toSatisfy(
      (err: unknown) => err instanceof CliUsageError && err.command === 'run'
    );
  });

  describe('run result decoding', () => {
    function runResponse(returnValue: string, status = 'SUCCEEDED') {
      return {
        returnValue,
        logs: 'log line',
        durationMs: 7,
        status,
        error: status === 'FAILED' ? 'boom' : null,
      };
    }

    async function runWith(result: string, status?: string) {
      const client = makeClient();
      client.run.execute = vi
        .fn()
        .mockResolvedValue(runResponse(result, status));
      return (await dispatch(client, ['run', '--code', 'x'])) as Record<
        string,
        unknown
      >;
    }

    it('prints a returned object as an object, not a JSON string', async () => {
      const out = await runWith('{"rows":[1,2],"name":"BTC"}');
      expect(out.returnValue).toEqual({ rows: [1, 2], name: 'BTC' });
      expect(out).toMatchObject({
        logs: 'log line',
        durationMs: 7,
        status: 'SUCCEEDED',
      });
    });

    it('decodes a script that returned JSON.stringify(obj)', async () => {
      const once = JSON.stringify({ income: [{ q: 'Q1', v: 1.5 }] });
      const out = await runWith(JSON.stringify(once));
      expect(out.returnValue).toEqual({ income: [{ q: 'Q1', v: 1.5 }] });
    });

    it('decodes a script that stringified twice', async () => {
      const twice = JSON.stringify(JSON.stringify([{ a: 'x"y' }]));
      const out = await runWith(JSON.stringify(twice));
      expect(out.returnValue).toEqual([{ a: 'x"y' }]);
    });

    it.each([
      ['plain text', 'hello world'],
      ['numeric text', '42'],
      ['boolean text', 'true'],
      ['quoted text', '"quoted"'],
    ])('keeps a returned %s string as written', async (_name, value) => {
      const out = await runWith(JSON.stringify(value));
      expect(out.returnValue).toBe(value);
    });

    it('passes through a result that is not JSON', async () => {
      const out = await runWith('not json {');
      expect(out.returnValue).toBe('not json {');
    });

    it('decodes failed runs too and keeps the error', async () => {
      const out = await runWith('null', 'FAILED');
      expect(out).toMatchObject({
        returnValue: null,
        status: 'FAILED',
        error: 'boom',
      });
    });

    it('decodes the result for the embedded agent runtime', async () => {
      const client = makeClient();
      client.run.execute = vi
        .fn()
        .mockResolvedValue(runResponse(JSON.stringify('{"a":1}')));
      const out = (await dispatchEmbedded(client, [
        'run',
        '--code',
        'x',
      ])) as Record<string, unknown>;
      expect(out.returnValue).toEqual({ a: 1 });
    });
  });

  it('dispatches credits wallet', async () => {
    const client = makeClient();
    const result = await dispatch(client, ['credits', 'wallet']);
    expect(client.credits.wallet).toHaveBeenCalled();
    expect(result).toEqual({ balance: '100', todayUsed: '3', balances: [] });
  });

  it('rejects mixed markets earnings selectors', async () => {
    const client = makeClient();
    await expect(
      dispatch(client, [
        'markets',
        'earnings',
        '--ticker',
        'AAPL',
        '--event',
        'latest-completed',
        '--fiscal-year',
        '2026',
        '--fiscal-quarter',
        'Q3',
      ])
    ).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof CliUsageError && err.command === 'markets'
    );
  });

  it('rejects incomplete markets earnings fiscal periods', async () => {
    const client = makeClient();
    await expect(
      dispatch(client, [
        'markets',
        'earnings',
        '--ticker',
        'AAPL',
        '--fiscal-year',
        '2026',
      ])
    ).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof CliUsageError && err.command === 'markets'
    );
  });

  it('markets --help documents context evidence semantics', async () => {
    const client = makeClient();
    const result = (await dispatch(client, ['markets', '--help'])) as {
      _help: boolean;
      text: string;
    };
    const help = result.text.replace(/\s+/g, ' ');
    expect(help).toContain('Narrative is dated Alva analysis');
    expect(help).toContain('The preview is the dated expectation baseline');
    expect(help).toContain('the transcript holds management statements');
    expect(help).toContain("the recap is Alva's dated interpretation");
    expect(help).toContain('does not invalidate valid stages');
    expect(help).toContain('never replaced with a different quarter');
  });

  it('dispatches credits items with explicit ISO window and filters', async () => {
    const client = makeClient();
    await dispatch(client, [
      'credits',
      'items',
      '--start',
      '2026-06-23T00:00:00Z',
      '--end',
      '2026-06-24T00:00:00Z',
      '--session-id',
      'session_0abc',
      '--first',
      '10',
      '--after',
      'cursor-1',
    ]);
    expect(client.credits.entries).toHaveBeenCalledWith({
      from: '2026-06-23T00:00:00.000Z',
      to: '2026-06-24T00:00:00.000Z',
      sessionId: 'session_0abc',
      pageSize: 10,
      pageToken: 'cursor-1',
    });
  });

  it('dispatches credits items with date-only UTC window', async () => {
    const client = makeClient();
    await dispatch(client, [
      'credits',
      'items',
      '--start',
      '2026-06-23',
      '--end',
      '2026-06-24',
    ]);
    expect(client.credits.entries).toHaveBeenCalledWith({
      from: '2026-06-23T00:00:00.000Z',
      to: '2026-06-24T00:00:00.000Z',
      sessionId: undefined,
      pageSize: undefined,
      pageToken: undefined,
    });
  });

  it('dispatches credits items --today as the current UTC day', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-06-23T11:22:33Z'));
      const client = makeClient();
      await dispatch(client, ['credits', 'items', '--today', '--first', '3']);
      expect(client.credits.entries).toHaveBeenCalledWith({
        from: '2026-06-23T00:00:00.000Z',
        to: '2026-06-24T00:00:00.000Z',
        sessionId: undefined,
        pageSize: 3,
        pageToken: undefined,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('dispatches credits items --last duration from current time', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-06-23T11:22:33Z'));
      const client = makeClient();
      await dispatch(client, ['credits', 'items', '--last', '24h']);
      expect(client.credits.entries).toHaveBeenCalledWith({
        from: '2026-06-22T11:22:33.000Z',
        to: '2026-06-23T11:22:33.000Z',
        sessionId: undefined,
        pageSize: undefined,
        pageToken: undefined,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('throws CliUsageError when credits items window is missing', async () => {
    const client = makeClient();
    await expect(dispatch(client, ['credits', 'items'])).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof CliUsageError && err.command === 'credits'
    );
  });

  it('throws CliUsageError when credits items windows are combined', async () => {
    const client = makeClient();
    await expect(
      dispatch(client, [
        'credits',
        'items',
        '--today',
        '--start',
        '2026-06-23',
        '--end',
        '2026-06-24',
      ])
    ).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof CliUsageError && err.command === 'credits'
    );
  });

  it('throws CliUsageError when credits items --first is outside range', async () => {
    const client = makeClient();
    await expect(
      dispatch(client, ['credits', 'items', '--today', '--first', '501'])
    ).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof CliUsageError && err.command === 'credits'
    );
  });

  it('credits --help documents items window flags', async () => {
    const client = makeClient();
    const result = (await dispatch(client, ['credits', '--help'])) as {
      _help: boolean;
      text: string;
    };
    expect(result.text).toContain('--today');
    expect(result.text).toContain('--last');
    expect(result.text).toContain('--start');
    expect(result.text).toContain('no --user-id');
  });

  it('run --help documents --max-heap-size-mb', async () => {
    const client = makeClient();
    const result = (await dispatch(client, ['run', '--help'])) as {
      _help: boolean;
      text: string;
    };
    expect(result.text).toContain('--max-heap-size-mb');
    expect(result.text).toContain('--args-stdin');
    expect(result.text).toContain('--timeout-ms');
    expect(result.text).toContain('ALVA_RUN_TIMEOUT_MS');
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

  it('omits local file flags from the Slim Agent catalog', async () => {
    const cases: Array<{ argv: string[] }> = [
      { argv: ['run', '--local-file', './script.js'] },
      {
        argv: [
          'fs',
          'write',
          '--path',
          '~/library/script.js',
          '--file',
          './script.js',
        ],
      },
      {
        argv: [
          'playbooks',
          'functions',
          'register',
          '--playbook-id',
          '123',
          '--function-name',
          'analyze',
          '--entry-script-path',
          '~/playbooks/p/udf/analyze.js',
          '--params-schema-file',
          './schema.json',
        ],
      },
      {
        argv: [
          'playbooks',
          'screenshot',
          '--url',
          '/playbook/alice/p',
          '--out',
          'p.png',
        ],
      },
    ];

    for (const { argv } of cases) {
      await expect(
        dispatchEmbedded(makeClient(), argv, undefined, { runtime: 'jagent' })
      ).rejects.toSatisfy(
        (err: unknown) =>
          err instanceof CliUsageError &&
          err.message.includes('is not supported')
      );
    }
  });

  it('rejects screenshot --out in jagent mode before capturing', async () => {
    const client = makeClient();

    await expect(
      dispatchEmbedded(
        client,
        [
          'playbooks',
          'screenshot',
          '--url',
          '/playbook/alice/p',
          '--out',
          'p.png',
        ],
        undefined,
        { runtime: 'jagent' }
      )
    ).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof CliUsageError &&
        err.message.includes('--out is not supported')
    );
    expect(client.screenshot.capture).not.toHaveBeenCalled();
  });

  it('returns a tagged _image result for screenshot --base64', async () => {
    const client = makeClient();
    const jpeg = encodeBase64(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]));
    client.screenshot.capture = vi
      .fn()
      .mockResolvedValue({ contentType: 'image/jpeg', contentBase64: jpeg });
    const result = await dispatch(client, [
      'screenshot',
      '--url',
      'u',
      '--base64',
    ]);
    expect(result).toEqual({
      _image: true,
      mimeType: 'image/jpeg',
      data: jpeg,
      bytes: 4,
    });
  });

  it('applies default compression for screenshot --base64', async () => {
    const client = makeClient();
    client.screenshot.capture = vi
      .fn()
      .mockResolvedValue(
        aScreenshot(encodeBase64(new Uint8Array([0x89, 0x50, 0x4e, 0x47])))
      );
    await dispatch(client, ['screenshot', '--url', 'u', '--base64']);
    expect(client.screenshot.capture).toHaveBeenCalledWith(
      expect.objectContaining({
        compress: true,
        compressMaxWidth: 1280,
        compressQuality: 70,
      })
    );
  });

  it('honors explicit compress overrides for screenshot --base64', async () => {
    const client = makeClient();
    client.screenshot.capture = vi
      .fn()
      .mockResolvedValue(
        aScreenshot(encodeBase64(new Uint8Array([0x89, 0x50, 0x4e, 0x47])))
      );
    await dispatch(client, [
      'screenshot',
      '--url',
      'u',
      '--base64',
      '--compress-quality',
      '90',
      '--compress-max-width',
      '1920',
    ]);
    expect(client.screenshot.capture).toHaveBeenCalledWith(
      expect.objectContaining({
        compress: true,
        compressQuality: 90,
        compressMaxWidth: 1920,
      })
    );
  });

  it('opts out of compression with screenshot --base64 --full', async () => {
    const client = makeClient();
    client.screenshot.capture = vi
      .fn()
      .mockResolvedValue(
        aScreenshot(encodeBase64(new Uint8Array([0x89, 0x50, 0x4e, 0x47])))
      );
    await dispatch(client, ['screenshot', '--url', 'u', '--base64', '--full']);
    expect(client.screenshot.capture).toHaveBeenCalledWith(
      expect.objectContaining({ compress: false })
    );
  });

  it('honors explicit --no-compress in screenshot --base64', async () => {
    const client = makeClient();
    client.screenshot.capture = vi
      .fn()
      .mockResolvedValue(
        aScreenshot(encodeBase64(new Uint8Array([0x89, 0x50, 0x4e, 0x47])))
      );
    await dispatch(client, [
      'screenshot',
      '--url',
      'u',
      '--base64',
      '--no-compress',
    ]);
    expect(client.screenshot.capture).toHaveBeenCalledWith(
      expect.objectContaining({ compress: false })
    );
  });

  it('throws CliUsageError when screenshot has both --out and --base64', async () => {
    const client = makeClient();
    await expect(
      dispatch(client, ['screenshot', '--url', 'u', '--out', 'f', '--base64'])
    ).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof CliUsageError && err.command === 'screenshot'
    );
  });

  it('throws CliUsageError when screenshot has neither --out nor --base64', async () => {
    const client = makeClient();
    await expect(
      dispatch(client, ['screenshot', '--url', 'u'])
    ).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof CliUsageError && err.command === 'screenshot'
    );
  });

  it('writes file and returns {written,bytes} for screenshot --out', async () => {
    const client = makeClient();
    client.screenshot.capture = vi
      .fn()
      .mockResolvedValue(
        aScreenshot(encodeBase64(new Uint8Array([0x89, 0x50, 0x4e, 0x47])))
      );
    const writeSpy = vi
      .spyOn(fs, 'writeFileSync')
      .mockImplementation(() => undefined);
    try {
      const result = await dispatch(client, [
        'screenshot',
        '--url',
        'u',
        '--out',
        'f.png',
      ]);
      expect(result).toEqual({ written: 'f.png', bytes: 4 });
      expect(writeSpy).toHaveBeenCalled();
    } finally {
      writeSpy.mockRestore();
    }
  });

  it('throws CliUsageError for screenshot --base64 with empty bytes', async () => {
    const client = makeClient();
    client.screenshot.capture = vi.fn().mockResolvedValue(aScreenshot(''));
    await expect(
      dispatch(client, ['screenshot', '--url', 'u', '--base64'])
    ).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof CliUsageError && err.command === 'screenshot'
    );
  });

  it('dispatches feed delete', async () => {
    const client = makeClient();
    await dispatch(client, ['feed', 'delete', '--id', '42']);
    expect(client.feed.delete).toHaveBeenCalledWith('42');
  });

  it('dispatches feed list with filters', async () => {
    const client = makeClient();
    await dispatch(client, [
      'feed',
      'list',
      '--status',
      'all',
      '--limit',
      '20',
      '--cursor',
      'abc',
    ]);
    expect(client.feed.list).toHaveBeenCalledWith({
      status: undefined,
      pageSize: 20,
      pageToken: 'abc',
    });
    await dispatch(client, ['feed', 'list', '--status', 'PAUSED']);
    expect(client.feed.list).toHaveBeenLastCalledWith({
      status: 'PAUSED',
      pageSize: undefined,
      pageToken: undefined,
    });
  });

  it('prints the /api/v2 page for feed list, active feeds by default', async () => {
    const client = makeClient();
    const page = {
      items: [
        {
          id: 'automation_0a',
          name: 'btc-ema',
          status: 'ACTIVE',
          schedule: { cron: '0 * * * *', timezone: 'UTC' },
          flow: null,
          lastRunAt: null,
          totalRuns: 3,
          usedByCount: 1,
        },
      ],
      nextPageToken: 'next',
    };
    client.feed.list = vi.fn().mockResolvedValue(page);
    await expect(dispatch(client, ['feed', 'list'])).resolves.toEqual(page);
    expect(client.feed.list).toHaveBeenCalledWith({
      status: 'ACTIVE',
      pageSize: undefined,
      pageToken: undefined,
    });
  });

  it('dispatches feed stop', async () => {
    const client = makeClient();
    await dispatch(client, ['feed', 'stop', '--id', '42']);
    expect(client.feed.stop).toHaveBeenCalledWith('42');
  });

  it('dispatches feed resume', async () => {
    const client = makeClient();
    await dispatch(client, ['feed', 'resume', '--id', '42']);
    expect(client.feed.resume).toHaveBeenCalledWith('42');
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

  it('feed delete passes an opaque --id and rejects a padded one', async () => {
    const client = makeClient();
    await dispatch(client, ['feed', 'delete', '--id', 'automation_0abc']);
    expect(client.feed.delete).toHaveBeenCalledWith('automation_0abc');
    await expect(
      dispatch(client, ['feed', 'delete', '--id', ' automation_0abc'])
    ).rejects.toThrow("--id must be a feed ID for 'feed delete'");
  });

  it('dispatches feed set-visibility public', async () => {
    const client = makeClient();
    await dispatch(client, [
      'feed',
      'set-visibility',
      '--id',
      '42',
      '--visibility',
      'public',
    ]);
    expect(client.feed.setVisibility).toHaveBeenCalledWith('42', 'PUBLIC');
  });

  it('dispatches feed set-visibility private', async () => {
    const client = makeClient();
    await dispatch(client, [
      'feed',
      'set-visibility',
      '--id',
      '42',
      '--visibility',
      'private',
    ]);
    expect(client.feed.setVisibility).toHaveBeenCalledWith('42', 'PRIVATE');
  });

  it('feed set-visibility requires --id', async () => {
    const client = makeClient();
    await expect(
      dispatch(client, ['feed', 'set-visibility', '--visibility', 'public'])
    ).rejects.toThrow("--id is required for 'feed set-visibility'");
  });

  it('feed set-visibility requires --visibility', async () => {
    const client = makeClient();
    await expect(
      dispatch(client, ['feed', 'set-visibility', '--id', '42'])
    ).rejects.toThrow("--visibility is required for 'feed set-visibility'");
    expect(client.feed.setVisibility).not.toHaveBeenCalled();
  });

  it('feed set-visibility rejects an invalid --visibility value', async () => {
    const client = makeClient();
    await expect(
      dispatch(client, [
        'feed',
        'set-visibility',
        '--id',
        '42',
        '--visibility',
        'publc',
      ])
    ).rejects.toThrow(
      "--visibility must be one of public, private for 'feed set-visibility', got 'publc'"
    );
    expect(client.feed.setVisibility).not.toHaveBeenCalled();
  });

  it('renders automation list as readable text by default', async () => {
    const client = makeClient();
    const result = await dispatch(client, [
      'automation',
      'list',
      '--status',
      'all',
      '--limit',
      '20',
      '--cursor',
      'abc',
    ]);
    expect(client.automation.list).toHaveBeenCalledWith({
      status: undefined,
      pageSize: 20,
      pageToken: 'abc',
    });
    expect(result).toEqual(expect.stringContaining('1 automation(s):'));
    expect(result).toEqual(expect.stringContaining('btc-ema  [ACTIVE]'));
    expect(result).toEqual(expect.stringContaining('schedule: 0 * * * *'));
    expect(result).toEqual(expect.stringContaining('used by: 1'));
    expect(result).toEqual(expect.stringContaining('nextPageToken: next'));
  });

  it('returns raw automation list with --json', async () => {
    const client = makeClient();
    const result = await dispatch(client, ['automation', 'list', '--json']);
    expect(result).toEqual(
      await vi.mocked(client.automation.list).mock.results[0].value
    );
    expect(result).toMatchObject({ nextPageToken: 'next' });
  });

  it('renders automation inspect as readable text by default', async () => {
    const client = makeClient();
    const result = await dispatch(client, [
      'automation',
      'inspect',
      '--id',
      '42',
    ]);
    expect(client.automation.inspect).toHaveBeenCalledWith('42');
    expect(result).toEqual(expect.stringContaining('portfolio-watch'));
    expect(result).toEqual(expect.stringContaining('runs: 5'));
    expect(result).toEqual(
      expect.stringContaining('schedule: 0 9 * * * (UTC)')
    );
    expect(result).toEqual(expect.stringContaining('flow id: portfolio_watch'));
    expect(result).toEqual(
      expect.stringContaining(
        'flow config path: /alva/home/alice/memory/profile/portfolio_watch/portfolio-watch.yaml'
      )
    );
  });

  it('returns raw automation inspect with --json', async () => {
    const client = makeClient();
    const result = await dispatch(client, [
      'automation',
      'inspect',
      '--id',
      '42',
      '--json',
    ]);
    expect(result).toEqual(anAutomation());
  });

  it('dispatches automation publish', async () => {
    const client = makeClient();
    await dispatch(client, [
      'automation',
      'publish',
      '--name',
      'btc',
      '--version',
      '1.0',
      '--cronjob-id',
      'cronjob_05',
      '--view-json',
      '{"chart":"line"}',
      '--description',
      'BTC signal',
      '--changelog',
      'Initial',
      '--agent-type',
      'alpi',
      '--skip-auto-trigger',
    ]);
    expect(client.automation.publish).toHaveBeenCalledWith({
      name: 'btc',
      version: '1.0',
      cronjobId: 'cronjob_05',
      viewJson: '{"chart":"line"}',
      description: 'BTC signal',
      changelog: 'Initial',
      agentType: 'alpi',
      skipFirstRun: true,
    });
  });

  it('documents automation publish side effects and their run opt-out', async () => {
    const client = makeClient();
    const result = (await dispatch(client, ['automation', '--help'])) as {
      _help: boolean;
      text: string;
    };
    expect(result.text).toContain('--skip-auto-trigger');
    expect(result.text).toContain('owner alert binding');
    expect(result.text).toContain('first producer run');
  });

  it('dispatches an ID-scoped automation update', async () => {
    const client = makeClient();
    await dispatch(client, [
      'automation',
      'update',
      '--id',
      '2077624515435917312',
      '--version',
      '1.0.1',
      '--cronjob-id',
      'cronjob_0c',
      '--description=updated',
      '--changelog=republished',
      '--agent-type',
      'alpi',
      '--trigger',
    ]);
    expect(client.automation.update).toHaveBeenCalledWith(
      '2077624515435917312',
      {
        version: '1.0.1',
        cronjobId: 'cronjob_0c',
        description: 'updated',
        changelog: 'republished',
        agentType: 'alpi',
        triggerRun: true,
      }
    );
  });

  it('preserves an explicit empty automation metadata value', async () => {
    const client = makeClient();
    await dispatch(client, [
      'automation',
      'update',
      '--id',
      '42',
      '--description=',
    ]);
    expect(client.automation.update).toHaveBeenCalledWith('42', {
      version: undefined,
      cronjobId: undefined,
      description: '',
      changelog: undefined,
      agentType: undefined,
      triggerRun: undefined,
    });
  });

  it('rejects a no-op automation update', async () => {
    const client = makeClient();
    await expect(
      dispatch(client, ['automation', 'update', '--id', '42'])
    ).rejects.toThrow(
      'automation update requires at least one field or --trigger'
    );
    expect(client.automation.update).not.toHaveBeenCalled();
  });

  it('gets and partially updates automation delivery destinations', async () => {
    const client = makeClient();

    await dispatch(client, ['automation', 'delivery', 'get', '--id', '42']);
    await dispatch(client, [
      'automation',
      'delivery',
      'update',
      '--id',
      '42',
      '--no-email-enabled',
    ]);
    await dispatch(client, [
      'automation',
      'delivery',
      'update',
      '--id',
      '42',
      '--alva-channel-ids=',
    ]);

    expect(client.automation.delivery.get).toHaveBeenCalledWith('42');
    expect(client.automation.delivery.update).toHaveBeenNthCalledWith(1, '42', {
      channelIds: undefined,
      email: false,
    });
    expect(client.automation.delivery.update).toHaveBeenNthCalledWith(2, '42', {
      channelIds: [],
      email: undefined,
    });
  });

  it('automation delivery update resolves the Agent channel alias 0', async () => {
    const client = makeClient();
    await dispatch(client, [
      'automation',
      'delivery',
      'update',
      '--id',
      '42',
      '--alva-channel-ids',
      '0,channel_0x,channel_0ch',
    ]);
    expect(client.schedules.agentChannelId).toHaveBeenCalledTimes(1);
    expect(client.automation.delivery.update).toHaveBeenCalledWith('42', {
      channelIds: ['channel_0ch', 'channel_0x'],
      email: undefined,
    });
  });

  it('rejects a no-op automation delivery update', async () => {
    const client = makeClient();
    await expect(
      dispatch(client, ['automation', 'delivery', 'update', '--id', '42'])
    ).rejects.toThrow('automation delivery update requires');
    expect(client.automation.delivery.update).not.toHaveBeenCalled();
  });

  it('validates the required delivery automation id before patch fields', async () => {
    const client = makeClient();
    await expect(
      dispatch(client, ['automation', 'delivery', 'update'])
    ).rejects.toThrow("--id is required for 'automation delivery update'");
    expect(client.automation.delivery.update).not.toHaveBeenCalled();
  });

  it('dispatches automation lifecycle commands', async () => {
    const client = makeClient();
    await dispatch(client, ['automation', 'stop', '--id', 'automation_0a']);
    await dispatch(client, ['automation', 'resume', '--id', 'automation_0b']);
    await dispatch(client, ['automation', 'delete', '--id', 'automation_0c']);
    expect(client.automation.stop).toHaveBeenCalledWith('automation_0a');
    expect(client.automation.resume).toHaveBeenCalledWith('automation_0b');
    expect(client.automation.delete).toHaveBeenCalledWith('automation_0c');
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
      query: 'scanner',
      tags: ['macro', 'ai'],
      orderBy: 'NEWEST',
      pageSize: 5,
      pageToken: 'abc',
    });
  });

  it('reads keyless playbooks trending from client.v1 with the 0.x output', async () => {
    const client = new AlvaClient({});
    const v1 = { playbooks: [], has_next: false };
    const trending = vi
      .spyOn(client.v1.playbooks, 'trending')
      .mockResolvedValue(v1);
    const v2 = vi.spyOn(client.playbooks, 'trending');

    await expect(
      dispatch(client, ['playbooks', 'trending', '--sort', 'follows', '--json'])
    ).resolves.toEqual(v1);
    expect(trending).toHaveBeenCalledWith(
      expect.objectContaining({ sort: 'FOLLOWS' })
    );
    expect(v2).not.toHaveBeenCalled();
  });

  it('dispatches functions register with inline params schema', async () => {
    const client = makeClient();
    await dispatch(client, [
      'functions',
      'register',
      '--playbook-id',
      'playbook_0abc',
      '--function-name',
      'analyze',
      '--entry-script-path',
      '/alva/home/alice/playbooks/my-playbook/udf/analyze.js',
      '--params-schema',
      '{"type":"object"}',
      '--no-allow-charges',
    ]);
    expect(client.functions.register).toHaveBeenCalledWith('playbook_0abc', {
      name: 'analyze',
      entryScriptPath: '/alva/home/alice/playbooks/my-playbook/udf/analyze.js',
      paramsSchema: '{"type":"object"}',
      allowCharges: false,
    });
  });

  it('dispatches functions register with --run-as-service-account', async () => {
    const client = makeClient();
    await dispatch(client, [
      'functions',
      'register',
      '--playbook-id',
      'playbook_0abc',
      '--function-name',
      'analyze',
      '--entry-script-path',
      '/alva/home/alice/playbooks/my-playbook/udf/analyze.js',
      '--run-as-service-account',
      'account_0sa',
    ]);
    expect(client.functions.register).toHaveBeenCalledWith(
      'playbook_0abc',
      expect.objectContaining({ runAsAccountId: 'account_0sa' })
    );
  });

  it('refuses --clear-run-as for functions register, which /api/v2 cannot clear', async () => {
    const client = makeClient();
    await expect(
      dispatch(client, [
        'functions',
        'register',
        '--playbook-id',
        'playbook_0abc',
        '--function-name',
        'analyze',
        '--entry-script-path',
        '/alva/home/alice/playbooks/my-playbook/udf/analyze.js',
        '--clear-run-as',
      ])
    ).rejects.toThrow(/--clear-run-as is not available/);
    expect(client.functions.register).not.toHaveBeenCalled();
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
      'playbook_0abc',
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
      'playbook_0abc',
      expect.objectContaining({
        paramsSchema: '{"type":"object"}',
        allowCharges: true,
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
        'playbook_0abc',
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
    await dispatch(client, [
      'functions',
      'list',
      '--playbook-id',
      'playbook_0abc',
    ]);
    expect(client.functions.list).toHaveBeenCalledWith('playbook_0abc', {
      pageSize: 100,
    });
  });

  it('dispatches functions delete', async () => {
    const client = makeClient();
    await dispatch(client, [
      'functions',
      'delete',
      '--playbook-id',
      'playbook_0abc',
      '--function-name',
      'analyze',
    ]);
    expect(client.functions.list).toHaveBeenCalledWith('playbook_0abc', {
      name: 'analyze',
    });
    expect(client.functions.delete).toHaveBeenCalledWith(FUNCTION);
  });

  it('dispatches functions invoke with params JSON', async () => {
    const client = makeClient();
    await dispatch(client, [
      'functions',
      'invoke',
      '--playbook-id',
      'playbook_0abc',
      '--function-name',
      'analyze',
      '--params',
      '{"ticker":"AAPL"}',
    ]);
    expect(client.functions.invoke).toHaveBeenCalledWith(FUNCTION, {
      parametersJson: '{"ticker":"AAPL"}',
    });
  });

  it('refuses functions invoke params that are not an object, and a missing function', async () => {
    const client = makeClient();
    const invoke = [
      'functions',
      'invoke',
      '--playbook-id',
      'playbook_0abc',
      '--function-name',
      'analyze',
    ];
    await expect(
      dispatch(client, [...invoke, '--params', '[1]'])
    ).rejects.toThrow("--params must be a JSON object for 'functions invoke'");
    client.functions.list = vi
      .fn()
      .mockResolvedValue({ items: [], nextPageToken: null });
    await expect(dispatch(client, invoke)).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Playbook playbook_0abc has no function named analyze',
    });
    expect(client.functions.invoke).not.toHaveBeenCalled();
  });

  it('functions invoke rejects invalid params JSON', async () => {
    const client = makeClient();
    await expect(
      dispatch(client, [
        'functions',
        'invoke',
        '--playbook-id',
        'playbook_0abc',
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
      'playbook_0abc',
    ]);
    expect(client.functions.getAllowance).toHaveBeenCalledWith('playbook_0abc');
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
      'playbook_0abc',
      '--amount',
      '25',
    ]);
    expect(client.functions.createAllowance).toHaveBeenCalledWith({
      playbookId: 'playbook_0abc',
      credits: '25',
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
        'playbook_0abc',
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
      'playbook_0abc',
    ]);
    expect(client.functions.getAllowance).toHaveBeenCalledWith('playbook_0abc');
    expect(client.functions.revokeAllowance).toHaveBeenCalledWith(
      'allowance_0a1'
    );
    client.functions.getAllowance = vi.fn().mockResolvedValue(null);
    await expect(
      dispatch(client, [
        'functions',
        'allowance',
        'revoke',
        '--playbook-id',
        'playbook_0abc',
      ])
    ).resolves.toBeUndefined();
    expect(client.functions.revokeAllowance).toHaveBeenCalledTimes(1);
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
      'cronjob_05',
      '--skip-auto-trigger',
    ]);
    expect(client.release.feed).toHaveBeenCalledWith({
      name: 'btc',
      version: '1.0',
      cronjobId: 'cronjob_05',
      skipFirstRun: true,
    });
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
      '[{"automationId":"automation_0a","major":2}]',
    ]);
    expect(client.release.playbookDraft).toHaveBeenCalledWith({
      slug: 'btc-dashboard',
      title: 'BTC Trend Dashboard',
      automations: [{ automationId: 'automation_0a', major: 2 }],
    });
  });

  it('refuses 0.x --feeds members before any request', async () => {
    const client = makeClient();
    await expect(
      dispatch(client, [
        'release',
        'playbook-draft',
        '--name',
        'btc-dashboard',
        '--display-name',
        'BTC',
        '--feeds',
        '[{"feed_id":"automation_0a"}]',
      ])
    ).rejects.toThrow(
      /--feeds must be a JSON array of \{automationId, major\?\}/
    );
    expect(client.release.playbookDraft).not.toHaveBeenCalled();
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
      '[{"automationId":"automation_0a","major":2}]',
      '--skill-id',
      'alva/screener',
    ]);
    expect(client.playbookSkills.get).toHaveBeenCalledWith('alva/screener');
    expect(client.release.playbookDraft).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'btc-dashboard', skillId: 'skill_0a' })
    );

    await dispatch(client, [
      'release',
      'playbook-draft',
      '--name',
      'btc-dashboard',
      '--display-name',
      'BTC Trend Dashboard',
      '--feeds',
      '[]',
      '--skill-id',
      'skill_0b',
    ]);
    expect(client.playbookSkills.get).toHaveBeenCalledTimes(1);
    expect(client.release.playbookDraft).toHaveBeenLastCalledWith(
      expect.objectContaining({ automations: [], skillId: 'skill_0b' })
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
        '[{"automationId":"automation_0a","major":2}]',
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
        '[{"automationId":"automation_0a","major":2}]',
        '--changelog',
        'Initial release',
      ])
    ).rejects.toThrow(/readme-url/);
  });

  it.each([
    [false, [], undefined],
    [false, ['--confirm-bundled-feed-exposure=false'], false],
    [false, ['--confirm-bundled-feed-exposure'], true],
    [true, [], undefined],
    [true, ['--confirm-bundled-feed-exposure=false'], false],
    [true, ['--confirm-bundled-feed-exposure'], true],
  ] as const)(
    'dispatches playbook release (embedded=%s) with flags %j',
    async (embedded, confirmationFlags, confirmation) => {
      const client = makeClient();
      // The release-playbook code path now hard-gates on the design linter,
      // which (a) reads ~/playbooks/<name>/index.html via ALFS and
      // (b) fetches the active design contract from the CDN. Stub both so
      // the test stays hermetic.
      client.fs.read = vi
        .fn()
        .mockResolvedValue(
          fileContent(
            '<html><head><style>body{font-family:Delight}</style></head>' +
              '<body><div class="playbook-container"><p>ok</p></div></body></html>'
          )
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
      await (embedded ? dispatchEmbedded : dispatch)(client, [
        ...(embedded ? ['playbooks', 'release'] : ['release', 'playbook']),
        '--name',
        'btc-dashboard',
        '--version',
        'v1.0.0',
        '--feeds',
        '[{"automationId":"automation_0a","major":2}]',
        '--changelog',
        'Initial release',
        '--readme-url',
        '/alva/home/alice/playbooks/btc-dashboard/README.md',
        ...confirmationFlags,
      ]);
      expect(client.playbooks.getBySlug).toHaveBeenCalledWith(
        'alice',
        'btc-dashboard'
      );
      expect(client.release.playbook).toHaveBeenCalledWith('playbook_0abc', {
        version: 'v1.0.0',
        automations: [{ automationId: 'automation_0a', major: 2 }],
        changelog: 'Initial release',
        readmePath: '/alva/home/alice/playbooks/btc-dashboard/README.md',
        confirmBundledFeedExposure: confirmation,
      });
      expect(client.fs.read).toHaveBeenCalledWith({
        path: '~/playbooks/btc-dashboard/index.html',
      });
      fetchSpy.mockRestore();
    }
  );

  it('dispatches sdk partitions', async () => {
    const client = makeClient();
    const first = { id: 'sdk_partition_0a', name: 'feed_widgets' };
    const second = { id: 'sdk_partition_0b', name: 'unified_search' };
    client.sdk.partitions = vi
      .fn()
      .mockResolvedValueOnce({ items: [first], nextPageToken: 'p2' })
      .mockResolvedValueOnce({ items: [second], nextPageToken: null });
    await expect(dispatch(client, ['sdk', 'partitions'])).resolves.toEqual({
      items: [first, second],
      nextPageToken: null,
    });
    expect(client.sdk.partitions).toHaveBeenNthCalledWith(1, {
      pageSize: 100,
      pageToken: undefined,
    });
    expect(client.sdk.partitions).toHaveBeenNthCalledWith(2, {
      pageSize: 100,
      pageToken: 'p2',
    });
  });

  it('dispatches sdk doc with --name', async () => {
    const client = makeClient();
    await dispatch(client, ['sdk', 'doc', '--name', 'ohlcv']);
    expect(client.sdk.doc).toHaveBeenCalledWith('ohlcv');
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
    expect(client.playbooks.getBySlug).toHaveBeenCalledWith('alice', 'pb');
    expect(client.comments.create).toHaveBeenCalledWith('playbook_0abc', {
      body: 'Nice!',
      parentId: undefined,
    });
  });

  it('dispatches notification-history list-feed', async () => {
    const client = makeClient();
    vi.mocked(client.v1.notifications.listFeed).mockResolvedValueOnce({
      items: [
        {
          id: '1',
          event_type: 'feed_alert_ready',
          user_id: '7',
          channel: 'telegram',
          status: 'sent',
          created_at: 1777355703,
          feed_id: '42',
        },
      ],
      next_cursor: '',
      feed_path: '~/f',
    });
    const result = (await dispatch(client, [
      'notification-history',
      'list-feed',
      '--username',
      'alice',
      '--name',
      'btc-ema',
      '--delivery-provider',
      'telegram',
      '--since',
      '2023-11-14T22:13:20Z',
    ])) as { items: Array<Record<string, unknown>> };
    expect(client.v1.notifications.listFeed).toHaveBeenCalledWith({
      username: 'alice',
      name: 'btc-ema',
      channel: 'telegram',
      status: undefined,
      since_time: 1700000000,
      first: undefined,
      cursor: undefined,
    });
    expect(result.items[0]).toMatchObject({ delivery_provider: 'telegram' });
    expect(result.items[0]!.channel).toBeUndefined();
  });

  it('rejects the legacy notification-history --channel flag', async () => {
    const client = makeClient();
    await expect(
      dispatch(client, [
        'notification-history',
        'list-feed',
        '--username',
        'alice',
        '--name',
        'btc-ema',
        '--channel',
        'telegram',
      ])
    ).rejects.toThrow(
      /--channel is no longer supported.*use --delivery-provider/
    );
    expect(client.v1.notifications.listFeed).not.toHaveBeenCalled();
  });

  it('refuses a Unix-seconds notification-history --since, naming the change', async () => {
    const client = makeClient();
    await expect(
      dispatch(client, [
        'notification-history',
        'list-feed',
        '--username',
        'alice',
        '--name',
        'btc-ema',
        '--since',
        '1700000000',
      ])
    ).rejects.toThrow(
      /--since takes an RFC 3339 time .* since toolkit 1\.0; Unix timestamps are no longer accepted/
    );
    expect(client.v1.notifications.listFeed).not.toHaveBeenCalled();
  });

  it('dispatches notification-preferences list', async () => {
    const client = makeClient();
    expect(
      await dispatch(client, ['notification-preferences', 'list'])
    ).toEqual({ sessionCompleted: null });
    expect(client.notificationPreferences.get).toHaveBeenCalled();
  });

  it('dispatches notification-preferences disable-session-completed', async () => {
    const client = makeClient();
    await dispatch(client, [
      'notification-preferences',
      'disable-session-completed',
    ]);
    expect(client.notificationPreferences.update).toHaveBeenCalledWith({
      sessionCompleted: false,
    });
  });

  it('dispatches notification-preferences enable-session-completed', async () => {
    const client = makeClient();
    await dispatch(client, [
      'notification-preferences',
      'enable-session-completed',
    ]);
    expect(client.notificationPreferences.update).toHaveBeenCalledWith({
      sessionCompleted: true,
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
      category: 'RUNTIME',
      severity: 'HIGH',
      summary: 'runtime failed',
      details: 'command returned a platform error',
      evidence: { command: 'alva run foo.js' },
      context: { session_id: 's1' },
    });
    expect(result).toEqual(aFeedback());
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
    expect(result).toEqual(aFeedback());
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

  it('rejects the removed channel command', async () => {
    const client = makeClient('123', 'channel_group');
    await expect(dispatch(client, ['channel', '--help'])).rejects.toThrow(
      "Unknown command: 'channel'"
    );
    await expect(
      dispatch(client, ['channel', 'group-subscriptions', 'list'])
    ).rejects.toThrow("Unknown command: 'channel'");
    expect(client.v1.channelGroupSubscriptions.list).not.toHaveBeenCalled();
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
    expect(vi.mocked(client.playbooks.getBySlug).mock.calls).toEqual([
      ['alice', 'my-pb'],
      ['bob', 'src'],
    ]);
    expect(client.remix.save).toHaveBeenCalledWith('playbook_0abc', [
      'playbook_0abc',
    ]);
    await expect(
      dispatch(client, [
        'remix',
        '--child-username',
        'alice',
        '--child-name',
        'my-pb',
        '--parents',
        '["bob/src"]',
      ])
    ).rejects.toThrow(/--parents must be a JSON array of \{username, name\}/);
    expect(client.remix.save).toHaveBeenCalledTimes(1);
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
    expect(client.deploy.create).toHaveBeenCalledWith({
      name: 'j',
      entryPath: '~/j.js',
      cronExpression: '* * * * *',
      argsJson: undefined,
      pushNotify: false,
      maxHeapSizeMb: undefined,
      executionTimeoutSeconds: undefined,
      runAsAccountId: undefined,
    });
  });

  it('preserves string IDs in deploy create --args', async () => {
    const client = makeClient();
    const args = '{"channel_id":"2087608331744604161"}';
    await dispatch(client, [
      'deploy',
      'create',
      '--name',
      'j',
      '--path',
      '~/j.js',
      '--cron',
      '* * * * *',
      '--args',
      args,
    ]);
    expect(client.deploy.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'j', argsJson: args })
    );
  });

  it.each([
    '{"channel_id":2087608331744604161}',
    '{"channel_id":9.007199254740992e15}',
    '{"nested":[{"channel_id":2087608331744604161}]}',
    'null',
    '[]',
  ])('rejects unsafe run --args before dispatch: %s', async (args) => {
    const client = makeClient();
    await expect(
      dispatch(client, ['run', '--code', '1+1', '--args', args])
    ).rejects.toThrow();
    expect(client.run._executeSerializedArgs).not.toHaveBeenCalled();
  });

  it('dispatches deploy create with --run-as-service-account', async () => {
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
      '--run-as-service-account',
      'account_0sa',
    ]);
    expect(client.deploy.create).toHaveBeenCalledWith(
      expect.objectContaining({ runAsAccountId: 'account_0sa' })
    );
  });

  it('dispatches deploy create with --execution-timeout-seconds', async () => {
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
      '--execution-timeout-seconds',
      '3600',
    ]);
    expect(client.deploy.create).toHaveBeenCalledWith(
      expect.objectContaining({ executionTimeoutSeconds: 3600 })
    );
  });

  it('dispatches deploy update with --execution-timeout-seconds', async () => {
    const client = makeClient();
    await dispatch(client, [
      'deploy',
      'update',
      '--id',
      '5',
      '--execution-timeout-seconds',
      '900',
    ]);
    expect(client.deploy.update).toHaveBeenCalledWith(
      '5',
      expect.objectContaining({ executionTimeoutSeconds: 900 })
    );
  });

  it.each(['0', '3601', '1.5'])(
    'rejects deploy execution timeout %s outside the integer range',
    async (value) => {
      const client = makeClient();
      await expect(
        dispatch(client, [
          'deploy',
          'update',
          '--id',
          '5',
          '--execution-timeout-seconds',
          value,
        ])
      ).rejects.toThrow(/execution-timeout-seconds/);
      expect(client.deploy.update).not.toHaveBeenCalled();
    }
  );

  // Security: --run-as-service-account 0 must FAIL, not reach deploy update as
  // "0", which clears run_as and runs the job with the owner's full privileges
  // (Codex #113 P1); --clear-run-as says that explicitly.
  it('rejects --run-as-service-account 0 (deploy update)', async () => {
    const client = makeClient();
    await expect(
      dispatch(client, [
        'deploy',
        'update',
        '--id',
        '5',
        '--run-as-service-account',
        '0',
      ])
    ).rejects.toThrow(/run-as-service-account/);
    expect(client.deploy.update).not.toHaveBeenCalled();
  });

  it('rejects an empty or 0 --run-as-service-account (functions register)', async () => {
    const client = makeClient();
    // "0" cleared run_as in 0.x; /api/v2 has no clear, so it must not pass.
    for (const value of ['', '0']) {
      await expect(
        dispatch(client, [
          'functions',
          'register',
          '--playbook-id',
          'playbook_0abc',
          '--function-name',
          'analyze',
          '--entry-script-path',
          '/alva/home/alice/playbooks/my-playbook/udf/analyze.js',
          '--run-as-service-account',
          value,
        ])
      ).rejects.toThrow(/run-as-service-account/);
    }
    expect(client.functions.register).not.toHaveBeenCalled();
  });

  it('deploy update --clear-run-as clears runAsAccountId with null', async () => {
    const client = makeClient();
    await dispatch(client, ['deploy', 'update', '--id', '5', '--clear-run-as']);
    expect(client.deploy.update).toHaveBeenCalledWith(
      '5',
      expect.objectContaining({ runAsAccountId: null })
    );
    await dispatch(client, ['deploy', 'update', '--id', '5', '--name', 'n']);
    expect(vi.mocked(client.deploy.update).mock.calls[1][1]).toMatchObject({
      name: 'n',
      runAsAccountId: undefined,
    });
  });

  it('rejects --clear-run-as together with --run-as-service-account', async () => {
    const client = makeClient();
    await expect(
      dispatch(client, [
        'deploy',
        'update',
        '--id',
        '5',
        '--clear-run-as',
        '--run-as-service-account',
        '90123',
      ])
    ).rejects.toThrow(/mutually exclusive/);
    expect(client.deploy.update).not.toHaveBeenCalled();
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

  it('throws CliUsageError with command="deploy" when --id is blank for deploy get', async () => {
    const client = makeClient();
    await expect(
      dispatch(client, ['deploy', 'get', '--id', ' '])
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

  it('rejects unknown flags before invoking a leaf command', async () => {
    const client = makeClient();
    await expect(
      dispatch(client, ['whoami', '--profiel', 'staging'])
    ).rejects.toThrow(/--profiel is not supported for 'whoami'.*--profile/);
    expect(client.user.me).not.toHaveBeenCalled();
  });

  it('rejects a flag that belongs to a different leaf command', async () => {
    const client = makeClient();
    await expect(
      dispatch(client, [
        'fs',
        'read',
        '--path',
        '~/file',
        '--automation-ids',
        '42',
      ])
    ).rejects.toThrow(/--automation-ids is not supported for 'fs read'/);
    expect(client.fs.read).not.toHaveBeenCalled();
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
    expect(result).toMatchObject(aMe({ toolkitMinVersion: '0.1.0' }));
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
      expiresAt: '2027-01-15T08:00:00.000Z',
      renewalNeeded: false,
      tier: 'PRO',
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

  it('top-level help exposes alert without advertising the removed channel command', async () => {
    const client = makeClient();
    const result = (await dispatch(client, ['--help'])) as {
      _help: boolean;
      text: string;
    };
    expect(result.text).not.toMatch(/^\s{2}channel\s/m);
    expect(result.text).not.toContain('Deprecated group-alert compatibility');
    expect(result.text).toContain('alert');
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
    expect(result.text).toContain('@range/{start_ms}..{end_ms}');
    expect(result.text).toContain('@before/{timestamp_ms}/{limit}');
    expect(result.text).toContain('@after/{timestamp_ms}/{limit}');
    expect(result.text).toContain(
      'RFC 3339, Unix-second timestamps, @range/{duration}, and @now are not supported.'
    );
    expect(result.text).not.toContain('Recent data within duration');
    expect(result.text).not.toContain('Latest single data point');
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
    expect(result.text).toContain(
      'Let successful Feed runs deliver declared alert outputs'
    );
    expect(result.text).toContain(
      'This is not a dry run and may deliver Feed alerts to subscribers'
    );
    expect(result.text).toContain('trigger uses production delivery semantics');
    expect(result.text).toContain('--execution-timeout-seconds');
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
    expect(result.text).toContain('preferredMessagingApp');
    expect(result.text).not.toContain('active_im_provider');
    expect(result.text.toLowerCase()).toContain('arrays_jwt');
  });

  it('returns per-command help for user --help with the /api/v2 Me fields', async () => {
    const client = makeClient();
    const result = (await dispatch(client, ['user', '--help'])) as {
      _help: boolean;
      text: string;
    };
    expect(result._help).toBe(true);
    expect(result.text).toContain('preferredMessagingApp');
    expect(result.text).not.toContain('subscription_tier');
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
    expect(result.text).toContain('list-feed');
    expect(result.text).toContain('--delivery-provider <name>');
    expect(result.text).not.toContain('--channel <name>');
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

  it('returns per-command help for automation --help', async () => {
    const client = makeClient();
    const result = (await dispatch(client, ['automation', '--help'])) as {
      _help: boolean;
      text: string;
    };
    expect(result.text).toContain('alva automation list');
    expect(result.text).toContain('publish');
    expect(result.text).toContain('--json');
  });

  it('returns per-command help for alert --help', async () => {
    const client = makeClient();
    const result = (await dispatch(client, ['alert', '--help'])) as {
      _help: boolean;
      text: string;
    };
    expect(result.text).toContain('alva alert list');
    expect(result.text).toContain('alva alert follows');
    expect(result.text).toContain('--automation <owner/name>');
    expect(result.text).toContain('--automation-ids <a,b>');
    expect(result.text).toContain('--delivery-provider <name>');
    expect(result.text).toContain('Alva channel ID');
    expect(result.text).not.toContain('--channel <name>');
    expect(result.text).toContain('preferences');
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
    expect(result.text).toContain('--append');
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
    expect(result.text).toContain('Symlink target paths are stored verbatim');
    expect(result.text).toContain('not home-expanded');
    expect(result.text).toContain(
      'alva fs symlink --target-path "real-file.txt" --link-path "~/my-link.txt"'
    );
    expect(result.text).not.toContain('--target-path "~/real-file.txt"');
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
    automation: [
      'list',
      'inspect',
      'publish',
      'update',
      'stop',
      'resume',
      'delete',
    ],
    alert: [
      'list',
      'follows',
      'enable',
      'disable',
      'history',
      'preferences',
      'enable-session-completed',
      'disable-session-completed',
    ],
    feed: ['list', 'stop', 'resume', 'delete', 'set-visibility'],
    credits: ['wallet', 'items'],
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
      const groupLine = lines.find((line) =>
        line.trimStart().startsWith(`${group} `)
      );
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
          metadata: { endpoint_count: 2 },
        },
        {
          name: 'beta',
          description: 'beta desc',
        },
      ],
    });
    const result = await dispatch(client, ['data-skills', 'list']);
    expect(typeof result).toBe('string');
    const text = result as string;
    expect(text).toContain('alpha');
    expect(text).toContain('alpha desc');
    expect(text).toContain('2 endpoints');
    expect(text).toContain('beta');
    expect(text).toContain('beta desc');
    expect(text).not.toContain('pro');
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
      metadata: { endpoint_count: 1 },
      endpoint_metadata: [
        {
          skill: 'sk',
          file: 'f',
          method: 'GET',
          path: '/api/v1/stocks/f',
        },
      ],
    });
    const result = await dispatch(client, ['data-skills', 'summary', 'sk']);
    expect(typeof result).toBe('string');
    const text = result as string;
    expect(text).toContain('# sk');
    expect(text).toContain('desc');
    expect(text).toContain('# Header');
    expect(text).toContain('body line');
    expect(text).toContain('GET');
    expect(text).toContain('/api/v1/stocks/f');
    expect(text).not.toContain('ACCESS');
    expect(text).not.toContain('TIER');
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
      metadata: {
        skill: 'sk',
        file: 'f',
        method: 'GET',
        path: '/api/v1/stocks/f',
      },
    });
    const result = await dispatch(client, [
      'data-skills',
      'endpoint',
      'sk',
      'f',
    ]);
    expect(typeof result).toBe('string');
    expect(result as string).toContain('endpoint body');
    expect(result as string).toContain('GET /api/v1/stocks/f');
    expect(result as string).not.toContain('requires pro');
    expect(result as string).not.toContain('access:');
  });

  it('data-skills --help returns help text', async () => {
    const client = makeClient();
    const result = (await dispatch(client, ['data-skills', '--help'])) as {
      _help: boolean;
      text: string;
    };
    expect(result._help).toBe(true);
    expect(result.text).toContain('Browse the Arrays backend');
    expect(result.text).not.toContain('local tier metadata');
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
      owner: undefined,
      pageSize: 100,
      pageToken: undefined,
    });
  });

  it('reads every skillhub page into one list', async () => {
    const client = makeClient();
    const skill = (name: string) => ({
      id: 'skill_0a',
      name,
      displayName: name,
      description: `${name} skill`,
      tags: ['research'],
      owner: { id: null, handle: 'alva', displayName: null, avatarUrl: null },
      header: null,
      iconUrl: null,
      promptTemplate: null,
      updatedAt: null,
    });
    client.playbookSkills.list = vi
      .fn()
      .mockResolvedValueOnce({ items: [skill('a')], nextPageToken: 'p2' })
      .mockResolvedValueOnce({ items: [skill('b')], nextPageToken: null });

    const text = await dispatch(client, [
      'skillhub',
      'list',
      '--username',
      'alva',
    ]);
    expect(text).toBe(
      '• alva/a\n  a skill\n  tags: research\n• alva/b\n  b skill\n  tags: research\n'
    );
    expect(client.playbookSkills.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ owner: 'alva', pageToken: 'p2' })
    );
  });

  it('reads keyless skillhub from client.v1', async () => {
    const client = new AlvaClient({});
    const list = vi
      .spyOn(client.v1.playbookSkills, 'list')
      .mockResolvedValue({ skills: [] });
    await expect(dispatch(client, ['skillhub', 'list'])).resolves.toBe(
      'No playbook skills found.\n'
    );
    expect(list).toHaveBeenCalledWith({ tag: undefined, username: undefined });
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

  it('rejects a trailing global value flag before it can be stripped', () => {
    expect(() => stripGlobalFlags(['whoami', '--base-url'])).toThrow(
      /--base-url requires a value/
    );
  });

  it('rejects a global value flag followed by another flag', () => {
    expect(() =>
      stripGlobalFlags(['whoami', '--base-url', '--profile', 'stg'])
    ).toThrow(/--base-url requires a value/);
  });

  it('strips leading globals before broker but passes broker argv verbatim', () => {
    // Globals precede the command group; everything after `broker` is a raw
    // passthrough and must survive even when a venue flag collides with a CLI
    // global (adversarial review).
    expect(
      stripGlobalFlags([
        '--base-url',
        'https://api-llm.stg.alva.ai',
        'broker',
        'order',
        'place',
        '--api-key',
        'venue-native-value',
        '--base-url=venue',
        '--profile',
        'x',
      ])
    ).toEqual([
      'broker',
      'order',
      'place',
      '--api-key',
      'venue-native-value',
      '--base-url=venue',
      '--profile',
      'x',
    ]);

    expect(
      stripGlobalFlags([
        '--profile',
        'jagent',
        'trading',
        'broker',
        'raw',
        '--profile',
        'venue-native',
      ])
    ).toEqual(['trading', 'broker', 'raw', '--profile', 'venue-native']);
  });
});

describe('CLI_VERSION', () => {
  it('falls back to dev when __VERSION__ is not defined at build time', () => {
    expect(CLI_VERSION).toBe('dev');
  });

  it('is available through embedded dispatch', async () => {
    await expect(dispatch(makeClient(), ['--version'])).resolves.toBe(
      `alva version ${CLI_VERSION}`
    );
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
    client.user.me = vi
      .fn()
      .mockResolvedValue(aMe({ toolkitMinVersion: '99.0.0' }));
    const result = (await dispatch(client, ['whoami'], {
      cliVersion: '0.1.2',
    })) as Record<string, unknown>;
    expect(result._warning).toBeDefined();
    expect(result._warning as string).toContain('upgrade');
  });

  it('no _warning when CLI version >= min version', async () => {
    const client = makeClient();
    client.user.me = vi
      .fn()
      .mockResolvedValue(aMe({ toolkitMinVersion: '0.1.0' }));
    const result = (await dispatch(client, ['whoami'], {
      cliVersion: '0.1.2',
    })) as Record<string, unknown>;
    expect(result._warning).toBeUndefined();
  });

  it('no _warning when the server sends no toolkitMinVersion', async () => {
    const client = makeClient();
    client.user.me = vi.fn().mockResolvedValue(aMe({ toolkitMinVersion: '' }));
    const result = (await dispatch(client, ['whoami'], {
      cliVersion: '0.1.2',
    })) as Record<string, unknown>;
    expect(result._warning).toBeUndefined();
  });

  it('no _warning when server returns malformed version', async () => {
    const client = makeClient();
    client.user.me = vi
      .fn()
      .mockResolvedValue(aMe({ toolkitMinVersion: 'bad' }));
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
      expiresAt: '2026-12-01T00:00:00.000Z',
      tier: 'FREE',
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
      expiresAt: '2026-12-01T00:00:00.000Z',
      tier: 'FREE',
      renewalNeeded: false,
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

  it('can read playbook HTML through the client filesystem', async () => {
    const { handleLintPlaybook } = await import('../src/cli/lint.js');
    const client = makeClient();
    client.fs.read = vi
      .fn()
      .mockResolvedValue(
        fileContent('<html><body><p>no container</p></body></html>')
      );
    vi.mocked(fs.readFileSync).mockClear();

    const result = await handleLintPlaybook({
      file: '~/playbooks/demo/index.html',
      client,
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

    expect(client.fs.read).toHaveBeenCalledWith({
      path: '~/playbooks/demo/index.html',
    });
    expect(fs.readFileSync).not.toHaveBeenCalled();
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('required-container');
  });

  it('can lint an ArrayBuffer created in another realm', async () => {
    const { handleLintPlaybook } = await import('../src/cli/lint.js');
    const client = makeClient();
    const html = '<html><body><p>no container</p></body></html>';
    const bytes = [...new TextEncoder().encode(html)];
    client.fs.read = vi.fn().mockResolvedValue({
      ...fileContent(''),
      data: runInNewContext(`new Uint8Array(${JSON.stringify(bytes)}).buffer`),
    });

    const result = await handleLintPlaybook({
      file: '~/playbooks/demo/index.html',
      client,
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

describe('alva ask', () => {
  const pending = {
    id: 'ask_operation_0a',
    done: false,
    metadata: { sessionId: 'session_0s', createdAt: null },
    response: null,
    error: null,
  };
  const done = { ...pending, done: true, response: { text: 'NVDA beat.' } };

  it('creates the ask, waits and prints the answer text', async () => {
    const client = makeClient();
    client.asks.create = vi.fn().mockResolvedValue(pending);
    client.asks.wait = vi.fn().mockResolvedValue(done);
    expect(
      await dispatch(client, [
        'ask',
        '--prompt',
        'How did NVDA do?',
        '--model',
        'm1',
      ])
    ).toBe('NVDA beat.\n');
    expect(client.asks.create).toHaveBeenCalledWith({
      prompt: 'How did NVDA do?',
      system: undefined,
      model: 'm1',
      effort: undefined,
    });
    expect(client.asks.wait).toHaveBeenCalledWith(pending);
  });

  it('--json prints the finished operation and --no-wait the started one', async () => {
    const client = makeClient();
    client.asks.create = vi.fn().mockResolvedValue(pending);
    client.asks.wait = vi.fn().mockResolvedValue(done);
    expect(await dispatch(client, ['ask', '--prompt', 'q', '--json'])).toEqual(
      done
    );
    expect(
      await dispatch(client, ['ask', '--prompt', 'q', '--no-wait'])
    ).toEqual(pending);
    expect(client.asks.wait).toHaveBeenCalledTimes(1);
    await expect(dispatch(client, ['ask'])).rejects.toThrow(/--prompt/);
  });
});

describe('CLI dispatch — FEED alerts and playbook follows (mono-meta#584 W3)', () => {
  it('dispatches playbook follow without changing alerts', async () => {
    const client = makeClient();
    vi.mocked(client.playbooks.getBySlug).mockResolvedValue(
      aPlaybook({ id: 'playbook_0bcd' })
    );
    expect(
      await dispatch(client, [
        'subscriptions',
        'follow-playbook',
        '--username',
        'alice',
        '--name',
        'btc-dashboard',
      ])
    ).toEqual(aPlaybookFollow());
    expect(client.playbooks.getBySlug).toHaveBeenCalledWith(
      'alice',
      'btc-dashboard'
    );
    expect(client.subscriptions.followPlaybook).toHaveBeenCalledWith(
      'playbook_0bcd'
    );
    expect(client.subscriptions.subscribeBatch).not.toHaveBeenCalled();
  });

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
      pageSize: 20,
      pageToken: 'c1',
    });
  });

  it('dispatches subscriptions batch subscribe and unsubscribe for feed ids', async () => {
    const client = makeClient();
    await dispatch(client, [
      'subscriptions',
      'subscribe',
      '--feed-ids',
      'automation_0a,automation_0b',
      '--channel-id',
      'channel_0c',
    ]);
    await dispatch(client, [
      'subscriptions',
      'unsubscribe',
      '--feed-ids',
      'automation_0a',
    ]);
    expect(client.subscriptions.subscribeBatch).toHaveBeenCalledWith({
      automationIds: ['automation_0a', 'automation_0b'],
      channelId: 'channel_0c',
    });
    expect(client.subscriptions.unsubscribeBatch).toHaveBeenCalledWith([
      'automation_0a',
    ]);
    await dispatch(client, [
      'subscriptions',
      'subscribe',
      '--feed-ids',
      'automation_0a',
      '--channel-id',
      '0',
    ]);
    expect(client.subscriptions.subscribeBatch).toHaveBeenLastCalledWith({
      automationIds: ['automation_0a'],
      channelId: undefined,
    });
  });

  it('rejects subscriptions unsubscribe without ids', async () => {
    const client = makeClient();
    await expect(
      dispatch(client, ['subscriptions', 'unsubscribe'])
    ).rejects.toThrow(/feed-ids/);
    expect(client.subscriptions.unsubscribeBatch).not.toHaveBeenCalled();
  });

  it('rejects playbook ids for subscriptions batch mutations', async () => {
    const client = makeClient();
    await expect(
      dispatch(client, ['subscriptions', 'subscribe', '--playbook-ids', '8009'])
    ).rejects.toThrow(/Playbook alert targets are unsupported/);
    await expect(
      dispatch(client, [
        'subscriptions',
        'unsubscribe',
        '--playbook-ids',
        '8009',
      ])
    ).rejects.toThrow(/Playbook alert targets are unsupported/);
    expect(client.subscriptions.unsubscribeBatch).not.toHaveBeenCalled();
  });

  it('renders alert list as readable text by default', async () => {
    const client = makeClient();
    const result = await dispatch(client, [
      'alert',
      'list',
      '--first',
      '20',
      '--cursor',
      'c1',
    ]);
    expect(client.alerts.list).toHaveBeenCalledWith({
      pageSize: 20,
      pageToken: 'c1',
    });
    expect(result).toEqual(expect.stringContaining('1 alert(s):'));
    expect(result).toEqual(expect.stringContaining('btc-ema  [ACTIVE]'));
    expect(result).toEqual(
      expect.stringContaining('destination: CHANNEL channel_0ch')
    );
    expect(result).toEqual(
      expect.stringContaining('automation status: ACTIVE')
    );
    expect(result).toEqual(expect.stringContaining('used by: 1'));
    expect(result).toEqual(expect.stringContaining('nextPageToken: next'));
  });

  it('returns raw alert list with --json', async () => {
    const client = makeClient();
    const result = await dispatch(client, ['alert', 'list', '--json']);
    expect(result).toEqual({
      items: [aSubscription({ channelId: 'channel_0ch' })],
      nextPageToken: 'next',
    });
  });

  it('lists current group alerts through the explicit group subcommand', async () => {
    const client = makeClient('123', 'channel_group');
    vi.mocked(client.v1.channelGroupSubscriptions.list).mockResolvedValueOnce({
      subscriptions: [
        {
          event_type: 'feed_alert_ready',
          target: { type: 'feed', id: 42 },
          subscribed_by_user_id: 7,
          enabled: true,
          created_at_ms: 1,
          updated_at_ms: 1,
        },
      ],
    });
    const result = await dispatch(client, ['alert', 'group', 'list']);
    expect(client.v1.channelGroupSubscriptions.list).toHaveBeenCalledWith({
      session_id: '123',
    });
    expect(client.alerts.list).not.toHaveBeenCalled();
    expect(result).toEqual(expect.stringContaining('1 group alert(s):'));
  });

  it('keeps the regular alert command personal inside a group session', async () => {
    const client = makeClient('123', 'channel_group');
    await dispatch(client, ['alert', 'list']);
    expect(client.alerts.list).toHaveBeenCalled();
    expect(client.v1.channelGroupSubscriptions.list).not.toHaveBeenCalled();
  });

  it('dispatches alert follows with pagination flags', async () => {
    const client = makeClient();
    await dispatch(client, [
      'alert',
      'follows',
      '--limit',
      '20',
      '--cursor',
      'c1',
    ]);
    expect(client.alerts.follows).toHaveBeenCalledWith({
      pageSize: 20,
      pageToken: 'c1',
    });
  });

  it('dispatches alert enable and disable for automation targets', async () => {
    const client = makeClient();
    await dispatch(client, [
      'alert',
      'enable',
      '--automation',
      'alice/btc-ema',
    ]);
    await dispatch(client, [
      'alert',
      'disable',
      '--automation',
      'alice/btc-ema',
    ]);
    expect(client.v1.subscriptions.subscribeFeed).toHaveBeenCalledWith({
      username: 'alice',
      name: 'btc-ema',
    });
    expect(client.v1.subscriptions.unsubscribeFeed).toHaveBeenCalledWith({
      username: 'alice',
      name: 'btc-ema',
    });
  });

  it('dispatches name-addressed alert enable with an explicit channel id', async () => {
    const client = makeClient();

    await dispatch(client, [
      'alert',
      'enable',
      '--automation',
      'alice/btc-ema',
      '--channel-id',
      '7',
    ]);

    expect(client.v1.subscriptions.subscribeFeed).toHaveBeenCalledWith({
      username: 'alice',
      name: 'btc-ema',
      channelId: '7',
    });
    expect(client.alerts.enableBatch).not.toHaveBeenCalled();
  });

  it('rejects flags that alert subcommands do not consume', async () => {
    const client = makeClient();

    await expect(
      dispatch(client, ['alert', 'list', '--channel-id', '7'])
    ).rejects.toThrow(/--channel-id is not supported for 'alert list'/);
    await expect(
      dispatch(client, ['alert', 'list', '--typo', 'value'])
    ).rejects.toThrow(/--typo is not supported for 'alert list'/);
    await expect(
      dispatch(client, ['alert', 'disable', '--channel-id', '7'])
    ).rejects.toThrow(/--channel-id is not supported for 'alert disable'/);
    await expect(
      dispatch(makeClient('123', 'channel_group'), [
        'alert',
        'group',
        'list',
        '--channel-id',
        '7',
      ])
    ).rejects.toThrow(/--channel-id is not supported for 'alert group list'/);

    expect(client.alerts.list).not.toHaveBeenCalled();
    expect(client.v1.subscriptions.unsubscribeFeed).not.toHaveBeenCalled();
    expect(client.alerts.disableBatch).not.toHaveBeenCalled();
  });

  it('rejects alert enable and disable for playbook targets', async () => {
    const client = makeClient();
    await expect(
      dispatch(client, ['alert', 'enable', '--playbook', 'alice/btc-dashboard'])
    ).rejects.toThrow(/Playbook alert targets are unsupported/);
    await expect(
      dispatch(client, [
        'alert',
        'disable',
        '--playbook',
        'alice/btc-dashboard',
      ])
    ).rejects.toThrow(/Playbook alert targets are unsupported/);
  });

  it('dispatches alert batch enable and disable by automation ids', async () => {
    const client = makeClient();
    await dispatch(client, [
      'alert',
      'enable',
      '--automation-ids',
      'automation_0a,automation_0b',
      '--channel-id',
      'channel_0c',
    ]);
    await dispatch(client, [
      'alert',
      'disable',
      '--automation-ids',
      'automation_0a,automation_0b',
    ]);
    expect(client.alerts.enableBatch).toHaveBeenCalledWith({
      automationIds: ['automation_0a', 'automation_0b'],
      channelId: 'channel_0c',
    });
    expect(client.alerts.disableBatch).toHaveBeenCalledWith([
      'automation_0a',
      'automation_0b',
    ]);
  });

  it('enables and disables current group alerts by automation id', async () => {
    const client = makeClient('123', 'channel_group');
    await dispatch(client, [
      'alert',
      'group',
      'enable',
      '--automation-ids',
      '42',
    ]);
    await dispatch(client, [
      'alert',
      'group',
      'disable',
      '--automation-ids',
      '42',
    ]);
    expect(client.v1.channelGroupSubscriptions.subscribe).toHaveBeenCalledWith({
      session_id: '123',
      target_type: 'feed',
      target_id: '42',
    });
    expect(
      client.v1.channelGroupSubscriptions.unsubscribe
    ).toHaveBeenCalledWith({
      session_id: '123',
      target_type: 'feed',
      target_id: '42',
    });
    expect(client.alerts.enableBatch).not.toHaveBeenCalled();
    expect(client.alerts.disableBatch).not.toHaveBeenCalled();
  });

  it('rejects ambiguous group alert targets', async () => {
    const client = makeClient('123', 'channel_group');
    await expect(
      dispatch(client, [
        'alert',
        'group',
        'enable',
        '--automation-ids',
        '42,43',
      ])
    ).rejects.toThrow(/exactly one positive/);
    await expect(
      dispatch(client, [
        'alert',
        'group',
        'enable',
        '--automation-ids',
        '42',
        '--channel-id',
        '7',
      ])
    ).rejects.toThrow(/Alva channel/);
  });

  it('requires alert group commands to run in a channel-group session', async () => {
    const client = makeClient('123', 'chat');
    await expect(dispatch(client, ['alert', 'group', 'list'])).rejects.toThrow(
      /only available inside an external IM-group sandbox/
    );
    expect(client.v1.channelGroupSubscriptions.list).not.toHaveBeenCalled();
  });

  it('requires the attached group session id without accepting it as input', async () => {
    const client = makeClient(undefined, 'channel_group');
    await expect(dispatch(client, ['alert', 'group', 'list'])).rejects.toThrow(
      /current group session is unavailable/
    );
    expect(client.v1.channelGroupSubscriptions.list).not.toHaveBeenCalled();
  });

  it('does not accept an explicit session id for alert group commands', async () => {
    const client = makeClient('123', 'channel_group');
    await expect(
      dispatch(client, ['alert', 'group', 'list', '--session-id', '456'])
    ).rejects.toThrow(/does not accept --session-id/);
    expect(client.v1.channelGroupSubscriptions.list).not.toHaveBeenCalled();
  });

  it('rejects playbook ids for alert batch mutations', async () => {
    const client = makeClient();
    await expect(
      dispatch(client, ['alert', 'disable', '--playbook-ids', '7'])
    ).rejects.toThrow(/Playbook alert targets are unsupported/);
    expect(client.alerts.disableBatch).not.toHaveBeenCalled();
  });

  it('dispatches alert history by owner and name to /api/v1', async () => {
    const client = makeClient();
    vi.mocked(client.v1.notifications.listFeed).mockResolvedValueOnce({
      items: [
        {
          id: '1',
          event_type: 'feed_alert_ready',
          user_id: '7',
          channel: 'web',
          status: 'sent',
          created_at: 1777355703,
          feed_id: '42',
        },
      ],
      next_cursor: '',
      feed_path: '~/f',
    });
    const result = (await dispatch(client, [
      'alert',
      'history',
      '--automation',
      'alice/btc-ema',
      '--delivery-provider',
      'web',
      '--status',
      'sent',
      '--since',
      '2026-04-28T05:55:03Z',
      '--first',
      '5',
      '--cursor',
      'c1',
    ])) as { items: Array<Record<string, unknown>> };
    expect(client.v1.notifications.listFeed).toHaveBeenCalledWith({
      username: 'alice',
      name: 'btc-ema',
      channel: 'web',
      status: 'sent',
      since_time: 1777355703,
      first: 5,
      cursor: 'c1',
    });
    expect(result.items[0]).toMatchObject({ delivery_provider: 'web' });
    expect(result.items[0]!.channel).toBeUndefined();
    expect(client.alerts.history).not.toHaveBeenCalled();
  });

  it('dispatches alert history by automation ID to /api/v2', async () => {
    const client = makeClient();
    const result = await dispatch(client, [
      'alert',
      'history',
      '--automation-id',
      'automation_0abc',
      '--delivery-provider',
      'web',
      '--status',
      'sent',
      '--since',
      '2026-04-28T07:55:03+02:00',
      '--first',
      '5',
      '--cursor',
      'c1',
    ]);
    expect(client.alerts.history).toHaveBeenCalledWith({
      automationId: 'automation_0abc',
      deliveryProvider: 'web',
      status: 'SENT',
      since: '2026-04-28T05:55:03.000Z',
      pageSize: 5,
      pageToken: 'c1',
    });
    expect(result).toEqual({ items: [aDelivery()], nextPageToken: null });
    expect(client.v1.notifications.listFeed).not.toHaveBeenCalled();
    await expect(
      dispatch(client, [
        'alert',
        'history',
        '--automation-id',
        'automation_0abc',
        '--since',
        '1777355703',
      ])
    ).rejects.toThrow(/Unix timestamps are no longer accepted/);
  });

  it('rejects the legacy alert history --channel flag', async () => {
    const client = makeClient();
    await expect(
      dispatch(client, [
        'alert',
        'history',
        '--automation',
        'alice/btc-ema',
        '--channel',
        'telegram',
      ])
    ).rejects.toThrow(
      /--channel is no longer supported.*use --delivery-provider/
    );
    expect(client.v1.notifications.listFeed).not.toHaveBeenCalled();
  });

  it('dispatches alert preferences', async () => {
    const client = makeClient();
    await dispatch(client, ['alert', 'preferences']);
    await dispatch(client, ['alert', 'enable-session-completed']);
    await dispatch(client, ['alert', 'disable-session-completed']);
    expect(client.alerts.preferences).toHaveBeenCalled();
    expect(client.alerts.updatePreferences).toHaveBeenNthCalledWith(1, {
      sessionCompleted: true,
    });
    expect(client.alerts.updatePreferences).toHaveBeenNthCalledWith(2, {
      sessionCompleted: false,
    });
  });

  it('requires an automation target for alert mutations', async () => {
    const client = makeClient();
    await expect(dispatch(client, ['alert', 'enable'])).rejects.toThrow(
      "--automation is required for 'alert enable'"
    );
    await expect(
      dispatch(client, [
        'alert',
        'enable',
        '--automation',
        'alice/btc-ema',
        '--playbook',
        'alice/btc-dashboard',
      ])
    ).rejects.toThrow('Playbook alert targets are unsupported');
  });

  it('dispatches playbooks get --ids as a batch', async () => {
    const client = makeClient();
    await dispatch(client, ['playbooks', 'get', '--ids', '1,2']);
    expect(client.playbooks.getByIds).toHaveBeenCalledWith(['1', '2']);
  });

  it('renders playbooks trending as readable text by default', async () => {
    const client = makeClient();
    client.playbooks.trending = vi.fn().mockResolvedValue({
      items: [aPlaybook({ slug: 'macro', title: 'Macro' })],
      nextPageToken: 'next',
    });
    const result = await dispatch(client, ['playbooks', 'trending']);
    expect(typeof result).toBe('string');
    expect(result).toContain('• Macro  [public]  ★ 7');
    expect(result).toContain('alice/macro');
    expect(result).toContain('https://alva.ai/u/alice/playbooks/macro');
    expect(result).toContain('--cursor <nextPageToken>');
  });

  it('returns the /api/v2 page for playbooks trending --json', async () => {
    const client = makeClient();
    const page = { items: [aPlaybook()], nextPageToken: null };
    client.playbooks.trending = vi.fn().mockResolvedValue(page);
    const result = await dispatch(client, ['playbooks', 'trending', '--json']);
    expect(result).toBe(page);
  });

  it('dispatches playbooks get --ref', async () => {
    const client = makeClient();
    await dispatch(client, ['playbooks', 'get', '--ref', 'alice/macro']);
    expect(client.playbooks.get).toHaveBeenCalledWith({
      id: undefined,
      ref: 'alice/macro',
    });
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
    expect(client.playbooks.listByOwner).toHaveBeenCalledWith('alice', {
      pageSize: 10,
      pageToken: undefined,
    });
  });

  it('dispatches playbooks mine to the owner endpoint (drafts included)', async () => {
    const client = makeClient();
    await dispatch(client, ['playbooks', 'mine']);
    expect(client.playbooks.listOwn).toHaveBeenCalledWith({
      status: undefined,
      pageSize: undefined,
      pageToken: undefined,
    });
  });

  it('passes a validated --filter to playbooks mine', async () => {
    const client = makeClient();
    await dispatch(client, ['playbooks', 'mine', '--filter', 'draft']);
    expect(client.playbooks.listOwn).toHaveBeenCalledWith({
      status: 'DRAFT',
      pageSize: undefined,
      pageToken: undefined,
    });
  });

  it('rejects an unknown playbooks mine --filter', async () => {
    const client = makeClient();
    await expect(
      dispatch(client, ['playbooks', 'mine', '--filter', 'bogus'])
    ).rejects.toThrow(/--filter must be one of/);
    expect(client.playbooks.listOwn).not.toHaveBeenCalled();
  });

  it('auto-paginates playbooks list --all across pages', async () => {
    const client = makeClient();
    const a = aPlaybook({ id: 'playbook_0a', slug: 'a' });
    const b = aPlaybook({ id: 'playbook_0b', slug: 'b' });
    client.playbooks.listByOwner = vi
      .fn()
      .mockResolvedValueOnce({ items: [a], nextPageToken: 'c1' })
      .mockResolvedValueOnce({ items: [b], nextPageToken: null });
    const out = await dispatch(client, [
      'playbooks',
      'list',
      '--owner',
      'alice',
      '--all',
      '--json',
    ]);
    expect(client.playbooks.listByOwner).toHaveBeenCalledTimes(2);
    expect(client.playbooks.listByOwner).toHaveBeenLastCalledWith('alice', {
      pageSize: undefined,
      pageToken: 'c1',
    });
    expect(out).toEqual({ items: [a, b], nextPageToken: null });
  });

  it('auto-paginates playbooks mine --all with the page token, past an empty page', async () => {
    const client = makeClient();
    const a = aPlaybook({ id: 'playbook_0a', slug: 'a' });
    const b = aPlaybook({ id: 'playbook_0b', slug: 'b' });
    client.playbooks.listOwn = vi
      .fn()
      .mockResolvedValueOnce({ items: [a], nextPageToken: 'c1' })
      .mockResolvedValueOnce({ items: [], nextPageToken: 'c2' })
      .mockResolvedValueOnce({ items: [b], nextPageToken: null });
    const out = await dispatch(client, [
      'playbooks',
      'mine',
      '--all',
      '--json',
    ]);
    expect(client.playbooks.listOwn).toHaveBeenCalledTimes(3);
    expect(client.playbooks.listOwn).toHaveBeenLastCalledWith({
      status: undefined,
      pageSize: undefined,
      pageToken: 'c2',
    });
    expect(out).toEqual({ items: [a, b], nextPageToken: null });
  });

  it('sets a playbook visibility by its name, confirming bundled feeds', async () => {
    const client = makeClient();
    await dispatch(client, [
      'playbooks',
      'set-visibility',
      '--name',
      'scanner',
      '--visibility',
      'Paid',
    ]);
    expect(client.playbooks.getBySlug).toHaveBeenCalledWith('alice', 'scanner');
    expect(client.playbooks.update).toHaveBeenCalledWith('playbook_0abc', {
      visibility: 'PAID',
      confirmBundledFeedExposure: true,
      confirmEndPaidRenewals: undefined,
    });
    await dispatch(client, [
      'playbooks',
      'set-visibility',
      '--name',
      'scanner',
      '--visibility',
      'public',
      '--confirm-end-paid-renewals',
    ]);
    expect(client.playbooks.update).toHaveBeenLastCalledWith(
      'playbook_0abc',
      expect.objectContaining({
        visibility: 'PUBLIC',
        confirmEndPaidRenewals: true,
      })
    );
  });
});

describe('CLI dispatch — Slim Agent profile', () => {
  it('uses the Slim catalog by default without changing the system CLI', async () => {
    const client = makeClient();

    await expect(
      dispatchEmbedded(client, ['deploy', 'list'])
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof CliUsageError &&
        error.message.includes("Unknown command: 'deploy'")
    );

    await expect(dispatch(client, ['deploy', 'list'])).resolves.toBeDefined();
  });

  const agentDeps = {
    runtime: 'jagent' as const,
    env: {},
    stderr: { write: vi.fn(() => true) },
  };

  it('uses isolated help and rejects terminal-only routes', async () => {
    const client = makeClient();
    const help = (await dispatchEmbedded(client, [], undefined, agentDeps)) as {
      text: string;
    };
    expect(help.text).toContain('account');
    expect(help.text).toContain('portfolio');
    expect(help.text).not.toContain('configure');
    expect(help.text).not.toContain('sdk');

    await expect(
      dispatchEmbedded(client, ['deploy', 'list'], undefined, agentDeps)
    ).rejects.toThrow(/Unknown command: 'deploy'/);

    await dispatch(client, ['deploy', 'list']);
    expect(client.deploy.list).toHaveBeenCalled();
  });

  it('parses Slim leaf help before rejecting unsupported flags', async () => {
    const client = makeClient();

    await expect(
      dispatchEmbedded(
        client,
        ['playbooks', 'draft', '--trading_symbols', 'TSLA', '--help'],
        undefined,
        agentDeps
      )
    ).rejects.toThrow(
      /--trading_symbols is not supported for 'playbooks draft'.*--trading-symbols/
    );
    expect(client.release.playbookDraft).not.toHaveBeenCalled();
  });

  it('renders schema-backed Slim leaf help without dispatching', async () => {
    const client = makeClient();
    const help = (await dispatchEmbedded(
      client,
      ['playbooks', 'draft', '--help'],
      undefined,
      agentDeps
    )) as { _help: boolean; text: string };
    const helpWithValidFlags = await dispatchEmbedded(
      client,
      ['playbooks', 'draft', '--trading-symbols', '["TSLA"]', '--help'],
      undefined,
      agentDeps
    );

    expect(help._help).toBe(true);
    expect(help.text).toContain('Usage: alva playbooks draft [options]');
    for (const flag of [
      '--name',
      '--display-name',
      '--description',
      '--feeds',
      '--trading-symbols',
      '--skill-id',
      '--tags',
      '--help',
    ]) {
      expect(help.text).toContain(flag);
    }
    expect(helpWithValidFlags).toEqual(help);
    expect(client.release.playbookDraft).not.toHaveBeenCalled();
  });

  it('renders both accepted forms of Slim boolean flags', async () => {
    const client = makeClient();
    const help = (await dispatchEmbedded(
      client,
      ['playbooks', 'functions', 'register', '--help'],
      undefined,
      agentDeps
    )) as { _help: boolean; text: string };

    expect(help._help).toBe(true);
    expect(help.text).toContain('  --allow-charges | --no-allow-charges');
    expect(help.text).toContain('  --clear-run-as | --no-clear-run-as');
    expect(client.functions.register).not.toHaveBeenCalled();
  });

  it('leaves Full playbook-draft help unchanged', async () => {
    const client = makeClient();
    const help = (await dispatch(client, [
      'release',
      'playbook-draft',
      '--help',
    ])) as { _help: boolean; text: string };

    expect(help._help).toBe(true);
    expect(help.text).toContain('Playbook-draft flags:');
    expect(help.text).toContain('--trading-symbols');
    expect(client.release.playbookDraft).not.toHaveBeenCalled();
  });

  it('routes account identity and notification preferences', async () => {
    const client = makeClient();
    const identity = (await dispatchEmbedded(
      client,
      ['account', 'whoami'],
      undefined,
      agentDeps
    )) as { username: string };
    expect(identity.username).toBe('alice');

    await dispatchEmbedded(
      client,
      [
        'account',
        'notifications',
        'set-preference',
        '--session-completed',
        'disabled',
      ],
      undefined,
      agentDeps
    );
    expect(client.notificationPreferences.update).toHaveBeenCalledWith({
      sessionCompleted: false,
    });
  });

  it('returns Agent screenshots as image content without an encoding flag', async () => {
    const client = makeClient();
    client.screenshot.capture = vi
      .fn()
      .mockResolvedValue(
        aScreenshot(encodeBase64(Uint8Array.from([0x89, 0x50, 0x4e, 0x47])))
      );

    const result = await dispatchEmbedded(
      client,
      ['playbooks', 'screenshot', '--url', '/playbook/alice/pulse'],
      undefined,
      agentDeps
    );

    expect(result).toEqual(
      expect.objectContaining({ _image: true, mimeType: 'image/png' })
    );
    expect(client.screenshot.capture).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/playbook/alice/pulse',
        compress: true,
      })
    );
  });

  it('creates and registers an automation in one command', async () => {
    const client = makeClient();
    const result = await dispatchEmbedded(
      client,
      [
        'automation',
        'create',
        '--name',
        'pulse',
        '--path',
        '~/scripts/pulse.js',
        '--cron',
        '0 * * * *',
        '--version',
        '1.0.0',
        '--description',
        'Market pulse',
      ],
      undefined,
      agentDeps
    );

    expect(client.deploy.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'pulse',
        entryPath: '~/scripts/pulse.js',
        cronExpression: '0 * * * *',
      })
    );
    expect(client.automation.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'pulse',
        version: '1.0.0',
        cronjobId: 'cronjob_0p1',
        description: 'Market pulse',
      })
    );
    expect(result).toEqual({
      automation: AUTOMATION_VERSION,
      producer: aCronjob({ id: 'cronjob_0p1' }),
    });
  });

  it('refuses a producer whose id is not an ID string', async () => {
    const client = makeClient();
    client.deploy.create = vi.fn().mockResolvedValue({ id: 1 });
    await expect(
      dispatchEmbedded(
        client,
        [
          'automation',
          'create',
          '--name',
          'pulse',
          '--path',
          '~/scripts/pulse.js',
          '--cron',
          '0 * * * *',
          '--version',
          '1.0.0',
        ],
        undefined,
        agentDeps
      )
    ).rejects.toThrow('Automation producer creation returned an invalid id');
    expect(client.automation.publish).not.toHaveBeenCalled();
  });

  it('validates automation registration fields before creating a producer', async () => {
    const client = makeClient();
    await expect(
      dispatchEmbedded(
        client,
        [
          'automation',
          'create',
          '--name',
          'pulse',
          '--path',
          '~/scripts/pulse.js',
          '--cron',
          '0 * * * *',
        ],
        undefined,
        agentDeps
      )
    ).rejects.toThrow(/--version is required/);
    expect(client.deploy.create).not.toHaveBeenCalled();
  });

  it('reports a recoverable producer id when automation registration fails', async () => {
    const client = makeClient();
    client.automation.publish = vi
      .fn()
      .mockRejectedValue(new Error('registration unavailable'));
    await expect(
      dispatchEmbedded(
        client,
        [
          'automation',
          'create',
          '--name',
          'pulse',
          '--path',
          '~/scripts/pulse.js',
          '--cron',
          '0 * * * *',
          '--version',
          '1.0.0',
        ],
        undefined,
        agentDeps
      )
    ).rejects.toThrow(
      /producer cronjob_0p1 was created.*left intact.*registration unavailable/
    );
    expect(client.deploy.delete).not.toHaveBeenCalled();
  });

  it('resolves the producer for unified update and run commands', async () => {
    const client = makeClient();
    await dispatchEmbedded(
      client,
      [
        'automation',
        'update',
        '--id',
        '42',
        '--cron',
        '0 8 * * *',
        '--description',
        'New description',
      ],
      undefined,
      agentDeps
    );
    expect(client.deploy.update).toHaveBeenCalledWith(
      'cronjob_0p420',
      expect.objectContaining({ cronExpression: '0 8 * * *' })
    );
    expect(client.automation.update).toHaveBeenCalledWith(
      '42',
      expect.objectContaining({ description: 'New description' })
    );

    await dispatchEmbedded(
      client,
      ['automation', 'runs', 'list', '--id', '42', '--first', '20'],
      undefined,
      agentDeps
    );
    expect(client.deploy.listRuns).toHaveBeenCalledWith('cronjob_0p420', {
      pageSize: 20,
      pageToken: undefined,
    });

    const trigger = await dispatchEmbedded(
      client,
      ['automation', 'trigger', '--id', '42'],
      undefined,
      agentDeps
    );
    expect(client.deploy.trigger).toHaveBeenCalledWith('cronjob_0p420');
    expect(trigger).toEqual({ dispatchId: 'cronjob_dispatch_0d' });
  });

  it('rejects array-shaped Automation details before producer operations', async () => {
    const client = makeClient();
    client.automation.inspect = vi.fn().mockResolvedValue([]);

    await expect(
      dispatchEmbedded(
        client,
        ['automation', 'trigger', '--id', '42'],
        undefined,
        agentDeps
      )
    ).rejects.toThrow('Automation 42 returned an invalid detail');
    expect(client.deploy.trigger).not.toHaveBeenCalled();
  });

  it('keeps Automation delivery reads and partial updates in the Slim tree', async () => {
    const client = makeClient();

    await dispatchEmbedded(
      client,
      ['automation', 'delivery', 'get', '--id', '42'],
      undefined,
      agentDeps
    );
    await dispatchEmbedded(
      client,
      ['automation', 'delivery', 'update', '--id', '42', '--no-email-enabled'],
      undefined,
      agentDeps
    );

    expect(client.automation.delivery.get).toHaveBeenCalledWith('42');
    expect(client.automation.delivery.update).toHaveBeenCalledWith('42', {
      channelIds: undefined,
      email: false,
    });
  });

  it('reports a producer-first partial automation update', async () => {
    const client = makeClient();
    client.automation.update = vi
      .fn()
      .mockRejectedValue(new Error('metadata unavailable'));

    await expect(
      dispatchEmbedded(
        client,
        [
          'automation',
          'update',
          '--id',
          '42',
          '--cron',
          '0 8 * * *',
          '--description',
          'New description',
        ],
        undefined,
        agentDeps
      )
    ).rejects.toThrow(
      /Automation 42 metadata update failed after producer cronjob_0p420 was updated: metadata unavailable/
    );
    expect(client.deploy.update).toHaveBeenCalled();
  });

  it('preserves int64 automation ids and skips producer lookup for metadata-only updates', async () => {
    const client = makeClient();
    const id = '9007199254740993';

    await dispatchEmbedded(
      client,
      ['automation', 'update', '--id', id, '--description', 'Metadata only'],
      undefined,
      agentDeps
    );

    expect(client.automation.inspect).not.toHaveBeenCalled();
    expect(client.deploy.update).not.toHaveBeenCalled();
    expect(client.automation.update).toHaveBeenCalledWith(id, {
      description: 'Metadata only',
      version: undefined,
      cronjobId: undefined,
      changelog: undefined,
      agentType: undefined,
      triggerRun: undefined,
    });
  });

  it('preserves int64 automation ids for inspect and visibility routes', async () => {
    const client = makeClient();
    const id = '9007199254740993';
    client.automation.inspect = vi
      .fn()
      .mockResolvedValue(anAutomation({ name: 'large-id' }));

    await dispatchEmbedded(
      client,
      ['automation', 'inspect', '--id', id, '--json'],
      undefined,
      agentDeps
    );
    await dispatchEmbedded(
      client,
      ['automation', 'set-visibility', '--id', id, '--visibility', 'public'],
      undefined,
      agentDeps
    );

    expect(client.automation.inspect).toHaveBeenCalledWith(id);
    expect(client.feed.setVisibility).toHaveBeenCalledWith(id, 'PUBLIC');
  });

  it('lets automation deletion cascade a paused producer', async () => {
    const client = makeClient();
    const result = await dispatchEmbedded(
      client,
      ['automation', 'delete', '--id', '42'],
      undefined,
      agentDeps
    );
    expect(client.deploy.pause).toHaveBeenCalledWith('cronjob_0p420');
    expect(client.automation.delete).toHaveBeenCalledWith('42');
    expect(client.deploy.delete).not.toHaveBeenCalled();
    expect(result).toEqual({
      automation_id: '42',
      cronjob_id: 'cronjob_0p420',
      status: 'deleted',
    });
  });

  it('deletes an int64 automation without requiring a backing producer', async () => {
    const client = makeClient();
    const id = '9007199254740993';
    client.automation.inspect = vi.fn().mockResolvedValue(
      anAutomation({
        name: 'metadata-only',
        status: 'PAUSED',
        cronjobId: null,
      })
    );

    const result = await dispatchEmbedded(
      client,
      ['automation', 'delete', '--id', id],
      undefined,
      agentDeps
    );

    expect(client.automation.inspect).toHaveBeenCalledWith(id);
    expect(client.automation.delete).toHaveBeenCalledWith(id);
    expect(client.deploy.pause).not.toHaveBeenCalled();
    expect(client.deploy.delete).not.toHaveBeenCalled();
    expect(result).toEqual({
      automation_id: id,
      status: 'deleted',
    });
  });

  it('coordinates product and producer pause/resume state', async () => {
    const client = makeClient();

    await dispatchEmbedded(
      client,
      ['automation', 'pause', '--id', '42'],
      undefined,
      agentDeps
    );
    expect(client.deploy.pause).toHaveBeenCalledWith('cronjob_0p420');
    expect(client.automation.stop).toHaveBeenCalledWith('42');
    expect(client.deploy.pause).toHaveBeenCalledBefore(client.automation.stop);

    await dispatchEmbedded(
      client,
      ['automation', 'resume', '--id', '42'],
      undefined,
      agentDeps
    );
    expect(client.automation.resume).toHaveBeenCalledWith('42');
    expect(client.deploy.resume).toHaveBeenCalledWith('cronjob_0p420');
    expect(client.automation.resume).toHaveBeenCalledBefore(
      client.deploy.resume
    );
  });

  it('reports a paused producer when product deletion fails', async () => {
    const client = makeClient();
    client.automation.delete = vi
      .fn()
      .mockRejectedValue(new Error('delete unavailable'));

    await expect(
      dispatchEmbedded(
        client,
        ['automation', 'delete', '--id', '42'],
        undefined,
        agentDeps
      )
    ).rejects.toThrow(
      /producer cronjob_0p420 was paused.*remains paused.*delete unavailable/
    );
    expect(client.deploy.delete).not.toHaveBeenCalled();
  });

  it('moves portfolio reads and defaults legacy Signal execution to dry-run', async () => {
    const client = makeClient();
    client.portfolio.accounts = vi
      .fn()
      .mockResolvedValue({ items: [], nextPageToken: null });
    client.portfolio.snapshot = vi.fn().mockResolvedValue({ positions: [] });
    client.portfolio.activities = vi
      .fn()
      .mockResolvedValue({ items: [], nextPageToken: null });
    client.trading.orders = vi
      .fn()
      .mockResolvedValue({ items: [], nextPageToken: null });
    client.trading.equity = vi.fn().mockResolvedValue({ points: [] });
    client.trading.placeOrders = vi
      .fn()
      .mockResolvedValue({ status: 'EXECUTED', orders: [] });

    await dispatchEmbedded(
      client,
      ['portfolio', 'accounts'],
      undefined,
      agentDeps
    );
    await dispatchEmbedded(
      client,
      ['portfolio', 'summary', '--account-id', 'broker_account_0a'],
      undefined,
      agentDeps
    );
    await dispatchEmbedded(
      client,
      [
        'portfolio',
        'activities',
        '--account-id',
        'broker_account_0a',
        '--limit',
        '10',
      ],
      undefined,
      agentDeps
    );
    await dispatchEmbedded(
      client,
      ['portfolio', 'orders', '--account-id', 'broker_account_0a'],
      undefined,
      agentDeps
    );
    await dispatchEmbedded(
      client,
      [
        'portfolio',
        'equity-history',
        '--account-id',
        'broker_account_0a',
        '--range',
        'ALL',
      ],
      undefined,
      agentDeps
    );

    expect(client.portfolio.accounts).toHaveBeenCalledWith();
    expect(client.portfolio.snapshot).toHaveBeenCalledWith('broker_account_0a');
    expect(client.portfolio.activities).toHaveBeenCalledWith(
      'broker_account_0a',
      { pageSize: 10, pageToken: undefined }
    );
    expect(client.trading.orders).toHaveBeenCalledWith('broker_account_0a', {
      origin: undefined,
      from: undefined,
      pageSize: undefined,
    });
    expect(client.trading.equity).toHaveBeenCalledWith('broker_account_0a', {
      range: 'ALL',
    });

    const instruction = '{"type":"ORDERS","orders":[]}';
    await dispatchEmbedded(
      client,
      [
        'trading',
        'signals',
        'execute',
        '--account-id',
        'broker_account_0a',
        '--instruction',
        instruction,
      ],
      undefined,
      agentDeps
    );
    expect(client.trading.placeOrders).toHaveBeenLastCalledWith(
      'broker_account_0a',
      { type: 'ORDERS', orders: [], dryRun: true },
      { idempotencyKey: undefined }
    );

    await dispatchEmbedded(
      client,
      [
        'trading',
        'signals',
        'execute',
        '--account-id',
        'broker_account_0a',
        '--instruction',
        instruction,
        '--live',
      ],
      undefined,
      agentDeps
    );
    expect(client.trading.placeOrders).toHaveBeenLastCalledWith(
      'broker_account_0a',
      { type: 'ORDERS', orders: [] },
      { idempotencyKey: undefined }
    );
  });

  it('keeps legacy Signal subscriptions isolated under their own subtree', async () => {
    const client = makeClient();
    client.trading.subscriptions = vi
      .fn()
      .mockResolvedValue({ items: [], nextPageToken: null });
    client.trading.subscribe = vi
      .fn()
      .mockResolvedValue({ id: 'trade_subscription_0a' });
    client.trading.unsubscribe = vi
      .fn()
      .mockResolvedValue({ id: 'trade_subscription_0a' });

    await dispatchEmbedded(
      client,
      [
        'trading',
        'signals',
        'subscriptions',
        'list',
        '--account-id',
        'broker_account_0a',
      ],
      undefined,
      agentDeps
    );
    await dispatchEmbedded(
      client,
      [
        'trading',
        'signals',
        'subscriptions',
        'subscribe',
        '--account-id',
        'broker_account_0a',
        '--signal-source-id',
        'automation_0f',
        '--playbook-id',
        'playbook_0p',
        '--playbook-version',
        '1.0.0',
      ],
      undefined,
      agentDeps
    );
    await dispatchEmbedded(
      client,
      [
        'trading',
        'signals',
        'subscriptions',
        'unsubscribe',
        '--subscription-id',
        'trade_subscription_0a',
      ],
      undefined,
      agentDeps
    );

    expect(client.trading.subscriptions).toHaveBeenCalledWith(
      'broker_account_0a'
    );
    expect(client.trading.subscribe).toHaveBeenCalledWith('broker_account_0a', {
      playbookId: 'playbook_0p',
      signalSourceId: 'automation_0f',
      playbookVersion: '1.0.0',
      initialOrders: 'NONE',
    });
    expect(client.trading.unsubscribe).toHaveBeenCalledWith(
      'trade_subscription_0a'
    );
  });
});

describe('CLI dispatch — broker', () => {
  const brokerDeps = {
    runtime: 'jagent' as const,
    randomUUID: () => '123e4567-e89b-42d3-a456-426614174000',
  };

  function brokerClient(resp: { envelope: unknown; exit: number }) {
    const client = makeClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (client as any)._v2Request = vi
      .fn()
      .mockResolvedValue({ envelope: resp.envelope, exitCode: resp.exit });
    return client;
  }

  async function dispatchBrokerStdin(client: AlvaClient, stdin: string) {
    return dispatchEmbedded(
      client,
      ['trading', 'broker', 'order', 'place', '--stdin'],
      undefined,
      {
        ...brokerDeps,
        readStdin: async () => stdin,
      }
    );
  }

  it('projects Broker discovery into the Slim tree', async () => {
    const client = brokerClient({
      envelope: {
        commands: [
          { name: 'accounts', usage: 'alva broker accounts' },
          { name: 'risk-rules', usage: 'alva broker risk-rules' },
          { name: 'venues', usage: 'alva broker venues' },
          { name: 'help', usage: 'alva broker help' },
          { name: 'quote', usage: 'alva broker quote' },
        ],
        nextCommands: ['alva broker describe --venue <venue>'],
      },
      exit: 0,
    });
    const result = (await dispatchEmbedded(
      client,
      ['trading', 'broker', 'describe'],
      undefined,
      { runtime: 'jagent' }
    )) as {
      commands: Array<{ name: string; usage: string }>;
      nextCommands: string[];
    };

    expect(result.commands).toEqual([
      { name: 'quote', usage: 'alva trading broker quote' },
    ]);
    expect(result.nextCommands).toEqual([
      'alva trading broker describe --venue <venue>',
    ]);
  });

  it('forwards Broker-native help to the Broker service', async () => {
    const client = brokerClient({
      envelope: { usage: 'quote --venue <venue> --symbol <symbol>' },
      exit: 0,
    });

    const result = await dispatchEmbedded(client, [
      'trading',
      'broker',
      'quote',
      '--help',
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((client as any)._v2Request).toHaveBeenCalledWith(
      'POST',
      '/broker/invocations',
      expect.objectContaining({
        body: expect.objectContaining({ argv: ['quote', '--help'] }),
      })
    );
    expect(result).toEqual({
      usage: 'quote --venue <venue> --symbol <symbol>',
    });
  });

  it('keeps help at the Broker passthrough boundary in Toolkit', async () => {
    const client = brokerClient({ envelope: {}, exit: 0 });

    const result = (await dispatchEmbedded(client, [
      'trading',
      'broker',
      '--help',
    ])) as { _help: boolean; text: string };

    expect(result._help).toBe(true);
    expect(result.text).toContain('trading broker');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((client as any)._v2Request).not.toHaveBeenCalled();
  });

  it('keeps shared prerequisites out of the Broker subtree', async () => {
    const client = brokerClient({ envelope: {}, exit: 0 });
    await expect(
      dispatchEmbedded(client, ['trading', 'broker', 'accounts'], undefined, {
        runtime: 'jagent',
      })
    ).rejects.toThrow(/use 'alva trading accounts'/);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((client as any)._v2Request).not.toHaveBeenCalled();
  });

  it.each(['venues', 'help'])(
    'blocks targeted discovery of the hidden Broker %s command',
    async (command) => {
      const client = brokerClient({ envelope: {}, exit: 0 });

      await expect(
        dispatchEmbedded(
          client,
          ['trading', 'broker', 'describe', '--command', command],
          undefined,
          { runtime: 'jagent' }
        )
      ).rejects.toThrow(/not part of the Slim Broker tree/);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((client as any)._v2Request).not.toHaveBeenCalled();
    }
  );

  it('routes shared accounts and risk rules through the /api/v2 reads, not Broker', async () => {
    const client = brokerClient({ envelope: {}, exit: 0 });
    client.portfolio.accounts = vi
      .fn()
      .mockResolvedValue({ items: [], nextPageToken: null });
    client.trading.riskRules = vi.fn().mockResolvedValue({});

    await dispatchEmbedded(client, ['trading', 'accounts'], undefined, {
      runtime: 'jagent',
    });
    await dispatchEmbedded(client, ['trading', 'risk-rules'], undefined, {
      runtime: 'jagent',
    });

    expect(client.portfolio.accounts).toHaveBeenCalledWith({
      modes: ['PAPER_TRADING', 'LIVE_TRADING', 'BROKER_CONFIRMATION'],
    });
    expect(client.trading.riskRules).toHaveBeenCalled();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((client as any)._v2Request).not.toHaveBeenCalled();
  });

  it('passes argv through verbatim to /api/v2/broker/invocations', async () => {
    const client = brokerClient({ envelope: { status: 'filled' }, exit: 0 });
    const env = await dispatchEmbedded(
      client,
      [
        'trading',
        'broker',
        'quote',
        '--venue',
        'binance',
        '--symbol',
        'BTC/USDT',
      ],
      undefined,
      brokerDeps
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((client as any)._v2Request).toHaveBeenCalledWith(
      'POST',
      '/broker/invocations',
      expect.objectContaining({
        body: expect.objectContaining({
          argv: ['quote', '--venue', 'binance', '--symbol', 'BTC/USDT'],
        }),
      })
    );
    expect(env).toEqual({ status: 'filled' });
  });

  it('mints an --intent-id for a live order place', async () => {
    const client = brokerClient({ envelope: { status: 'filled' }, exit: 0 });
    await dispatchEmbedded(
      client,
      [
        'trading',
        'broker',
        'order',
        'place',
        '--account-id',
        'broker_account_0a1',
        '--venue',
        'binance',
        '--symbol',
        'BTC/USDT',
        '--side',
        'buy',
        '--amount',
        '0.01',
      ],
      undefined,
      brokerDeps
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const call = (client as any)._v2Request.mock.calls[0];
    const argv: string[] = call[2].body.argv;
    const idx = argv.indexOf('--intent-id');
    expect(idx).toBeGreaterThan(-1);
    expect(argv[idx + 1]).toMatch(/^[0-9a-f-]{36}$/); // a UUID
    expect(call[2].body.accountId).toBe('broker_account_0a1');
    expect(argv).not.toContain('--account-id');
  });

  it('does NOT mint an intent-id for a dry-run or when one is supplied', async () => {
    const client = brokerClient({ envelope: { dryRun: true }, exit: 0 });
    await dispatchEmbedded(
      client,
      [
        'trading',
        'broker',
        'order',
        'place',
        '--account-id',
        'broker_account_0a1',
        '--venue',
        'binance',
        '--symbol',
        'BTC/USDT',
        '--side',
        'buy',
        '--amount',
        '0.01',
        '--dry-run',
      ],
      undefined,
      { runtime: 'jagent' }
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const argv: string[] = (client as any)._v2Request.mock.calls[0][2].body
      .argv;
    expect(argv).not.toContain('--intent-id');

    const client2 = brokerClient({ envelope: {}, exit: 0 });
    await dispatchEmbedded(
      client2,
      [
        'trading',
        'broker',
        'order',
        'place',
        '--account-id',
        'broker_account_0a1',
        '--venue',
        'binance',
        '--symbol',
        'BTC/USDT',
        '--side',
        'buy',
        '--amount',
        '0.01',
        '--intent-id',
        'mine',
      ],
      undefined,
      { runtime: 'jagent' }
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const argv2: string[] = (client2 as any)._v2Request.mock.calls[0][2].body
      .argv;
    expect(argv2.filter((a) => a === '--intent-id')).toHaveLength(1);
    expect(argv2[argv2.indexOf('--intent-id') + 1]).toBe('mine');
  });

  it('does not double-mint when the handle is in equals-form', async () => {
    const client = brokerClient({ envelope: {}, exit: 0 });
    await dispatchEmbedded(
      client,
      [
        'trading',
        'broker',
        'order',
        'place',
        '--account-id',
        'broker_account_0a1',
        '--venue',
        'binance',
        '--symbol',
        'BTC/USDT',
        '--side',
        'buy',
        '--amount',
        '0.01',
        '--intent-id=mine',
      ],
      undefined,
      { runtime: 'jagent' }
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const argv: string[] = (client as any)._v2Request.mock.calls[0][2].body
      .argv;
    expect(argv.filter((a) => a.startsWith('--intent-id'))).toHaveLength(1);
    expect(argv).toContain('--intent-id=mine');
  });

  it.each([
    ['intentId', '{\n  "intentId": "retry-me"\n}\n'],
    ['clientOrderId', '{"clientOrderId":"venue-retry"}'],
    ['dryRun', '{"dryRun":true}'],
  ])('does not mint over a stdin %s control', async (_name, stdin) => {
    const client = brokerClient({ envelope: {}, exit: 0 });
    await dispatchBrokerStdin(client, stdin);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (client as any)._v2Request.mock.calls[0][2].body;
    expect(body.argv).toEqual(['order', 'place', '--stdin']);
    expect(body.stdin).toBe(stdin);
  });

  it('preserves the same stdin intent-id across retries', async () => {
    const client = brokerClient({ envelope: {}, exit: 0 });
    const stdin = '{"intentId":"stable-retry"}';

    await dispatchBrokerStdin(client, stdin);
    await dispatchBrokerStdin(client, stdin);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calls = (client as any)._v2Request.mock.calls;
    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(call[2].body.argv).toEqual(['order', 'place', '--stdin']);
      expect(call[2].body.stdin).toBe(stdin);
    }
  });

  it('still mints for a valid live stdin order without a retry control', async () => {
    const client = brokerClient({ envelope: {}, exit: 0 });
    const stdin = '{\n  "account": "7",\n  "dryRun": false\n}\n';
    await dispatchBrokerStdin(client, stdin);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (client as any)._v2Request.mock.calls[0][2].body;
    const idx = body.argv.indexOf('--intent-id');
    expect(idx).toBeGreaterThan(-1);
    expect(body.argv[idx + 1]).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.stdin).toBe(stdin);
  });

  it.each(['{bad json', 'null', '[]', '{"dryRun":"true"}'])(
    'does not mint for invalid or ambiguous stdin: %s',
    async (stdin) => {
      const client = brokerClient({ envelope: {}, exit: 0 });
      await dispatchBrokerStdin(client, stdin);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body = (client as any)._v2Request.mock.calls[0][2].body;
      expect(body.argv).toEqual(['order', 'place', '--stdin']);
      expect(body.stdin).toBe(stdin);
    }
  );

  it('forwards a broker-native valueless flag (--open) without a parse error', async () => {
    // --open is not a toolkit flag. broker must bypass the command parser and
    // forward it verbatim. (order list, not stdin — no blocking read.)
    const client = brokerClient({ envelope: { status: 'ok' }, exit: 0 });
    const env = await dispatchEmbedded(
      client,
      [
        'trading',
        'broker',
        'order',
        'list',
        '--venue',
        'binance',
        '--account-id',
        'broker_account_0a1',
        '--open',
      ],
      undefined,
      { runtime: 'jagent' }
    );
    expect(env).toEqual({ status: 'ok' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const argv: string[] = (client as any)._v2Request.mock.calls[0][2].body
      .argv;
    expect(argv).toContain('--open');
  });

  it('uses Jagent Broker result semantics without caller runtime wiring', async () => {
    const client = brokerClient({ envelope: { status: 'ok' }, exit: 0 });

    await expect(
      dispatchEmbedded(client, [
        'trading',
        'broker',
        'balance',
        '--venue',
        'binance',
        '--account-id',
        'broker_account_0a1',
      ])
    ).resolves.toEqual({ status: 'ok' });
  });

  it('synthesizes a network error envelope on transport failure', async () => {
    const client = makeClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (client as any)._v2Request = vi
      .fn()
      .mockRejectedValue(new Error('econnrefused'));
    const env = (await dispatchEmbedded(
      client,
      [
        'trading',
        'broker',
        'balance',
        '--venue',
        'binance',
        '--account-id',
        'broker_account_0a1',
      ],
      undefined,
      { runtime: 'jagent' }
    )) as { status: string; reason: { code: string } };
    expect(env.status).toBe('error');
    expect(env.reason.code).toBe('network');
  });
});
