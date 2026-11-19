import type { AlvaClient } from '../client.js';
import { AlvaError } from '../error.js';
import type { AlvaId } from '../types.js';

export interface CreateCompanyNewsParams {
  name: string;
  tickers: string[];
  initial_lookback_hours?: number;
  page_size?: number;
}

export interface CreateCompanyNewsResponse {
  /** The feed's Automation ID. */
  feed_id: AlvaId;
  /** The Cronjob ID of the feed's producer. */
  cronjob_id: AlvaId;
}

export function validateCompanyNewsCreateParams(
  params: CreateCompanyNewsParams
): void {
  if (
    typeof params?.name !== 'string' ||
    params.name.trim() !== params.name ||
    !/^[a-zA-Z0-9][a-zA-Z0-9-]{0,63}$/.test(params.name) ||
    params.name === 'news-lane'
  ) {
    throw new AlvaError(
      'INVALID_ARGUMENT',
      'name must be 1-64 alphanumeric/hyphen characters and distinct from news-lane',
      400
    );
  }
  if (
    !Array.isArray(params.tickers) ||
    params.tickers.length < 1 ||
    params.tickers.length > 1000 ||
    params.tickers.some(
      (ticker) =>
        typeof ticker !== 'string' ||
        ticker.trim() !== ticker ||
        !/^[A-Z0-9][A-Z0-9.-]{0,19}$/.test(ticker)
    ) ||
    new Set(params.tickers).size !== params.tickers.length
  ) {
    throw new AlvaError(
      'INVALID_ARGUMENT',
      'tickers must contain 1-1000 unique uppercase symbols',
      400
    );
  }
  for (const [name, maximum] of [
    ['initial_lookback_hours', 168],
    ['page_size', 100],
  ] as const) {
    const value = params[name];
    if (
      value !== undefined &&
      (!Number.isInteger(value) || value < 0 || value > maximum)
    ) {
      throw new AlvaError(
        'INVALID_ARGUMENT',
        `${name} must be an integer from 0 to ${maximum} (0 selects the default)`,
        400
      );
    }
  }
}

export class CompanyNewsResource {
  constructor(private client: AlvaClient) {}

  async create(
    params: CreateCompanyNewsParams
  ): Promise<CreateCompanyNewsResponse> {
    this.client._requireAuth();
    validateCompanyNewsCreateParams(params);
    const feed = await this.client._v2Request<{
      id?: unknown;
      cronjobId?: unknown;
    } | null>('POST', '/company-news-feeds', {
      body: {
        name: params.name,
        tickers: params.tickers,
        initialLookbackHours: params.initial_lookback_hours,
        batchSize: params.page_size,
      },
    });
    if (!validID(feed?.id) || !validID(feed?.cronjobId)) {
      throw new AlvaError(
        'INVALID_RESPONSE',
        'company news response must contain an id and a cronjobId',
        502
      );
    }
    return { feed_id: feed.id, cronjob_id: feed.cronjobId };
  }
}

function validID(value: unknown): value is AlvaId {
  return typeof value === 'string' && value !== '' && value.trim() === value;
}
