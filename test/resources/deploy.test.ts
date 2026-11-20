import { afterEach, describe, it, expect } from 'vitest';
import { AlvaClient } from '../../src/client.js';
import { aCronjob, aCronjobRun, CRONJOB } from '../automationV2.js';
import { fakeV2 } from '../fakeV2.js';
import { v2 } from '../v2Schema.js';

let restore: (() => void) | undefined;
afterEach(() => restore?.());

function client() {
  return new AlvaClient({ apiKey: 'key', baseUrl: 'https://api.test' });
}

describe('DeployResource', () => {
  it('create() posts the CreateCronjobBody with argsJson as written', async () => {
    const fake = fakeV2({ 'POST /me/cronjobs': () => aCronjob() });
    restore = fake.restore;
    const body = {
      name: 'btc-ema',
      entryPath: '~/feeds/btc-ema/v1/src/index.js',
      cronExpression: '0 */4 * * *',
      argsJson: '{"n":9007199254740993}',
      runAsAccountId: 'account_0sa',
    };
    expect(
      await client().deploy.create(body, { idempotencyKey: 'create-1' })
    ).toEqual(aCronjob());
    expect(fake.calls[0].body).toEqual(body);
    expect(fake.calls[0].headers['Idempotency-Key']).toBe('"create-1"');
  });

  it('list() and get() return the CronjobList page and the Cronjob', async () => {
    const page = { items: [aCronjob()], nextPageToken: 'p2' };
    const fake = fakeV2({
      'GET /me/cronjobs': () => page,
      [`GET /cronjobs/${CRONJOB}`]: () => aCronjob(),
    });
    restore = fake.restore;
    const c = client();
    expect(await c.deploy.list({ pageSize: 5, pageToken: 'p1' })).toEqual(page);
    expect(await c.deploy.get(CRONJOB)).toEqual(aCronjob());
    expect(fake.calls[0].query.toString()).toBe('pageSize=5&pageToken=p1');
  });

  it('update() sends a merge patch where null clears the run-as account', async () => {
    const fake = fakeV2({ [`PATCH /cronjobs/${CRONJOB}`]: () => aCronjob() });
    restore = fake.restore;
    await client().deploy.update(CRONJOB, {
      cronExpression: '0 */2 * * *',
      runAsAccountId: null,
    });
    expect(fake.calls[0].body).toEqual({
      cronExpression: '0 */2 * * *',
      runAsAccountId: null,
    });
    expect(fake.calls[0].headers['Content-Type']).toBe(
      'application/merge-patch+json'
    );
  });

  it('pause, resume and delete return the Cronjob and {}', async () => {
    const paused = aCronjob({ status: 'PAUSED' });
    const fake = fakeV2({
      [`POST /cronjobs/${CRONJOB}/pause`]: () => paused,
      [`POST /cronjobs/${CRONJOB}/resume`]: () => aCronjob(),
      [`DELETE /cronjobs/${CRONJOB}`]: () => ({}),
    });
    restore = fake.restore;
    const c = client();
    expect(await c.deploy.pause(CRONJOB)).toEqual(paused);
    expect(await c.deploy.resume(CRONJOB)).toEqual(aCronjob());
    expect(await c.deploy.delete(CRONJOB)).toEqual({});
  });

  it('trigger() returns the DispatchReceipt and getDispatch() the dispatch', async () => {
    const dispatch = v2('CronjobDispatch', {
      id: 'cronjob_dispatch_0d',
      cronjobId: CRONJOB,
      state: 'SUCCEEDED',
      run: aCronjobRun(),
    });
    const fake = fakeV2({
      [`POST /cronjobs/${CRONJOB}/trigger`]: () =>
        v2('DispatchReceipt', { dispatchId: 'cronjob_dispatch_0d' }),
      'GET /cronjob-dispatches/cronjob_dispatch_0d': () => dispatch,
    });
    restore = fake.restore;
    const c = client();
    expect(await c.deploy.trigger(CRONJOB)).toEqual({
      dispatchId: 'cronjob_dispatch_0d',
    });
    expect(await c.deploy.getDispatch('cronjob_dispatch_0d')).toEqual(dispatch);
  });

  it('listRuns(), runStats() and getRunLogs() read their own routes', async () => {
    const page = { items: [aCronjobRun()], nextPageToken: null };
    const stats = v2('CronjobRunStats', {
      totalRuns: 3,
      succeededRuns: 2,
      failedRuns: 1,
      skippedRuns: 0,
      lastRunAt: '2026-11-02T00:00:00Z',
      lastSucceededAt: null,
    });
    const logs = v2('CronjobRunLogs', { logs: 'ok\n', error: null });
    const fake = fakeV2({
      [`GET /cronjobs/${CRONJOB}/runs`]: () => page,
      [`GET /cronjobs/${CRONJOB}/run-stats`]: () => stats,
      'GET /cronjob-runs/run_0r/logs': () => logs,
    });
    restore = fake.restore;
    const c = client();
    expect(await c.deploy.listRuns(CRONJOB, { pageSize: 10 })).toEqual(page);
    expect(await c.deploy.runStats(CRONJOB)).toEqual(stats);
    expect(await c.deploy.getRunLogs('run_0r')).toEqual(logs);
    expect(fake.calls[0].query.get('pageSize')).toBe('10');
  });
});
