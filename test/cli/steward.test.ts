import { describe, expect, it, vi } from 'vitest';
import { AlvaClient } from '../../src/client.js';
import { dispatchCli as dispatchSystem } from '../../src/cli/dispatch.js';
import { dispatch as dispatchEmbedded } from '../../src/cli/embeddedDispatch.js';
import { CliUsageError } from '../../src/error.js';

const inboxPath =
  '/alva/home/alice/agents/steward-9/.pi/agent/sessions/main.inbox.jsonl';

function clientWithSteward(attached = false) {
  const client = new AlvaClient({
    apiKey: 'alva_test',
    ...(attached ? { originInboxPath: inboxPath } : {}),
  });
  client.steward.decide = vi.fn().mockResolvedValue({ state: 'consumed' });
  client.steward.forward = vi
    .fn()
    .mockResolvedValue({ channelMessageId: '77', state: 'sent' });
  client.steward.send = vi.fn().mockResolvedValue({ channelMessageId: '78' });
  client.steward.pending = vi
    .fn()
    .mockResolvedValue({ items: [], nextAfterId: null });
  client.steward.briefed = vi.fn().mockResolvedValue({ ok: true });
  return client;
}

describe('steward CLI', () => {
  it('embedded commands always target the host-attached Inbox', async () => {
    const client = clientWithSteward(true);
    await dispatchEmbedded(client, [
      'steward',
      'decide',
      '--delivery-id',
      '123',
      '--decision',
      'immediate',
      '--reason',
      'guidance cut',
    ]);
    expect(client.steward.decide).toHaveBeenCalledWith({
      inboxPath,
      deliveryId: '123',
      decision: 'immediate',
      reason: 'guidance cut',
    });

    await dispatchEmbedded(client, [
      'steward',
      'forward',
      '--delivery-id',
      '123',
    ]);
    expect(client.steward.forward).toHaveBeenCalledWith({
      inboxPath,
      deliveryId: '123',
      requestId: undefined,
    });

    await dispatchEmbedded(client, [
      'steward',
      'send',
      '--delivery-ids',
      '124, 125',
      '--body',
      'Two related moves',
    ]);
    expect(client.steward.send).toHaveBeenCalledWith({
      inboxPath,
      body: 'Two related moves',
      deliveryIds: ['124', '125'],
      requestId: undefined,
    });

    await dispatchEmbedded(client, [
      'steward',
      'pending',
      '--after',
      '0',
      '--first',
      '20',
    ]);
    expect(client.steward.pending).toHaveBeenCalledWith({
      inboxPath,
      afterDeliveryId: '0',
      sinceMs: undefined,
      first: 20,
    });

    await dispatchEmbedded(client, [
      'steward',
      'briefed',
      '--digest-run-id',
      'digest-555-42',
      '--delivery-ids',
      '124,125',
    ]);
    expect(client.steward.briefed).toHaveBeenCalledWith({
      inboxPath,
      deliveryIds: ['124', '125'],
      digestRunId: 'digest-555-42',
    });
  });

  it('embedded commands refuse to run without a host Inbox or with overrides', async () => {
    const client = clientWithSteward();
    await expect(
      dispatchEmbedded(client, ['steward', 'pending'])
    ).rejects.toThrow(CliUsageError);
    const attached = clientWithSteward(true);
    await expect(
      dispatchEmbedded(attached, [
        'steward',
        'pending',
        '--inbox-path',
        inboxPath,
      ])
    ).rejects.toThrow(CliUsageError);
    expect(attached.steward.pending).not.toHaveBeenCalled();
  });

  it('terminal commands require an explicit --inbox-path', async () => {
    const client = clientWithSteward();
    await expect(
      dispatchSystem(client, ['steward', 'forward', '--delivery-id', '1'])
    ).rejects.toThrow(CliUsageError);
    await dispatchSystem(client, [
      'steward',
      'forward',
      '--inbox-path',
      inboxPath,
      '--delivery-id',
      '1',
      '--request-id',
      '4d3a1a7e-6d1a-4e2c-9a3b-2f1e0c9b8a77',
    ]);
    expect(client.steward.forward).toHaveBeenCalledWith({
      inboxPath,
      deliveryId: '1',
      requestId: '4d3a1a7e-6d1a-4e2c-9a3b-2f1e0c9b8a77',
    });
    await expect(
      dispatchSystem(client, [
        'steward',
        'decide',
        '--inbox-path',
        inboxPath,
        '--delivery-id',
        '1',
        '--decision',
        'later',
        '--reason',
        'x',
      ])
    ).rejects.toThrow(/decision must be one of/);
  });
});
