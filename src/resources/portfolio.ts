import type { AlvaClient } from '../client.js';
import type {
  PortfolioAccount,
  PortfolioSummary,
  PortfolioActivityConnection,
} from '../types.js';

export class PortfolioResource {
  constructor(private client: AlvaClient) {}

  async accounts(): Promise<PortfolioAccount[]> {
    this.client._requireAuth();
    return this.client._request(
      'GET',
      '/api/v1/portfolio/accounts'
    ) as Promise<PortfolioAccount[]>;
  }

  async summary(accountId: string): Promise<PortfolioSummary> {
    this.client._requireAuth();
    return this.client._request('GET', '/api/v1/portfolio/summary', {
      query: { accountId },
    }) as Promise<PortfolioSummary>;
  }

  async activities(params: {
    accountId: string;
    limit?: number;
    pageToken?: string;
  }): Promise<PortfolioActivityConnection> {
    this.client._requireAuth();
    return this.client._request('GET', '/api/v1/portfolio/activities', {
      query: {
        accountId: params.accountId,
        limit: params.limit,
        pageToken: params.pageToken,
      },
    }) as Promise<PortfolioActivityConnection>;
  }
}
