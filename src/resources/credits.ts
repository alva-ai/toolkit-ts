import type { AlvaClient } from '../client.js';
import type { Page } from '../platformApi.js';
import type {
  AlvaId,
  CreditWallet,
  CreditWalletItem,
  CreditWalletItemsParams,
  CreditWalletItemsResponse,
} from '../types.js';

// The wallet and the credit ledger on /api/v2 (alva-gateway
// pkg/v2/api/billing). Amounts are Decimal strings of whole credits.
interface WireWallet {
  balance: string;
  todayUsed: string;
}

interface WireCreditEntry {
  id: AlvaId;
  amount: string;
  reason: string;
  title: string | null;
  sessionId: AlvaId | null;
  playbookId: AlvaId | null;
  automationId: AlvaId | null;
  occurredAt: string;
}

/** v1's credit source for each v2 reason. */
const SOURCE_OF_REASON: Readonly<Record<string, string>> = {
  CHAT: 'ask',
  STRATEGY: 'strategy',
  DASHBOARD: 'dashboard',
  PLAYBOOK: 'playbook',
  SERVICE_CALL: 'service',
  IMAGE_GENERATION: 'image_generation',
  SPEECH_TRANSCRIPTION: 'speech_transcription',
  X_FEED_DATA: 'arrays_x_feed',
  EARNINGS_INTERPRETATION: 'earnings_interpretation',
  CREDIT_PACK: 'credit_pack',
  RECHARGE: 'recharge',
  DAILY_GRANT: 'daily_reset',
  MONTHLY_GRANT: 'monthly_reset',
  SIGN_UP_BONUS: 'sign_up_bonus',
  INVITE_BONUS: 'bind_invite_code',
  REFERRAL_BONUS: 'referral',
  PROMOTION: 'operation_promotion',
};

function toWallet(w: WireWallet): CreditWallet {
  const balance = Number(w.balance);
  return {
    balance,
    totalRemaining: balance,
    todayUsed: Number(w.todayUsed),
  };
}

function toItem(e: WireCreditEntry): CreditWalletItem {
  const item: CreditWalletItem = {
    id: e.id,
    sessionId: e.sessionId,
    playbookId: e.playbookId,
    feedId: e.automationId,
    op: e.amount.startsWith('-') ? 'debit' : 'credit',
    source: SOURCE_OF_REASON[e.reason] ?? 'other',
    amount: Math.abs(Number(e.amount)),
    createdAtMs: Date.parse(e.occurredAt),
  };
  if (e.title !== null) item.title = e.title;
  return item;
}

export class CreditsResource {
  constructor(private client: AlvaClient) {}

  async wallet(): Promise<CreditWallet> {
    this.client._requireAuth();
    return toWallet(
      await this.client._v2Request<WireWallet>('GET', '/me/wallet')
    );
  }

  async items(
    params: CreditWalletItemsParams
  ): Promise<CreditWalletItemsResponse> {
    this.client._requireAuth();
    const [wallet, page] = await Promise.all([
      this.client._v2Request<WireWallet>('GET', '/me/wallet'),
      this.client._v2Request<Page<WireCreditEntry>>(
        'GET',
        '/me/credit-entries',
        {
          query: {
            from: new Date(params.startAtMs).toISOString(),
            to: new Date(params.endAtMs).toISOString(),
            sessionId: params.sessionId,
            pageSize: params.first,
            pageToken: params.after,
          },
        }
      ),
    ]);
    const next = page.nextPageToken;
    const edges = page.items.map((entry, i) => ({
      // Rows have no cursor of their own; the last one carries the page's.
      cursor: i === page.items.length - 1 ? (next ?? '') : '',
      node: toItem(entry),
    }));
    return {
      ...toWallet(wallet),
      items: {
        pageInfo: {
          hasNextPage: next !== null,
          hasPreviousPage: false,
          startCursor: null,
          endCursor: next,
        },
        edges,
      },
    };
  }
}
