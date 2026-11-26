import type { AlvaClient } from '../client.js';
import type { Schema } from '../platformApi.js';

/** The caller's notification preferences; null is the server default. */
export class NotificationPreferencesResource {
  constructor(private client: AlvaClient) {}

  async get(): Promise<Schema<'NotificationPreferences'>> {
    this.client._requireAuth();
    return this.client._v2Request('GET', '/me/notification-preferences');
  }

  /** A merge patch: members absent from `patch` keep their value. */
  async update(
    patch: Schema<'NotificationPreferencesPatch'>
  ): Promise<Schema<'NotificationPreferences'>> {
    this.client._requireAuth();
    return this.client._v2Request('PATCH', '/me/notification-preferences', {
      body: patch,
    });
  }
}
