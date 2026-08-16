import type {
  CommandDefinition,
  CommandOptions,
  FlagKind,
} from './commandDefinitions.js';

export type EmbeddedCommandAction =
  | 'automation-create'
  | 'automation-inspect'
  | 'automation-update'
  | 'automation-delete'
  | 'automation-pause'
  | 'automation-resume'
  | 'automation-trigger'
  | 'automation-set-visibility'
  | 'automation-runs-list'
  | 'automation-runs-status'
  | 'automation-runs-logs'
  | 'notification-set-preference'
  | 'signal-execute'
  | 'screenshot';

export interface EmbeddedCommandDefinition extends CommandDefinition {
  readonly targetPath?: readonly string[];
  readonly action?: EmbeddedCommandAction;
}

function embeddedCommand(
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
  for (const name of values) flags[name] = 'value';
  for (const name of booleans) {
    if (flags[name] !== undefined) {
      throw new Error(
        `Embedded CLI flag --${name} has conflicting definitions`
      );
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

function route(
  path: string,
  target: string,
  options: CommandOptions = {}
): EmbeddedCommandDefinition {
  return {
    ...embeddedCommand(path, options),
    targetPath: target.split(' '),
  };
}

function action(
  path: string,
  options: CommandOptions,
  actionName: EmbeddedCommandAction
): EmbeddedCommandDefinition {
  return { ...embeddedCommand(path, options), action: actionName };
}

/**
 * The complete in-process Alpi Alva command contract.
 *
 * Keep every flag and positional explicit: the embedded dispatch must not
 * inherit aliases or command behavior from the system Alva CLI catalog.
 */
export const EMBEDDED_COMMAND_DEFINITIONS: readonly EmbeddedCommandDefinition[] =
  [
    route('account whoami', 'whoami'),
    route('account credits wallet', 'credits wallet'),
    route('account credits items', 'credits items', {
      values: ['last', 'start', 'end', 'session-id', 'first', 'after'],
      booleans: ['today'],
    }),
    route('account secrets create', 'secrets create', {
      values: ['name', 'value'],
    }),
    route('account secrets list', 'secrets list'),
    route('account secrets get', 'secrets get', { values: ['name'] }),
    route('account secrets update', 'secrets update', {
      values: ['name', 'value'],
    }),
    route('account secrets delete', 'secrets delete', { values: ['name'] }),
    route('account notifications preferences', 'notification-preferences list'),
    action(
      'account notifications set-preference',
      { values: ['session-completed'] },
      'notification-set-preference'
    ),
    route('account service-accounts create', 'service-account create', {
      values: ['name'],
    }),
    route('account service-accounts list', 'service-account list'),
    route('account service-accounts delete', 'service-account delete', {
      values: ['id'],
    }),
    route('account service-accounts grant', 'service-account grant', {
      values: ['id', 'path', 'permission'],
    }),
    route('account service-accounts revoke', 'service-account revoke', {
      values: ['id', 'path', 'permission'],
    }),
    route('fs read', 'fs read', { values: ['path', 'offset', 'size'] }),
    route('fs write', 'fs write', {
      values: ['path', 'data'],
      booleans: ['mkdir-parents', 'append'],
    }),
    route('fs stat', 'fs stat', { values: ['path'] }),
    route('fs readdir', 'fs readdir', {
      values: ['path'],
      booleans: ['recursive'],
    }),
    route('fs mkdir', 'fs mkdir', { values: ['path'] }),
    route('fs remove', 'fs remove', {
      values: ['path'],
      booleans: ['recursive'],
    }),
    route('fs rename', 'fs rename', { values: ['old-path', 'new-path'] }),
    route('fs copy', 'fs copy', { values: ['src-path', 'dst-path'] }),
    route('fs symlink', 'fs symlink', { values: ['target-path', 'link-path'] }),
    route('fs readlink', 'fs readlink', { values: ['path'] }),
    route('fs chmod', 'fs chmod', { values: ['path', 'mode'] }),
    route('fs grant', 'fs grant', {
      values: ['path', 'subject', 'permission'],
    }),
    route('fs revoke', 'fs revoke', {
      values: ['path', 'subject', 'permission'],
    }),
    route('run', 'run', {
      values: [
        'code',
        'entry-path',
        'working-dir',
        'args',
        'max-heap-size-mb',
        'timeout-ms',
      ],
    }),
    route('data-skills list', 'data-skills list', { booleans: ['json'] }),
    route('data-skills summary', 'data-skills summary', {
      booleans: ['json'],
      positionals: ['skill name'],
    }),
    route('data-skills endpoint', 'data-skills endpoint', {
      booleans: ['json'],
      positionals: ['skill name', 'endpoint file'],
    }),
    route('skillhub list', 'skillhub list', {
      values: ['tag', 'username'],
      booleans: ['json'],
    }),
    route('skillhub tags', 'skillhub tags', { booleans: ['json'] }),
    route('skillhub get', 'skillhub get', {
      booleans: ['json'],
      positionals: ['playbook skill identifier'],
    }),
    route('skillhub file', 'skillhub file', {
      booleans: ['json'],
      positionals: ['playbook skill identifier', 'file path'],
    }),
    route('markets narrative', 'markets narrative', { values: ['ticker'] }),
    route('markets earnings', 'markets earnings', {
      values: ['ticker', 'event', 'fiscal-year', 'fiscal-quarter'],
    }),
    action(
      'automation create',
      {
        values: [
          'name',
          'path',
          'cron',
          'version',
          'args',
          'view-json',
          'description',
          'changelog',
          'agent-type',
          'max-heap-size-mb',
          'execution-timeout-seconds',
          'run-as-service-account',
        ],
        booleans: ['push-notify', 'skip-auto-trigger'],
      },
      'automation-create'
    ),
    route('automation list', 'automation list', {
      values: ['limit', 'cursor', 'status'],
      booleans: ['json'],
    }),
    action(
      'automation inspect',
      { values: ['id'], booleans: ['json'] },
      'automation-inspect'
    ),
    action(
      'automation update',
      {
        values: [
          'id',
          'name',
          'cron',
          'version',
          'args',
          'description',
          'changelog',
          'agent-type',
          'max-heap-size-mb',
          'execution-timeout-seconds',
          'run-as-service-account',
        ],
        booleans: ['push-notify', 'clear-run-as'],
      },
      'automation-update'
    ),
    route('automation delivery get', 'automation delivery get', {
      values: ['id'],
    }),
    route('automation delivery update', 'automation delivery update', {
      values: ['id', 'alva-channel-ids'],
      booleans: ['email-enabled'],
    }),
    action('automation delete', { values: ['id'] }, 'automation-delete'),
    action('automation pause', { values: ['id'] }, 'automation-pause'),
    action('automation resume', { values: ['id'] }, 'automation-resume'),
    action('automation trigger', { values: ['id'] }, 'automation-trigger'),
    action(
      'automation set-visibility',
      { values: ['id', 'visibility'] },
      'automation-set-visibility'
    ),
    action(
      'automation runs list',
      { values: ['id', 'first', 'cursor'] },
      'automation-runs-list'
    ),
    action(
      'automation runs status',
      { values: ['id', 'workflow-run-id'] },
      'automation-runs-status'
    ),
    action(
      'automation runs logs',
      { values: ['id', 'run-id'] },
      'automation-runs-logs'
    ),
    route('playbooks trending', 'playbooks trending', {
      values: ['keyword', 'tags', 'tag', 'sort', 'limit', 'cursor', 'current'],
      booleans: ['json'],
    }),
    route('playbooks list', 'playbooks list', {
      values: ['owner', 'limit', 'cursor'],
      booleans: ['json', 'all'],
    }),
    route('playbooks mine', 'playbooks mine', {
      values: ['filter', 'limit', 'cursor'],
      booleans: ['json', 'all'],
    }),
    route('playbooks get', 'playbooks get', {
      values: ['ids', 'id', 'ref'],
      booleans: ['json'],
    }),
    route('playbooks set-visibility', 'playbooks set-visibility', {
      values: ['name', 'visibility'],
    }),
    route('playbooks draft', 'release playbook-draft', {
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
    route('playbooks release', 'release playbook', {
      values: ['name', 'version', 'feeds', 'changelog', 'readme-url'],
      booleans: ['bypass-lint'],
    }),
    route('playbooks lint', 'lint playbook', {
      values: ['format'],
      positionals: ['file argument'],
    }),
    action(
      'playbooks screenshot',
      {
        values: [
          'url',
          'selector',
          'xpath',
          'compress-quality',
          'compress-max-width',
        ],
        booleans: ['full', 'compress'],
      },
      'screenshot'
    ),
    route('playbooks remix', 'remix', {
      values: ['child-username', 'child-name', 'parents'],
    }),
    route('playbooks comments create', 'comments create', {
      values: ['username', 'name', 'content', 'parent-id'],
    }),
    route('playbooks comments pin', 'comments pin', { values: ['comment-id'] }),
    route('playbooks comments unpin', 'comments unpin', {
      values: ['comment-id'],
    }),
    route('playbooks follows list', 'subscriptions follows', {
      values: ['limit', 'cursor'],
    }),
    route('playbooks follows follow', 'subscriptions follow-playbook', {
      values: ['username', 'name'],
    }),
    route('playbooks follows unfollow', 'subscriptions unfollow-playbook', {
      values: ['username', 'name'],
    }),
    route('playbooks functions allowance', 'functions allowance'),
    route('playbooks functions allowance get', 'functions allowance get', {
      values: ['playbook-id'],
    }),
    route('playbooks functions allowance list', 'functions allowance list'),
    route(
      'playbooks functions allowance create',
      'functions allowance create',
      { values: ['playbook-id', 'amount'] }
    ),
    route(
      'playbooks functions allowance revoke',
      'functions allowance revoke',
      { values: ['playbook-id'] }
    ),
    route('playbooks functions register', 'functions register', {
      values: [
        'playbook-id',
        'function-name',
        'entry-script-path',
        'params-schema',
        'run-as-service-account',
      ],
      booleans: ['allow-charges', 'clear-run-as'],
    }),
    route('playbooks functions list', 'functions list', {
      values: ['playbook-id'],
    }),
    route('playbooks functions delete', 'functions delete', {
      values: ['playbook-id', 'function-name'],
    }),
    route('playbooks functions invoke', 'functions invoke', {
      values: ['playbook-id', 'function-name', 'params'],
    }),
    route('alert list', 'alert list', {
      values: ['first', 'cursor'],
      booleans: ['json'],
    }),
    route('alert enable', 'alert enable', {
      values: ['automation', 'automation-ids', 'channel-id'],
    }),
    route('alert disable', 'alert disable', {
      values: ['automation', 'automation-ids'],
    }),
    route('alert history', 'alert history', {
      values: [
        'automation',
        'delivery-provider',
        'status',
        'since',
        'first',
        'cursor',
      ],
    }),
    route('portfolio accounts', 'portfolio accounts'),
    route('portfolio summary', 'portfolio summary', { values: ['account-id'] }),
    route('portfolio activities', 'portfolio activities', {
      values: ['account-id', 'limit', 'page-token'],
    }),
    route('portfolio orders', 'trading orders', {
      values: ['account-id', 'source', 'since', 'limit'],
    }),
    route('portfolio equity-history', 'trading equity-history', {
      values: ['account-id', 'timeframe', 'since-ms', 'until-ms'],
    }),
    route('trading accounts', 'broker accounts'),
    route('trading risk-rules', 'broker risk-rules'),
    route('trading signals subscriptions list', 'trading subscriptions', {
      values: ['account-id'],
    }),
    route('trading signals subscriptions subscribe', 'trading subscribe', {
      values: [
        'account-id',
        'source-username',
        'source-feed',
        'playbook-id',
        'playbook-version',
      ],
    }),
    route('trading signals subscriptions unsubscribe', 'trading unsubscribe', {
      values: ['subscription-id'],
    }),
    action(
      'trading signals execute',
      {
        values: ['account-id', 'signal', 'source-username', 'source-feed'],
        booleans: ['live'],
      },
      'signal-execute'
    ),
    route('trading broker', 'broker', { passthrough: true }),
  ];
