import type { AlvaClient } from '../client.js';
import { v2Path, type Page } from '../platformApi.js';
import type {
  AlvaId,
  PortfolioAccount,
  PortfolioSummary,
  PortfolioActivityConnection,
} from '../types.js';
import {
  accountSubscriptions,
  isTradingAccount,
  listBrokerAccounts,
  money,
  ms,
  playbookRefs,
  seconds,
  type WireMoney,
  type WireSnapshot,
} from './brokerAccounts.js';

// GET /api/v2/broker-accounts/{accountId}/activities items. They have no ID.
interface WireActivity {
  kind: string;
  label: string;
  sourceLabel: string | null;
  occurredAt: string | null;
  symbol: string | null;
  side: string | null;
  quantity: string | null;
  price: WireMoney | null;
  amount: WireMoney | null;
  fee: WireMoney | null;
  status: string | null;
  description: string | null;
  externalReference: string | null;
}

export class PortfolioResource {
  constructor(private client: AlvaClient) {}

  async accounts(): Promise<PortfolioAccount[]> {
    this.client._requireAuth();
    const accounts = await listBrokerAccounts(this.client);
    const subscriptions = await accountSubscriptions(this.client, accounts);
    const playbooks = await playbookRefs(
      this.client,
      [...subscriptions.values()].flat().map((s) => s.playbookId)
    );
    return accounts.map((a) => {
      const trading = isTradingAccount(a);
      return {
        id: a.id,
        provider: trading ? 'TREX' : 'SNAPTRADE',
        name: a.displayName,
        institution: a.broker.name,
        identifier: a.maskedNumber ?? undefined,
        readOnly: a.mode === 'READ_ONLY',
        paper: a.mode === 'PAPER_TRADING',
        exchange: trading ? a.broker.code : undefined,
        createdAtMs: ms(a.connectedAt),
        subscriptions: (subscriptions.get(a.id) ?? []).map((s) => {
          const playbook =
            s.playbookId === null ? undefined : playbooks.get(s.playbookId);
          return {
            id: s.id,
            sourceUsername: playbook?.ownerUsername ?? '',
            sourceFeed: s.feed,
            playbookId: s.playbookId ?? '',
            playbookName: playbook?.title ?? '',
            playbookVersion: s.playbookVersion,
            active: s.status === 'ACTIVE',
            deactivateReason: s.stoppedReason ?? undefined,
            createdAt: seconds(s.createdAt),
            watermark: ms(s.lastSignalAt) ?? 0,
          };
        }),
        status: a.status,
        statusReason: a.statusReason ?? undefined,
        lastSyncedAtMs: ms(a.lastSyncedAt),
        connectionId: a.connectionId ?? undefined,
      };
    });
  }

  async summary(accountId: AlvaId): Promise<PortfolioSummary> {
    this.client._requireAuth();
    const s = await this.client._v2Request<WireSnapshot>(
      'GET',
      v2Path`/broker-accounts/${accountId}/snapshot`
    );
    return {
      totalValue: money(s.totalValue),
      cash: money(s.cash),
      unrealizedPnl: money(s.unrealizedPnl),
      holdings: s.positions.map((p) => ({
        symbol: p.symbol,
        side: p.side,
        quantity: Number(p.quantity),
        avgCost: money(p.averageCost),
        currentPrice: money(p.price),
        marketValue: money(p.marketValue),
        unrealizedPnl: money(p.unrealizedPnl),
        allocation: p.weight ?? undefined,
      })),
      asOfMs: ms(s.valuedAt),
    };
  }

  async activities(params: {
    accountId: AlvaId;
    limit?: number;
    pageToken?: string;
  }): Promise<PortfolioActivityConnection> {
    this.client._requireAuth();
    const page = await this.client._v2Request<Page<WireActivity>>(
      'GET',
      v2Path`/broker-accounts/${params.accountId}/activities`,
      { query: { pageSize: params.limit, pageToken: params.pageToken } }
    );
    return {
      activities: page.items.map((a) => ({
        kind: a.kind,
        type: a.label,
        occurredAtMs: ms(a.occurredAt),
        symbol: a.symbol ?? undefined,
        side: a.side ?? undefined,
        quantity: a.quantity === null ? undefined : Number(a.quantity),
        price: money(a.price),
        amount: money(a.amount),
        fee: money(a.fee),
        status: a.status ?? undefined,
        sourceLabel: a.sourceLabel ?? undefined,
        description: a.description ?? undefined,
        externalReferenceId: a.externalReference ?? undefined,
      })),
      nextPageToken: page.nextPageToken ?? undefined,
    };
  }
}
