import { describe, it, expect, vi } from 'vitest';
import { AlvaClient } from '../src/client.js';
import { AlvaError } from '../src/error.js';
import { ArraysJwtResource } from '../src/resources/arraysJwt.js';

describe('ArraysJwtResource.ensure', () => {
  it('posts to correct path and returns passthrough', async () => {
    const client = new AlvaClient({ apiKey: 'alva_test' });
    const mockResponse = {
      expires_at: 123,
      tier: 'SUBSCRIPTION_TIER_PRO' as const,
      renewed: true,
    };
    const requestSpy = vi.fn().mockResolvedValue(mockResponse);
    client._request = requestSpy;
    const resource = new ArraysJwtResource(client);

    const result = await resource.ensure();

    expect(requestSpy).toHaveBeenCalledTimes(1);
    const callArgs = requestSpy.mock.calls[0];
    expect(callArgs[0]).toBe('POST');
    expect(callArgs[1]).toBe('/api/v1/arrays-jwt/ensure');
    expect(result).toEqual(mockResponse);
  });

  it('requires auth — throws UNAUTHENTICATED before hitting _request', async () => {
    const client = new AlvaClient({});
    const requestSpy = vi.fn();
    client._request = requestSpy;
    const resource = new ArraysJwtResource(client);

    await expect(resource.ensure()).rejects.toMatchObject({
      name: 'AlvaError',
      code: 'UNAUTHENTICATED',
    });
    // Ensure the thrown error is an AlvaError instance.
    await expect(resource.ensure()).rejects.toBeInstanceOf(AlvaError);
    expect(requestSpy).not.toHaveBeenCalled();
  });
});

describe('ArraysJwtResource.status', () => {
  it('gets to correct path and returns passthrough', async () => {
    const client = new AlvaClient({ apiKey: 'alva_test' });
    const mockResponse = {
      exists: true,
      expires_at: 456,
      tier: 'SUBSCRIPTION_TIER_FREE' as const,
      renewal_needed: false,
    };
    const requestSpy = vi.fn().mockResolvedValue(mockResponse);
    client._request = requestSpy;
    const resource = new ArraysJwtResource(client);

    const result = await resource.status();

    expect(requestSpy).toHaveBeenCalledTimes(1);
    const callArgs = requestSpy.mock.calls[0];
    expect(callArgs[0]).toBe('GET');
    expect(callArgs[1]).toBe('/api/v1/arrays-jwt/status');
    expect(result).toEqual(mockResponse);
  });

  it('requires auth — throws UNAUTHENTICATED before hitting _request', async () => {
    const client = new AlvaClient({});
    const requestSpy = vi.fn();
    client._request = requestSpy;
    const resource = new ArraysJwtResource(client);

    await expect(resource.status()).rejects.toMatchObject({
      name: 'AlvaError',
      code: 'UNAUTHENTICATED',
    });
    await expect(resource.status()).rejects.toBeInstanceOf(AlvaError);
    expect(requestSpy).not.toHaveBeenCalled();
  });
});
