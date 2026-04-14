import { describe, it, expect, vi } from 'vitest';
import { DeployResource } from '../../src/resources/deploy.js';
import { AlvaClient } from '../../src/client.js';

function makeClient(): AlvaClient & { _request: ReturnType<typeof vi.fn> } {
  const client = new AlvaClient({ apiKey: 'key' }) as AlvaClient & {
    _request: ReturnType<typeof vi.fn>;
  };
  client._request = vi.fn().mockResolvedValue({});
  return client;
}

describe('DeployResource', () => {
  it('create sends POST /api/v1/deploy/cronjob', async () => {
    const client = makeClient();
    const deploy = new DeployResource(client);
    await deploy.create({
      name: 'my-job',
      path: '~/scripts/job.js',
      cron_expression: '*/5 * * * *',
    });
    expect(client._request).toHaveBeenCalledWith(
      'POST',
      '/api/v1/deploy/cronjob',
      {
        body: {
          name: 'my-job',
          path: '~/scripts/job.js',
          cron_expression: '*/5 * * * *',
          args: undefined,
          push_notify: undefined,
        },
      }
    );
  });

  it('list sends GET /api/v1/deploy/cronjobs with pagination', async () => {
    const client = makeClient();
    const deploy = new DeployResource(client);
    await deploy.list({ limit: 10, cursor: 'abc' });
    expect(client._request).toHaveBeenCalledWith(
      'GET',
      '/api/v1/deploy/cronjobs',
      { query: { limit: 10, cursor: 'abc' } }
    );
  });

  it('list sends GET with default params', async () => {
    const client = makeClient();
    const deploy = new DeployResource(client);
    await deploy.list();
    expect(client._request).toHaveBeenCalledWith(
      'GET',
      '/api/v1/deploy/cronjobs',
      { query: { limit: undefined, cursor: undefined } }
    );
  });

  it('get sends GET /api/v1/deploy/cronjob/:id', async () => {
    const client = makeClient();
    const deploy = new DeployResource(client);
    await deploy.get({ id: 123 });
    expect(client._request).toHaveBeenCalledWith(
      'GET',
      '/api/v1/deploy/cronjob/123'
    );
  });

  it('update sends PATCH /api/v1/deploy/cronjob/:id', async () => {
    const client = makeClient();
    const deploy = new DeployResource(client);
    await deploy.update({ id: 123, name: 'new-name' });
    expect(client._request).toHaveBeenCalledWith(
      'PATCH',
      '/api/v1/deploy/cronjob/123',
      { body: { name: 'new-name' } }
    );
  });

  it('delete sends DELETE /api/v1/deploy/cronjob/:id', async () => {
    const client = makeClient();
    const deploy = new DeployResource(client);
    await deploy.delete({ id: 123 });
    expect(client._request).toHaveBeenCalledWith(
      'DELETE',
      '/api/v1/deploy/cronjob/123'
    );
  });

  it('pause sends POST /api/v1/deploy/cronjob/:id/pause', async () => {
    const client = makeClient();
    const deploy = new DeployResource(client);
    await deploy.pause({ id: 123 });
    expect(client._request).toHaveBeenCalledWith(
      'POST',
      '/api/v1/deploy/cronjob/123/pause'
    );
  });

  it('resume sends POST /api/v1/deploy/cronjob/:id/resume', async () => {
    const client = makeClient();
    const deploy = new DeployResource(client);
    await deploy.resume({ id: 123 });
    expect(client._request).toHaveBeenCalledWith(
      'POST',
      '/api/v1/deploy/cronjob/123/resume'
    );
  });

  it('listRuns sends GET /api/v1/deploy/cronjob/:id/runs with pagination', async () => {
    const client = makeClient();
    const deploy = new DeployResource(client);
    await deploy.listRuns({ cronjob_id: 42, first: 10, cursor: 99 });
    expect(client._request).toHaveBeenCalledWith(
      'GET',
      '/api/v1/deploy/cronjob/42/runs',
      { query: { first: 10, cursor: 99 } }
    );
  });

  it('listRuns sends GET with default params', async () => {
    const client = makeClient();
    const deploy = new DeployResource(client);
    await deploy.listRuns({ cronjob_id: 42 });
    expect(client._request).toHaveBeenCalledWith(
      'GET',
      '/api/v1/deploy/cronjob/42/runs',
      { query: { first: undefined, cursor: undefined } }
    );
  });

  it('getRunLogs sends GET /api/v1/deploy/cronjob/:id/runs/:runId/logs', async () => {
    const client = makeClient();
    const deploy = new DeployResource(client);
    await deploy.getRunLogs({ cronjob_id: 42, run_id: 7 });
    expect(client._request).toHaveBeenCalledWith(
      'GET',
      '/api/v1/deploy/cronjob/42/runs/7/logs'
    );
  });
});
