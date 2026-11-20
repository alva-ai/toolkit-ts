import { afterEach, describe, it, expect } from 'vitest';
import { AlvaClient } from '../../src/client.js';
import { fakeV2 } from '../fakeV2.js';
import { v2 } from '../v2Schema.js';

let restore: (() => void) | undefined;
afterEach(() => restore?.());

function client() {
  return new AlvaClient({ apiKey: 'key', baseUrl: 'https://api.test' });
}

describe('NotificationPreferencesResource', () => {
  it('get() returns the NotificationPreferences, null when unset', async () => {
    const prefs = v2('NotificationPreferences', { sessionCompleted: null });
    const fake = fakeV2({ 'GET /me/notification-preferences': () => prefs });
    restore = fake.restore;
    expect(await client().notificationPreferences.get()).toEqual(prefs);
  });

  it('update() sends the patch as a merge patch', async () => {
    const fake = fakeV2({
      'PATCH /me/notification-preferences': () =>
        v2('NotificationPreferences', { sessionCompleted: false }),
    });
    restore = fake.restore;
    expect(
      await client().notificationPreferences.update({ sessionCompleted: false })
    ).toEqual({ sessionCompleted: false });
    expect(fake.calls[0].body).toEqual({ sessionCompleted: false });
    expect(fake.calls[0].headers['Content-Type']).toBe(
      'application/merge-patch+json'
    );
  });
});
