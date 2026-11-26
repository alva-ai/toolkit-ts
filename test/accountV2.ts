import type { Schema } from '../src/platformApi.js';
import { v2 } from './v2Schema.js';

// /api/v2 fixtures of the account resources (user, secrets, service
// accounts, feedback, notifications), each checked against its schema in the
// contract.

export const REQUEST_ID = '123e4567-e89b-42d3-a456-426614174000';

export function aMe(overrides: Partial<Schema<'Me'>> = {}): Schema<'Me'> {
  return v2('Me', {
    id: 'account_0abc',
    profileId: 'profile_0abc',
    username: 'alice',
    planTier: 'PRO',
    messagingBindings: [
      { id: 'messaging_binding_0t', app: 'TELEGRAM', displayName: 'alice_tg' },
    ],
    preferredMessagingApp: 'TELEGRAM',
    toolkitMinVersion: '1.0.0',
    homePath: '/alva/home/alice',
    ...overrides,
  });
}

export function aSecret(
  overrides: Partial<Schema<'Secret'>> = {}
): Schema<'Secret'> {
  return v2('Secret', {
    id: 'secret_0k1',
    name: 'KEY',
    version: 2,
    prefix: 'sk-',
    valueLength: 12,
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-02T00:00:00Z',
    ...overrides,
  });
}

export function aServiceAccount(
  overrides: Partial<Schema<'ServiceAccount'>> = {}
): Schema<'ServiceAccount'> {
  return v2('ServiceAccount', {
    id: 'account_0sa',
    displayName: 'fintwit-bot',
    username: 'alice-sa-1',
    ownerId: 'account_0abc',
    createdAt: '2026-11-01T00:00:00Z',
    ...overrides,
  });
}

export function aGrant(
  overrides: Partial<Schema<'ServiceAccountGrant'>> = {}
): Schema<'ServiceAccountGrant'> {
  return v2('ServiceAccountGrant', {
    id: 'service_account_grant_0g',
    serviceAccountId: 'account_0sa',
    path: '/alva/home/alice/feeds/x/',
    permission: 'READ',
    ...overrides,
  });
}

export function aFeedback(): Schema<'Feedback'> {
  return v2('Feedback', {
    id: 'feedback_0f',
    notionPageId: 'page-123',
    notionUrl: 'https://notion.so/page-123',
  });
}

export function aDelivery(
  overrides: Partial<Schema<'NotificationDelivery'>> = {}
): Schema<'NotificationDelivery'> {
  return v2('NotificationDelivery', {
    id: 'notification_delivery_0n',
    automationId: 'automation_0abc',
    playbookId: null,
    eventType: 'FEED_ALERT',
    deliveryProvider: 'telegram',
    status: 'SENT',
    message: 'BTC crossed the EMA',
    errorMessage: null,
    createdAt: '2026-11-20T09:00:00Z',
    actions: [],
    ...overrides,
  });
}
