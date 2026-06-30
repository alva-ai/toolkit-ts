import type { AlvaClient } from '../client.js';
import { AlvaError } from '../error.js';
import type {
  CreditWallet,
  CreditWalletItemsParams,
  CreditWalletItemsResponse,
} from '../types.js';

const CREDIT_WALLET_QUERY = `
query ToolkitCreditWallet {
  viewer {
    creditWallet {
      balance
      totalRemaining
      todayUsed
    }
  }
}
`.trim();

const CREDIT_WALLET_ITEMS_QUERY = `
query ToolkitCreditWalletItems($input: CreditWalletItemConnectionInput!) {
  viewer {
    creditWallet {
      balance
      totalRemaining
      todayUsed
      items(input: $input) {
        pageInfo {
          hasNextPage
          hasPreviousPage
          startCursor
          endCursor
        }
        edges {
          cursor
          node {
            id
            sessionId
            playbookId
            feedId
            op
            source
            amount
            extras
            createdAtMs
          }
        }
      }
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
  errors?: GraphQLErrorPayload[];
}

interface CreditWalletQueryData {
  viewer?: {
    creditWallet?: CreditWallet | null;
  } | null;
}

interface CreditWalletItemsQueryData {
  viewer?: {
    creditWallet?: CreditWalletItemsResponse | null;
  } | null;
}

function graphQLErrorMessage(errors: GraphQLErrorPayload[]): string {
  const messages = errors
    .map((error) =>
      typeof error.message === 'string' && error.message
        ? error.message
        : undefined
    )
    .filter((message): message is string => Boolean(message));
  return messages.length > 0 ? messages.join('; ') : 'GraphQL request failed';
}

export class CreditsResource {
  constructor(private client: AlvaClient) {}

  async wallet(): Promise<CreditWallet> {
    this.client._requireAuth();
    const data = await this.graphql<CreditWalletQueryData>(CREDIT_WALLET_QUERY);
    const wallet = data.viewer?.creditWallet;
    if (!wallet) {
      throw new AlvaError(
        'GRAPHQL_EMPTY_RESPONSE',
        'GraphQL response did not include viewer.creditWallet',
        502
      );
    }
    return wallet;
  }

  async items(
    params: CreditWalletItemsParams
  ): Promise<CreditWalletItemsResponse> {
    this.client._requireAuth();
    const data = await this.graphql<CreditWalletItemsQueryData>(
      CREDIT_WALLET_ITEMS_QUERY,
      {
        input: {
          startAtMs: params.startAtMs,
          endAtMs: params.endAtMs,
          sessionId: params.sessionId,
          first: params.first,
          after: params.after,
        },
      }
    );
    const wallet = data.viewer?.creditWallet;
    if (!wallet) {
      throw new AlvaError(
        'GRAPHQL_EMPTY_RESPONSE',
        'GraphQL response did not include viewer.creditWallet.items',
        502
      );
    }
    return wallet;
  }

  private async graphql<T>(
    query: string,
    variables?: Record<string, unknown>
  ): Promise<T> {
    const response = (await this.client._request('POST', '/query', {
      body: variables === undefined ? { query } : { query, variables },
    })) as GraphQLResponse<T>;

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
