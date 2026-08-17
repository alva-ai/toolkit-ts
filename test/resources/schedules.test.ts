import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AlvaClient } from '../../src/client.js';

const wireSchedule = {
  id: 'AgentSchedule:91:heartbeat',
  channelId: '91',
  name: 'heartbeat',
  rule: {
    kind: 'EVERY',
    atMs: null,
    everyIntervalSeconds: 3600,
    cronExpression: null,
    cronTimezone: null,
  },
  bounds: { startsAtMs: null, untilMs: null, maxOccurrences: 5 },
  message: { text: 'Check status.' },
  status: 'ACTIVE',
  failureCode: null,
  failureAtMs: null,
  occurrencesUsed: 1,
  nextFireAtMs: Date.parse('2026-08-11T05:00:00Z'),
  createdAtMs: Date.parse('2026-08-11T03:00:00Z'),
  updatedAtMs: Date.parse('2026-08-11T04:00:00Z'),
};

describe('SchedulesResource', () => {
  let client: AlvaClient;
  let request: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    client = new AlvaClient({ apiKey: 'alva_test' });
    request = vi.fn();
    client._request = request;
  });

  it('lists canonical schedules through the owner-scoped Channel graph', async () => {
    request.mockResolvedValue({
      data: {
        viewer: {
          channel: {
            schedules: { edges: [{ node: wireSchedule }] },
          },
        },
      },
    });

    await expect(client.schedules.list({ channelId: '91' })).resolves.toEqual([
      {
        name: 'heartbeat',
        rule: { kind: 'every', interval: 'PT3600S' },
        bounds: { maxOccurrences: 5 },
        text: 'Check status.',
        status: 'active',
        occurrencesUsed: 1,
        nextFireAt: '2026-08-11T05:00:00.000Z',
        createdAt: '2026-08-11T03:00:00.000Z',
        updatedAt: '2026-08-11T04:00:00.000Z',
      },
    ]);
    expect(request).toHaveBeenCalledWith(
      'POST',
      '/query',
      expect.objectContaining({
        body: expect.objectContaining({ variables: { channelId: '91' } }),
      })
    );
  });

  it('converts after to an absolute at before the mutation', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-11T04:00:00Z'));
    request.mockResolvedValue({
      data: {
        updateChannelSchedule: {
          schedule: {
            ...wireSchedule,
            rule: {
              kind: 'AT',
              atMs: Date.parse('2026-08-11T04:01:30Z'),
              everyIntervalSeconds: null,
              cronExpression: null,
              cronTimezone: null,
            },
            bounds: {},
          },
        },
      },
    });

    await client.schedules.put({
      channelId: 91,
      name: 'soon',
      rule: { kind: 'after', duration: 'PT90S' },
      text: 'Check soon.',
    });

    expect(request).toHaveBeenCalledWith(
      'POST',
      '/query',
      expect.objectContaining({
        body: expect.objectContaining({
          variables: {
            input: {
              channelId: '91',
              name: 'soon',
              rule: { kind: 'AT', atMs: Date.parse('2026-08-11T04:01:30Z') },
              message: { text: 'Check soon.' },
            },
          },
        }),
      })
    );
    vi.useRealTimers();
  });

  it('ceil-converts positive whole-second after from a fractional clock', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-11T04:00:00.001Z'));
    request.mockResolvedValue({
      data: {
        updateChannelSchedule: {
          schedule: {
            ...wireSchedule,
            rule: {
              kind: 'AT',
              atMs: Date.parse('2026-08-11T04:00:02Z'),
              everyIntervalSeconds: null,
              cronExpression: null,
              cronTimezone: null,
            },
          },
        },
      },
    });
    await client.schedules.put({
      channelId: 91,
      name: 'soon',
      rule: { kind: 'after', duration: 'PT1S' },
      text: 'Check soon.',
    });
    expect(request).toHaveBeenCalledWith(
      'POST',
      '/query',
      expect.objectContaining({
        body: expect.objectContaining({
          variables: expect.objectContaining({
            input: expect.objectContaining({
              rule: { kind: 'AT', atMs: Date.parse('2026-08-11T04:00:02Z') },
            }),
          }),
        }),
      })
    );
    vi.useRealTimers();
  });

  it('uses explicit lifecycle mutations and rejects unsafe inputs before IO', async () => {
    request.mockResolvedValue({
      data: { updateChannelSchedule: { schedule: wireSchedule } },
    });
    await client.schedules.pause({ channelId: 91, name: 'heartbeat' });
    expect(request).toHaveBeenCalledWith(
      'POST',
      '/query',
      expect.objectContaining({
        body: expect.objectContaining({
          variables: {
            input: {
              channelId: '91',
              name: 'heartbeat',
              lifecycle: 'PAUSED',
            },
          },
        }),
      })
    );

    request.mockClear();
    await expect(
      client.schedules.put({
        channelId: 91,
        name: 'bad',
        rule: { kind: 'at', timestamp: '2026-08-11T04:00:00' },
        text: 'x',
      })
    ).rejects.toThrow('timezone');
    expect(request).not.toHaveBeenCalled();
  });

  it('rejects unsafe numeric channel IDs before network IO', async () => {
    await expect(
      client.schedules.list({ channelId: Number.MAX_SAFE_INTEGER + 1 })
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    expect(request).not.toHaveBeenCalled();
  });

  it('accepts lowercase RFC3339 timezone markers', async () => {
    request.mockResolvedValue({
      data: {
        updateChannelSchedule: {
          schedule: {
            ...wireSchedule,
            rule: {
              kind: 'AT',
              atMs: Date.parse('2026-08-11T04:00:00Z'),
              everyIntervalSeconds: null,
              cronExpression: null,
              cronTimezone: null,
            },
          },
        },
      },
    });

    await client.schedules.put({
      channelId: 91,
      name: 'lowercase-time',
      rule: { kind: 'at', timestamp: '2026-08-11t04:00:00z' },
      text: 'x',
    });

    expect(request).toHaveBeenCalledWith(
      'POST',
      '/query',
      expect.objectContaining({
        body: expect.objectContaining({
          variables: expect.objectContaining({
            input: expect.objectContaining({
              rule: {
                kind: 'AT',
                atMs: Date.parse('2026-08-11T04:00:00Z'),
              },
            }),
          }),
        }),
      })
    );
  });

  it('tolerates omitted optional bounds and message in responses', async () => {
    request.mockResolvedValue({
      data: {
        viewer: {
          channel: {
            schedules: {
              edges: [
                { node: { ...wireSchedule, bounds: null, message: null } },
              ],
            },
          },
        },
      },
    });

    await expect(client.schedules.list({ channelId: 91 })).resolves.toEqual([
      expect.objectContaining({ bounds: {}, text: '' }),
    ]);
  });

  it.each([
    [
      'shared name grammar',
      {
        channelId: 91,
        name: 'Bad Name',
        rule: { kind: 'every', interval: 'PT1H' },
        text: 'x',
      },
    ],
    [
      'calendar-valid RFC3339 timestamp',
      {
        channelId: 91,
        name: 'valid',
        rule: { kind: 'at', timestamp: '2026-02-30T00:00:00Z' },
        text: 'x',
      },
    ],
    [
      'one-minute duration minimum',
      {
        channelId: 91,
        name: 'valid',
        rule: { kind: 'every', interval: 'PT59.999S' },
        text: 'x',
      },
    ],
    [
      'fractional explicit timestamp',
      {
        channelId: 91,
        name: 'valid',
        rule: { kind: 'at', timestamp: '2026-08-11T04:00:00.001Z' },
        text: 'x',
      },
    ],
    [
      'fractional after duration',
      {
        channelId: 91,
        name: 'valid',
        rule: { kind: 'after', duration: 'PT1.5S' },
        text: 'x',
      },
    ],
    [
      'valid UTF-8 text',
      {
        channelId: 91,
        name: 'valid',
        rule: { kind: 'every', interval: 'PT1H' },
        text: '\ud800',
      },
    ],
  ])('enforces %s before network IO', async (_name, input) => {
    await expect(client.schedules.put(input as never)).rejects.toMatchObject({
      code: 'INVALID_ARGUMENT',
    });
    expect(request).not.toHaveBeenCalled();
  });

  it('fails closed on an unknown response status', async () => {
    request.mockResolvedValue({
      data: {
        viewer: {
          channel: {
            schedules: {
              edges: [{ node: { ...wireSchedule, status: 'FUTURE' } }],
            },
          },
        },
      },
    });
    await expect(
      client.schedules.list({ channelId: 91 })
    ).rejects.toMatchObject({ code: 'GRAPHQL_EMPTY_RESPONSE' });
  });

  it('fails closed on a fractional semantic response timestamp', async () => {
    request.mockResolvedValue({
      data: {
        viewer: {
          channel: {
            schedules: {
              edges: [
                {
                  node: {
                    ...wireSchedule,
                    nextFireAtMs: wireSchedule.nextFireAtMs + 1,
                  },
                },
              ],
            },
          },
        },
      },
    });
    await expect(
      client.schedules.list({ channelId: 91 })
    ).rejects.toMatchObject({
      code: 'GRAPHQL_EMPTY_RESPONSE',
    });
  });

  it('resolves the viewer Agent Channel for CLI defaults', async () => {
    request.mockResolvedValue({
      data: {
        viewer: {
          channels: [
            { id: '12', kind: 'TOPIC' },
            { id: '91', kind: 'AGENT' },
          ],
        },
      },
    });
    await expect(client.schedules.agentChannelId()).resolves.toBe('91');
  });
});
