import type { Schema } from '../src/platformApi.js';
import { page } from './marketV2.js';

// /api/v2 fixtures of the portfolio domain (broker accounts, holdings,
// orders, copy trading, risk rules, broker invocations); PORTFOLIO_FIXTURES
// is checked against the contract by test/fixturesV2.test.ts.

export const ACCOUNT = 'broker_account_0a1';
export const SUBSCRIPTION = 'trade_subscription_0a1';

function usd(amount: string): Schema<'Money'> {
  return { amount, currency: 'USD' };
}

export function brokerAccount(
  overrides: Partial<Schema<'BrokerAccount'>> = {}
): Schema<'BrokerAccount'> {
  return {
    id: ACCOUNT,
    displayName: 'Paper',
    broker: { code: 'alpaca', name: 'Alpaca', logoUrl: null },
    maskedNumber: '****1234',
    mode: 'PAPER_TRADING',
    capabilities: {
      canPlaceOrders: true,
      createsInstructions: false,
      requiresUserSubmit: false,
      canCopyTrade: true,
      canRefresh: true,
      hasEquityHistory: true,
      hasOrderHistory: true,
    },
    status: 'ACTIVE',
    statusReason: null,
    connectionHealth: 'HEALTHY',
    connectionHealthCheckedAt: null,
    dataFreshness: 'REALTIME',
    lastSyncedAt: '2026-11-01T00:00:00.000Z',
    connectedAt: '2026-10-01T00:00:00.000Z',
    connectionId: 'broker_authorization_0a1',
    provider: 'DIRECT',
    ...overrides,
  };
}

export function snapshot(): Schema<'PortfolioSnapshot'> {
  return {
    accountId: ACCOUNT,
    totalValue: usd('1100'),
    cash: usd('100'),
    positionValue: usd('1000'),
    unrealizedPnl: usd('50'),
    valuationStatus: 'COMPLETE',
    valuedAt: '2026-11-01T00:00:00.000Z',
    positionsReportedAt: '2026-11-01T00:00:00.000Z',
    positions: [
      {
        symbol: 'AAPL',
        side: 'LONG',
        quantity: '5',
        averageCost: usd('190'),
        price: usd('200'),
        marketValue: usd('1000'),
        valuation: {
          value: usd('1000'),
          exchangeRate: '1',
          source: 'PROVIDER',
          status: 'AVAILABLE',
          sourceReportedAt: null,
          retrievedAt: '2026-11-01T00:00:00.000Z',
        },
        unrealizedPnl: usd('50'),
        weight: '1',
        instrument: 'EQUITY',
        option: null,
      },
    ],
  };
}

export function activity(): Schema<'BrokerActivity'> {
  return {
    kind: 'TRADE',
    label: 'Buy',
    sourceLabel: null,
    occurredAt: '2026-11-01T00:00:00.000Z',
    symbol: 'AAPL',
    side: 'BUY',
    quantity: '5',
    price: usd('190'),
    amount: usd('950'),
    fee: null,
    status: 'FILLED',
    description: null,
    externalReference: 'ext-1',
    instrument: 'EQUITY',
    option: null,
    origin: 'ALVA_DIRECT',
  };
}

export function order(
  overrides: Partial<Schema<'Order'>> = {}
): Schema<'Order'> {
  return {
    id: 'order_0a1',
    accountId: ACCOUNT,
    externalReference: 'ext-1',
    symbol: 'BINANCE_PERP_BTC_USDT',
    side: 'BUY',
    positionEffect: 'OPEN',
    status: 'EXPIRED',
    rejectReason: null,
    requestedQuantity: '0.01',
    filledQuantity: '0',
    averagePrice: null,
    origin: 'ALVA_INSTRUCTION',
    tradeSubscriptionId: SUBSCRIPTION,
    placedAt: '2026-11-01T00:00:00.000Z',
    option: null,
    ...overrides,
  };
}

export function orderExecution(): Schema<'OrderExecution'> {
  return {
    status: 'EXECUTED',
    reason: null,
    orders: [
      {
        orderId: 'order_0a1',
        symbol: 'BINANCE_PERP_BTC_USDT',
        side: 'BUY',
        positionEffect: 'OPEN',
        status: 'FILLED',
        requestedQuantity: '0.01',
        filledQuantity: '0.01',
        rejectReason: null,
      },
      {
        orderId: null,
        symbol: 'BINANCE_PERP_ETH_USDT',
        side: 'SELL',
        positionEffect: 'CLOSE',
        status: 'ERROR',
        requestedQuantity: null,
        filledQuantity: null,
        rejectReason: 'venue error',
      },
    ],
  };
}

export function equitySeries(): Schema<'EquitySeries'> {
  return {
    accountId: ACCOUNT,
    range: 'ONE_WEEK',
    points: [
      {
        at: '2026-11-01T00:00:00.000Z',
        equity: usd('1000'),
        change: usd('0'),
        changePercent: null,
      },
      {
        at: '2026-11-02T00:00:00.000Z',
        equity: usd('1100'),
        change: usd('100'),
        changePercent: '10',
      },
    ],
  };
}

export function riskRules(): Schema<'RiskRules'> {
  return {
    maxOrderValue: { enabled: true, value: '10000' },
    maxDailyTurnover: { enabled: false, value: null },
    maxDailyOrders: { enabled: true, value: '100' },
  };
}

export function tradeSubscription(
  overrides: Partial<Schema<'TradeSubscription'>> = {}
): Schema<'TradeSubscription'> {
  return {
    id: SUBSCRIPTION,
    accountId: ACCOUNT,
    playbookId: 'playbook_0a1',
    playbookVersion: 'v1.0.0',
    feed: 'targets',
    signalSourceId: 'automation_0a1',
    status: 'ACTIVE',
    stoppedReason: null,
    createdAt: '2026-11-01T00:00:00.000Z',
    lastSignalAt: null,
    ...overrides,
  };
}

export function brokerInvocation(): Schema<'BrokerInvocation'> {
  return { envelope: { schemaVersion: 2, status: 'ok' }, exitCode: 0 };
}

export const PORTFOLIO_FIXTURES = [
  ['BrokerAccountList', page([brokerAccount()])],
  ['PortfolioSnapshot', snapshot()],
  ['BrokerActivityList', page([activity()], 'p2')],
  ['OrderList', page([order(), order({ positionEffect: null, side: null })])],
  ['OrderExecution', orderExecution()],
  ['EquitySeries', equitySeries()],
  ['RiskRules', riskRules()],
  [
    'TradeSubscriptionList',
    page([tradeSubscription({ status: 'STOPPED', stoppedReason: 'manual' })]),
  ],
  ['BrokerInvocation', brokerInvocation()],
] as const;
