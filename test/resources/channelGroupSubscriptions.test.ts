import { afterEach, describe, it, expect } from 'vitest';
import { AlvaClient } from '../../src/client.js';
import { fakeV2 } from '../fakeV2.js';
import { v2 } from '../v2Schema.js';

let restore: (() => void) | undefined;
afterEach(() => restore?.());

describe('ChannelGroupSubscriptionsResource.getGroupChatHistory', () => {
  it('reads /api/v2/group-chat-history and returns the GroupChatHistory', async () => {
    const history = v2('GroupChatHistory', {
      messages: [
        {
          senderName: 'bob',
          content: 'gm',
          mediaSummary: null,
          sentAt: '2026-11-19T10:00:00.123Z',
          permalink: null,
          role: 'USER',
        },
      ],
    });
    const fake = fakeV2({ 'GET /group-chat-history': () => history });
    restore = fake.restore;
    const client = new AlvaClient({ apiKey: 'key' });
    const query = {
      app: 'TELEGRAM' as const,
      remoteChat: '-100123',
      from: '2026-11-19T10:00:00.123Z',
      to: '2026-11-19T10:01:00Z',
    };
    expect(
      await client.channelGroupSubscriptions.getGroupChatHistory(query)
    ).toEqual(history);
    expect(Object.fromEntries(fake.calls[0].query)).toEqual(query);
  });
});
