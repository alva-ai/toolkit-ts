import { describe, it, expect, vi } from 'vitest';
import { AlvaClient } from '../../src/client.js';
import { FeedbackResource } from '../../src/resources/feedback.js';

function makeClient(): AlvaClient & { _request: ReturnType<typeof vi.fn> } {
  const client = new AlvaClient({ apiKey: 'key' }) as AlvaClient & {
    _request: ReturnType<typeof vi.fn>;
  };
  client._request = vi.fn().mockResolvedValue({
    feedback_id: 123,
    slack_status: 'sent',
    dedupe_key: 'session-1/runtime',
    duplicate: false,
  });
  return client;
}

describe('FeedbackResource', () => {
  it('submit sends POST /api/v1/feedback', async () => {
    const client = makeClient();
    const feedback = new FeedbackResource(client);
    const result = await feedback.submit({
      summary: 'runtime failed',
      category: 'runtime',
      severity: 'high',
      evidence: { command: 'alva run foo.js' },
      context: { session_id: 's1' },
      dedupe_key: 'session-1/runtime',
    });

    expect(client._request).toHaveBeenCalledWith('POST', '/api/v1/feedback', {
      body: {
        summary: 'runtime failed',
        category: 'runtime',
        severity: 'high',
        evidence: { command: 'alva run foo.js' },
        context: { session_id: 's1' },
        dedupe_key: 'session-1/runtime',
      },
    });
    expect(result).toEqual({
      feedback_id: 123,
      slack_status: 'sent',
      dedupe_key: 'session-1/runtime',
      duplicate: false,
    });
  });
});
