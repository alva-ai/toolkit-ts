import type { AlvaClient } from '../client.js';
import { AlvaError } from '../error.js';
import { collectAll, v2Path, type Page } from '../platformApi.js';
import type {
  AlvaId,
  TradingAccount,
  TradingPortfolio,
  TradingOrder,
  TradingSubscription,
  EquityPoint,
  RiskRuleEntry,
  TradingRiskRule,
  TradingRiskRuleInput,
  ExecuteSignalResult,
} from '../types.js';
import {
  accountSubscriptions,
  isTradingAccount,
  listBrokerAccounts,
  listTradeSubscriptions,
  ms,
  playbookRefs,
  type PlaybookRef,
  type WireMoney,
  type WireSnapshot,
  type WireTradeSubscription,
} from './brokerAccounts.js';

/** Where an order came from (the v2 filter that replaces trex's source). */
export type OrderOrigin =
  | 'EXTERNAL'
  | 'ALVA_DIRECT'
  | 'ALVA_INSTRUCTION'
  | 'UNKNOWN';

/** The window of an account's value curve. */
export type EquityRange =
  | 'ONE_DAY'
  | 'ONE_WEEK'
  | 'ONE_MONTH'
  | 'THREE_MONTHS'
  | 'YEAR_TO_DATE'
  | 'ONE_YEAR'
  | 'ALL';

interface WireOrder {
  id: AlvaId;
  externalReference: string;
  symbol: string;
  side: 'BUY' | 'SELL' | null;
  status: string;
  rejectReason: string | null;
  requestedQuantity: string;
  filledQuantity: string;
  averagePrice: WireMoney | null;
  origin: OrderOrigin;
  tradeSubscriptionId: AlvaId | null;
  placedAt: string | null;
}

interface WireEquitySeries {
  points: {
    startsAt: string;
    value: WireMoney;
    pnl: WireMoney;
    pnlPercent: string;
  }[];
}

interface WireRiskLimit {
  enabled: boolean;
  value: string;
}

interface WireRiskRules {
  maxOrderValue: WireRiskLimit;
  maxDailyTurnover: WireRiskLimit;
  maxDailyOrders: WireRiskLimit;
}

/** trex's order status names, which v1 returned. */
const ORDER_STATUS: Readonly<Record<string, string>> = {
  PENDING: 'pending',
  PARTIALLY_FILLED: 'partial',
  FILLED: 'filled',
  REJECTED: 'rejected',
  CANCELED: 'canceled',
  UNKNOWN: 'unknown',
};

const DAY_MS = 86_400_000;

/**
 * The smallest window that still holds sinceMs. Months are taken as their
 * shortest length, so the window never starts after sinceMs.
 */
const EQUITY_RANGES: readonly [EquityRange, number][] = [
  ['ONE_DAY', DAY_MS],
  ['ONE_WEEK', 7 * DAY_MS],
  ['ONE_MONTH', 28 * DAY_MS],
  ['THREE_MONTHS', 89 * DAY_MS],
  ['ONE_YEAR', 365 * DAY_MS],
];

function rangeSince(sinceMs: number): EquityRange {
  const span = Date.now() - sinceMs;
  return EQUITY_RANGES.find(([, length]) => span <= length)?.[0] ?? 'ALL';
}

function amount(m: WireMoney | null): number | undefined {
  return m === null ? undefined : Number(m.amount);
}

function toRiskRules(r: WireRiskRules): TradingRiskRule {
  const entry = (l: WireRiskLimit): RiskRuleEntry => ({
    value: Number(l.value),
    enabled: l.enabled,
  });
  return {
    maxSingleOrder: entry(r.maxOrderValue),
    maxDailyTurnover: entry(r.maxDailyTurnover),
    maxDailyOrders: entry(r.maxDailyOrders),
  };
}

function toSubscription(
  s: WireTradeSubscription,
  playbook: PlaybookRef | undefined
): TradingSubscription {
  return {
    id: s.id,
    accountId: s.accountId,
    sourceUsername: playbook?.ownerUsername ?? '',
    sourceFeed: s.feed,
    active: s.status === 'ACTIVE',
    deactivateReason: s.stoppedReason ?? undefined,
    playbookId: s.playbookId ?? '',
    playbookVersion: s.playbookVersion,
    createdAtMs: Date.parse(s.createdAt),
    watermark: ms(s.lastSignalAt) ?? 0,
  };
}

export class TradingResource {
  constructor(private client: AlvaClient) {}

  async accounts(): Promise<TradingAccount[]> {
    this.client._requireAuth();
    const accounts = (await listBrokerAccounts(this.client)).filter(
      isTradingAccount
    );
    const subscriptions = await accountSubscriptions(this.client, accounts);
    const playbooks = await playbookRefs(
      this.client,
      [...subscriptions.values()].flat().map((s) => s.playbookId)
    );
    return accounts.map((a) => ({
      id: a.id,
      name: a.displayName,
      exchange: a.broker.code,
      paper: a.mode === 'PAPER_TRADING',
      identifier: a.maskedNumber ?? '',
      createdAtMs: ms(a.connectedAt) ?? 0,
      subscriptions: (subscriptions.get(a.id) ?? []).map((s) => {
        const playbook =
          s.playbookId === null ? undefined : playbooks.get(s.playbookId);
        return {
          id: s.id,
          sourceUsername: playbook?.ownerUsername ?? '',
          sourceFeed: s.feed,
          playbookId: s.playbookId ?? '',
          playbookName: playbook?.title ?? '',
          active: s.status === 'ACTIVE',
        };
      }),
    }));
  }

  async portfolio(accountId: AlvaId): Promise<TradingPortfolio> {
    this.client._requireAuth();
    const s = await this.client._v2Request<WireSnapshot>(
      'GET',
      v2Path`/broker-accounts/${accountId}/snapshot`
    );
    return {
      // Null when a holding could not be valued, as trex reported it.
      equity:
        s.valuationStatus === 'COMPLETE'
          ? (amount(s.totalValue) ?? null)
          : null,
      cash: amount(s.cash) ?? 0,
      unrealizedPnl: amount(s.unrealizedPnl),
      assets: s.positions.map((p) => ({
        symbol: p.symbol,
        side: p.side.toLowerCase(),
        quantity: Number(p.quantity),
        entryPrice: amount(p.averageCost) ?? 0,
        currentPrice: amount(p.price),
        marketValue: amount(p.marketValue),
        unrealizedPnl: amount(p.unrealizedPnl),
        allocation: p.weight ?? undefined,
      })),
    };
  }

  async orders(params: {
    accountId: AlvaId;
    origin?: OrderOrigin;
    /** @deprecated trex's source filter has no /api/v2 form; use origin. */
    source?: string;
    /** Orders placed at or after this time, Unix seconds. */
    since?: number;
    limit?: number;
  }): Promise<TradingOrder[]> {
    this.client._requireAuth();
    if (params.source !== undefined) {
      throw new AlvaError(
        'INVALID_ARGUMENT',
        'source is not a filter of /api/v2; filter by origin (EXTERNAL, ALVA_DIRECT, ALVA_INSTRUCTION or UNKNOWN)',
        400
      );
    }
    const page = await this.client._v2Request<Page<WireOrder>>(
      'GET',
      v2Path`/broker-accounts/${params.accountId}/orders`,
      {
        query: {
          origin: params.origin,
          since:
            params.since === undefined
              ? undefined
              : new Date(params.since * 1000).toISOString(),
          pageSize: params.limit,
        },
      }
    );
    const playbookOf = await this.subscriptionPlaybooks(
      params.accountId,
      page.items
    );
    return page.items.map((o) => ({
      orderId: o.externalReference,
      symbol: o.symbol,
      side: o.side?.toLowerCase() ?? '',
      requestedQty: Number(o.requestedQuantity),
      filledQty: Number(o.filledQuantity),
      price: amount(o.averagePrice) ?? 0,
      status: ORDER_STATUS[o.status] ?? o.status.toLowerCase(),
      rejectReason: o.rejectReason ?? undefined,
      source: o.origin,
      sourcePlaybook:
        o.tradeSubscriptionId === null
          ? ''
          : (playbookOf.get(o.tradeSubscriptionId) ?? ''),
      subscriptionId: o.tradeSubscriptionId ?? undefined,
      dryRun: false,
      createdAtMs: ms(o.placedAt) ?? 0,
    }));
  }

  async subscriptions(accountId: AlvaId): Promise<TradingSubscription[]> {
    this.client._requireAuth();
    const subscriptions = await listTradeSubscriptions(this.client, accountId);
    const playbooks = await playbookRefs(
      this.client,
      subscriptions.map((s) => s.playbookId)
    );
    return subscriptions.map((s) =>
      toSubscription(
        s,
        s.playbookId === null ? undefined : playbooks.get(s.playbookId)
      )
    );
  }

  /**
   * The account's value curve. /api/v2 serves preset windows: without range,
   * the smallest one holding sinceMs is read, and points outside
   * [sinceMs, untilMs] are dropped.
   */
  async equityHistory(params: {
    accountId: AlvaId;
    range?: EquityRange;
    /** Only "1D" (daily), the one bucket trex served. */
    timeframe?: string;
    sinceMs?: number;
    untilMs?: number;
  }): Promise<EquityPoint[]> {
    this.client._requireAuth();
    if (
      params.timeframe !== undefined &&
      params.timeframe.toUpperCase() !== '1D'
    ) {
      throw new AlvaError(
        'INVALID_ARGUMENT',
        `timeframe ${params.timeframe} is not available; choose a range instead`,
        400
      );
    }
    const range =
      params.range ??
      (params.sinceMs === undefined ? undefined : rangeSince(params.sinceMs));
    const series = await this.client._v2Request<WireEquitySeries>(
      'GET',
      v2Path`/broker-accounts/${params.accountId}/equity`,
      { query: { range } }
    );
    return series.points
      .filter((p) => {
        const at = Date.parse(p.startsAt);
        return (
          (params.sinceMs === undefined || at >= params.sinceMs) &&
          (params.untilMs === undefined || at <= params.untilMs)
        );
      })
      .map((p) => ({
        timestamp: Math.floor(Date.parse(p.startsAt) / 1000),
        equity: Number(p.value.amount),
        pnl: Number(p.pnl.amount),
        pnlPct: Number(p.pnlPercent) / 100,
      }));
  }

  async riskRules(): Promise<TradingRiskRule> {
    this.client._requireAuth();
    return toRiskRules(
      await this.client._v2Request<WireRiskRules>('GET', '/me/risk-rules')
    );
  }

  /**
   * Copies a Playbook feed's signals into the account. The feed is its
   * Automation ID (signalSourceId); without one, sourceFeed names one of the
   * caller's own feeds, since /api/v2 cannot find another user's feed by
   * name. executeLatest stays on /api/v1, which takes v1's numeric IDs.
   */
  async subscribe(params: {
    accountId: AlvaId;
    sourceUsername: string;
    sourceFeed: string;
    playbookId: AlvaId;
    playbookVersion: string;
    signalSourceId?: AlvaId;
    executeLatest?: boolean;
  }): Promise<TradingSubscription> {
    this.client._requireAuth();
    if (params.executeLatest) {
      return this.client._request('POST', '/api/v1/trading/subscribe', {
        body: {
          accountId: params.accountId,
          sourceUsername: params.sourceUsername,
          sourceFeed: params.sourceFeed,
          playbookId: params.playbookId,
          playbookVersion: params.playbookVersion,
          executeLatest: true,
        },
      }) as Promise<TradingSubscription>;
    }
    const signalSourceId =
      params.signalSourceId ??
      (await this.ownFeed(params.sourceUsername, params.sourceFeed));
    const s = await this.client._v2Request<WireTradeSubscription>(
      'POST',
      v2Path`/broker-accounts/${params.accountId}/trade-subscriptions`,
      {
        body: {
          playbookId: params.playbookId,
          signalSourceId,
          playbookVersion: params.playbookVersion,
          initialOrders: 'NONE',
        },
      }
    );
    const playbooks = await playbookRefs(this.client, [s.playbookId]);
    const playbook =
      s.playbookId === null ? undefined : playbooks.get(s.playbookId);
    return toSubscription(
      s,
      playbook ?? { title: '', ownerUsername: params.sourceUsername }
    );
  }

  async unsubscribe(
    subscriptionId: AlvaId
  ): Promise<{ unsubscribedId: AlvaId }> {
    this.client._requireAuth();
    const s = await this.client._v2Request<WireTradeSubscription>(
      'POST',
      v2Path`/trade-subscriptions/${subscriptionId}/cancel`
    );
    return { unsubscribedId: s.id };
  }

  /**
   * Executes a signal. It stays on /api/v1 (/api/v2 has no order placement
   * yet), which takes trex's numeric account ID, as `alva broker accounts`
   * lists it, not the ID trading.accounts returns.
   */
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

  async updateRiskRules(rules: TradingRiskRuleInput): Promise<TradingRiskRule> {
    this.client._requireAuth();
    const limit = (e: RiskRuleEntry | undefined) =>
      e === undefined
        ? undefined
        : { enabled: e.enabled, value: String(e.value) };
    try {
      return toRiskRules(
        await this.client._v2Request<WireRiskRules>('PATCH', '/me/risk-rules', {
          body: {
            maxOrderValue: limit(rules.maxSingleOrder),
            maxDailyTurnover: limit(rules.maxDailyTurnover),
            maxDailyOrders: limit(rules.maxDailyOrders),
          },
        })
      );
    } catch (error) {
      if (
        error instanceof AlvaError &&
        error.requiredPermission === 'trading_limits:write'
      ) {
        throw new AlvaError(
          error.code,
          `this credential may only tighten risk rules: raising or lifting a cap needs trading_limits:write (${error.message})`,
          error.status,
          error.details,
          { requiredPermission: error.requiredPermission }
        );
      }
      throw error;
    }
  }

  /** The Automation ID of the caller's own feed named sourceFeed. */
  private async ownFeed(
    sourceUsername: string,
    sourceFeed: string
  ): Promise<AlvaId> {
    const username = await this.client.user._username();
    if (username.toLowerCase() !== sourceUsername.toLowerCase()) {
      throw new AlvaError(
        'INVALID_ARGUMENT',
        `pass signalSourceId (the feed's Automation ID) to copy ${sourceUsername}/${sourceFeed}: only your own feeds can be found by name`,
        400
      );
    }
    const automations = await collectAll(
      this.client._v2Pages<{ id: AlvaId; name: string }>('/me/automations', {
        pageSize: 100,
      })
    );
    const feed = automations.find((a) => a.name === sourceFeed);
    if (feed === undefined) {
      throw new AlvaError(
        'NOT_FOUND',
        `you have no feed named ${sourceFeed}`,
        404
      );
    }
    return feed.id;
  }

  /** The Playbook title of each order's copy trading, read when any has one. */
  private async subscriptionPlaybooks(
    accountId: AlvaId,
    orders: readonly WireOrder[]
  ): Promise<Map<AlvaId, string>> {
    if (orders.every((o) => o.tradeSubscriptionId === null)) return new Map();
    const subscriptions = await listTradeSubscriptions(
      this.client,
      accountId
    ).catch(() => []);
    const playbooks = await playbookRefs(
      this.client,
      subscriptions.map((s) => s.playbookId)
    );
    const out = new Map<AlvaId, string>();
    for (const s of subscriptions) {
      const title =
        s.playbookId === null ? undefined : playbooks.get(s.playbookId)?.title;
      if (title !== undefined) out.set(s.id, title);
    }
    return out;
  }
}
