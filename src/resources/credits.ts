import type { AlvaClient } from '../client.js';
import type { Schema, V2Query } from '../platformApi.js';

/** The caller's credit wallet and its ledger. Amounts are Decimal strings. */
export class CreditsResource {
  constructor(private client: AlvaClient) {}

  async wallet(): Promise<Schema<'Wallet'>> {
    this.client._requireAuth();
    return this.client._v2Request('GET', '/me/wallet');
  }

  /** One page of the ledger (from inclusive, to exclusive); a debit's amount is negative. */
  async entries(
    query: V2Query<'/me/credit-entries', 'get'> = {}
  ): Promise<Schema<'CreditEntryList'>> {
    this.client._requireAuth();
    return this.client._v2Request('GET', '/me/credit-entries', { query });
  }
}
