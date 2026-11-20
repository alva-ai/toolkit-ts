import type { AlvaClient } from '../client.js';
import type { Schema, V2Query } from '../platformApi.js';

export class NotificationsResource {
  constructor(private client: AlvaClient) {}

  /**
   * One page of the notifications an automation delivered to the caller,
   * newest first. The caller needs read access to the automation's feed.
   */
  async list(
    query: V2Query<'/me/notification-deliveries', 'get'>
  ): Promise<Schema<'NotificationDeliveryList'>> {
    this.client._requireAuth();
    return this.client._v2Request('GET', '/me/notification-deliveries', {
      query,
    });
  }
}
