import { afterEach, describe, it, expect } from 'vitest';
import { AlvaClient } from '../../src/client.js';
import { aFeedback, REQUEST_ID } from '../accountV2.js';
import { fakeV2 } from '../fakeV2.js';

let restore: (() => void) | undefined;
afterEach(() => restore?.());

describe('FeedbackResource', () => {
  it('submit() posts the SubmitFeedbackRequest and returns the Feedback', async () => {
    const fake = fakeV2({ 'POST /feedback': () => aFeedback() });
    restore = fake.restore;
    const client = new AlvaClient({
      apiKey: 'key',
      baseUrl: 'https://api.test',
    });
    const body = {
      summary: 'runtime failed',
      category: 'DATA_QUALITY' as const,
      severity: 'HIGH' as const,
      evidence: { command: 'alva run foo.js' },
    };
    expect(
      await client.feedback.submit(body, { idempotencyKey: REQUEST_ID })
    ).toEqual(aFeedback());
    expect(fake.calls[0].body).toEqual(body);
    expect(fake.calls[0].headers['Idempotency-Key']).toBe(`"${REQUEST_ID}"`);
  });
});
