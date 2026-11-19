import { describe, it, expect } from 'vitest';
import { v2Client } from '../helpers/v2Client.js';

const ME = {
  id: 'account_0alice',
  username: 'alice',
  planTier: 'FREE',
  messagingBindings: [],
  preferredMessagingApp: null,
  toolkitMinVersion: '1.0.0',
  homePath: '/alva/home/alice',
};

const JOB = {
  id: 'cronjob_0c',
  name: 'my-job',
  entryPath: '/alva/home/alice/scripts/job.js',
  cronExpression: '*/5 * * * *',
  timezone: 'UTC',
  status: 'ACTIVE',
  argsJson: '{"channel_id":2087608331744604161}',
  pushNotify: true,
  maxHeapSizeMb: null,
  executionTimeoutSeconds: 1800,
  runAsAccountId: null,
  startsAt: '2026-07-15T12:00:00.000Z',
  endsAt: null,
  maxRuns: 12,
  runCount: 3,
  createdAt: '2026-07-15T11:00:00.000Z',
  updatedAt: '2026-07-15T11:30:00.000Z',
};

const CRONJOB = {
  id: 'cronjob_0c',
  name: 'my-job',
  path: '/scripts/job.js',
  cron_expression: '*/5 * * * *',
  status: 'active',
  args: { channel_id: 2087608331744604161 },
  push_notify: true,
  max_heap_size_mb: null,
  execution_timeout_seconds: 1800,
  run_as_user_id: '0',
  start_at: '2026-07-15T12:00:00.000Z',
  end_at: null,
  max_runs: 12,
  run_count: 3,
  created_at: '2026-07-15T11:00:00.000Z',
  updated_at: '2026-07-15T11:30:00.000Z',
};

const RUN = {
  id: 'cronjob_run_0r',
  cronjobId: 'cronjob_0c',
  dispatchId: 'cronjob_dispatch_0d',
  status: 'SUCCEEDED',
  error: null,
  durationMs: 1200,
  creditsUsed: '3',
  createdAt: '2026-07-15T12:00:00.000Z',
  finishedAt: '2026-07-15T12:00:01.200Z',
};

describe('DeployResource', () => {
  it('create posts the v2 body and rebuilds the v1 cronjob', async () => {
    const { client, v2 } = v2Client({
      'GET /me': ME,
      'POST /me/cronjobs': JOB,
    });
    const job = await client.deploy.create({
      name: 'my-job',
      path: '~/scripts/job.js',
      cron_expression: '*/5 * * * *',
      args: { threshold: 1 },
      run_as_user_id: 'account_0sa',
      start_at: '2026-07-15T12:00:00Z',
      max_runs: 12,
      execution_timeout_seconds: 3600,
    });
    expect(job).toEqual(CRONJOB);
    expect(v2).toHaveBeenCalledWith('POST', '/me/cronjobs', {
      body: {
        name: 'my-job',
        entryPath: '~/scripts/job.js',
        cronExpression: '*/5 * * * *',
        argsJson: '{"threshold":1}',
        pushNotify: undefined,
        maxHeapSizeMb: undefined,
        executionTimeoutSeconds: 3600,
        runAsAccountId: 'account_0sa',
        startsAt: '2026-07-15T12:00:00Z',
        endsAt: undefined,
        maxRuns: 12,
      },
    });
  });

  it('_createSerializedArgs sends the exact args text as argsJson', async () => {
    const { client, v2 } = v2Client({
      'GET /me': ME,
      'POST /me/cronjobs': JOB,
    });
    const args = '{"channel_id":2087608331744604161}';
    await client.deploy._createSerializedArgs(
      { name: 'j', path: '~/j.js', cron_expression: '* * * * *' },
      args
    );
    const body = v2.mock.calls.find((c) => c[0] === 'POST')?.[2]?.body;
    expect(body).toMatchObject({ argsJson: args });
  });

  it('keeps legacy args that are not JSON as text and null args as null', async () => {
    const { client } = v2Client({
      'GET /me': ME,
      'GET /me/cronjobs': {
        items: [
          { ...JOB, argsJson: 'not json', runAsAccountId: 'account_0sa' },
          { ...JOB, argsJson: null, entryPath: '/alva/home/bob/x.js' },
        ],
        nextPageToken: null,
      },
    });
    const { cronjobs, next_cursor } = await client.deploy.list();
    expect(cronjobs.map((j) => [j.args, j.run_as_user_id, j.path])).toEqual([
      ['not json', 'account_0sa', '/scripts/job.js'],
      [null, '0', '/alva/home/bob/x.js'],
    ]);
    expect(next_cursor).toBe('');
  });

  it('list passes limit and cursor as one page and reads the username once', async () => {
    const { client, v2 } = v2Client({
      'GET /me': ME,
      'GET /me/cronjobs': { items: [JOB], nextPageToken: 'next' },
      'GET /cronjobs/cronjob_0c': JOB,
    });
    const page = await client.deploy.list({ limit: 10, cursor: 'abc' });
    expect(page).toEqual({ cronjobs: [CRONJOB], next_cursor: 'next' });
    expect(v2).toHaveBeenCalledWith('GET', '/me/cronjobs', {
      query: { pageSize: 10, pageToken: 'abc' },
    });
    await expect(client.deploy.get({ id: 'cronjob_0c' })).resolves.toEqual(
      CRONJOB
    );
    expect(v2.mock.calls.filter((c) => c[1] === '/me')).toHaveLength(1);
  });

  it('update sends a merge patch; run_as_user_id "0" runs as the owner', async () => {
    const { client, v2 } = v2Client({
      'GET /me': ME,
      'PATCH /cronjobs/cronjob_0c': JOB,
    });
    await client.deploy.update({
      id: 'cronjob_0c',
      name: 'new-name',
      execution_timeout_seconds: 900,
      run_as_user_id: '0',
    });
    expect(v2).toHaveBeenCalledWith('PATCH', '/cronjobs/cronjob_0c', {
      body: {
        name: 'new-name',
        cronExpression: undefined,
        argsJson: undefined,
        pushNotify: undefined,
        maxHeapSizeMb: undefined,
        executionTimeoutSeconds: 900,
        runAsOwner: true,
      },
    });
    await client.deploy._updateSerializedArgs(
      { id: 'cronjob_0c', run_as_user_id: 'account_0sa' },
      '{"a":1}'
    );
    expect(v2.mock.calls.at(-1)?.[2]?.body).toMatchObject({
      argsJson: '{"a":1}',
      runAsAccountId: 'account_0sa',
    });
    expect(v2.mock.calls.at(-1)?.[2]?.body).not.toHaveProperty('runAsOwner');
  });

  it('delete, pause and resume address the Cronjob ID', async () => {
    const { client, v2 } = v2Client({
      'DELETE /cronjobs/cronjob_0c': {},
      'POST /cronjobs/cronjob_0c/pause': JOB,
      'POST /cronjobs/cronjob_0c/resume': JOB,
    });
    await client.deploy.delete({ id: 'cronjob_0c' });
    await client.deploy.pause({ id: 'cronjob_0c' });
    await client.deploy.resume({ id: 'cronjob_0c' });
    expect(v2.mock.calls.map(([m, p]) => `${m} ${p}`)).toEqual([
      'DELETE /cronjobs/cronjob_0c',
      'POST /cronjobs/cronjob_0c/pause',
      'POST /cronjobs/cronjob_0c/resume',
    ]);
  });

  it('trigger returns the dispatch ID as workflow_run_id', async () => {
    const { client } = v2Client({
      'POST /cronjobs/cronjob_0c/trigger': {
        dispatchId: 'cronjob_dispatch_0d',
      },
    });
    await expect(client.deploy.trigger({ id: 'cronjob_0c' })).resolves.toEqual({
      workflow_run_id: 'cronjob_dispatch_0d',
    });
  });

  it('listRuns rebuilds runs and stats with the v1 names', async () => {
    const { client, v2 } = v2Client({
      'GET /cronjobs/cronjob_0c/runs': {
        items: [
          RUN,
          {
            ...RUN,
            id: 'cronjob_run_0q',
            status: 'QUEUED',
            dispatchId: null,
            error: 'boom',
            finishedAt: null,
          },
        ],
        nextPageToken: 'more',
      },
      'GET /cronjobs/cronjob_0c/run-stats': {
        totalRuns: 4,
        succeededRuns: 2,
        failedRuns: 1,
        skippedRuns: 1,
        lastRunAt: '2026-07-15T12:00:00.000Z',
        lastSucceededAt: null,
      },
    });
    expect(
      await client.deploy.listRuns({
        cronjob_id: 'cronjob_0c',
        first: 10,
        cursor: 'tok',
      })
    ).toEqual({
      runs: [
        {
          id: 'cronjob_run_0r',
          cronjob_id: 'cronjob_0c',
          status: 'completed',
          error: '',
          duration_ms: 1200,
          credits_used: 3,
          created_at: '2026-07-15T12:00:00.000Z',
          finished_at: '2026-07-15T12:00:01.200Z',
          workflow_run_id: 'cronjob_dispatch_0d',
        },
        {
          id: 'cronjob_run_0q',
          cronjob_id: 'cronjob_0c',
          status: 'dispatched',
          error: 'boom',
          duration_ms: 1200,
          credits_used: 3,
          created_at: '2026-07-15T12:00:00.000Z',
          workflow_run_id: '',
        },
      ],
      stats: {
        total_runs: 4,
        success_count: 2,
        fail_count: 1,
        skipped_count: 1,
        last_run_at: '2026-07-15T12:00:00.000Z',
      },
      next_cursor: 'more',
    });
    expect(v2.mock.calls[0][2]).toEqual({
      query: { pageSize: 10, pageToken: 'tok' },
    });
  });

  it('getRunStatus maps the dispatch state and run', async () => {
    const { client } = v2Client({
      'GET /cronjob-dispatches/cronjob_dispatch_0d': {
        id: 'cronjob_dispatch_0d',
        cronjobId: 'cronjob_0c',
        state: 'SUCCEEDED',
        run: RUN,
      },
    });
    await expect(
      client.deploy.getRunStatus({
        cronjob_id: 'cronjob_0c',
        workflow_run_id: 'cronjob_dispatch_0d',
      })
    ).resolves.toMatchObject({
      workflow_run_id: 'cronjob_dispatch_0d',
      state: 'COMPLETED',
      run: { id: 'cronjob_run_0r', status: 'completed' },
    });
  });

  it('getRunStatus of another cronjob is NOT_FOUND, and QUEUED is DISPATCHED', async () => {
    const { client } = v2Client({
      'GET /cronjob-dispatches/cronjob_dispatch_0d': {
        id: 'cronjob_dispatch_0d',
        cronjobId: 'cronjob_0c',
        state: 'QUEUED',
        run: null,
      },
    });
    await expect(
      client.deploy.getRunStatus({
        cronjob_id: 'cronjob_0other',
        workflow_run_id: 'cronjob_dispatch_0d',
      })
    ).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
    await expect(
      client.deploy.getRunStatus({
        cronjob_id: 'cronjob_0c',
        workflow_run_id: 'cronjob_dispatch_0d',
      })
    ).resolves.toEqual({
      workflow_run_id: 'cronjob_dispatch_0d',
      state: 'DISPATCHED',
    });
  });

  it('getRunLogs reads the run by its ID', async () => {
    const { client } = v2Client({
      'GET /cronjob-runs/cronjob_run_0r/logs': { logs: 'hello\n', error: null },
    });
    await expect(
      client.deploy.getRunLogs({
        cronjob_id: 'cronjob_0c',
        run_id: 'cronjob_run_0r',
      })
    ).resolves.toEqual({ logs: 'hello\n', error: '' });
  });
});
