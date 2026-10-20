import type { AlvaClient } from '../client.js';
import { AlvaError } from '../error.js';

export interface CreateCompanyNewsParams {
  name: string;
  tickers: string[];
  initial_lookback_hours?: number;
  page_size?: number;
}

export interface CreateCompanyNewsResponse {
  feed_id: string;
  cronjob_id: string;
}

const CREATE_COMPANY_NEWS = `mutation CreateCompanyNews($input: CompanyNewsFeedInput!) {
  companyNews {
    createFeed(input: $input) { id producer { id } }
  }
}`;

interface CompanyNewsGraphResponse {
  data?: {
    companyNews?: {
      createFeed?: { id?: unknown; producer?: { id?: unknown } | null } | null;
    } | null;
  } | null;
  errors?: { message?: string; extensions?: { code?: string } }[];
}

const GRAPHQL_STATUS_BY_CODE: Readonly<Record<string, number>> = {
  INVALID_ARGUMENT: 400,
  UNAUTHENTICATED: 401,
  PERMISSION_DENIED: 403,
  NOT_FOUND: 404,
  ALREADY_EXISTS: 409,
  ABORTED: 409,
  FAILED_PRECONDITION: 412,
  RESOURCE_EXHAUSTED: 429,
  INTERNAL: 500,
  UNKNOWN: 500,
  DATA_LOSS: 500,
  UNAVAILABLE: 503,
  DEADLINE_EXCEEDED: 504,
};

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
    const body = {
      name: params.name,
      tickers: params.tickers,
      ...(params.initial_lookback_hours === undefined
        ? {}
        : { initialLookbackHours: params.initial_lookback_hours }),
      ...(params.page_size === undefined ? {} : { pageSize: params.page_size }),
    };
    const graph = (await this.client._request('POST', '/query', {
      body: { query: CREATE_COMPANY_NEWS, variables: { input: body } },
    })) as CompanyNewsGraphResponse | null;
    if (Array.isArray(graph?.errors) && graph.errors.length > 0) {
      const codes = graph.errors.map((error) => error?.extensions?.code);
      const code =
        typeof codes[0] === 'string' &&
        codes.every((value) => value === codes[0])
          ? codes[0]
          : 'GRAPHQL_ERROR';
      throw new AlvaError(
        code,
        graph.errors
          .map((error) => error?.message)
          .filter(Boolean)
          .join('; ') || 'Company News creation failed',
        GRAPHQL_STATUS_BY_CODE[code] ?? 502,
        { errors: graph.errors }
      );
    }
    const feed = graph?.data?.companyNews?.createFeed;
    const response = { feed_id: feed?.id, cronjob_id: feed?.producer?.id };
    if (
      typeof response !== 'object' ||
      response === null ||
      !('feed_id' in response) ||
      !validID(response.feed_id) ||
      !('cronjob_id' in response) ||
      !validID(response.cronjob_id)
    ) {
      throw new AlvaError(
        'INVALID_RESPONSE',
        'company news response must contain decimal int64 feed_id and cronjob_id strings',
        502
      );
    }
    return { feed_id: response.feed_id, cronjob_id: response.cronjob_id };
  }
}

function validID(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.trim() === value &&
    /^[1-9]\d{0,18}$/.test(value) &&
    BigInt(value) <= 9223372036854775807n
  );
}
