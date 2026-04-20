import type { AlvaClient } from '../client.js';
import type { SubscriptionTier } from '../types.js';

export interface PostConfigureHook {
  name: string;
  run(client: AlvaClient): Promise<void>;
}

export interface RunHooksDeps {
  hooks?: PostConfigureHook[];
  stderr?: (s: string) => void;
}

function defaultStderr(s: string): void {
  process.stderr.write(s);
}

function formatTier(t: SubscriptionTier | string): string {
  const stripped =
    typeof t === 'string' && t.startsWith('SUBSCRIPTION_TIER_')
      ? t.slice('SUBSCRIPTION_TIER_'.length)
      : String(t);
  return stripped.toLowerCase();
}

function formatExpiry(expiresAt: number): string {
  return new Date(expiresAt * 1000).toISOString().slice(0, 10);
}

export const ensureArraysJwtHook: PostConfigureHook = {
  name: 'ensureArraysJwt',
  async run(client: AlvaClient): Promise<void> {
    const res = await client.arraysJwt.ensure();
    const date = formatExpiry(res.expires_at);
    const tier = formatTier(res.tier);
    const verb = res.renewed
      ? 'Arrays JWT provisioned'
      : 'Arrays JWT already current';
    process.stderr.write(`${verb} (expires ${date}, tier: ${tier})\n`);
  },
};

export const POST_CONFIGURE_HOOKS: PostConfigureHook[] = [ensureArraysJwtHook];

export async function runPostConfigureHooks(
  client: AlvaClient,
  deps?: RunHooksDeps
): Promise<void> {
  const hooks = deps?.hooks ?? POST_CONFIGURE_HOOKS;
  const stderr = deps?.stderr ?? defaultStderr;
  for (const hook of hooks) {
    try {
      await hook.run(client);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      stderr(`warning: post-configure hook "${hook.name}" failed: ${msg}\n`);
    }
  }
}
