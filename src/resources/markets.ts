import type { AlvaClient } from '../client.js';
import { AlvaError } from '../error.js';
import { v2Path } from '../platformApi.js';
import type { AlvaId } from '../types.js';

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

// The /api/v2 wire: an Asset, its company narrative, earnings calendar and
// earnings report (alva-gateway pkg/v2/api/market).
interface WireAsset {
  id: AlvaId;
  symbol: string;
}

interface WireNarrativeVersion {
  asOf: string;
  generatedAt: string;
  body: string;
  peers: string | null;
}

interface WireNarrative {
  latest: WireNarrativeVersion | null;
  history: WireNarrativeVersion[];
  changes: { asOf: string; generatedAt: string; summary: string | null }[];
}

interface WireEarningsPeriod {
  fiscalYear: number;
  fiscalQuarter: CompanyFiscalQuarter;
  label: string;
  periodEnd: string;
  reportsOn: string;
  timing: CompanyEarningsSession | null;
  status: CompanyEarningsStatus;
  isDefault: boolean;
}

interface WireEarningsCalendar {
  periods: WireEarningsPeriod[];
  defaultPeriod: WireEarningsPeriod | null;
  unresolvedEventCount: number;
}

interface WireConsensus {
  estimateCount: number;
  observedAt: string | null;
}

interface WireEarningsReport {
  period: WireEarningsPeriod;
  preview: Omit<
    CompanyPreEarningsAnalysis,
    'status' | 'consensusN' | 'consensusObservedAt'
  > & {
    availability: CompanyEarningsContentStatus;
    consensus: WireConsensus | null;
  };
  release: {
    availability: CompanyEarningsContentStatus;
    releasedOn: string | null;
    url: string | null;
  };
  transcript: {
    availability: CompanyEarningsContentStatus;
    heldOn: string | null;
    publishedAt: string | null;
    sections: CompanyEarningsTranscriptSection[];
  };
  recap: Omit<
    CompanyPostEarningsSummary,
    'status' | 'evidenceState' | 'consensusN' | 'consensusObservedAt'
  > & {
    availability: CompanyEarningsContentStatus;
    evidence: CompanyPostEarningsSummary['evidenceState'];
    consensus: WireConsensus | null;
  };
}

// v1 looked a ticker up as a stock; an Asset is one listing, so a ticker is
// tried as a US listing, then a non-US one.
const STOCK_ASSET_CLASSES = ['US_STOCK', 'NON_US_STOCK'] as const;

function isNotFound(error: unknown): boolean {
  return error instanceof AlvaError && error.status === 404;
}

function toPeriod(p: WireEarningsPeriod): CompanyEarningsPeriod {
  return {
    fiscalYear: p.fiscalYear,
    fiscalQuarter: p.fiscalQuarter,
    label: p.label,
    fiscalDateEnding: p.periodEnd,
    earningsDate: p.reportsOn,
    session: p.timing,
    status: p.status,
    isDefault: p.isDefault,
  };
}

function toNarrative(
  n: WireNarrative
): Omit<CompanyNarrativeContext, 'ticker'> {
  return {
    current: n.latest
      ? {
          asOf: n.latest.asOf,
          generatedAtMs: Date.parse(n.latest.generatedAt),
          narrative: n.latest.body,
          peers: n.latest.peers ?? '',
        }
      : null,
    history:
      n.history.length > 0 || n.changes.length > 0
        ? {
            snapshots: n.history.map((s) => ({
              asOf: s.asOf,
              generatedAtMs: Date.parse(s.generatedAt),
              narrative: s.body,
            })),
            changeLog: n.changes.map((c) => ({
              asOf: c.asOf,
              generatedAtMs: Date.parse(c.generatedAt),
              narrativeChangeLog: c.summary,
            })),
          }
        : null,
  };
}

function toEarnings(
  r: WireEarningsReport
): Omit<CompanyEarningsContext, 'ticker'> {
  const {
    availability: preStatus,
    consensus: preConsensus,
    ...pre
  } = r.preview;
  const {
    availability: recapStatus,
    evidence,
    consensus: recapConsensus,
    ...recap
  } = r.recap;
  return {
    period: toPeriod(r.period),
    preEarningsAnalysis: {
      ...pre,
      status: preStatus,
      consensusN: preConsensus?.estimateCount ?? null,
      consensusObservedAt: preConsensus?.observedAt ?? null,
    },
    earningsRelease: {
      status: r.release.availability,
      releaseDate: r.release.releasedOn,
      url: r.release.url,
    },
    earningsTranscript: {
      status: r.transcript.availability,
      date: r.transcript.heldOn,
      publishedAtMs:
        r.transcript.publishedAt === null
          ? null
          : Date.parse(r.transcript.publishedAt),
      sections: r.transcript.sections,
    },
    postEarningsSummary: {
      ...recap,
      status: recapStatus,
      evidenceState: evidence,
      consensusN: recapConsensus?.estimateCount ?? null,
      consensusObservedAt: recapConsensus?.observedAt ?? null,
    },
  };
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
    const asset = await this.stock(normalizedTicker(ticker));
    try {
      const narrative = await this.client._v2Request<WireNarrative>(
        'GET',
        v2Path`/assets/${asset.id}/narrative`
      );
      return { ticker: asset.symbol, ...toNarrative(narrative) };
    } catch (error) {
      if (!isNotFound(error)) throw error;
      return { ticker: asset.symbol, current: null, history: null };
    }
  }

  async earningsPeriods(ticker: string): Promise<CompanyEarningsCatalog> {
    this.client._requireAuth();
    return this.calendar(await this.stock(normalizedTicker(ticker)));
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
    const asset = await this.stock(ticker);
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
      const catalog = await this.calendar(asset);
      const period = this.selectPeriod(catalog, event, asset.symbol);
      fiscalYear = period.fiscalYear;
      fiscalQuarter = period.fiscalQuarter;
    }

    try {
      const report = await this.client._v2Request<WireEarningsReport>(
        'GET',
        v2Path`/assets/${asset.id}/earnings`,
        { query: { fiscalYear, fiscalQuarter } }
      );
      return { ticker: asset.symbol, ...toEarnings(report) };
    } catch (error) {
      if (!isNotFound(error)) throw error;
      throw new AlvaError(
        'MARKETS_EARNINGS_NOT_COVERED',
        `No earnings content is available for ${asset.symbol} FY${fiscalYear} ${fiscalQuarter}`,
        404,
        { ticker: asset.symbol, fiscalYear, fiscalQuarter }
      );
    }
  }

  private async calendar(asset: WireAsset): Promise<CompanyEarningsCatalog> {
    try {
      const calendar = await this.client._v2Request<WireEarningsCalendar>(
        'GET',
        v2Path`/assets/${asset.id}/earnings-calendar`
      );
      return {
        periods: calendar.periods.map(toPeriod),
        defaultPeriod: calendar.defaultPeriod
          ? toPeriod(calendar.defaultPeriod)
          : null,
        unresolvedEventCount: calendar.unresolvedEventCount,
      };
    } catch (error) {
      if (!isNotFound(error)) throw error;
      throw new AlvaError(
        'MARKETS_EARNINGS_NOT_COVERED',
        `No earnings periods are available for ${asset.symbol}`,
        404,
        { ticker: asset.symbol }
      );
    }
  }

  /** The stock Asset a ticker names, as v1's stock entity lookup found it. */
  private async stock(ticker: string): Promise<WireAsset> {
    for (const assetClass of STOCK_ASSET_CLASSES) {
      try {
        return await this.client._v2Request<WireAsset>(
          'GET',
          v2Path`/assets/by-symbol/${ticker}`,
          { query: { assetClass } }
        );
      } catch (error) {
        if (!isNotFound(error)) throw error;
      }
    }
    throw new AlvaError(
      'MARKETS_ENTITY_NOT_FOUND',
      `No stock entity was found for ${ticker}`,
      404,
      { ticker }
    );
  }

  private selectPeriod(
    catalog: CompanyEarningsCatalog,
    event: CompanyEarningsEvent,
    ticker: string
  ): CompanyEarningsPeriod {
    if (event === 'latest-completed') {
      const completed = catalog.periods
        .filter((period) => period.status === 'COMPLETED')
        .sort((a, b) => b.earningsDate.localeCompare(a.earningsDate));
      if (completed.length > 0) return completed[0];
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
}
