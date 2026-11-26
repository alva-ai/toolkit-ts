import { afterEach, describe, it, expect } from 'vitest';
import { AlvaClient } from '../../src/client.js';
import {
  aSchedule,
  aSessionSchedule,
  CHANNEL,
  INBOX,
} from '../automationV2.js';
import { fakeV2, problem } from '../fakeV2.js';
import { v2 } from '../v2Schema.js';

let restore: (() => void) | undefined;
afterEach(() => restore?.());

function client() {
  return new AlvaClient({ apiKey: 'key', baseUrl: 'https://api.test' });
}

const PUT = {
  name: 'market-open',
  message: 'Review the market open',
  rule: { kind: 'CRON' as const, cron: '30 9 * * 1-5', timezone: 'UTC' },
  startsAt: '2026-07-15T12:00:00.000Z',
};

describe('SchedulesResource', () => {
  it('list() and put() address a Channel and return the v2 shapes', async () => {
    const page = { items: [aSchedule()], nextPageToken: null };
    const fake = fakeV2({
      [`GET /channels/${CHANNEL}/schedules`]: () => page,
      [`POST /channels/${CHANNEL}/schedules`]: () => aSchedule(),
    });
    restore = fake.restore;
    const c = client();
    expect(await c.schedules.list(CHANNEL, { name: 'heartbeat' })).toEqual(
      page
    );
    expect(
      await c.schedules.put(CHANNEL, PUT, { idempotencyKey: 'put-1' })
    ).toEqual(aSchedule());
    expect(fake.calls[0].query.get('name')).toBe('heartbeat');
    expect(fake.calls[1].body).toEqual(PUT);
    expect(fake.calls[1].headers['Idempotency-Key']).toBe('"put-1"');
  });

  it('pause, resume and delete take the Schedule ID', async () => {
    const paused = aSchedule({ status: 'PAUSED' });
    const fake = fakeV2({
      'POST /schedules/schedule_0s/pause': () => paused,
      'POST /schedules/schedule_0s/resume': () => aSchedule(),
      'DELETE /schedules/schedule_0s': () => ({}),
    });
    restore = fake.restore;
    const c = client();
    expect(await c.schedules.pause('schedule_0s')).toEqual(paused);
    expect(await c.schedules.resume('schedule_0s')).toEqual(aSchedule());
    expect(await c.schedules.delete('schedule_0s')).toEqual({});
  });

  it('the Session family addresses a Session Inbox', async () => {
    const page = { items: [aSessionSchedule()], nextPageToken: null };
    const fake = fakeV2({
      'GET /session-schedules': () => page,
      'POST /session-schedules': () => aSessionSchedule(),
      'POST /session-schedules/session_schedule_0s/pause': () =>
        aSessionSchedule({ status: 'PAUSED' }),
      'POST /session-schedules/session_schedule_0s/resume': () =>
        aSessionSchedule(),
      'DELETE /session-schedules/session_schedule_0s': () => ({}),
    });
    restore = fake.restore;
    const c = client();
    expect(await c.schedules.listSession({ inboxPath: INBOX })).toEqual(page);
    await c.schedules.putSession({ inboxPath: INBOX, ...PUT });
    await c.schedules.pauseSession('session_schedule_0s');
    await c.schedules.resumeSession('session_schedule_0s');
    await c.schedules.deleteSession('session_schedule_0s');
    expect(fake.calls[0].query.get('inboxPath')).toBe(INBOX);
    expect(fake.calls[1].body).toEqual({ inboxPath: INBOX, ...PUT });
    expect(fake.calls.map((call) => call.method)).toEqual([
      'GET',
      'POST',
      'POST',
      'POST',
      'DELETE',
    ]);
  });

  it('keeps the problem of a failed request', async () => {
    const fake = fakeV2({
      [`POST /channels/${CHANNEL}/schedules`]: () =>
        problem(400, 'INVALID_ARGUMENT'),
    });
    restore = fake.restore;
    await expect(client().schedules.put(CHANNEL, PUT)).rejects.toMatchObject({
      code: 'INVALID_ARGUMENT',
      status: 400,
    });
  });

  it('agentChannelId() reads the caller AGENT channel', async () => {
    const fake = fakeV2({
      'GET /me/channels': [
        () => ({
          items: [
            v2('Channel', {
              id: CHANNEL,
              kind: 'AGENT',
              slug: 'agent',
              description: '',
              title: null,
              mainSessionId: null,
              createdAt: null,
              updatedAt: null,
              lastActivityAt: null,
              summary: null,
            }),
          ],
          nextPageToken: null,
        }),
        () => ({ items: [], nextPageToken: null }),
      ],
    });
    restore = fake.restore;
    const c = client();
    expect(await c.schedules.agentChannelId()).toBe(CHANNEL);
    expect(fake.calls[0].query.get('kind')).toBe('AGENT');
    await expect(c.schedules.agentChannelId()).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
