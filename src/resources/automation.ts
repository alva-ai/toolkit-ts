import type { AlvaClient } from '../client.js';
import { AlvaError } from '../error.js';
import type {
  AutomationAlertDelivery,
  AutomationAlertDeliveryGetRequest,
  AutomationAlertDeliveryUpdateRequest,
  AutomationAlertDeliveryUpdateResponse,
  AutomationInspectRequest,
  AutomationInspectResponse,
  AutomationUpdateRequest,
  AutomationUpdateResponse,
  FeedDeleteRequest,
  FeedDeleteResponse,
  FeedListParams,
  FeedListResponse,
  FeedReleaseRequest,
  FeedReleaseResponse,
  FeedStatusUpdateRequest,
  FeedStatusUpdateResponse,
} from '../types.js';

const AUTOMATION_ALERT_DELIVERY_QUERY = `
query ToolkitAutomationAlertDelivery($automationId: ID!) {
  automation(id: $automationId) {
    alertDelivery {
      isEnabled
      alvaChannels { id }
      email { isEnabled isAvailable address }
    }
  }
}
`.trim();

const UPDATE_AUTOMATION_ALERT_DELIVERY = `
mutation ToolkitUpdateAutomationAlertDelivery(
  $input: UpdateAutomationAlertDeliveryInput!
  $includeAlvaChannels: Boolean!
  $includeEmail: Boolean!
) {
  updateAutomationAlertDelivery(input: $input) {
    automation { id }
    alertDelivery {
      isEnabled
      alvaChannels @include(if: $includeAlvaChannels) { id }
      email @include(if: $includeEmail) { isEnabled isAvailable address }
    }
  }
}
`.trim();

interface GraphQLErrorPayload {
  message?: unknown;
  [key: string]: unknown;
}

interface GraphQLResponse<T> {
  data?: T | null;
  errors?: Array<GraphQLErrorPayload | null>;
}

interface AutomationAlertDeliveryQueryData {
  automation?: { alertDelivery?: AutomationAlertDelivery | null } | null;
}

interface AutomationAlertDeliveryMutationData {
  updateAutomationAlertDelivery?: AutomationAlertDeliveryUpdateResponse | null;
}

/**
 * Product-facing automation API. Backed by the existing feed/release gateway
 * surfaces while those lower-level names remain on the wire for compatibility.
 */
export class AutomationResource {
  readonly delivery: AutomationAlertDeliveryResource;

  constructor(private client: AlvaClient) {
    this.delivery = new AutomationAlertDeliveryResource(client);
  }

  list(params: FeedListParams = {}): Promise<FeedListResponse> {
    return this.client.feed.list(params);
  }

  /**
   * Inspect one automation. Backed by GET /api/v1/automation/:id.
   */
  async inspect(
    params: AutomationInspectRequest
  ): Promise<AutomationInspectResponse> {
    this.client._requireAuth();
    const id = requireAutomationID(params.id);
    return this.client._request(
      'GET',
      `/api/v1/automation/${encodeURIComponent(String(id))}`
    ) as Promise<AutomationInspectResponse>;
  }

  /** Partially update one existing automation by immutable decimal-string id. */
  async update(
    params: AutomationUpdateRequest
  ): Promise<AutomationUpdateResponse> {
    this.client._requireAuth();
    const id = requireAutomationIDString(params.id);
    if (!hasAutomationUpdate(params)) {
      throw new Error(
        'automation update requires at least one field or trigger=true'
      );
    }
    return this.client._request(
      'PATCH',
      `/api/v1/automation/${encodeURIComponent(String(id))}`,
      {
        body: {
          version: params.version,
          cronjob_id: params.cronjob_id,
          description: params.description,
          changelog: params.changelog,
          agent_type: params.agent_type,
          trigger: params.trigger,
        },
      }
    ) as Promise<AutomationUpdateResponse>;
  }

  stop(params: FeedStatusUpdateRequest): Promise<FeedStatusUpdateResponse> {
    return this.client.feed.stop(params);
  }

  resume(params: FeedStatusUpdateRequest): Promise<FeedStatusUpdateResponse> {
    return this.client.feed.resume(params);
  }

  delete(params: FeedDeleteRequest): Promise<FeedDeleteResponse> {
    return this.client.feed.delete(params);
  }

  publish(params: FeedReleaseRequest): Promise<FeedReleaseResponse> {
    return this.client.release.feed(params);
  }
}

export class AutomationAlertDeliveryResource {
  constructor(private client: AlvaClient) {}

  async get(
    params: AutomationAlertDeliveryGetRequest
  ): Promise<AutomationAlertDelivery> {
    this.client._requireAuth();
    const id = requireAutomationIDString(params.id);
    const data = await this.graphql<AutomationAlertDeliveryQueryData>(
      AUTOMATION_ALERT_DELIVERY_QUERY,
      { automationId: id }
    );
    const delivery = data.automation?.alertDelivery;
    if (!delivery) {
      throw new AlvaError(
        'GRAPHQL_EMPTY_RESPONSE',
        'GraphQL response did not include automation.alertDelivery',
        502
      );
    }
    return delivery;
  }

  async update(
    params: AutomationAlertDeliveryUpdateRequest
  ): Promise<AutomationAlertDeliveryUpdateResponse> {
    this.client._requireAuth();
    const id = requireAutomationIDString(params.id);
    const includeAlvaChannels = params.alvaChannelIds !== undefined;
    const includeEmail = params.emailEnabled !== undefined;
    if (!includeAlvaChannels && !includeEmail) {
      throw new Error(
        'automation delivery update requires alvaChannelIds or emailEnabled'
      );
    }
    const alvaChannelIds = includeAlvaChannels
      ? uniqueAlvaChannelIDs(params.alvaChannelIds ?? [])
      : undefined;
    const data = await this.graphql<AutomationAlertDeliveryMutationData>(
      UPDATE_AUTOMATION_ALERT_DELIVERY,
      {
        input: {
          automationId: id,
          ...(includeAlvaChannels ? { alvaChannelIds } : {}),
          ...(includeEmail ? { emailEnabled: params.emailEnabled } : {}),
        },
        includeAlvaChannels,
        includeEmail,
      }
    );
    const result = data.updateAutomationAlertDelivery;
    if (!result) {
      throw new AlvaError(
        'GRAPHQL_EMPTY_RESPONSE',
        'GraphQL response did not include updateAutomationAlertDelivery',
        502
      );
    }
    return result;
  }

  private async graphql<T>(
    query: string,
    variables: Record<string, unknown>
  ): Promise<T> {
    const response = (await this.client._request('POST', '/query', {
      body: { query, variables },
    })) as GraphQLResponse<T> | null | undefined;
    if (!response) {
      throw new AlvaError(
        'GRAPHQL_EMPTY_RESPONSE',
        'GraphQL response was empty',
        502
      );
    }
    if (response.errors && response.errors.length > 0) {
      throw new AlvaError(
        'GRAPHQL_ERROR',
        graphQLErrorMessage(response.errors),
        400,
        { errors: response.errors }
      );
    }
    if (!response.data) {
      throw new AlvaError(
        'GRAPHQL_EMPTY_RESPONSE',
        'GraphQL response did not include data',
        502
      );
    }
    return response.data;
  }
}

function requireAutomationID(id: number | string): number | string {
  if (typeof id === 'string') return requireAutomationIDString(id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error('automation id must be a positive integer');
  }
  return id;
}

function requireAutomationIDString(id: string): string {
  if (!/^[1-9]\d*$/.test(id)) {
    throw new Error('automation id must be a positive integer string');
  }
  return id;
}

function hasAutomationUpdate(params: AutomationUpdateRequest): boolean {
  return (
    params.version !== undefined ||
    params.cronjob_id !== undefined ||
    params.description !== undefined ||
    params.changelog !== undefined ||
    params.agent_type !== undefined ||
    params.trigger === true
  );
}

function uniqueAlvaChannelIDs(values: readonly string[]): string[] {
  const ids = [...new Set(values)];
  for (const id of ids) {
    if (!/^(0|[1-9]\d*)$/.test(id)) {
      throw new Error(
        'Alva channel ids must be positive integer strings or the agent sentinel 0'
      );
    }
  }
  return ids;
}

function graphQLErrorMessage(
  errors: Array<GraphQLErrorPayload | null>
): string {
  const messages = errors
    .map((error) =>
      error && typeof error.message === 'string' && error.message
        ? error.message
        : undefined
    )
    .filter((message): message is string => Boolean(message));
  return messages.length > 0 ? messages.join('; ') : 'GraphQL request failed';
}
