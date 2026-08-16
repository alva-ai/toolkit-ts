import { CliUsageError } from '../error.js';
import type { ParsedCommand } from './commandParser.js';
import {
  EMBEDDED_COMMAND_DEFINITIONS,
  type EmbeddedCommandDefinition,
} from './embeddedCommandDefinitions.js';

export const EMBEDDED_GLOBAL_FLAG_DEFINITIONS = {
  help: 'boolean',
} as const;

const embeddedDefinitions = new Map(
  EMBEDDED_COMMAND_DEFINITIONS.map((definition) => [
    definition.path.join(' '),
    definition,
  ])
);

export function embeddedCommandDefinition(
  path: readonly string[]
): EmbeddedCommandDefinition {
  const definition = embeddedDefinitions.get(path.join(' '));
  if (definition === undefined) {
    throw new Error(`Embedded CLI route '${path.join(' ')}' is not registered`);
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
    const definition = embeddedCommandDefinition(parsed.path);
    if (definition.flags[name] === 'boolean') {
      argv.push(value === 'false' ? `--no-${name}` : `--${name}`);
    } else {
      argv.push(`--${name}`, value);
    }
  }
  return argv;
}

export function embeddedCommandArgv(parsed: ParsedCommand): string[] {
  const definition = embeddedCommandDefinition(parsed.path);
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
      `Embedded CLI route '${parsed.path.join(' ')}' requires direct dispatch`
    );
  }
  if (definition.targetPath === undefined) {
    throw new Error(
      `Embedded CLI route '${parsed.path.join(' ')}' has no target`
    );
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
