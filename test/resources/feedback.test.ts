import { describe, it, expect } from 'vitest';
import { v2Client } from '../helpers/v2Client.js';

describe('FeedbackResource', () => {
  it('submit sends POST /api/v2/feedback with upper-case enums', async () => {
    const { client, v2 } = v2Client({
      'POST /feedback': {
        id: 'feedback_0f',
        notionPageId: 'page-123',
        notionUrl: 'https://notion.so/page-123',
      },
    });
    const result = await client.feedback.submit({
      summary: 'runtime failed',
      category: 'data_quality',
      severity: 'high',
      evidence: { command: 'alva run foo.js' },
      context: { session_id: 's1' },
    });
    expect(v2).toHaveBeenCalledWith('POST', '/feedback', {
      body: {
        source: undefined,
        category: 'DATA_QUALITY',
        severity: 'HIGH',
        summary: 'runtime failed',
        details: undefined,
        evidence: { command: 'alva run foo.js' },
        context: { session_id: 's1' },
      },
    });
    expect(result).toEqual({
      feedback_id: 'feedback_0f',
      notion_page_id: 'page-123',
      notion_url: 'https://notion.so/page-123',
    });
  });

  it('submit reports an unfiled Notion page as empty strings', async () => {
    const { client } = v2Client({
      'POST /feedback': {
        id: 'feedback_0f',
        notionPageId: null,
        notionUrl: null,
      },
    });
    expect(await client.feedback.submit({ summary: 's' })).toEqual({
      feedback_id: 'feedback_0f',
      notion_page_id: '',
      notion_url: '',
    });
  });
});
