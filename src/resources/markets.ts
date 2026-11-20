import type { AlvaClient } from '../client.js';
import { v2Path, type Schema, type V2Query } from '../platformApi.js';

/**
 * An Asset and its company context: narrative, earnings calendar and
 * earnings report. A symbol resolves to an Asset once (assetBySymbol); every
 * other read takes the Asset ID.
 */
export class MarketsResource {
  constructor(private client: AlvaClient) {}

  /** The listing a symbol names: the primary one, or the assetClass's. 404 when there is none. */
  async assetBySymbol(
    symbol: string,
    query: V2Query<'/assets/by-symbol/{symbol}', 'get'> = {}
  ): Promise<Schema<'Asset'>> {
    this.client._requireAuth();
    return this.client._v2Request('GET', v2Path`/assets/by-symbol/${symbol}`, {
      query,
    });
  }

  /** The current narrative, its history and changes. 404 without coverage. */
  async narrative(assetId: string): Promise<Schema<'AssetNarrative'>> {
    this.client._requireAuth();
    return this.client._v2Request('GET', v2Path`/assets/${assetId}/narrative`);
  }

  async earningsCalendar(assetId: string): Promise<Schema<'EarningsCalendar'>> {
    this.client._requireAuth();
    return this.client._v2Request(
      'GET',
      v2Path`/assets/${assetId}/earnings-calendar`
    );
  }

  /** One fiscal quarter's report; without fiscalYear and fiscalQuarter, the calendar's default period. */
  async earnings(
    assetId: string,
    query: V2Query<'/assets/{assetId}/earnings', 'get'> = {}
  ): Promise<Schema<'EarningsReport'>> {
    this.client._requireAuth();
    return this.client._v2Request('GET', v2Path`/assets/${assetId}/earnings`, {
      query,
    });
  }
}
