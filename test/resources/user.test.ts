import { describe, it, expect } from 'vitest';
import { AlvaError } from '../../src/error.js';
import { v2Client } from '../helpers/v2Client.js';

const ME = {
  id: 'account_0abc',
  profileId: 'profile_0abc',
  username: 'alice',
  planTier: 'PRO',
  messagingBindings: [
    { id: 'messaging_binding_0t', app: 'TELEGRAM', displayName: 'alice_tg' },
    {
      id: 'messaging_binding_0d',
      app: 'DISCORD',
      displayName: 'alice_discord',
    },
    { id: 'messaging_binding_0s', app: 'SLACK', displayName: 'Alice' },
    { id: 'messaging_binding_0w', app: 'WHATSAPP', displayName: null },
  ],
  preferredMessagingApp: 'SLACK',
  toolkitMinVersion: '1.0.0',
  homePath: '/alva/home/alice',
};

describe('UserResource', () => {
  it('me() rebuilds the profile from GET /api/v2/me', async () => {
    const { client, v2 } = v2Client({ 'GET /me': ME });
    expect(await client.user.me()).toEqual({
      id: 'account_0abc',
      username: 'alice',
      subscription_tier: 'pro',
      telegram_username: 'alice_tg',
      discord_username: 'alice_discord',
      slack_username: 'Alice',
      whatsapp_username: '',
      imessage_username: '',
      active_channel: 'slack',
      toolkit_min_version: '1.0.0',
      home_path: '/alva/home/alice',
    });
    expect(v2).toHaveBeenCalledWith('GET', '/me');
  });

  it('me() reports no active channel when none is preferred', async () => {
    const { client } = v2Client({
      'GET /me': { ...ME, preferredMessagingApp: null, messagingBindings: [] },
    });
    const profile = await client.user.me();
    expect(profile.active_channel).toBe('');
    expect(profile.telegram_username).toBe('');
  });

  it('_username() reads the account once and retries after a failure', async () => {
    let failures = 1;
    const { client, v2 } = v2Client({
      'GET /me': () => {
        if (failures-- > 0) throw new AlvaError('UNAVAILABLE', 'down', 503);
        return ME;
      },
    });
    await expect(client.user._username()).rejects.toThrow('down');
    expect(await client.user._username()).toBe('alice');
    expect(await client.user._username()).toBe('alice');
    expect(v2).toHaveBeenCalledTimes(2);
  });
});
