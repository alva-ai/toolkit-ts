import type { AlvaClient } from '../client.js';
import type { Schema, V2Query } from '../platformApi.js';

/**
 * External IM groups. The group subscriptions keep
 * `client.v1.channelGroupSubscriptions` (they name the group by its numeric
 * origin session).
 */
export class ChannelGroupSubscriptionsResource {
  constructor(private client: AlvaClient) {}

  /**
   * A group's buffered chat messages between `from` and `to` (RFC 3339),
   * for the group-chat digest automation. The caller
   * must be that group's Alva admin (a digest feed runs as that admin). Each
   * message carries a `permalink` back to the original message.
   */
  async getGroupChatHistory(
    query: V2Query<'/group-chat-history', 'get'>
  ): Promise<Schema<'GroupChatHistory'>> {
    this.client._requireAuth();
    return this.client._v2Request('GET', '/group-chat-history', { query });
  }
}
