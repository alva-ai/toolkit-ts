import { describe, expect, it, vi } from 'vitest';
import { AlvaClient } from '../../src/client.js';
import { AlvaError } from '../../src/error.js';

const inboxPath =
  '/alva/home/alice/agents/steward-9/.pi/agent/sessions/main.inbox.jsonl';

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

  it('reads one connection page and returns the next opaque cursor', async () => {
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
    const page = await c.steward.pending({ inboxPath, untilMs: 1788720000000 });
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
    await c.steward.pending({ inboxPath, after: 'cur-5', untilMs: 1 });
    expect(request).toHaveBeenLastCalledWith('POST', '/query', {
      body: {
        query: expect.stringContaining('stewardDigestPending'),
        variables: { inboxPath, input: { first: 50, after: 'cur-5' } },
      },
    });
    await expect(c.steward.pending({ inboxPath, first: 500 })).rejects.toThrow(
      /between 1 and 100/
    );
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
