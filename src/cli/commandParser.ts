import { CliUsageError } from '../error.js';
import type { CommandDefinition, FlagKind } from './commandDefinitions.js';

interface CommandNode {
  readonly children: Map<string, CommandNode>;
  definition?: CommandDefinition;
}

export interface ParsedCommand {
  readonly path: readonly string[];
  readonly flags: Record<string, string>;
  readonly positionals: readonly string[];
  readonly passthrough?: readonly string[];
}

function buildCommandTree(
  definitions: readonly CommandDefinition[]
): CommandNode {
  const root: CommandNode = { children: new Map() };
  for (const definition of definitions) {
    if (definition.path.length === 0) {
      throw new Error('CLI command path cannot be empty');
    }
    if (
      definition.positionals.min < 0 ||
      definition.positionals.max < definition.positionals.min ||
      definition.positionals.max !== definition.positionals.names.length
    ) {
      throw new Error(
        `Invalid positional definition for '${definition.path.join(' ')}'`
      );
    }
    let node = root;
    for (const segment of definition.path) {
      let child = node.children.get(segment);
      if (child === undefined) {
        child = { children: new Map() };
        node.children.set(segment, child);
      }
      node = child;
    }
    if (node.definition !== undefined) {
      throw new Error(
        `Duplicate CLI command definition '${definition.path.join(' ')}'`
      );
    }
    node.definition = definition;
  }
  return root;
}

function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let row = 1; row <= a.length; row++) {
    const current = [row];
    for (let column = 1; column <= b.length; column++) {
      current[column] = Math.min(
        current[column - 1]! + 1,
        previous[column]! + 1,
        previous[column - 1]! + (a[row - 1] === b[column - 1] ? 0 : 1)
      );
    }
    previous = current;
  }
  return previous[b.length]!;
}

function closestFlag(
  input: string,
  available: Readonly<Record<string, FlagKind>>
): string | undefined {
  let closest: string | undefined;
  let distance = Number.POSITIVE_INFINITY;
  for (const candidate of Object.keys(available)) {
    const candidateDistance = editDistance(input, candidate);
    if (candidateDistance < distance) {
      closest = candidate;
      distance = candidateDistance;
    }
  }
  const threshold = input.length <= 4 ? 1 : 2;
  return distance <= threshold ? closest : undefined;
}

const TOP_LEVEL_COMMAND_SUGGESTIONS: Readonly<Record<string, string>> = {
  market: 'markets',
  data: 'data-skills',
  feeds: 'automation',
};

function closestCommand(
  input: string,
  available: ReadonlyMap<string, CommandNode>
): string | undefined {
  const terminology = TOP_LEVEL_COMMAND_SUGGESTIONS[input];
  if (terminology !== undefined && available.has(terminology)) {
    return terminology;
  }
  let closest: string | undefined;
  let distance = Number.POSITIVE_INFINITY;
  for (const candidate of available.keys()) {
    const candidateDistance = editDistance(input, candidate);
    if (candidateDistance < distance) {
      closest = candidate;
      distance = candidateDistance;
    }
  }
  const threshold = input.length <= 4 ? 1 : 2;
  return distance <= threshold ? closest : undefined;
}

function mergeFlags(
  definition: CommandDefinition,
  globalFlags: Readonly<Record<string, FlagKind>>
): Readonly<Record<string, FlagKind>> {
  return { ...globalFlags, ...definition.flags };
}

function resolveCommand(
  args: readonly string[],
  tree: CommandNode
): {
  definition: CommandDefinition;
  consumed: number;
} {
  let node = tree;
  let consumed = 0;

  while (consumed < args.length) {
    const input = args[consumed]!;
    if (input.startsWith('-')) break;
    const child = node.children.get(input);
    if (child !== undefined) {
      node = child;
      consumed++;
      continue;
    }
    if (node.definition !== undefined && node.children.size === 0) break;

    if (consumed === 0) {
      const suggestion = closestCommand(input, node.children);
      const recovery =
        suggestion === undefined
          ? " Run 'alva --help' to list command families."
          : ` Did you mean '${suggestion}'?`;
      throw new CliUsageError(`Unknown command: '${input}'.${recovery}`);
    }
    const group = args[0]!;
    const command = args.slice(0, consumed).join(' ');
    throw new CliUsageError(
      `Unknown subcommand: ${command} ${input}. Use 'alva ${group} --help' for usage.`,
      group
    );
  }

  if (node.definition !== undefined) {
    return { definition: node.definition, consumed };
  }

  const group = args[0];
  if (group === undefined) {
    throw new CliUsageError('Missing command');
  }
  throw new CliUsageError(`Missing subcommand for ${group}`, group);
}

function unsupportedFlag(
  name: string,
  definition: CommandDefinition,
  available: Readonly<Record<string, FlagKind>>
): CliUsageError {
  const command = definition.path.join(' ');
  const suggestion = closestFlag(name, available);
  const suffix =
    suggestion === undefined ? '' : ` Did you mean '--${suggestion}'?`;
  return new CliUsageError(
    `--${name} is not supported for '${command}'.${suffix}`,
    definition.path[0]
  );
}

function parseWithTree(
  args: readonly string[],
  tree: CommandNode,
  globalFlags: Readonly<Record<string, FlagKind>>
): ParsedCommand {
  const { definition, consumed } = resolveCommand(args, tree);
  if (definition.passthrough === true) {
    return {
      path: definition.path,
      flags: {},
      positionals: [],
      passthrough: args.slice(consumed),
    };
  }

  const available = mergeFlags(definition, globalFlags);
  const flags: Record<string, string> = {};
  const positionals: string[] = [];

  for (let index = consumed; index < args.length; index++) {
    const input = args[index]!;
    if (input === '-h') {
      flags.help = 'true';
      continue;
    }
    if (!input.startsWith('--')) {
      positionals.push(input);
      continue;
    }

    const equalsIndex = input.indexOf('=');
    const externalName =
      equalsIndex === -1 ? input.slice(2) : input.slice(2, equalsIndex);

    let name = externalName;
    let kind = available[name];
    let negated = false;

    // A literal --no-X definition wins over boolean negation. This preserves
    // auth's distinct --browser and --no-browser switches.
    if (
      kind === undefined &&
      name.startsWith('no-') &&
      available[name.slice(3)] === 'boolean'
    ) {
      name = name.slice(3);
      kind = 'boolean';
      negated = true;
    }

    if (kind === undefined) {
      throw unsupportedFlag(externalName, definition, available);
    }

    if (equalsIndex !== -1) {
      const value = input.slice(equalsIndex + 1);
      if (kind === 'boolean') {
        if (value !== 'true' && value !== 'false') {
          throw new CliUsageError(
            `--${externalName} must be true or false`,
            definition.path[0]
          );
        }
        flags[name] =
          negated === true ? (value === 'true' ? 'false' : 'true') : value;
      } else {
        flags[name] = value;
      }
      continue;
    }

    if (kind === 'boolean') {
      flags[name] = negated ? 'false' : 'true';
      continue;
    }

    const value = args[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new CliUsageError(
        `--${externalName} requires a value`,
        definition.path[0]
      );
    }
    flags[name] = value;
    index++;
  }

  const command = definition.path.join(' ');
  if (flags.help !== undefined) {
    return {
      path: definition.path,
      flags,
      positionals,
    };
  }
  if (positionals.length < definition.positionals.min) {
    const missingName =
      definition.positionals.names[positionals.length] ?? 'argument';
    throw new CliUsageError(
      `Missing ${missingName} for '${command}'`,
      definition.path[0]
    );
  }
  if (positionals.length > definition.positionals.max) {
    throw new CliUsageError(
      `Unexpected argument '${positionals[definition.positionals.max]}' for '${command}'`,
      definition.path[0]
    );
  }

  return {
    path: definition.path,
    flags,
    positionals,
  };
}

export function createCommandParser(
  definitions: readonly CommandDefinition[],
  globalFlags: Readonly<Record<string, FlagKind>>
): (args: readonly string[]) => ParsedCommand {
  const tree = buildCommandTree(definitions);
  return (args) => parseWithTree(args, tree, globalFlags);
}
