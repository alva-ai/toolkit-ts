import { describe, it, expect } from 'vitest';
import { v2Client } from '../helpers/v2Client.js';

describe('NotificationPreferencesResource', () => {
  it('list() maps sessionCompleted to the session_completed setting', async () => {
    const { client } = v2Client({
      'GET /me/notification-preferences': { sessionCompleted: false },
    });
    expect(await client.notificationPreferences.list()).toEqual({
      settings: [{ key: 'session_completed', enabled: false }],
    });
  });

  it('list() returns no settings when the preference is unset', async () => {
    const { client } = v2Client({
      'GET /me/notification-preferences': { sessionCompleted: null },
    });
    expect(await client.notificationPreferences.list()).toEqual({
      settings: [],
    });
  });

  it('update() sends a merge patch of the one field', async () => {
    const { client, v2 } = v2Client({
      'PATCH /me/notification-preferences': { sessionCompleted: true },
    });
    expect(
      await client.notificationPreferences.update({
        key: 'session_completed',
        enabled: true,
      })
    ).toEqual({ setting: { key: 'session_completed', enabled: true } });
    expect(v2).toHaveBeenCalledWith('PATCH', '/me/notification-preferences', {
      body: { sessionCompleted: true },
    });
  });

  it('update() refuses an unknown key before sending', async () => {
    const { client, v2 } = v2Client({});
    await expect(
      client.notificationPreferences.update({
        key: 'toString' as 'session_completed',
        enabled: true,
      })
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    expect(v2).not.toHaveBeenCalled();
  });
});
