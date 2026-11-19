import type { AlvaClient } from '../client.js';
import type {
  EnsureArraysJwtResponse,
  ArraysJwtStatusResponse,
  SubscriptionTier,
} from '../types.js';

// The data-skills token (the Arrays JWT) on /api/v2 (alva-gateway
// pkg/v2/api/runtime): RFC 3339 expiry and a plan tier, rebuilt as today's
// Unix seconds and SUBSCRIPTION_TIER_* names.
type WirePlanTier = 'FREE' | 'PRO' | 'MAX';

interface WireDataSkillsToken {
  exists: boolean;
  expiresAt: string | null;
  tier: WirePlanTier | null;
  renewalNeeded: boolean;
}

interface WireDataSkillsTokenRefresh {
  expiresAt: string | null;
  tier: WirePlanTier | null;
  renewed: boolean;
}

function expiresAt(at: string | null): number {
  return at === null ? 0 : Math.floor(Date.parse(at) / 1000);
}

function tier(t: WirePlanTier | null): SubscriptionTier {
  return `SUBSCRIPTION_TIER_${t ?? 'UNSPECIFIED'}`;
}

export class ArraysJwtResource {
  constructor(private client: AlvaClient) {}

  /** Idempotently sign-or-renew the Arrays JWT server-side. */
  async ensure(): Promise<EnsureArraysJwtResponse> {
    this.client._requireAuth();
    const r = await this.client._v2Request<WireDataSkillsTokenRefresh>(
      'POST',
      '/me/data-skills-token/refresh'
    );
    return {
      expires_at: expiresAt(r.expiresAt),
      tier: tier(r.tier),
      renewed: r.renewed,
    };
  }

  /** Report the current Arrays JWT state for the authenticated user. */
  async status(): Promise<ArraysJwtStatusResponse> {
    this.client._requireAuth();
    const r = await this.client._v2Request<WireDataSkillsToken>(
      'GET',
      '/me/data-skills-token'
    );
    return {
      exists: r.exists,
      expires_at: expiresAt(r.expiresAt),
      tier: tier(r.tier),
      renewal_needed: r.renewalNeeded,
    };
  }
}
