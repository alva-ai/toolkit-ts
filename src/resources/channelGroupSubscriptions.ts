import type { AlvaClient } from '../client.js';
import { AlvaError } from '../error.js';
import type {
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
 * to public feed/playbook push events. Mutations are idempotent no-ops unless
 * the authenticated caller is that group's Alva admin.
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
