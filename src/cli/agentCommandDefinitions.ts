import {
  COMMAND_DEFINITIONS,
  command,
  type CommandDefinition,
  type CommandOptions,
  type FlagKind,
} from './commandDefinitions.js';
import type { ParsedCommand } from './commandSchema.js';
import { CliUsageError } from '../error.js';

export type AgentCommandAction =
  | 'automation-create'
  | 'automation-update'
  | 'automation-delete'
  | 'automation-pause'
  | 'automation-resume'
  | 'automation-trigger'
  | 'automation-runs-list'
  | 'automation-runs-status'
  | 'automation-runs-logs'
  | 'notification-set-preference'
  | 'signal-execute'
  | 'screenshot';

export interface AgentCommandDefinition extends CommandDefinition {
  readonly targetPath?: readonly string[];
  readonly action?: AgentCommandAction;
}

export const AGENT_GLOBAL_FLAG_DEFINITIONS: Readonly<Record<string, FlagKind>> =
  {
    help: 'boolean',
  };

const fullDefinitions = new Map(
  COMMAND_DEFINITIONS.map((definition) => [
    definition.path.join(' '),
    definition,
  ])
);

function route(path: string, target: string): AgentCommandDefinition {
  const definition = fullDefinitions.get(target);
  if (definition === undefined) {
    throw new Error(`Agent CLI target '${target}' is not registered`);
  }
  return {
    ...definition,
    path: path.split(' '),
    targetPath: definition.path,
  };
}

function agentCommand(
  path: string,
  options: CommandOptions,
  action: AgentCommandAction
): AgentCommandDefinition {
  return { ...command(path, options), action };
}

function fixedRoute(
  path: string,
  target: string,
  options: CommandOptions = {}
): AgentCommandDefinition {
  return {
    ...command(path, options),
    targetPath: target.split(' '),
  };
}

export const AGENT_COMMAND_DEFINITIONS: readonly AgentCommandDefinition[] = [
  route('account whoami', 'whoami'),
  route('account credits wallet', 'credits wallet'),
  route('account credits items', 'credits items'),
  route('account secrets create', 'secrets create'),
  route('account secrets list', 'secrets list'),
  route('account secrets get', 'secrets get'),
  route('account secrets update', 'secrets update'),
  route('account secrets delete', 'secrets delete'),
  route('account notifications preferences', 'notification-preferences list'),
  agentCommand(
    'account notifications set-preference',
    { values: ['session-completed'] },
    'notification-set-preference'
  ),
  route('account service-accounts create', 'service-account create'),
  route('account service-accounts list', 'service-account list'),
  route('account service-accounts delete', 'service-account delete'),
  route('account service-accounts grant', 'service-account grant'),
  route('account service-accounts revoke', 'service-account revoke'),

  route('fs read', 'fs read'),
  fixedRoute('fs write', 'fs write', {
    values: ['path', 'data'],
    booleans: ['mkdir-parents', 'append'],
  }),
  route('fs stat', 'fs stat'),
  route('fs readdir', 'fs readdir'),
  route('fs mkdir', 'fs mkdir'),
  route('fs remove', 'fs remove'),
  route('fs rename', 'fs rename'),
  route('fs copy', 'fs copy'),
  route('fs symlink', 'fs symlink'),
  route('fs readlink', 'fs readlink'),
  route('fs chmod', 'fs chmod'),
  route('fs grant', 'fs grant'),
  route('fs revoke', 'fs revoke'),
  fixedRoute('run', 'run', {
    values: [
      'code',
      'entry-path',
      'working-dir',
      'args',
      'max-heap-size-mb',
      'timeout-ms',
    ],
  }),

  route('data-skills list', 'data-skills list'),
  route('data-skills summary', 'data-skills summary'),
  route('data-skills endpoint', 'data-skills endpoint'),
  route('skillhub list', 'skillhub list'),
  route('skillhub tags', 'skillhub tags'),
  route('skillhub get', 'skillhub get'),
  route('skillhub file', 'skillhub file'),
  route('markets narrative', 'markets narrative'),
  route('markets earnings', 'markets earnings'),
  route('feedback submit', 'feedback submit'),

  agentCommand(
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
  route('automation list', 'automation list'),
  route('automation inspect', 'automation inspect'),
  agentCommand(
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
  route('automation delivery get', 'automation delivery get'),
  route('automation delivery update', 'automation delivery update'),
  agentCommand('automation delete', { values: ['id'] }, 'automation-delete'),
  agentCommand('automation pause', { values: ['id'] }, 'automation-pause'),
  agentCommand('automation resume', { values: ['id'] }, 'automation-resume'),
  agentCommand('automation trigger', { values: ['id'] }, 'automation-trigger'),
  route('automation set-visibility', 'feed set-visibility'),
  agentCommand(
    'automation runs list',
    { values: ['id', 'first', 'cursor'] },
    'automation-runs-list'
  ),
  agentCommand(
    'automation runs status',
    { values: ['id', 'workflow-run-id'] },
    'automation-runs-status'
  ),
  agentCommand(
    'automation runs logs',
    { values: ['id', 'run-id'] },
    'automation-runs-logs'
  ),

  route('playbooks trending', 'playbooks trending'),
  route('playbooks list', 'playbooks list'),
  route('playbooks mine', 'playbooks mine'),
  route('playbooks get', 'playbooks get'),
  route('playbooks set-visibility', 'playbooks set-visibility'),
  route('playbooks draft', 'release playbook-draft'),
  route('playbooks release', 'release playbook'),
  route('playbooks lint', 'lint playbook'),
  agentCommand(
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
  route('playbooks remix', 'remix'),
  route('playbooks comments create', 'comments create'),
  route('playbooks comments pin', 'comments pin'),
  route('playbooks comments unpin', 'comments unpin'),
  route('playbooks follows list', 'subscriptions follows'),
  route('playbooks follows follow', 'subscriptions follow-playbook'),
  route('playbooks follows unfollow', 'subscriptions unfollow-playbook'),
  route('playbooks functions allowance', 'functions allowance'),
  route('playbooks functions allowance get', 'functions allowance get'),
  route('playbooks functions allowance list', 'functions allowance list'),
  route('playbooks functions allowance create', 'functions allowance create'),
  route('playbooks functions allowance revoke', 'functions allowance revoke'),
  fixedRoute('playbooks functions register', 'functions register', {
    values: [
      'playbook-id',
      'function-name',
      'entry-script-path',
      'params-schema',
      'run-as-service-account',
    ],
    booleans: ['allow-charges', 'clear-run-as'],
  }),
  route('playbooks functions list', 'functions list'),
  route('playbooks functions delete', 'functions delete'),
  route('playbooks functions invoke', 'functions invoke'),

  fixedRoute('alert list', 'alert list', {
    values: ['first', 'cursor'],
    booleans: ['json'],
  }),
  fixedRoute('alert enable', 'alert enable', {
    values: ['automation', 'automation-ids', 'channel-id'],
  }),
  fixedRoute('alert disable', 'alert disable', {
    values: ['automation', 'automation-ids'],
  }),
  fixedRoute('alert history', 'alert history', {
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
  route('portfolio summary', 'portfolio summary'),
  route('portfolio activities', 'portfolio activities'),
  route('portfolio orders', 'trading orders'),
  route('portfolio equity-history', 'trading equity-history'),

  fixedRoute('trading accounts', 'broker accounts'),
  fixedRoute('trading risk-rules', 'broker risk-rules'),
  route('trading signals subscriptions list', 'trading subscriptions'),
  fixedRoute('trading signals subscriptions subscribe', 'trading subscribe', {
    values: [
      'account-id',
      'source-username',
      'source-feed',
      'playbook-id',
      'playbook-version',
    ],
  }),
  route('trading signals subscriptions unsubscribe', 'trading unsubscribe'),
  agentCommand(
    'trading signals execute',
    {
      values: ['account-id', 'signal', 'source-username', 'source-feed'],
      booleans: ['live'],
    },
    'signal-execute'
  ),
  route('trading broker', 'broker'),
];

const agentDefinitions = new Map(
  AGENT_COMMAND_DEFINITIONS.map((definition) => [
    definition.path.join(' '),
    definition,
  ])
);

export function agentCommandDefinition(
  path: readonly string[]
): AgentCommandDefinition {
  const definition = agentDefinitions.get(path.join(' '));
  if (definition === undefined) {
    throw new Error(`Agent CLI route '${path.join(' ')}' is not registered`);
  }
  return definition;
}

function serializedFlags(
  parsed: ParsedCommand,
  omitted: ReadonlySet<string> = new Set()
): string[] {
  const argv: string[] = [];
  for (const [name, value] of Object.entries(parsed.flags)) {
    if (name === 'help' || omitted.has(name)) continue;
    const definition = agentCommandDefinition(parsed.path);
    if (definition.flags[name] === 'boolean') {
      argv.push(value === 'false' ? `--no-${name}` : `--${name}`);
    } else {
      argv.push(`--${name}`, value);
    }
  }
  return argv;
}

export function agentCommandArgv(parsed: ParsedCommand): string[] {
  const definition = agentCommandDefinition(parsed.path);
  if (definition.action === 'notification-set-preference') {
    const value = parsed.flags['session-completed'];
    if (value !== 'enabled' && value !== 'disabled') {
      throw new CliUsageError(
        "--session-completed must be 'enabled' or 'disabled' for 'account notifications set-preference'",
        'account'
      );
    }
    return [
      'notification-preferences',
      value === 'enabled'
        ? 'enable-session-completed'
        : 'disable-session-completed',
    ];
  }
  if (definition.action === 'signal-execute') {
    const live = parsed.flags.live === 'true';
    return [
      'trading',
      'execute',
      ...serializedFlags(parsed, new Set(['live'])),
      ...parsed.positionals,
      ...(live ? [] : ['--dry-run']),
    ];
  }
  if (definition.action === 'screenshot') {
    return [
      'screenshot',
      ...serializedFlags(parsed),
      ...parsed.positionals,
      '--base64',
    ];
  }
  if (definition.action !== undefined) {
    throw new Error(
      `Agent CLI route '${parsed.path.join(' ')}' requires direct dispatch`
    );
  }
  if (definition.targetPath === undefined) {
    throw new Error(`Agent CLI route '${parsed.path.join(' ')}' has no target`);
  }
  if (parsed.passthrough !== undefined) {
    return [...definition.targetPath, ...parsed.passthrough];
  }
  return [
    ...definition.targetPath,
    ...serializedFlags(parsed),
    ...parsed.positionals,
  ];
}
