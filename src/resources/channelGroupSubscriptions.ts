import type { AlvaClient } from '../client.js';
import { AlvaError } from '../error.js';
import type {
  ChannelGroupHistoryParams,
  ChannelGroupHistoryResponse,
  ChannelGroupSubscriptionContextResponse,
  ChannelGroupSubscriptionListResponse,
  ChannelGroupSubscriptionMutationParams,
  ChannelGroupSubscriptionMutationResponse,
  ChannelGroupSubscriptionSessionParams,
} from '../types.js';

/**
 * Group push subscriptions for an external channel session.
 *
 * These APIs subscribe the Telegram/Discord group attached to `session_id`
 * to feed push events the group admin may read. Mutations are idempotent no-ops
 * unless the authenticated caller is that group's Alva admin.
 */
export class ChannelGroupSubscriptionsResource {
  constructor(private client: AlvaClient) {}

  async context(
    params: ChannelGroupSubscriptionSessionParams
  ): Promise<ChannelGroupSubscriptionContextResponse> {
    this.client._requireAuth();
    return this.client._request(
      'GET',
      '/api/v1/channel/group-subscriptions/context',
      {
        query: { session_id: params.session_id },
      }
    ) as Promise<ChannelGroupSubscriptionContextResponse>;
  }

  async list(
    params: ChannelGroupSubscriptionSessionParams
  ): Promise<ChannelGroupSubscriptionListResponse> {
    this.client._requireAuth();
    return this.client._request('GET', '/api/v1/channel/group-subscriptions', {
      query: { session_id: params.session_id },
    }) as Promise<ChannelGroupSubscriptionListResponse>;
  }

  async subscribe(
    params: ChannelGroupSubscriptionMutationParams
  ): Promise<ChannelGroupSubscriptionMutationResponse> {
    this.client._requireAuth();
    return this.client._request('POST', '/api/v1/channel/group-subscriptions', {
      jsonBody: mutationBody(params),
    }) as Promise<ChannelGroupSubscriptionMutationResponse>;
  }

  async unsubscribe(
    params: ChannelGroupSubscriptionMutationParams
  ): Promise<ChannelGroupSubscriptionMutationResponse> {
    this.client._requireAuth();
    return this.client._request(
      'DELETE',
      '/api/v1/channel/group-subscriptions',
      {
        jsonBody: mutationBody(params),
      }
    ) as Promise<ChannelGroupSubscriptionMutationResponse>;
  }

  /**
   * Read a group's buffered chat messages in a time window, for the group-chat
   * digest automation. Admin-gated: the authenticated caller must be that
   * group's Alva admin (a digest feed runs as that admin). Each message carries
   * a `permalink` deep-link back to the original message for "jump to original".
   * `from_micros`/`to_micros` are message-origin timestamps in microseconds.
   */
  async getGroupChatHistory(
    params: ChannelGroupHistoryParams
  ): Promise<ChannelGroupHistoryResponse> {
    this.client._requireAuth();
    return this.client._request('GET', '/api/v1/channel/group-history', {
      query: {
        channel: params.channel,
        remote_chat_id: params.remote_chat_id,
        from_micros: String(params.from_micros),
        to_micros: String(params.to_micros),
      },
    }) as Promise<ChannelGroupHistoryResponse>;
  }
}

function mutationBody(params: ChannelGroupSubscriptionMutationParams): string {
  return `{"session_id":${idLiteral(params.session_id)},"target_type":${JSON.stringify(params.target_type)},"target_id":${idLiteral(params.target_id)}}`;
}

function idLiteral(value: number | string): string {
  if (typeof value === 'number') {
    if (
      !Number.isInteger(value) ||
      value <= 0 ||
      !Number.isSafeInteger(value)
    ) {
      throw new AlvaError(
        'INVALID_ARGUMENT',
        'channel group subscription ids must be positive safe integers; pass large int64 ids as strings',
        0
      );
    }
    return String(value);
  }
  if (!/^[1-9]\d*$/.test(value)) {
    throw new AlvaError(
      'INVALID_ARGUMENT',
      'channel group subscription ids must be positive integer strings',
      0
    );
  }
  return value;
}
