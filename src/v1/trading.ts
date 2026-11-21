import type { AlvaClient } from '../client.js';

/** A copy-trading subscription as /api/v1 returns it (0.x). */
export interface TradingSubscription {
  id: string;
  accountId: string;
  sourceUsername: string;
  sourceFeed: string;
  active: boolean;
  deactivateReason?: string;
  playbookId: string;
  playbookVersion: string;
  createdAtMs: number;
  watermark: number;
}

export interface SubscribeExecutingLatestParams {
  /** The trex account's numeric v1 ID. */
  accountId: string;
  sourceUsername: string;
  sourceFeed: string;
  /** The Playbook's numeric v1 ID. */
  playbookId: string;
  playbookVersion: string;
}

/**
 * Copy trading that executes the feed's latest signal on subscribe, which
 * /api/v2 does not do yet (initialOrders FOLLOW_LATEST_SIGNAL is refused).
 * It takes /api/v1's numeric IDs.
 */
export class V1TradingResource {
  constructor(private client: AlvaClient) {}

  async subscribe(
    params: SubscribeExecutingLatestParams
  ): Promise<TradingSubscription> {
    this.client._requireAuth();
    return this.client._request('POST', '/api/v1/trading/subscribe', {
      body: { ...params, executeLatest: true },
    }) as Promise<TradingSubscription>;
  }
}
