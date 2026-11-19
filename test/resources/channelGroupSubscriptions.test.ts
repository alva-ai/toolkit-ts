import { describe, it, expect } from 'vitest';
import { v2Client } from '../helpers/v2Client.js';

describe('ChannelGroupSubscriptionsResource.getGroupChatHistory', () => {
  it('reads /api/v2/group-chat-history and rebuilds the v1 messages', async () => {
    const { client, v2 } = v2Client({
      'GET /group-chat-history': {
        messages: [
          {
            senderName: 'bob',
            content: 'gm',
            mediaSummary: null,
            sentAt: '2026-11-19T10:00:00.123Z',
            permalink: null,
            role: 'USER',
          },
          {
            senderName: 'alva',
            content: 'hi',
            mediaSummary: '[photo]',
            sentAt: '2026-11-19T10:00:01.000Z',
            permalink: 'https://t.me/c/1/2',
            role: 'ASSISTANT',
          },
        ],
      },
    });
    const result = await client.channelGroupSubscriptions.getGroupChatHistory({
      channel: 'telegram',
      remote_chat_id: '-100123',
      from_micros: '1763546400123999',
      to_micros: 1763546460000000,
    });
    expect(result).toEqual({
      messages: [
        {
          sender_username: 'bob',
          content: 'gm',
          media_summary: '',
          ts_micros: Date.parse('2026-11-19T10:00:00.123Z') * 1000,
          permalink: '',
          role: 'user',
        },
        {
          sender_username: 'alva',
          content: 'hi',
          media_summary: '[photo]',
          ts_micros: Date.parse('2026-11-19T10:00:01.000Z') * 1000,
          permalink: 'https://t.me/c/1/2',
          role: 'assistant',
        },
      ],
    });
    expect(v2).toHaveBeenCalledWith('GET', '/group-chat-history', {
      query: {
        app: 'TELEGRAM',
        remoteChat: '-100123',
        from: '2025-11-19T10:00:00.123Z',
        to: '2025-11-19T10:01:00.000Z',
      },
    });
  });

  it('refuses a window bound that is not a number before any request', async () => {
    const { client, v2 } = v2Client({});
    await expect(
      client.channelGroupSubscriptions.getGroupChatHistory({
        channel: 'telegram',
        remote_chat_id: '-100123',
        from_micros: 'yesterday',
        to_micros: 1,
      })
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    expect(v2).not.toHaveBeenCalled();
  });
});
