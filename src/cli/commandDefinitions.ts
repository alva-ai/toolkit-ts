export type FlagKind = 'boolean' | 'value';

export interface PositionalDefinition {
  readonly names: readonly string[];
  readonly min: number;
  readonly max: number;
}

export interface CommandDefinition {
  readonly path: readonly string[];
  readonly flags: Readonly<Record<string, FlagKind>>;
  readonly positionals: PositionalDefinition;
  readonly passthrough?: boolean;
}

export interface CommandOptions {
  readonly values?: readonly string[];
  readonly booleans?: readonly string[];
  readonly positionals?: readonly string[];
  readonly optionalPositionals?: number;
  readonly passthrough?: boolean;
}

export function command(
  path: string,
  {
    values = [],
    booleans = [],
    positionals = [],
    optionalPositionals = 0,
    passthrough = false,
  }: CommandOptions = {}
): CommandDefinition {
  const flags: Record<string, FlagKind> = {};
  for (const name of values) {
    flags[name] = 'value';
  }
  for (const name of booleans) {
    if (flags[name] !== undefined) {
      throw new Error(`CLI flag --${name} has conflicting definitions`);
    }
    flags[name] = 'boolean';
  }
  return {
    path: path.split(' '),
    flags,
    positionals: {
      names: positionals,
      min: positionals.length - optionalPositionals,
      max: positionals.length,
    },
    passthrough,
  };
}

export const GLOBAL_FLAG_DEFINITIONS: Readonly<Record<string, FlagKind>> = {
  'api-key': 'value',
  'base-url': 'value',
  profile: 'value',
  'arrays-endpoint': 'value',
  help: 'boolean',
};

export const COMMAND_DEFINITIONS: readonly CommandDefinition[] = [
  command('configure', {
    values: ['api-key', 'base-url', 'profile'],
  }),
  // Some route-map nodes are also valid help targets. Their handlers preserve
  // the existing bare-command help behavior while the trie still resolves
  // deeper leaves.
  command('auth'),
  command('auth login', {
    values: ['profile', 'auth-url', 'base-url'],
    booleans: ['browser', 'no-browser'],
  }),
  command('whoami'),
  command('user me'),

  command('fs read', { values: ['path', 'offset', 'size'] }),
  command('fs write', {
    values: ['path', 'data', 'file'],
    booleans: ['mkdir-parents', 'append'],
  }),
  command('fs stat', { values: ['path'] }),
  command('fs readdir', {
    values: ['path'],
    booleans: ['recursive'],
  }),
  command('fs mkdir', { values: ['path'] }),
  command('fs remove', {
    values: ['path'],
    booleans: ['recursive'],
  }),
  command('fs rename', { values: ['old-path', 'new-path'] }),
  command('fs copy', { values: ['src-path', 'dst-path'] }),
  command('fs symlink', { values: ['target-path', 'link-path'] }),
  command('fs readlink', { values: ['path'] }),
  command('fs chmod', { values: ['path', 'mode'] }),
  command('fs grant', { values: ['path', 'subject', 'permission'] }),
  command('fs revoke', { values: ['path', 'subject', 'permission'] }),

  command('run', {
    values: [
      'code',
      'local-file',
      'entry-path',
      'working-dir',
      'args',
      'max-heap-size-mb',
      'timeout-ms',
    ],
  }),

  command('deploy create', {
    values: [
      'name',
      'path',
      'cron',
      'args',
      'max-heap-size-mb',
      'execution-timeout-seconds',
      'run-as-service-account',
    ],
    booleans: ['push-notify'],
  }),
  command('deploy list', { values: ['limit', 'cursor'] }),
  command('deploy get', { values: ['id'] }),
  command('deploy update', {
    values: [
      'id',
      'name',
      'cron',
      'args',
      'max-heap-size-mb',
      'execution-timeout-seconds',
      'run-as-service-account',
    ],
    booleans: ['push-notify', 'clear-run-as'],
  }),
  command('deploy delete', { values: ['id'] }),
  command('deploy pause', { values: ['id'] }),
  command('deploy resume', { values: ['id'] }),
  command('deploy trigger', { values: ['id'] }),
  command('deploy runs', { values: ['id', 'first', 'cursor'] }),
  command('deploy run-status', {
    values: ['id', 'workflow-run-id'],
  }),
  command('deploy run-logs', { values: ['id', 'run-id'] }),

  command('loop create', {
    values: [
      'goal',
      'cron',
      'channel-id',
      'start',
      'until',
      'runs',
      'name',
      // Retained so the handler can emit the existing migration guidance.
      'expires-in',
    ],
  }),

  command('service-account create', { values: ['name'] }),
  command('service-account list'),
  command('service-account delete', { values: ['id'] }),
  command('service-account grant', {
    values: ['id', 'path', 'permission'],
  }),
  command('service-account revoke', {
    values: ['id', 'path', 'permission'],
  }),

  command('feed list', { values: ['limit', 'cursor', 'status'] }),
  command('feed stop', { values: ['id'] }),
  command('feed resume', { values: ['id'] }),
  command('feed delete', { values: ['id'] }),
  command('feed set-visibility', { values: ['id', 'visibility'] }),

  command('automation list', {
    values: ['limit', 'cursor', 'status'],
    booleans: ['json'],
  }),
  command('automation inspect', {
    values: ['id'],
    booleans: ['json'],
  }),
  command('automation publish', {
    values: [
      'name',
      'version',
      'cronjob-id',
      'view-json',
      'description',
      'changelog',
      'agent-type',
    ],
    booleans: ['skip-auto-trigger'],
  }),
  command('automation update', {
    values: [
      'id',
      'version',
      'cronjob-id',
      'description',
      'changelog',
      'agent-type',
    ],
    booleans: ['trigger'],
  }),
  command('automation delivery'),
  command('automation delivery get', { values: ['id'] }),
  command('automation delivery update', {
    values: ['id', 'alva-channel-ids'],
    booleans: ['email-enabled'],
  }),
  command('automation stop', { values: ['id'] }),
  command('automation resume', { values: ['id'] }),
  command('automation delete', { values: ['id'] }),

  command('credits wallet'),
  command('credits items', {
    values: ['last', 'start', 'end', 'session-id', 'first', 'after'],
    booleans: ['today'],
  }),

  command('playbooks trending', {
    values: ['keyword', 'tags', 'tag', 'sort', 'limit', 'cursor', 'current'],
    booleans: ['json'],
  }),
  command('playbooks set-visibility', {
    values: ['name', 'visibility'],
  }),
  command('playbooks get', {
    values: ['ids', 'id', 'ref'],
    booleans: ['json'],
  }),
  command('playbooks list', {
    values: ['owner', 'limit', 'cursor'],
    booleans: ['json', 'all'],
  }),
  command('playbooks mine', {
    values: ['filter', 'limit', 'cursor'],
    booleans: ['json', 'all'],
  }),

  command('functions allowance'),
  command('functions allowance get', { values: ['playbook-id'] }),
  command('functions allowance list'),
  command('functions allowance create', {
    values: ['playbook-id', 'amount'],
  }),
  command('functions allowance revoke', { values: ['playbook-id'] }),
  command('functions register', {
    values: [
      'playbook-id',
      'function-name',
      'entry-script-path',
      'params-schema',
      'params-schema-file',
      'run-as-service-account',
    ],
    booleans: ['allow-charges', 'clear-run-as'],
  }),
  command('functions list', { values: ['playbook-id'] }),
  command('functions delete', {
    values: ['playbook-id', 'function-name'],
  }),
  command('functions invoke', {
    values: ['playbook-id', 'function-name', 'params'],
  }),

  command('release feed', {
    values: [
      'name',
      'version',
      'cronjob-id',
      'view-json',
      'description',
      'changelog',
      'agent-type',
    ],
    booleans: ['skip-auto-trigger'],
  }),
  command('release playbook-draft', {
    values: [
      'name',
      'display-name',
      'description',
      'feeds',
      'trading-symbols',
      'skill-id',
      'tags',
    ],
  }),
  command('release playbook', {
    values: ['name', 'version', 'feeds', 'changelog', 'readme-url'],
    booleans: ['bypass-lint'],
  }),
  command('lint playbook', {
    values: ['format'],
    positionals: ['file argument'],
  }),

  command('secrets create', { values: ['name', 'value'] }),
  command('secrets list'),
  command('secrets get', { values: ['name'] }),
  command('secrets update', { values: ['name', 'value'] }),
  command('secrets delete', { values: ['name'] }),

  command('sdk doc', { values: ['name'] }),
  command('sdk partitions'),
  command('sdk partition-summary', { values: ['partition'] }),

  command('data-skills list', { booleans: ['json'] }),
  command('data-skills summary', {
    booleans: ['json'],
    positionals: ['skill name'],
  }),
  command('data-skills endpoint', {
    booleans: ['json'],
    positionals: ['skill name', 'endpoint file'],
  }),

  command('skillhub list', {
    values: ['tag', 'username'],
    booleans: ['json'],
  }),
  command('skillhub tags', { booleans: ['json'] }),
  command('skillhub get', {
    booleans: ['json'],
    positionals: ['playbook skill identifier'],
  }),
  command('skillhub file', {
    booleans: ['json'],
    positionals: ['playbook skill identifier', 'file path'],
  }),

  command('comments create', {
    values: ['username', 'name', 'content', 'parent-id'],
  }),
  command('comments pin', { values: ['comment-id'] }),
  command('comments unpin', { values: ['comment-id'] }),

  command('notification-history list-feed', {
    values: [
      'username',
      'name',
      'delivery-provider',
      // Retained so the handler can emit the existing rename guidance.
      'channel',
      'status',
      'since',
      'first',
      'cursor',
    ],
  }),
  command('notification-preferences list'),
  command('notification-preferences enable-session-completed'),
  command('notification-preferences disable-session-completed'),

  command('feedback submit', {
    values: [
      'source',
      'category',
      'severity',
      'summary',
      'details',
      'evidence-json',
      'context-json',
      // Retained so the handler can emit the existing migration guidance.
      'dedupe-key',
    ],
  }),

  command('subscriptions follow-playbook', {
    values: ['username', 'name'],
  }),
  command('subscriptions unfollow-playbook', {
    values: ['username', 'name'],
  }),
  command('subscriptions subscribe-feed', {
    values: ['username', 'name'],
  }),
  command('subscriptions unsubscribe-feed', {
    values: ['username', 'name'],
  }),
  command('subscriptions list', { values: ['first', 'cursor'] }),
  command('subscriptions follows', { values: ['limit', 'cursor'] }),
  command('subscriptions subscribe', {
    values: ['feed-ids', 'channel-id', 'playbook-ids'],
  }),
  command('subscriptions unsubscribe', {
    values: ['feed-ids', 'playbook-ids'],
  }),

  command('alert list', {
    values: ['first', 'cursor'],
    booleans: ['json'],
  }),
  command('alert follows', { values: ['limit', 'cursor'] }),
  command('alert enable', {
    values: [
      'automation',
      'automation-ids',
      'channel-id',
      'playbook',
      'playbook-ids',
    ],
  }),
  command('alert disable', {
    values: ['automation', 'automation-ids', 'playbook', 'playbook-ids'],
  }),
  command('alert group'),
  command('alert group list', {
    values: ['session-id'],
    booleans: ['json'],
  }),
  command('alert group enable', {
    values: ['automation', 'automation-ids', 'channel-id', 'session-id'],
  }),
  command('alert group disable', {
    values: ['automation', 'automation-ids', 'channel-id', 'session-id'],
  }),
  command('alert history', {
    values: [
      'automation',
      'playbook',
      'playbook-ids',
      'delivery-provider',
      // Retained so the handler can emit the existing rename guidance.
      'channel',
      'status',
      'since',
      'first',
      'cursor',
    ],
  }),
  command('alert preferences'),
  command('alert enable-session-completed'),
  command('alert disable-session-completed'),

  command('remix', {
    values: ['child-username', 'child-name', 'parents'],
  }),
  command('arrays'),
  command('arrays token'),
  command('arrays token ensure'),
  command('arrays token status'),
  command('screenshot', {
    values: [
      'url',
      'out',
      'selector',
      'xpath',
      'compress-quality',
      'compress-max-width',
    ],
    booleans: ['base64', 'full', 'compress'],
  }),

  command('portfolio accounts'),
  command('portfolio summary', { values: ['account-id'] }),
  command('portfolio activities', {
    values: ['account-id', 'limit', 'page-token'],
  }),

  command('markets narrative', { values: ['ticker'] }),
  command('markets earnings', {
    values: ['ticker', 'event', 'fiscal-year', 'fiscal-quarter'],
  }),

  command('trading accounts'),
  command('trading portfolio', { values: ['account-id'] }),
  command('trading orders', {
    values: ['account-id', 'source', 'since', 'limit'],
  }),
  command('trading subscriptions', { values: ['account-id'] }),
  command('trading equity-history', {
    values: ['account-id', 'timeframe', 'since-ms', 'until-ms'],
  }),
  command('trading risk-rules'),
  command('trading subscribe', {
    values: [
      'account-id',
      'source-username',
      'source-feed',
      'playbook-id',
      'playbook-version',
    ],
    booleans: ['execute-latest'],
  }),
  command('trading unsubscribe', { values: ['subscription-id'] }),
  command('trading execute', {
    values: ['account-id', 'signal', 'source-username', 'source-feed'],
    booleans: ['dry-run'],
  }),
  command('trading update-risk-rules', {
    values: [
      'max-single-order-value',
      'max-single-order-enabled',
      'max-daily-turnover-value',
      'max-daily-turnover-enabled',
      'max-daily-orders-value',
      'max-daily-orders-enabled',
    ],
  }),

  command('broker', { passthrough: true }),
];
