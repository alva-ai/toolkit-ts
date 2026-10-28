import { describe, expect, it, vi } from 'vitest';
import { AlvaClient } from '../../src/client.js';
import { AlvaError } from '../../src/error.js';

const inboxPath =
  '/alva/home/alice/agents/steward-9/.pi/agent/sessions/main.inbox.jsonl';

const alertSnapshot = JSON.stringify({
  kind: 'alert',
  delivery_id: 5,
  body_md: 'Frozen evidence: "quoted" facts\n原始正文',
  thesis: {
    thesis_id: 7,
    thesis_title: 'Original Thesis',
    statement: 'Original claim',
    author_version_id: 11,
    stance: 'refutes',
    reasoning: 'The evidence contradicts the original claim.',
  },
});

function client() {
  return new AlvaClient({ apiKey: 'alva_test' });
}

describe('StewardResource', () => {
  it('records a decision through the gateway mutation', async () => {
    const c = client();
    const request = vi.spyOn(c, '_request').mockResolvedValue({
      data: { updateStewardDelivery: { delivery: { state: 'consumed' } } },
    });
    const result = await c.steward.decide({
      inboxPath,
      deliveryId: '123',
      decision: 'digest',
      reason: ' routine event ',
    });
    expect(result).toEqual({ state: 'consumed' });
    expect(request).toHaveBeenCalledWith('POST', '/query', {
      body: {
        query: expect.stringContaining('updateStewardDelivery'),
        variables: {
          input: {
            inboxPath,
            deliveryId: '123',
            decision: { decision: 'DIGEST', reason: 'routine event' },
          },
        },
      },
    });
  });

  it('generates a UUID request id for forward and send when none is given', async () => {
    const c = client();
    const request = vi
      .spyOn(c, '_request')
      .mockResolvedValueOnce({
        data: {
          updateStewardDelivery: {
            delivery: { state: 'sent', channelMessageId: '77' },
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          postStewardMessage: {
            message: { channelMessageId: '78', requestId: 'x' },
          },
        },
      });
    await c.steward.forward({ inboxPath, deliveryId: '5' });
    await c.steward.send({ inboxPath, body: 'x', deliveryIds: ['5', '6'] });
    const uuid = /^[0-9a-f-]{36}$/;
    const forwardInput = (
      request.mock.calls[0][2] as {
        body: { variables: { input: { forward: { requestId: string } } } };
      }
    ).body.variables.input.forward;
    const sendInput = (
      request.mock.calls[1][2] as {
        body: {
          variables: { input: { requestId: string; deliveryIds: string[] } };
        };
      }
    ).body.variables.input;
    expect(forwardInput.requestId).toMatch(uuid);
    expect(sendInput.requestId).toMatch(uuid);
    expect(sendInput.deliveryIds).toEqual(['5', '6']);
  });

  it('send accepts an empty delivery set (For-You-only Brief) but briefed does not', async () => {
    const c = client();
    const request = vi.spyOn(c, '_request').mockResolvedValue({
      data: {
        postStewardMessage: {
          message: { channelMessageId: '90', requestId: 'x' },
        },
      },
    });
    await c.steward.send({
      inboxPath,
      body: 'For You only',
      deliveryIds: [],
      requestId: '11111111-1111-4111-8111-111111111111',
    });
    // Omitting deliveryIds entirely is equivalent to an empty set.
    await c.steward.send({
      inboxPath,
      body: 'For You only',
      requestId: '22222222-2222-4222-8222-222222222222',
    });
    for (const call of [request.mock.calls[0], request.mock.calls[1]]) {
      const sendInput = (
        call[2] as {
          body: { variables: { input: { deliveryIds: string[] } } };
        }
      ).body.variables.input;
      expect(sendInput.deliveryIds).toEqual([]);
    }

    await expect(
      c.steward.briefed({ inboxPath, deliveryIds: [], digestRunId: 'run' })
    ).rejects.toThrow(/at least one delivery id/);
  });

  it('reads one connection page through the explicit low-level method', async () => {
    const c = client();
    const request = vi.spyOn(c, '_request').mockResolvedValue({
      data: {
        viewer: {
          stewardDigestPending: {
            edges: [
              {
                cursor: 'cur-5',
                node: {
                  deliveryId: '5',
                  feedEntryId: '9',
                  source: { kind: 'FEED', id: '3' },
                  decisionReason: 'low urgency',
                  consumedAtMs: 1788710000000,
                },
              },
            ],
            pageInfo: { hasNextPage: true, endCursor: 'cur-5' },
            windowSinceMs: 1788700000000,
            windowUntilMs: 1788720000000,
          },
        },
      },
    });
    const page = await c.steward.pendingPage({
      inboxPath,
      untilMs: 1788720000000,
    });
    expect(page.nextCursor).toBe('cur-5');
    expect(page.items[0].deliveryId).toBe('5');
    expect(page.windowUntilMs).toBe(1788720000000);
    expect(request).toHaveBeenCalledWith('POST', '/query', {
      body: {
        query: expect.stringContaining('stewardDigestPending'),
        variables: { inboxPath, input: { first: 50, untilMs: 1788720000000 } },
      },
    });
    // A continuation passes only the cursor; the window travels inside it.
    await c.steward.pendingPage({ inboxPath, after: 'cur-5', untilMs: 1 });
    expect(request).toHaveBeenLastCalledWith('POST', '/query', {
      body: {
        query: expect.stringContaining('stewardDigestPending'),
        variables: { inboxPath, input: { first: 50, after: 'cur-5' } },
      },
    });
    await expect(
      c.steward.pendingPage({ inboxPath, first: 500 })
    ).rejects.toThrow(/between 1 and 100/);
  });

  it.each([
    { name: 'zero', pages: [[]], expected: [] },
    { name: 'one', pages: [['1']], expected: ['1'] },
    {
      name: 'multiple',
      pages: [['1', '2'], ['3'], ['4', '5']],
      expected: ['1', '2', '3', '4', '5'],
    },
  ])('automatically reads $name pending pages', async ({ pages, expected }) => {
    const c = client();
    const request = vi.spyOn(c, '_request');
    pages.forEach((deliveryIds, index) => {
      request.mockResolvedValueOnce({
        data: {
          viewer: {
            stewardDigestPending: {
              edges: deliveryIds.map((deliveryId) => ({
                cursor: `edge-${deliveryId}`,
                node: {
                  deliveryId,
                  feedEntryId: deliveryId,
                  source: { kind: 'FEED', id: '3' },
                  decisionReason: 'digest',
                  consumedAtMs: 1788710000000 + index,
                },
              })),
              pageInfo: {
                hasNextPage: index < pages.length - 1,
                endCursor:
                  index < pages.length - 1 ? `page-${index + 1}` : null,
              },
              windowSinceMs: 1788700000000,
              windowUntilMs: 1788720000000,
            },
          },
        },
      });
    });

    const result = await c.steward.pending({
      inboxPath,
      untilMs: 1788720000000,
      first: 2,
    });

    expect(result.items.map((item) => item.deliveryId)).toEqual(expected);
    expect(result).not.toHaveProperty('nextCursor');
    expect(result.windowSinceMs).toBe(1788700000000);
    expect(result.windowUntilMs).toBe(1788720000000);
    expect(request).toHaveBeenCalledTimes(pages.length);
    if (pages.length > 1) {
      expect(request).toHaveBeenNthCalledWith(2, 'POST', '/query', {
        body: {
          query: expect.stringContaining('stewardDigestPending'),
          variables: {
            inboxPath,
            input: { first: 2, after: 'page-1' },
          },
        },
      });
    }
  });

  it('deduplicates delivery ids repeated across pages', async () => {
    const c = client();
    vi.spyOn(c, '_request')
      .mockResolvedValueOnce({
        data: {
          viewer: {
            stewardDigestPending: {
              edges: ['1', '2'].map((deliveryId) => ({
                cursor: `edge-${deliveryId}`,
                node: {
                  deliveryId,
                  feedEntryId: deliveryId,
                  source: { kind: 'FEED', id: '3' },
                  decisionReason: 'digest',
                  consumedAtMs: 1788710000000,
                },
              })),
              pageInfo: { hasNextPage: true, endCursor: 'page-2' },
              windowSinceMs: 1788700000000,
              windowUntilMs: 1788720000000,
            },
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          viewer: {
            stewardDigestPending: {
              edges: ['2', '3'].map((deliveryId) => ({
                cursor: `edge-${deliveryId}`,
                node: {
                  deliveryId,
                  feedEntryId: deliveryId,
                  source: { kind: 'FEED', id: '3' },
                  decisionReason: 'digest',
                  consumedAtMs: 1788710000001,
                },
              })),
              pageInfo: { hasNextPage: false, endCursor: null },
              windowSinceMs: 1788700000000,
              windowUntilMs: 1788720000000,
            },
          },
        },
      });

    const result = await c.steward.pending({ inboxPath });
    expect(result.items.map((item) => item.deliveryId)).toEqual([
      '1',
      '2',
      '3',
    ]);
  });

  it.each([
    new AlvaError('NETWORK_TIMEOUT', 'timed out', 0),
    new AlvaError('NETWORK_ERROR', 'connection reset', 0),
    new AlvaError('UNAVAILABLE', 'temporarily unavailable', 503),
    new AlvaError('DEADLINE_EXCEEDED', 'deadline exceeded', 504),
  ])('recovers from a transient pending failure: %s', async (error) => {
    const c = client();
    const request = vi
      .spyOn(c, '_request')
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce({
        data: {
          viewer: {
            stewardDigestPending: {
              edges: [],
              pageInfo: { hasNextPage: false, endCursor: null },
              windowSinceMs: 1788700000000,
              windowUntilMs: 1788720000000,
            },
          },
        },
      });

    const result = await c.steward.pending({ inboxPath });
    expect(result.items).toEqual([]);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('fails after bounded retries are exhausted', async () => {
    const c = client();
    const error = new AlvaError('NETWORK_TIMEOUT', 'timed out', 0);
    const request = vi.spyOn(c, '_request').mockRejectedValue(error);

    await expect(c.steward.pending({ inboxPath })).rejects.toBe(error);
    expect(request).toHaveBeenCalledTimes(3);
  });

  it('fails the whole read when a later page exhausts retries', async () => {
    const c = client();
    const error = new AlvaError('NETWORK_ERROR', 'connection reset', 0);
    const request = vi
      .spyOn(c, '_request')
      .mockResolvedValueOnce({
        data: {
          viewer: {
            stewardDigestPending: {
              edges: [
                {
                  cursor: 'edge-1',
                  node: {
                    deliveryId: '1',
                    feedEntryId: '1',
                    source: { kind: 'FEED', id: '3' },
                    decisionReason: 'digest',
                    consumedAtMs: 1788710000000,
                  },
                },
              ],
              pageInfo: { hasNextPage: true, endCursor: 'page-2' },
              windowSinceMs: 1788700000000,
              windowUntilMs: 1788720000000,
            },
          },
        },
      })
      .mockRejectedValue(error);

    await expect(c.steward.pending({ inboxPath })).rejects.toBe(error);
    expect(request).toHaveBeenCalledTimes(4);
  });

  it('fails closed when the backend says another page exists without a cursor', async () => {
    const c = client();
    vi.spyOn(c, '_request').mockResolvedValue({
      data: {
        viewer: {
          stewardDigestPending: {
            edges: [
              {
                cursor: 'edge-1',
                node: {
                  deliveryId: '1',
                  feedEntryId: '1',
                  source: { kind: 'FEED', id: '3' },
                  decisionReason: 'digest',
                  consumedAtMs: 1788710000000,
                },
              },
            ],
            pageInfo: { hasNextPage: true, endCursor: null },
            windowSinceMs: 1788700000000,
            windowUntilMs: 1788720000000,
          },
        },
      },
    });

    await expect(c.steward.pending({ inboxPath })).rejects.toThrow(/empty/);
  });

  it('rejects more than 100 legacy briefed ids before transport', async () => {
    const c = client();
    const request = vi.spyOn(c, '_request').mockResolvedValue({
      data: { completeStewardBrief: { ok: true } },
    });
    const deliveryIds = Array.from({ length: 101 }, (_, index) =>
      String(index + 1)
    );

    await expect(
      c.steward.briefed({ inboxPath, deliveryIds, digestRunId: 'run-1' })
    ).rejects.toThrow(/at most 100/);
    expect(request).not.toHaveBeenCalled();
  });

  it.each([alertSnapshot, null, undefined])(
    'requests and preserves the pending alert snapshot: %s',
    async (snapshot) => {
      const c = client();
      const item = {
        deliveryId: '5',
        feedEntryId: '9',
        source: { kind: 'THESIS_FEED', id: '7' },
        decisionReason: 'routing judgment, not the original evidence',
        consumedAtMs: 1788710000000,
        ...(snapshot === undefined ? {} : { alertSnapshot: snapshot }),
      };
      const request = vi.spyOn(c, '_request').mockResolvedValue({
        data: {
          viewer: {
            stewardDigestPending: {
              edges: [{ cursor: 'cur-5', node: item }],
              pageInfo: { hasNextPage: true, endCursor: 'cur-5' },
              windowSinceMs: 1788700000000,
              windowUntilMs: 1788720000000,
            },
          },
        },
      });

      for (const params of [
        { inboxPath, untilMs: 1788720000000 },
        { inboxPath, after: 'cur-5' },
      ]) {
        const page = await c.steward.pendingPage(params);
        expect(page.items).toEqual([item]);
        expect(page.items[0].alertSnapshot).toBe(snapshot);
        expect(page.nextCursor).toBe('cur-5');
        expect(page.windowSinceMs).toBe(1788700000000);
        expect(page.windowUntilMs).toBe(1788720000000);
        expect(request).toHaveBeenLastCalledWith('POST', '/query', {
          body: {
            query: expect.stringMatching(/\balertSnapshot\b/),
            variables: { inboxPath, input: expect.any(Object) },
          },
        });
      }
    }
  );

  it('rejects invalid first-page bounds before transport', async () => {
    const c = client();
    const request = vi.spyOn(c, '_request');
    for (const params of [
      { sinceMs: -1 },
      { untilMs: 1.5 },
      { sinceMs: 10, untilMs: 10 },
    ]) {
      await expect(
        c.steward.pending({ inboxPath, ...params })
      ).rejects.toThrow();
    }
    expect(request).not.toHaveBeenCalled();
  });

  it('rejects missing or invalid response windows', async () => {
    const c = client();
    const request = vi.spyOn(c, '_request');
    for (const bounds of [
      {},
      { windowSinceMs: 10, windowUntilMs: 10 },
      { windowSinceMs: 1, windowUntilMs: 1.5 },
    ]) {
      request.mockResolvedValue({
        data: { viewer: { stewardDigestPending: { edges: [], ...bounds } } },
      });
      await expect(c.steward.pendingPage({ inboxPath })).rejects.toThrow(
        /empty/
      );
    }
  });

  it('validates ids, decisions, and the inbox path before calling the gateway', async () => {
    const c = client();
    const request = vi.spyOn(c, '_request');
    await expect(
      c.steward.decide({
        inboxPath,
        deliveryId: 'abc',
        decision: 'digest',
        reason: 'r',
      })
    ).rejects.toThrow(/positive integer/);
    await expect(
      c.steward.briefed({
        inboxPath,
        deliveryIds: ['1', '1'],
        digestRunId: 'run',
      })
    ).rejects.toThrow(/duplicate/);
    await expect(
      c.steward.forward({ inboxPath: '', deliveryId: '1' })
    ).rejects.toThrow(/Session Inbox path/);
    expect(request).not.toHaveBeenCalled();
  });

  it('maps a single canonical GraphQL error code to an AlvaError status', async () => {
    const c = client();
    vi.spyOn(c, '_request').mockResolvedValue({
      data: null,
      errors: [
        {
          message: 'no ready steward binding',
          extensions: { code: 'PERMISSION_DENIED' },
        },
      ],
    });
    const error = await c.steward
      .briefed({ inboxPath, deliveryIds: ['1'], digestRunId: 'run' })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AlvaError);
    expect((error as AlvaError).status).toBe(403);
  });
});

describe('generateRequestId', () => {
  it('produces RFC 4122 v4 ids even without crypto.randomUUID', async () => {
    const { generateRequestId } =
      await import('../../src/resources/steward.js');
    const v4 =
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    expect(generateRequestId()).toMatch(v4);
    const original = globalThis.crypto;
    Object.defineProperty(globalThis, 'crypto', {
      value: undefined,
      configurable: true,
    });
    try {
      expect(generateRequestId()).toMatch(v4);
    } finally {
      Object.defineProperty(globalThis, 'crypto', {
        value: original,
        configurable: true,
      });
    }
  });
});
