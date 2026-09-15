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
      data: { stewardDecideDelivery: { state: 'consumed' } },
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
        query: expect.stringContaining('stewardDecideDelivery'),
        variables: {
          input: {
            inboxPath,
            deliveryId: '123',
            decision: 'DIGEST',
            reason: 'routine event',
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
          stewardForwardAlert: { channelMessageId: '77', state: 'sent' },
        },
      })
      .mockResolvedValueOnce({
        data: { stewardSendChannelMessage: { channelMessageId: '78' } },
      });
    await c.steward.forward({ inboxPath, deliveryId: '5' });
    await c.steward.send({ inboxPath, body: 'x', deliveryIds: ['5', '6'] });
    const uuid = /^[0-9a-f-]{36}$/;
    const forwardInput = (
      request.mock.calls[0][2] as {
        body: { variables: { input: { requestId: string } } };
      }
    ).body.variables.input;
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

  it('pages pending deliveries by cursor and clamps the page size', async () => {
    const c = client();
    const request = vi.spyOn(c, '_request').mockResolvedValue({
      data: {
        stewardDigestPending: {
          items: [
            {
              deliveryId: '5',
              feedEntryId: '9',
              source: { kind: 'feed', id: '3' },
              decisionReason: 'low urgency',
              consumedAtMs: 1788710000000,
            },
          ],
          nextAfterId: '5',
        },
      },
    });
    const page = await c.steward.pending({ inboxPath, afterDeliveryId: '0' });
    expect(page.nextAfterId).toBe('5');
    expect(page.items[0].deliveryId).toBe('5');
    expect(request).toHaveBeenCalledWith('POST', '/query', {
      body: {
        query: expect.stringContaining('stewardDigestPending'),
        variables: {
          inboxPath,
          afterDeliveryId: null,
          sinceMs: null,
          first: 50,
        },
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
