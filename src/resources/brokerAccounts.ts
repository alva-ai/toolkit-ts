import type { AlvaClient } from '../client.js';
import { collectAll, v2Path } from '../platformApi.js';
import type { AlvaId, PortfolioMoney } from '../types.js';

// The /api/v2 portfolio and trading wire (alva-gateway pkg/v2/api/portfolio)
// that the portfolio and trading resources share: broker accounts, holdings
// and copy trading. Amounts are Decimal strings, times RFC 3339.

export interface WireMoney {
  amount: string;
  currency: string;
}

export interface WireBrokerAccount {
  id: AlvaId;
  displayName: string;
  broker: { code: string; name: string; logoUrl: string | null };
  maskedNumber: string | null;
  mode: 'READ_ONLY' | 'PAPER_TRADING' | 'LIVE_TRADING' | 'BROKER_CONFIRMATION';
  status: string;
  statusReason: string | null;
  lastSyncedAt: string | null;
  connectedAt: string | null;
  connectionId: AlvaId | null;
  provider: string;
}

export interface WirePosition {
  symbol: string;
  side: 'LONG' | 'SHORT';
  quantity: string;
  averageCost: WireMoney | null;
  price: WireMoney | null;
  marketValue: WireMoney | null;
  unrealizedPnl: WireMoney | null;
  weight: number | null;
}

export interface WireSnapshot {
  accountId: AlvaId;
  totalValue: WireMoney | null;
  cash: WireMoney | null;
  unrealizedPnl: WireMoney | null;
  valuationStatus: 'COMPLETE' | 'PARTIAL' | 'UNAVAILABLE';
  valuedAt: string | null;
  positions: WirePosition[];
}

export interface WireTradeSubscription {
  id: AlvaId;
  accountId: AlvaId;
  playbookId: AlvaId | null;
  playbookVersion: string;
  feed: string;
  signalSourceId: AlvaId | null;
  status: 'ACTIVE' | 'STOPPED';
  stoppedReason: string | null;
  createdAt: string;
  lastSignalAt: string | null;
}

/** What the trading output shows of a Playbook. */
export interface PlaybookRef {
  title: string;
  ownerUsername: string;
}

const CURRENCY_SYMBOLS: Readonly<Record<string, string>> = {
  USD: '$',
  CAD: 'C$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
};

/** v2 Money as today's amount, currency and symbol (the gateway's table). */
export function money(m: WireMoney | null): PortfolioMoney | undefined {
  if (m === null) return undefined;
  const currency = m.currency.toUpperCase();
  return {
    amount: Number(m.amount),
    currency,
    currencySymbol: CURRENCY_SYMBOLS[currency] ?? currency,
  };
}

/** An RFC 3339 time as Unix milliseconds; undefined when absent. */
export function ms(at: string | null): number | undefined {
  return at === null ? undefined : Date.parse(at);
}

/** An RFC 3339 time as Unix seconds, the unit trex reported. */
export function seconds(at: string): number {
  return Math.floor(Date.parse(at) / 1000);
}

export function isTradingAccount(a: WireBrokerAccount): boolean {
  return a.provider !== 'SNAPTRADE';
}

export function listBrokerAccounts(
  client: AlvaClient
): Promise<WireBrokerAccount[]> {
  return collectAll(
    client._v2Pages<WireBrokerAccount>('/me/broker-accounts', {
      pageSize: 100,
    })
  );
}

export function listTradeSubscriptions(
  client: AlvaClient,
  accountId: AlvaId
): Promise<WireTradeSubscription[]> {
  return collectAll(
    client._v2Pages<WireTradeSubscription>(
      v2Path`/broker-accounts/${accountId}/trade-subscriptions`,
      { pageSize: 200 }
    )
  );
}

/**
 * The trade subscriptions of each trading account, read as v1 embedded them:
 * best effort, an account whose list cannot be read has none.
 */
export async function accountSubscriptions(
  client: AlvaClient,
  accounts: readonly WireBrokerAccount[]
): Promise<Map<AlvaId, WireTradeSubscription[]>> {
  const lists = await Promise.all(
    accounts.map((a) =>
      isTradingAccount(a)
        ? listTradeSubscriptions(client, a.id).catch(() => [])
        : Promise.resolve([])
    )
  );
  return new Map(accounts.map((a, i) => [a.id, lists[i]]));
}

/**
 * The title and owner of each Playbook, read once per ID. As in v1, a
 * Playbook that cannot be read is left out, and its fields show as ''.
 */
export async function playbookRefs(
  client: AlvaClient,
  ids: Iterable<AlvaId | null>
): Promise<Map<AlvaId, PlaybookRef>> {
  const unique = [
    ...new Set([...ids].filter((id): id is AlvaId => id !== null)),
  ];
  const refs = await Promise.all(
    unique.map((id) =>
      client
        ._v2Request<{
          title: string;
          owner: { handle: string } | null;
        }>('GET', v2Path`/playbooks/${id}`)
        .then(
          (p): PlaybookRef => ({
            title: p.title,
            ownerUsername: p.owner?.handle ?? '',
          }),
          () => undefined
        )
    )
  );
  const out = new Map<AlvaId, PlaybookRef>();
  unique.forEach((id, i) => {
    const ref = refs[i];
    if (ref !== undefined) out.set(id, ref);
  });
  return out;
}
