import { describe, expect, it, vi } from 'vitest';
import { AlvaClient } from '../../src/client.js';
import { dispatchCli as dispatchSystem } from '../../src/cli/dispatch.js';
import { dispatch as dispatchEmbedded } from '../../src/cli/embeddedDispatch.js';

const inboxPath = '/alva/home/alice/original.inbox.jsonl';

function clientWithSchedules(attached = false) {
  const client = new AlvaClient({
    apiKey: 'alva_test',
    ...(attached ? { originInboxPath: inboxPath } : {}),
  });
  client.schedules.list = vi.fn().mockResolvedValue([]);
  client.schedules.put = vi.fn().mockResolvedValue({ name: 'later' });
  client.schedules.pause = vi.fn().mockResolvedValue({ name: 'later' });
  client.schedules.resume = vi.fn().mockResolvedValue({ name: 'later' });
  client.schedules.delete = vi.fn().mockResolvedValue(undefined);
  client.schedules.agentChannelId = vi.fn().mockResolvedValue('91');
  return client;
}

describe('Session schedule CLI targets', () => {
  it('supports explicit Inbox targets for all five terminal commands', async () => {
    const client = clientWithSchedules();
    await dispatchSystem(client, [
      'schedule',
      'list',
      '--inbox-path',
      inboxPath,
    ]);
    await dispatchSystem(client, [
      'schedule',
      'put',
      '--inbox-path',
      inboxPath,
      '--name',
      'later',
      '--after',
      'PT1M',
      '--message',
      'Check.',
    ]);
    for (const command of ['pause', 'resume', 'delete'] as const) {
      await dispatchSystem(client, [
        'schedule',
        command,
        '--inbox-path',
        inboxPath,
        '--name',
        'later',
      ]);
      expect(client.schedules[command]).toHaveBeenCalledWith({
        inboxPath,
        name: 'later',
      });
    }
    expect(client.schedules.list).toHaveBeenCalledWith({ inboxPath });
    expect(client.schedules.put).toHaveBeenCalledWith(
      expect.objectContaining({
        inboxPath,
        rule: { kind: 'after', duration: 'PT1M' },
      })
    );
    expect(client.schedules.agentChannelId).not.toHaveBeenCalled();
  });

  it('keeps the terminal default Channel and rejects mixed targets', async () => {
    const client = clientWithSchedules(true);
    await dispatchSystem(client, ['schedule', 'list']);
    expect(client.schedules.list).toHaveBeenCalledWith({ channelId: '91' });
    vi.mocked(client.schedules.list).mockClear();
    await expect(
      dispatchSystem(client, [
        'schedule',
        'list',
        '--channel-id',
        '91',
        '--inbox-path',
        inboxPath,
      ])
    ).rejects.toThrow(/mutually exclusive/);
    expect(client.schedules.list).not.toHaveBeenCalled();
  });

  it('only schedules the host-attached Inbox in embedded commands', async () => {
    const client = clientWithSchedules(true);
    await dispatchEmbedded(client, ['schedule', 'list']);
    await dispatchEmbedded(client, [
      'schedule',
      'put',
      '--name',
      'later',
      '--after',
      'PT1M',
      '--message',
      'Check.',
    ]);
    for (const command of ['pause', 'resume', 'delete'] as const) {
      await dispatchEmbedded(client, ['schedule', command, '--name', 'later']);
      expect(client.schedules[command]).toHaveBeenCalledWith({
        inboxPath,
        name: 'later',
      });
    }
    expect(client.schedules.list).toHaveBeenCalledWith({ inboxPath });
    expect(client.schedules.put).toHaveBeenCalledWith(
      expect.objectContaining({ inboxPath })
    );
    expect(client.schedules.agentChannelId).not.toHaveBeenCalled();
  });

  it('rejects embedded target and identity overrides and missing attachment', async () => {
    const client = clientWithSchedules(true);
    for (const flag of [
      'inbox-path',
      'channel-id',
      'run-as-service-account',
      'profile',
      'base-url',
      'api-key',
    ]) {
      await expect(
        dispatchEmbedded(client, ['schedule', 'list', `--${flag}`, 'override'])
      ).rejects.toThrow(/not supported/);
    }
    expect(client.schedules.list).not.toHaveBeenCalled();
    const unattached = clientWithSchedules();
    await expect(
      dispatchEmbedded(unattached, ['schedule', 'list'])
    ).rejects.toThrow(/attached.*Inbox/);
    expect(unattached.schedules.agentChannelId).not.toHaveBeenCalled();
    expect(unattached.schedules.list).not.toHaveBeenCalled();
  });
});
