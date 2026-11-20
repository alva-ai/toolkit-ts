import type { AlvaClient } from '../client.js';
import { v2Path, type Schema, type V2Query } from '../platformApi.js';

/**
 * The caller's broker accounts, trading and SnapTrade in one shape, their
 * holdings and their activity. Amounts are Decimal strings in Money, times
 * RFC 3339.
 */
export class PortfolioResource {
  constructor(private client: AlvaClient) {}

  /** One page of the accounts; copyTradingOnly keeps those that can copy a Playbook. */
  async accounts(
    query: V2Query<'/me/broker-accounts', 'get'> = {}
  ): Promise<Schema<'BrokerAccountList'>> {
    this.client._requireAuth();
    return this.client._v2Request('GET', '/me/broker-accounts', { query });
  }

  /** An account's balance and positions from one read. */
  async snapshot(accountId: string): Promise<Schema<'PortfolioSnapshot'>> {
    this.client._requireAuth();
    return this.client._v2Request(
      'GET',
      v2Path`/broker-accounts/${accountId}/snapshot`
    );
  }

  async activities(
    accountId: string,
    query: V2Query<'/broker-accounts/{accountId}/activities', 'get'> = {}
  ): Promise<Schema<'BrokerActivityList'>> {
    this.client._requireAuth();
    return this.client._v2Request(
      'GET',
      v2Path`/broker-accounts/${accountId}/activities`,
      { query }
    );
  }
}
