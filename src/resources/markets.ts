import type { AlvaClient } from '../client.js';
import { AlvaError } from '../error.js';

export type CompanyFiscalQuarter = 'Q1' | 'Q2' | 'Q3' | 'Q4';
export type CompanyEarningsEvent = 'latest-completed' | 'next-confirmed';
export type CompanyEarningsStatus = 'UPCOMING' | 'COMPLETED';
export type CompanyEarningsContentStatus =
  | 'AVAILABLE'
  | 'NOT_AVAILABLE_YET'
  | 'UNAVAILABLE';
export type CompanyEarningsSession =
  | 'BEFORE_MARKET_OPEN'
  | 'AFTER_MARKET_CLOSE';

export interface CompanyNarrative {
  asOf: string;
  generatedAtMs: number;
  narrative: string;
  peers: string;
}

export interface CompanyNarrativeSnapshot {
  asOf: string;
  generatedAtMs: number;
  narrative: string;
}

export interface CompanyNarrativeChangeLogEntry {
  asOf: string;
  generatedAtMs: number;
  narrativeChangeLog: string | null;
}

export interface CompanyNarrativeHistory {
  snapshots: CompanyNarrativeSnapshot[];
  changeLog: CompanyNarrativeChangeLogEntry[];
}

export interface CompanyNarrativeContext {
  ticker: string;
  current: CompanyNarrative | null;
  history: CompanyNarrativeHistory | null;
}

export interface CompanyEarningsPeriod {
  fiscalYear: number;
  fiscalQuarter: CompanyFiscalQuarter;
  label: string;
  fiscalDateEnding: string;
  earningsDate: string;
  session: CompanyEarningsSession | null;
  status: CompanyEarningsStatus;
  isDefault: boolean;
}

export interface CompanyEarningsCatalog {
  periods: CompanyEarningsPeriod[];
  defaultPeriod: CompanyEarningsPeriod | null;
  unresolvedEventCount: number;
}

export interface CompanyPreEarningsAnalysis {
  status: CompanyEarningsContentStatus;
  asOf: string | null;
  summary: string | null;
  whatWouldChangeView: string | null;
  mainQuestion: string | null;
  investorFocus: string[];
  consensusAndGuidance: string | null;
  stockSetup: string | null;
  eventRisk: string | null;
  whatWouldDriveUpside: string | null;
  bullCase: string | null;
  baseCase: string | null;
  bearCase: string | null;
  keyAsymmetry: string | null;
  consensusN: number | null;
  consensusObservedAt: string | null;
}

export interface CompanyEarningsRelease {
  status: CompanyEarningsContentStatus;
  releaseDate: string | null;
  url: string | null;
}

export interface CompanyEarningsTranscriptEntry {
  speaker: string;
  title: string;
  content: string;
}

export interface CompanyEarningsTranscriptSection {
  name: string;
  entries: CompanyEarningsTranscriptEntry[];
}

export interface CompanyEarningsTranscript {
  status: CompanyEarningsContentStatus;
  date: string | null;
  publishedAtMs: number | null;
  sections: CompanyEarningsTranscriptSection[];
}

export interface CompanyPostEarningsSummary {
  status: CompanyEarningsContentStatus;
  asOf: string | null;
  reportedCurrency: string | null;
  evidenceState: 'INITIAL_PRINT' | 'POST_CALL' | null;
  openingQuote: string | null;
  openingQuoteSpeaker: string | null;
  openingQuoteTitle: string | null;
  openingQuoteNote: string | null;
  buriedSignals: string[];
  whatYouShouldKnow: string[];
  consensusN: number | null;
  consensusObservedAt: string | null;
}

export interface CompanyEarningsContext {
  ticker: string;
  period: CompanyEarningsPeriod;
  preEarningsAnalysis: CompanyPreEarningsAnalysis;
  earningsRelease: CompanyEarningsRelease;
  earningsTranscript: CompanyEarningsTranscript;
  postEarningsSummary: CompanyPostEarningsSummary;
}

export type CompanyEarningsParams =
  | {
      ticker: string;
      event?: CompanyEarningsEvent;
      fiscalYear?: never;
      fiscalQuarter?: never;
    }
  | {
      ticker: string;
      event?: never;
      fiscalYear: number;
      fiscalQuarter: CompanyFiscalQuarter;
    };

const FISCAL_QUARTERS: readonly CompanyFiscalQuarter[] = [
  'Q1',
  'Q2',
  'Q3',
  'Q4',
];
const EARNINGS_EVENTS: readonly CompanyEarningsEvent[] = [
  'latest-completed',
  'next-confirmed',
];

const NARRATIVE_QUERY = `
query ToolkitCompanyNarrative($ticker: String!) {
  market {
    entity(input: { ticker: $ticker, kind: STOCK }) {
      ticker
      companyInsight {
        asOf
        generatedAtMs
        narrative
        peers
      }
      companyInsightHistory {
        snapshots {
          asOf
          generatedAtMs
          narrative
        }
        changeLog {
          asOf
          generatedAtMs
          narrativeChangeLog
        }
      }
    }
  }
}
`.trim();

const EARNINGS_CATALOG_QUERY = `
query ToolkitCompanyEarningsCatalog($ticker: String!) {
  market {
    entity(input: { ticker: $ticker, kind: STOCK }) {
      ticker
      earningsPeriods {
        unresolvedEventCount
        defaultPeriod {
          fiscalYear
          fiscalQuarter
          label
          fiscalDateEnding
          earningsDate
          session
          status
          isDefault
        }
        periods {
          fiscalYear
          fiscalQuarter
          label
          fiscalDateEnding
          earningsDate
          session
          status
          isDefault
        }
      }
    }
  }
}
`.trim();

const EARNINGS_QUERY = `
query ToolkitCompanyEarnings($ticker: String!, $input: CompanyEarningsInput) {
  market {
    entity(input: { ticker: $ticker, kind: STOCK }) {
      ticker
      earnings(input: $input) {
        period {
          fiscalYear
          fiscalQuarter
          label
          fiscalDateEnding
          earningsDate
          session
          status
          isDefault
        }
        preEarningsAnalysis {
          status
          asOf
          summary
          whatWouldChangeView
          mainQuestion
          investorFocus
          consensusAndGuidance
          stockSetup
          eventRisk
          whatWouldDriveUpside
          bullCase
          baseCase
          bearCase
          keyAsymmetry
          consensusN
          consensusObservedAt
        }
        earningsRelease {
          status
          releaseDate
          url
        }
        earningsTranscript {
          status
          date
          publishedAtMs
          sections {
            name
            entries {
              speaker
              title
              content
            }
          }
        }
        postEarningsSummary {
          status
          asOf
          reportedCurrency
          evidenceState
          openingQuote
          openingQuoteSpeaker
          openingQuoteTitle
          openingQuoteNote
          buriedSignals
          whatYouShouldKnow
          consensusN
          consensusObservedAt
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

interface NarrativeQueryData {
  market?: {
    entity?: {
      ticker: string;
      companyInsight: CompanyNarrative | null;
      companyInsightHistory: CompanyNarrativeHistory | null;
    } | null;
  } | null;
}

interface EarningsCatalogQueryData {
  market?: {
    entity?: {
      ticker: string;
      earningsPeriods: CompanyEarningsCatalog | null;
    } | null;
  } | null;
}

interface EarningsQueryData {
  market?: {
    entity?:
      | ({ ticker: string } & {
          earnings: Omit<CompanyEarningsContext, 'ticker'> | null;
        })
      | null;
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

function normalizedTicker(ticker: string): string {
  const normalized = ticker.trim().toUpperCase();
  if (!normalized) {
    throw new AlvaError('INVALID_ARGUMENT', 'ticker is required', 400);
  }
  return normalized;
}

export class MarketsResource {
  constructor(private client: AlvaClient) {}

  async narrative(ticker: string): Promise<CompanyNarrativeContext> {
    this.client._requireAuth();
    const requestedTicker = normalizedTicker(ticker);
    const data = await this.graphql<NarrativeQueryData>(NARRATIVE_QUERY, {
      ticker: requestedTicker,
    });
    const entity = data.market?.entity;
    if (!entity) {
      throw this.notFound(requestedTicker);
    }
    return {
      ticker: entity.ticker,
      current: entity.companyInsight,
      history: entity.companyInsightHistory,
    };
  }

  async earningsPeriods(ticker: string): Promise<CompanyEarningsCatalog> {
    this.client._requireAuth();
    const requestedTicker = normalizedTicker(ticker);
    const data = await this.graphql<EarningsCatalogQueryData>(
      EARNINGS_CATALOG_QUERY,
      { ticker: requestedTicker }
    );
    const entity = data.market?.entity;
    if (!entity) {
      throw this.notFound(requestedTicker);
    }
    if (!entity.earningsPeriods) {
      throw new AlvaError(
        'MARKETS_EARNINGS_NOT_COVERED',
        `No earnings periods are available for ${entity.ticker}`,
        404,
        { ticker: entity.ticker }
      );
    }
    return entity.earningsPeriods;
  }

  async earnings(
    params: CompanyEarningsParams
  ): Promise<CompanyEarningsContext> {
    this.client._requireAuth();
    const ticker = normalizedTicker(params.ticker);
    const requestedEvent = params.event;
    const requestedFiscalYear = params.fiscalYear;
    const requestedFiscalQuarter = params.fiscalQuarter;
    const hasExplicitPeriod =
      requestedFiscalYear !== undefined || requestedFiscalQuarter !== undefined;
    if (requestedEvent !== undefined && hasExplicitPeriod) {
      throw new AlvaError(
        'INVALID_ARGUMENT',
        'event cannot be combined with fiscalYear or fiscalQuarter',
        400
      );
    }
    if (
      (requestedFiscalYear === undefined) !==
      (requestedFiscalQuarter === undefined)
    ) {
      throw new AlvaError(
        'INVALID_ARGUMENT',
        'fiscalYear and fiscalQuarter must be provided together',
        400
      );
    }
    if (
      requestedEvent !== undefined &&
      !EARNINGS_EVENTS.includes(requestedEvent)
    ) {
      throw new AlvaError(
        'INVALID_ARGUMENT',
        `Unknown earnings event selector: ${requestedEvent}`,
        400
      );
    }
    if (
      requestedFiscalYear !== undefined &&
      (!Number.isInteger(requestedFiscalYear) ||
        requestedFiscalYear < 1900 ||
        requestedFiscalYear > 9999)
    ) {
      throw new AlvaError(
        'INVALID_ARGUMENT',
        'fiscalYear must be an integer between 1900 and 9999',
        400
      );
    }
    if (
      requestedFiscalQuarter !== undefined &&
      !FISCAL_QUARTERS.includes(requestedFiscalQuarter)
    ) {
      throw new AlvaError(
        'INVALID_ARGUMENT',
        'fiscalQuarter must be Q1, Q2, Q3, or Q4',
        400
      );
    }
    let fiscalYear: number;
    let fiscalQuarter: CompanyFiscalQuarter;

    if (
      requestedFiscalYear !== undefined &&
      requestedFiscalQuarter !== undefined
    ) {
      fiscalYear = requestedFiscalYear;
      fiscalQuarter = requestedFiscalQuarter;
    } else {
      const event = requestedEvent ?? 'latest-completed';
      const catalog = await this.earningsPeriods(ticker);
      const period = this.selectPeriod(catalog, event, ticker);
      fiscalYear = period.fiscalYear;
      fiscalQuarter = period.fiscalQuarter;
    }

    const data = await this.graphql<EarningsQueryData>(EARNINGS_QUERY, {
      ticker,
      input: { fiscalYear, fiscalQuarter },
    });
    const entity = data.market?.entity;
    if (!entity) {
      throw this.notFound(ticker);
    }
    if (!entity.earnings) {
      throw new AlvaError(
        'MARKETS_EARNINGS_NOT_COVERED',
        `No earnings content is available for ${entity.ticker} FY${fiscalYear} ${fiscalQuarter}`,
        404,
        { ticker: entity.ticker, fiscalYear, fiscalQuarter }
      );
    }
    return { ticker: entity.ticker, ...entity.earnings };
  }

  private selectPeriod(
    catalog: CompanyEarningsCatalog,
    event: CompanyEarningsEvent,
    ticker: string
  ): CompanyEarningsPeriod {
    if (event === 'latest-completed') {
      if (catalog.defaultPeriod) return catalog.defaultPeriod;
    } else {
      const upcoming = catalog.periods
        .filter((period) => period.status === 'UPCOMING')
        .sort((a, b) => a.earningsDate.localeCompare(b.earningsDate));
      if (upcoming.length > 0) return upcoming[0];
    }

    throw new AlvaError(
      'MARKETS_EARNINGS_EVENT_NOT_FOUND',
      `No ${event} earnings event is available for ${ticker}`,
      404,
      { ticker, event }
    );
  }

  private notFound(ticker: string): AlvaError {
    return new AlvaError(
      'MARKETS_ENTITY_NOT_FOUND',
      `No stock entity was found for ${ticker}`,
      404,
      { ticker }
    );
  }

  private async graphql<T>(
    query: string,
    variables: Record<string, unknown>
  ): Promise<T> {
    const response = (await this.client._request('POST', '/query', {
      body: { query, variables },
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
