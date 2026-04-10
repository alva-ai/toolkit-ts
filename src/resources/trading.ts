import type { AlvaClient } from '../client.js';
import type {
  TradingAccount,
  TradingPortfolio,
  TradingOrder,
  TradingSubscription,
  EquityPoint,
  TradingRiskRule,
  TradingRiskRuleInput,
  ExecuteSignalResult,
} from '../types.js';

export class TradingResource {
  constructor(private client: AlvaClient) {}

  async accounts(): Promise<TradingAccount[]> {
    this.client._requireAuth();
    return this.client._request(
      'GET',
      '/api/v1/trading/accounts'
    ) as Promise<TradingAccount[]>;
  }

  async portfolio(accountId: string): Promise<TradingPortfolio> {
    this.client._requireAuth();
    return this.client._request('GET', '/api/v1/trading/portfolio', {
      query: { accountId },
    }) as Promise<TradingPortfolio>;
  }

  async orders(params: {
    accountId: string;
    source?: string;
    since?: number;
    limit?: number;
  }): Promise<TradingOrder[]> {
    this.client._requireAuth();
    return this.client._request('GET', '/api/v1/trading/orders', {
      query: {
        accountId: params.accountId,
        source: params.source,
        since: params.since,
        limit: params.limit,
      },
    }) as Promise<TradingOrder[]>;
  }

  async subscriptions(accountId: string): Promise<TradingSubscription[]> {
    this.client._requireAuth();
    return this.client._request('GET', '/api/v1/trading/subscriptions', {
      query: { accountId },
    }) as Promise<TradingSubscription[]>;
  }

  async equityHistory(params: {
    accountId: string;
    timeframe?: string;
    sinceMs?: number;
    untilMs?: number;
  }): Promise<EquityPoint[]> {
    this.client._requireAuth();
    return this.client._request('GET', '/api/v1/trading/equity-history', {
      query: {
        accountId: params.accountId,
        timeframe: params.timeframe,
        sinceMs: params.sinceMs,
        untilMs: params.untilMs,
      },
    }) as Promise<EquityPoint[]>;
  }

  async riskRules(): Promise<TradingRiskRule> {
    this.client._requireAuth();
    return this.client._request(
      'GET',
      '/api/v1/trading/risk-rules'
    ) as Promise<TradingRiskRule>;
  }

  async subscribe(params: {
    accountId: string;
    sourceUsername: string;
    sourceFeed: string;
    playbookId: string;
    playbookVersion: string;
    executeLatest?: boolean;
  }): Promise<TradingSubscription> {
    this.client._requireAuth();
    return this.client._request('POST', '/api/v1/trading/subscribe', {
      body: params,
    }) as Promise<TradingSubscription>;
  }

  async unsubscribe(
    subscriptionId: string
  ): Promise<{ unsubscribedId: string }> {
    this.client._requireAuth();
    return this.client._request('POST', '/api/v1/trading/unsubscribe', {
      body: { subscriptionId },
    }) as Promise<{ unsubscribedId: string }>;
  }

  async execute(params: {
    accountId: string;
    signalJson: string;
    dryRun: boolean;
    sourceUsername?: string;
    sourceFeed?: string;
  }): Promise<ExecuteSignalResult> {
    this.client._requireAuth();
    return this.client._request('POST', '/api/v1/trading/execute', {
      body: params,
    }) as Promise<ExecuteSignalResult>;
  }

  async updateRiskRules(
    rules: TradingRiskRuleInput
  ): Promise<TradingRiskRule> {
    this.client._requireAuth();
    return this.client._request('PUT', '/api/v1/trading/risk-rules', {
      body: rules,
    }) as Promise<TradingRiskRule>;
  }
}
