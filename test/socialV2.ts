import type { Schema } from '../src/platformApi.js';
import { v2 } from './v2Schema.js';

// /api/v2 fixtures of the social resources (follows, alert subscriptions,
// group chats), each checked against its schema in the contract.

export const NVDA = 'asset_0nvda';
export const BTC = 'asset_0btc';
export const PROFILE = 'profile_0a1ce';
export const PLAYBOOK = 'playbook_0abc';
export const AUTOMATION = 'automation_0abc';

export function anAsset(
  overrides: Partial<Schema<'Asset'>> = {}
): Schema<'Asset'> {
  return v2('Asset', {
    id: NVDA,
    symbol: 'NVDA',
    name: 'NVIDIA Corporation',
    kind: 'STOCK',
    assetClass: 'US_STOCK',
    categories: [],
    logo: null,
    quote: null,
    venue: null,
    ...overrides,
  });
}

export function anAssetFollow(
  overrides: Partial<Schema<'AssetFollow'>> = {}
): Schema<'AssetFollow'> {
  return v2('AssetFollow', {
    asset: {
      id: NVDA,
      symbol: 'NVDA',
      name: 'NVIDIA Corporation',
      kind: 'STOCK',
    },
    following: true,
    changed: true,
    ...overrides,
  });
}

export function aProfile(
  overrides: Partial<Schema<'Profile'>> = {}
): Schema<'Profile'> {
  return v2('Profile', {
    id: PROFILE,
    kind: 'USER',
    displayName: 'Alice',
    handle: 'alice',
    xHandle: null,
    avatarUrl: null,
    followerCount: 3,
    viewerState: { following: true },
    ...overrides,
  });
}

export function aPlaybookFollow(
  overrides: Partial<Schema<'PlaybookFollow'>> = {}
): Schema<'PlaybookFollow'> {
  return v2('PlaybookFollow', {
    changed: true,
    following: true,
    followedAt: '2026-11-01T00:00:00Z',
    playbook: {
      id: PLAYBOOK,
      ownerUsername: 'alice',
      slug: 'btc-dashboard',
      displayName: 'BTC Dashboard',
    },
    ...overrides,
  });
}

export function aSubscription(
  overrides: Partial<Schema<'NotificationSubscription'>> = {}
): Schema<'NotificationSubscription'> {
  return v2('NotificationSubscription', {
    id: 'notification_subscription_0n',
    automationId: AUTOMATION,
    automationName: 'btc-ema',
    automationStatus: 'ACTIVE',
    targetStatus: 'ACTIVE',
    channelId: null,
    medium: 'CHANNEL',
    usedBy: [],
    usedByCount: 1,
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
    lastDeliveredAt: null,
    ...overrides,
  });
}
