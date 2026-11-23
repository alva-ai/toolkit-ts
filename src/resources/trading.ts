import type { AlvaClient } from '../client.js';
import { v2Path, type Schema, type V2Query } from '../platformApi.js';

export interface TradeOptions {
  /**
   * Idempotency-Key of the write: a retry with the same key never trades
   * twice. A UUID is recommended; without one, the call gets a new UUID.
   */
  idempotencyKey?: string;
}

/**
 * Orders, copy trading and risk rules of the caller's trex trading accounts.
 * Accounts and holdings are client.portfolio's.
 */
export class TradingResource {
  constructor(private client: AlvaClient) {}

  async orders(
    accountId: string,
    query: V2Query<'/broker-accounts/{accountId}/orders', 'get'> = {}
  ): Promise<Schema<'OrderList'>> {
    this.client._requireAuth();
    return this.client._v2Request(
      'GET',
      v2Path`/broker-accounts/${accountId}/orders`,
      { query }
    );
  }

  /**
   * Executes an order instruction now: trex sizes the orders, checks them
   * against the risk rules and places them, or with dryRun plans them only.
   */
  async placeOrders(
    accountId: string,
    instruction: Schema<'OrderInstruction'>,
    options: TradeOptions = {}
  ): Promise<Schema<'OrderExecution'>> {
    this.client._requireAuth();
    return this.client._v2Request(
      'POST',
      v2Path`/broker-accounts/${accountId}/orders`,
      { body: instruction, idempotencyKey: options.idempotencyKey }
    );
  }

  async subscriptions(
    accountId: string,
    query: V2Query<
      '/broker-accounts/{accountId}/trade-subscriptions',
      'get'
    > = {}
  ): Promise<Schema<'TradeSubscriptionList'>> {
    this.client._requireAuth();
    return this.client._v2Request(
      'GET',
      v2Path`/broker-accounts/${accountId}/trade-subscriptions`,
      { query }
    );
  }

  /** Copies a Playbook feed's signals (signalSourceId, its Automation ID) into the account. */
  async subscribe(
    accountId: string,
    body: Schema<'CreateTradeSubscriptionBody'>,
    options: TradeOptions = {}
  ): Promise<Schema<'TradeSubscription'>> {
    this.client._requireAuth();
    return this.client._v2Request(
      'POST',
      v2Path`/broker-accounts/${accountId}/trade-subscriptions`,
      { body, idempotencyKey: options.idempotencyKey }
    );
  }

  /** Stops a trade subscription; returns it, STOPPED. */
  async unsubscribe(
    tradeSubscriptionId: string,
    options: TradeOptions = {}
  ): Promise<Schema<'TradeSubscription'>> {
    this.client._requireAuth();
    return this.client._v2Request(
      'POST',
      v2Path`/trade-subscriptions/${tradeSubscriptionId}/cancel`,
      { idempotencyKey: options.idempotencyKey }
    );
  }

  /** The account's value curve over a preset range; each point's change is against the previous one. */
  async equity(
    accountId: string,
    query: V2Query<'/broker-accounts/{accountId}/equity', 'get'> = {}
  ): Promise<Schema<'EquitySeries'>> {
    this.client._requireAuth();
    return this.client._v2Request(
      'GET',
      v2Path`/broker-accounts/${accountId}/equity`,
      { query }
    );
  }

  async riskRules(): Promise<Schema<'RiskRules'>> {
    this.client._requireAuth();
    return this.client._v2Request('GET', '/me/risk-rules');
  }

  /**
   * Changes the risk rules (JSON Merge Patch): a rule not sent is unchanged,
   * and a rule sent replaces the current one whole, so it names both
   * `enabled` and `value` (the gateway refuses part of a rule). To change one
   * member, read the rules (`riskRules()`) and send the rule with the member
   * you keep; this method reads nothing itself. Raising or lifting a cap
   * needs trading_limits:write, which agent credentials lack; tightening
   * needs trading:write.
   */
  async updateRiskRules(
    patch: Schema<'RiskRulesPatch'>
  ): Promise<Schema<'RiskRules'>> {
    this.client._requireAuth();
    return this.client._v2Request('PATCH', '/me/risk-rules', { body: patch });
  }
}
