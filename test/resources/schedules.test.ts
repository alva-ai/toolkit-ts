import { afterEach, describe, expect, it, vi } from 'vitest';
import { AlvaError } from '../../src/error.js';
import type { V2RequestOptions } from '../../src/platformApi.js';
import { v2Client } from '../helpers/v2Client.js';

const CHANNEL = 'channel_0ch';
const INBOX = '/alva/home/alice/original.inbox.jsonl';

const wireSchedule = {
  id: 'schedule_0hb',
  channelId: CHANNEL,
  inboxPath: null,
  name: 'heartbeat',
  rule: {
    kind: 'EVERY',
    fireAt: null,
    everySeconds: 3600,
    cron: null,
    timezone: null,
  },
  startsAt: null,
  endsAt: null,
  maxOccurrences: 5,
  message: 'Check status.',
  status: 'ACTIVE',
  failureCode: null,
  failedAt: null,
  occurrencesUsed: 1,
  nextFireAt: '2026-08-11T05:00:00.000Z',
  createdAt: '2026-08-11T03:00:00.000Z',
  updatedAt: '2026-08-11T04:00:00.000Z',
};

const heartbeat = {
  name: 'heartbeat',
  rule: { kind: 'every', interval: 'PT3600S' },
  bounds: { maxOccurrences: 5 },
  text: 'Check status.',
  status: 'active',
  occurrencesUsed: 1,
  nextFireAt: '2026-08-11T05:00:00.000Z',
  createdAt: '2026-08-11T03:00:00.000Z',
  updatedAt: '2026-08-11T04:00:00.000Z',
};

function page(items: unknown[], nextPageToken: string | null = null) {
  return { items, nextPageToken };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('SchedulesResource', () => {
  it('lists a channel schedules page by page and rebuilds the SDK shape', async () => {
    const { client, v2 } = v2Client({
      [`GET /channels/${CHANNEL}/schedules`]: (o: V2RequestOptions) =>
        o.query?.pageToken === undefined
          ? page([wireSchedule], 'p2')
          : page([
              {
                ...wireSchedule,
                name: 'daily',
                rule: {
                  ...wireSchedule.rule,
                  kind: 'CRON',
                  everySeconds: null,
                  cron: '0 9 * * *',
                  timezone: 'UTC',
                },
                startsAt: '2026-08-12T00:00:00.000Z',
                endsAt: '2026-09-01T00:00:00.000Z',
                maxOccurrences: null,
                message: null,
                nextFireAt: null,
              },
            ]),
    });
    await expect(
      client.schedules.list({ channelId: CHANNEL })
    ).resolves.toEqual([
      heartbeat,
      {
        name: 'daily',
        rule: { kind: 'cron', expression: '0 9 * * *', timezone: 'UTC' },
        bounds: {
          startsAt: '2026-08-12T00:00:00.000Z',
          until: '2026-09-01T00:00:00.000Z',
        },
        text: '',
        status: 'active',
        occurrencesUsed: 1,
        createdAt: '2026-08-11T03:00:00.000Z',
        updatedAt: '2026-08-11T04:00:00.000Z',
      },
    ]);
    expect(v2.mock.calls.map((c) => c[2]?.query)).toEqual([
      { pageSize: 100, pageToken: undefined },
      { pageSize: 100, pageToken: 'p2' },
    ]);
  });

  it('uses the Session Inbox collection without changing the SDK result shape', async () => {
    const inboxSchedule = {
      ...wireSchedule,
      id: 'session_schedule_0hb',
      channelId: null,
      inboxPath: INBOX,
    };
    const { client, v2 } = v2Client({
      'GET /session-schedules': (o: V2RequestOptions) =>
        page(o.query?.name === 'missing' ? [] : [inboxSchedule]),
      'POST /session-schedules': inboxSchedule,
      'POST /session-schedules/session_schedule_0hb/pause': inboxSchedule,
      'POST /session-schedules/session_schedule_0hb/resume': inboxSchedule,
      'DELETE /session-schedules/session_schedule_0hb': {},
    });
    const [listed] = await client.schedules.list({ inboxPath: INBOX });
    expect(listed).toEqual(heartbeat);
    expect(v2.mock.calls[0][2]?.query).toEqual({
      inboxPath: INBOX,
      pageSize: 100,
      pageToken: undefined,
    });

    await client.schedules.put({
      inboxPath: INBOX,
      name: 'heartbeat',
      rule: { kind: 'every', interval: 'PT1H' },
      bounds: { maxOccurrences: 5 },
      text: 'Check.',
    });
    expect(v2).toHaveBeenLastCalledWith('POST', '/session-schedules', {
      body: {
        inboxPath: INBOX,
        name: 'heartbeat',
        rule: { kind: 'EVERY', everySeconds: 3600 },
        maxOccurrences: 5,
        message: 'Check.',
      },
    });
    await client.schedules.pause({ inboxPath: INBOX, name: 'heartbeat' });
    await client.schedules.resume({ inboxPath: INBOX, name: 'heartbeat' });
    await client.schedules.delete({ inboxPath: INBOX, name: 'heartbeat' });
    expect(v2.mock.calls.slice(2).map(([m, p, o]) => [m, p, o?.query])).toEqual(
      [
        ['GET', '/session-schedules', { inboxPath: INBOX, name: 'heartbeat' }],
        ['POST', '/session-schedules/session_schedule_0hb/pause', undefined],
        ['GET', '/session-schedules', { inboxPath: INBOX, name: 'heartbeat' }],
        ['POST', '/session-schedules/session_schedule_0hb/resume', undefined],
        ['GET', '/session-schedules', { inboxPath: INBOX, name: 'heartbeat' }],
        ['DELETE', '/session-schedules/session_schedule_0hb', undefined],
      ]
    );
    await expect(
      client.schedules.pause({ inboxPath: INBOX, name: 'missing' })
    ).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
  });

  it('finds a channel schedule by name and pauses it by its ID', async () => {
    const { client, v2 } = v2Client({
      [`GET /channels/${CHANNEL}/schedules`]: page([wireSchedule]),
      'POST /schedules/schedule_0hb/pause': {
        ...wireSchedule,
        status: 'PAUSED',
      },
    });
    await expect(
      client.schedules.pause({ channelId: CHANNEL, name: 'heartbeat' })
    ).resolves.toMatchObject({ status: 'paused' });
    expect(v2.mock.calls[0][2]).toEqual({ query: { name: 'heartbeat' } });
  });

  it('rejects ambiguous and malformed targets before any request', async () => {
    const { client, v2 } = v2Client({});
    for (const target of [
      {},
      { channelId: CHANNEL, inboxPath: INBOX },
      { channelId: '' },
      { channelId: 91 },
      { inboxPath: '' },
      { inboxPath: 'relative.inbox.jsonl' },
      { inboxPath: '/alva/home/alice/../alice/original.inbox.jsonl' },
      { inboxPath: '/alva/home/alice//original.inbox.jsonl' },
      { inboxPath: '/alva/home/alice/original.jsonl' },
      { inboxPath: '/alva/home/alice/original.jsonl.inbox' },
    ]) {
      await expect(
        client.schedules.list(
          target as Parameters<typeof client.schedules.list>[0]
        )
      ).rejects.toThrow();
    }
    expect(v2).not.toHaveBeenCalled();
  });

  it('keeps the problem code of a failed request', async () => {
    const { client } = v2Client({
      [`GET /channels/${CHANNEL}/schedules`]: () => {
        throw new AlvaError('RATE_LIMITED', 'slow down', 429);
      },
    });
    await expect(
      client.schedules.list({ channelId: CHANNEL })
    ).rejects.toMatchObject({ code: 'RATE_LIMITED', status: 429 });
  });

  it('converts after to an absolute fireAt before the request', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-11T04:00:00Z'));
    const at = {
      ...wireSchedule,
      rule: {
        kind: 'AT',
        fireAt: '2026-08-11T04:01:30.000Z',
        everySeconds: null,
        cron: null,
        timezone: null,
      },
      maxOccurrences: null,
    };
    const { client, v2 } = v2Client({
      [`POST /channels/${CHANNEL}/schedules`]: at,
    });
    await expect(
      client.schedules.put({
        channelId: CHANNEL,
        name: 'soon',
        rule: { kind: 'after', duration: 'PT90S' },
        text: 'Check soon.',
      })
    ).resolves.toMatchObject({
      rule: { kind: 'at', timestamp: '2026-08-11T04:01:30.000Z' },
      bounds: {},
    });
    expect(v2).toHaveBeenCalledWith('POST', `/channels/${CHANNEL}/schedules`, {
      body: {
        name: 'soon',
        rule: { kind: 'AT', fireAt: '2026-08-11T04:01:30.000Z' },
        message: 'Check soon.',
      },
    });
  });

  it('ceil-converts positive whole-second after from a fractional clock', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-11T04:00:00.001Z'));
    const { client, v2 } = v2Client({
      [`POST /channels/${CHANNEL}/schedules`]: wireSchedule,
    });
    await client.schedules.put({
      channelId: CHANNEL,
      name: 'soon',
      rule: { kind: 'after', duration: 'PT1S' },
      text: 'Check soon.',
    });
    expect(v2.mock.calls[0][2]?.body).toMatchObject({
      rule: { kind: 'AT', fireAt: '2026-08-11T04:00:02.000Z' },
    });
  });

  it('sends cron rules and bounds in the v2 body', async () => {
    const { client, v2 } = v2Client({
      [`POST /channels/${CHANNEL}/schedules`]: wireSchedule,
    });
    await client.schedules.put({
      channelId: CHANNEL,
      name: 'daily',
      rule: {
        kind: 'cron',
        expression: '0 9 * * *',
        timezone: 'America/New_York',
      },
      bounds: {
        startsAt: '2026-08-12T00:00:00+02:00',
        until: '2026-09-01T00:00:00Z',
      },
      text: 'Brief me.',
    });
    expect(v2.mock.calls[0][2]?.body).toEqual({
      name: 'daily',
      rule: { kind: 'CRON', cron: '0 9 * * *', timezone: 'America/New_York' },
      startsAt: '2026-08-11T22:00:00.000Z',
      endsAt: '2026-09-01T00:00:00.000Z',
      message: 'Brief me.',
    });
  });

  it('accepts lowercase RFC3339 timezone markers', async () => {
    const { client, v2 } = v2Client({
      [`POST /channels/${CHANNEL}/schedules`]: wireSchedule,
    });
    await client.schedules.put({
      channelId: CHANNEL,
      name: 'lowercase-time',
      rule: { kind: 'at', timestamp: '2026-08-11t04:00:00z' },
      text: 'x',
    });
    expect(v2.mock.calls[0][2]?.body).toMatchObject({
      rule: { kind: 'AT', fireAt: '2026-08-11T04:00:00.000Z' },
    });
  });

  it.each([
    [
      'shared name grammar',
      {
        name: 'Bad Name',
        rule: { kind: 'every', interval: 'PT1H' },
        text: 'x',
      },
    ],
    [
      'calendar-valid RFC3339 timestamp',
      {
        name: 'valid',
        rule: { kind: 'at', timestamp: '2026-02-30T00:00:00Z' },
        text: 'x',
      },
    ],
    [
      'one-minute duration minimum',
      {
        name: 'valid',
        rule: { kind: 'every', interval: 'PT59.999S' },
        text: 'x',
      },
    ],
    [
      'fractional explicit timestamp',
      {
        name: 'valid',
        rule: { kind: 'at', timestamp: '2026-08-11T04:00:00.001Z' },
        text: 'x',
      },
    ],
    [
      'fractional after duration',
      { name: 'valid', rule: { kind: 'after', duration: 'PT1.5S' }, text: 'x' },
    ],
    [
      'empty ISO time component',
      { name: 'valid', rule: { kind: 'after', duration: 'P1DT' }, text: 'x' },
    ],
    [
      'valid UTF-8 text',
      {
        name: 'valid',
        rule: { kind: 'every', interval: 'PT1H' },
        text: '\ud800',
      },
    ],
  ])('enforces %s before network IO', async (_name, input) => {
    const { client, v2 } = v2Client({});
    await expect(
      client.schedules.put({ channelId: CHANNEL, ...input } as never)
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    expect(v2).not.toHaveBeenCalled();
  });

  it('fails closed on an unknown response status', async () => {
    const { client } = v2Client({
      [`GET /channels/${CHANNEL}/schedules`]: page([
        { ...wireSchedule, status: 'FUTURE' },
      ]),
    });
    await expect(
      client.schedules.list({ channelId: CHANNEL })
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('fails closed on a fractional semantic response timestamp', async () => {
    const { client } = v2Client({
      [`GET /channels/${CHANNEL}/schedules`]: page([
        { ...wireSchedule, nextFireAt: '2026-08-11T05:00:00.001Z' },
      ]),
    });
    await expect(
      client.schedules.list({ channelId: CHANNEL })
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('reports a failed schedule with its failure code and time', async () => {
    const { client } = v2Client({
      [`GET /channels/${CHANNEL}/schedules`]: page([
        {
          ...wireSchedule,
          status: 'FAILED',
          failureCode: 'TARGET_INVALID',
          failedAt: '2026-08-11T04:30:00.250Z',
        },
      ]),
    });
    const [schedule] = await client.schedules.list({ channelId: CHANNEL });
    expect(schedule).toMatchObject({
      status: 'failed',
      failure: { code: 'target_invalid', at: '2026-08-11T04:30:00.250Z' },
    });
  });

  it('resolves the viewer Agent Channel for CLI defaults', async () => {
    const { client, v2 } = v2Client({
      'GET /me/channels': page([{ id: CHANNEL, kind: 'AGENT' }]),
    });
    await expect(client.schedules.agentChannelId()).resolves.toBe(CHANNEL);
    expect(v2).toHaveBeenCalledWith('GET', '/me/channels', {
      query: { kind: 'AGENT' },
    });
  });

  it('reports a missing Agent Channel as NOT_FOUND', async () => {
    const { client } = v2Client({ 'GET /me/channels': page([]) });
    await expect(client.schedules.agentChannelId()).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
