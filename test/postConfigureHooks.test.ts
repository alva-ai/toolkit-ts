import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  runPostConfigureHooks,
  ensureArraysJwtHook,
  POST_CONFIGURE_HOOKS,
  type PostConfigureHook,
} from '../src/cli/postConfigureHooks.js';
import { AlvaClient } from '../src/client.js';
import { AlvaError } from '../src/error.js';

function makeClient(): AlvaClient {
  return new AlvaClient({ apiKey: 'alva_test' });
}

describe('runPostConfigureHooks', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('runs all hooks in order when all succeed (no warnings)', async () => {
    const client = makeClient();
    const runA = vi.fn().mockResolvedValue(undefined);
    const runB = vi.fn().mockResolvedValue(undefined);
    const hooks: PostConfigureHook[] = [
      { name: 'A', run: runA },
      { name: 'B', run: runB },
    ];
    const writes: string[] = [];
    const stderr = (s: string) => {
      writes.push(s);
    };

    await expect(
      runPostConfigureHooks(client, { hooks, stderr })
    ).resolves.toBeUndefined();

    expect(runA).toHaveBeenCalledTimes(1);
    expect(runB).toHaveBeenCalledTimes(1);
    // No warning lines from the registry itself.
    expect(writes.filter((w) => w.startsWith('warning:'))).toEqual([]);
  });

  it('logs warning for hook throwing Error and still runs subsequent hooks', async () => {
    const client = makeClient();
    const runA = vi.fn().mockRejectedValue(new Error('boom'));
    const runB = vi.fn().mockResolvedValue(undefined);
    const hooks: PostConfigureHook[] = [
      { name: 'A', run: runA },
      { name: 'B', run: runB },
    ];
    const writes: string[] = [];
    const stderr = (s: string) => {
      writes.push(s);
    };

    await expect(
      runPostConfigureHooks(client, { hooks, stderr })
    ).resolves.toBeUndefined();

    expect(runB).toHaveBeenCalledTimes(1);
    const joined = writes.join('');
    expect(joined).toContain('warning: post-configure hook "A" failed: boom');
  });

  it('logs warning for hook throwing non-Error value', async () => {
    const client = makeClient();
    const runA = vi.fn().mockImplementation(async () => {
      throw 'raw';
    });
    const hooks: PostConfigureHook[] = [{ name: 'A', run: runA }];
    const writes: string[] = [];
    const stderr = (s: string) => {
      writes.push(s);
    };

    await expect(
      runPostConfigureHooks(client, { hooks, stderr })
    ).resolves.toBeUndefined();

    expect(writes.join('')).toContain(
      'warning: post-configure hook "A" failed: raw'
    );
  });

  it('default registry includes ensureArraysJwt', () => {
    const match = POST_CONFIGURE_HOOKS.find(
      (h) => h.name === 'ensureArraysJwt'
    );
    expect(match).toBeDefined();
  });
});

describe('ensureArraysJwtHook', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('has name "ensureArraysJwt"', () => {
    expect(ensureArraysJwtHook.name).toBe('ensureArraysJwt');
  });

  it('writes "provisioned" line on renewed=true success', async () => {
    const client = makeClient();
    const expiresAt = 1735689600;
    client.arraysJwt.ensure = vi.fn().mockResolvedValue({
      expires_at: expiresAt,
      tier: 'SUBSCRIPTION_TIER_PRO',
      renewed: true,
    });
    const writes: string[] = [];
    const writeSpy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation((chunk: unknown) => {
        writes.push(String(chunk));
        return true;
      });

    await ensureArraysJwtHook.run(client);

    expect(writeSpy).toHaveBeenCalled();
    const joined = writes.join('');
    const expectedDate = new Date(expiresAt * 1000).toISOString().slice(0, 10);
    expect(joined).toContain('Arrays JWT provisioned');
    expect(joined).toContain(`expires ${expectedDate}`);
    expect(joined).toContain('tier: pro');
  });

  it('writes "already current" line on renewed=false success', async () => {
    const client = makeClient();
    const expiresAt = 1735689600;
    client.arraysJwt.ensure = vi.fn().mockResolvedValue({
      expires_at: expiresAt,
      tier: 'SUBSCRIPTION_TIER_FREE',
      renewed: false,
    });
    const writes: string[] = [];
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
      writes.push(String(chunk));
      return true;
    });

    await ensureArraysJwtHook.run(client);

    const joined = writes.join('');
    const expectedDate = new Date(expiresAt * 1000).toISOString().slice(0, 10);
    expect(joined).toContain('Arrays JWT already current');
    expect(joined).toContain(`expires ${expectedDate}`);
    expect(joined).toContain('tier: free');
  });

  it('formats tier for UNSPECIFIED', async () => {
    const client = makeClient();
    client.arraysJwt.ensure = vi.fn().mockResolvedValue({
      expires_at: 1735689600,
      tier: 'SUBSCRIPTION_TIER_UNSPECIFIED',
      renewed: true,
    });
    const writes: string[] = [];
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
      writes.push(String(chunk));
      return true;
    });

    await ensureArraysJwtHook.run(client);

    expect(writes.join('')).toContain('tier: unspecified');
  });

  it('formats tier for unknown/garbage string', async () => {
    const client = makeClient();
    client.arraysJwt.ensure = vi.fn().mockResolvedValue({
      expires_at: 1735689600,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tier: 'garbage' as any,
      renewed: false,
    });
    const writes: string[] = [];
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
      writes.push(String(chunk));
      return true;
    });

    await ensureArraysJwtHook.run(client);

    expect(writes.join('')).toContain('tier: garbage');
  });

  it('rethrows AlvaError from ensure() so registry can log it', async () => {
    const client = makeClient();
    const err = new AlvaError('NETWORK_ERROR', 'down', 0);
    client.arraysJwt.ensure = vi.fn().mockRejectedValue(err);

    await expect(ensureArraysJwtHook.run(client)).rejects.toBe(err);
  });
});
