import { describe, expect, it, vi } from 'vitest';
import { AlvaClient } from '../../src/client.js';
import { dispatchCli as dispatchSystem } from '../../src/cli/dispatch.js';
import { dispatch as dispatchEmbedded } from '../../src/cli/embeddedDispatch.js';
import { aSchedule, aSessionSchedule } from '../automationV2.js';

const inboxPath = '/alva/home/alice/original.inbox.jsonl';
const page = (items: unknown[]) => ({ items, nextPageToken: null });

function clientWithSchedules(attached = false) {
  const client = new AlvaClient({
    apiKey: 'alva_test',
    ...(attached ? { originInboxPath: inboxPath } : {}),
  });
  const session = aSessionSchedule({ name: 'later' });
  client.schedules.list = vi.fn().mockResolvedValue(page([aSchedule()]));
  client.schedules.listSession = vi.fn().mockResolvedValue(page([session]));
  client.schedules.putSession = vi.fn().mockResolvedValue(session);
  client.schedules.pauseSession = vi.fn().mockResolvedValue(session);
  client.schedules.resumeSession = vi.fn().mockResolvedValue(session);
  client.schedules.deleteSession = vi.fn().mockResolvedValue({});
  client.schedules.agentChannelId = vi.fn().mockResolvedValue('channel_0ch');
  return client;
}

const SESSION_CALLS = {
  pause: 'pauseSession',
  resume: 'resumeSession',
  delete: 'deleteSession',
} as const;

describe('Session schedule CLI targets', () => {
  it('supports explicit Inbox targets for all five terminal commands', async () => {
    const client = clientWithSchedules();
    expect(
      await dispatchSystem(client, [
        'schedule',
        'list',
        '--inbox-path',
        inboxPath,
      ])
    ).toEqual(page([aSessionSchedule({ name: 'later' })]));
    await dispatchSystem(client, [
      'schedule',
      'put',
      '--inbox-path',
      inboxPath,
      '--name',
      'later',
      '--every',
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
      expect(client.schedules[SESSION_CALLS[command]]).toHaveBeenCalledWith(
        'session_schedule_0s'
      );
    }
    expect(client.schedules.listSession).toHaveBeenCalledWith({
      inboxPath,
      pageSize: 100,
      pageToken: undefined,
    });
    expect(client.schedules.listSession).toHaveBeenCalledWith({
      inboxPath,
      name: 'later',
    });
    expect(client.schedules.putSession).toHaveBeenCalledWith({
      inboxPath,
      name: 'later',
      message: 'Check.',
      rule: { kind: 'EVERY', everySeconds: 60 },
    });
    expect(client.schedules.agentChannelId).not.toHaveBeenCalled();
  });

  it('keeps the terminal default Channel and rejects mixed targets', async () => {
    const client = clientWithSchedules(true);
    await dispatchSystem(client, ['schedule', 'list']);
    expect(client.schedules.list).toHaveBeenCalledWith('channel_0ch', {
      pageSize: 100,
      pageToken: undefined,
    });
    vi.mocked(client.schedules.list).mockClear();
    await expect(
      dispatchSystem(client, [
        'schedule',
        'list',
        '--channel-id',
        'channel_0ch',
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
      expect(client.schedules[SESSION_CALLS[command]]).toHaveBeenCalledWith(
        'session_schedule_0s'
      );
    }
    expect(client.schedules.listSession).toHaveBeenCalledWith(
      expect.objectContaining({ inboxPath })
    );
    expect(client.schedules.putSession).toHaveBeenCalledWith(
      expect.objectContaining({ inboxPath })
    );
    expect(client.schedules.list).not.toHaveBeenCalled();
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
    expect(client.schedules.listSession).not.toHaveBeenCalled();
    const unattached = clientWithSchedules();
    await expect(
      dispatchEmbedded(unattached, ['schedule', 'list'])
    ).rejects.toThrow(/attached.*Inbox/);
    expect(unattached.schedules.agentChannelId).not.toHaveBeenCalled();
    expect(unattached.schedules.listSession).not.toHaveBeenCalled();
  });

  it('a name that selects no schedule is NOT_FOUND without a write', async () => {
    const client = clientWithSchedules();
    client.schedules.listSession = vi.fn().mockResolvedValue(page([]));
    await expect(
      dispatchSystem(client, [
        'schedule',
        'pause',
        '--inbox-path',
        inboxPath,
        '--name',
        'missing',
      ])
    ).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
    expect(client.schedules.pauseSession).not.toHaveBeenCalled();
  });
});
