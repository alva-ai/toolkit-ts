import { AlvaClient } from '../client.js';
import { CliUsageError } from '../error.js';
import { embeddedCommandDefinition } from './agentCommandDefinitions.js';
import {
  AGENT_COMMAND_HELP,
  AGENT_HELP_TEXT,
  agentHelpFor,
} from './agentHelp.js';
import type { ParsedCommand } from './commandParser.js';
import { parseEmbeddedCommand } from './embeddedCommandSchema.js';
import {
  CLI_VERSION,
  executeParsedCommand,
  handleBroker,
  requireFlag,
  requirePositiveIntegerStringFlag,
} from './dispatch.js';
import { EMBEDDED_COMMAND_DEFINITIONS } from './embeddedCommandDefinitions.js';
import type { DispatchRuntimeDeps } from './dispatch.js';

/** Stable leaf inventory for Alpi Alva safety smokes and tooling. */
export const ALPI_ALVA_COMMAND_PATHS: readonly string[] = Object.freeze(
  EMBEDDED_COMMAND_DEFINITIONS.map((definition) => definition.path.join(' '))
);
const ALPI_ALVA_COMMAND_PATH_SET = new Set(ALPI_ALVA_COMMAND_PATHS);

function selectedEmbeddedFlagValues(
  parsed: ParsedCommand,
  names: readonly string[]
): Record<string, string> {
  return Object.fromEntries(
    names.flatMap((name) => {
      const value = parsed.flags[name];
      return value === undefined ? [] : [[name, value]];
    })
  );
}

function internalCommand(
  path: readonly string[],
  flags: Record<string, string> = {}
): ParsedCommand {
  return { path, flags, positionals: [] };
}

function automationID(parsed: ParsedCommand, command: string): string {
  return requirePositiveIntegerStringFlag(parsed.flags, 'id', command);
}

function producerIDFromAutomationDetail(
  detail: unknown,
  automationId: string
): number | undefined {
  if (typeof detail !== 'object' || detail === null || Array.isArray(detail)) {
    throw new Error(`Automation ${automationId} returned an invalid detail`);
  }
  const raw = (detail as Record<string, unknown>).cronjob_id;
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'number' || !Number.isSafeInteger(raw) || raw <= 0) {
    throw new Error(`Automation ${automationId} returned an invalid producer`);
  }
  return raw;
}

function producerIDFromCreate(result: unknown): number {
  if (typeof result !== 'object' || result === null) {
    throw new Error('Automation producer creation returned an invalid result');
  }
  const raw = (result as Record<string, unknown>).id;
  if (typeof raw !== 'number' || !Number.isSafeInteger(raw) || raw <= 0) {
    throw new Error('Automation producer creation returned an invalid id');
  }
  return raw;
}

async function resolveAutomationProducer(
  client: AlvaClient,
  automationId: string
): Promise<number> {
  const detail = await client.automation.inspect({ id: automationId });
  const producerId = producerIDFromAutomationDetail(detail, automationId);
  if (producerId === undefined) {
    throw new Error(`Automation ${automationId} has no active producer`);
  }
  return producerId;
}

async function findAutomationProducer(
  client: AlvaClient,
  automationId: string
): Promise<number | undefined> {
  const detail = await client.automation.inspect({ id: automationId });
  return producerIDFromAutomationDetail(detail, automationId);
}

async function dispatchEmbeddedAutomation(
  client: AlvaClient,
  parsed: ParsedCommand,
  meta: { profile?: string; baseUrl?: string; cliVersion?: string } | undefined,
  deps: DispatchRuntimeDeps | undefined
): Promise<unknown> {
  const definition = embeddedCommandDefinition(parsed.path);
  switch (definition.action) {
    case 'automation-create': {
      const name = requireFlag(parsed.flags, 'name', 'automation create');
      requireFlag(parsed.flags, 'path', 'automation create');
      requireFlag(parsed.flags, 'cron', 'automation create');
      const version = requireFlag(parsed.flags, 'version', 'automation create');
      const producer = await executeParsedCommand(
        client,
        internalCommand(
          ['deploy', 'create'],
          selectedEmbeddedFlagValues(parsed, [
            'name',
            'path',
            'cron',
            'args',
            'max-heap-size-mb',
            'execution-timeout-seconds',
            'run-as-service-account',
            'push-notify',
          ])
        ),
        meta,
        deps
      );
      const cronjobId = producerIDFromCreate(producer);
      try {
        const automation = await executeParsedCommand(
          client,
          internalCommand(['automation', 'publish'], {
            name,
            version,
            'cronjob-id': String(cronjobId),
            ...selectedEmbeddedFlagValues(parsed, [
              'view-json',
              'description',
              'changelog',
              'agent-type',
              'skip-auto-trigger',
            ]),
          }),
          meta,
          deps
        );
        return { automation, producer };
      } catch (error) {
        throw new Error(
          `Automation registration failed after producer ${cronjobId} was created; the producer was left intact for recovery: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    case 'automation-update': {
      const id = automationID(parsed, 'automation update');
      const producerFlags = selectedEmbeddedFlagValues(parsed, [
        'name',
        'cron',
        'args',
        'max-heap-size-mb',
        'execution-timeout-seconds',
        'run-as-service-account',
        'push-notify',
        'clear-run-as',
      ]);
      const productFlags = selectedEmbeddedFlagValues(parsed, [
        'version',
        'description',
        'changelog',
        'agent-type',
      ]);
      if (
        Object.keys(producerFlags).length === 0 &&
        Object.keys(productFlags).length === 0
      ) {
        throw new CliUsageError(
          "'automation update' requires at least one update field",
          'automation'
        );
      }
      let cronjobId: number | undefined;
      let producer: unknown;
      if (Object.keys(producerFlags).length > 0) {
        cronjobId = await resolveAutomationProducer(client, id);
        producer = await executeParsedCommand(
          client,
          internalCommand(['deploy', 'update'], {
            id: String(cronjobId),
            ...producerFlags,
          }),
          meta,
          deps
        );
      }
      let automation: unknown;
      if (Object.keys(productFlags).length > 0) {
        try {
          automation = await executeParsedCommand(
            client,
            internalCommand(['automation', 'update'], {
              id: String(id),
              ...productFlags,
            }),
            meta,
            deps
          );
        } catch (error) {
          const suffix =
            Object.keys(producerFlags).length === 0
              ? ''
              : ` after producer ${cronjobId} was updated`;
          throw new Error(
            `Automation ${id} metadata update failed${suffix}: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
      return {
        automation_id: String(id),
        cronjob_id: cronjobId,
        automation,
        producer,
      };
    }

    case 'automation-pause': {
      const id = automationID(parsed, 'automation pause');
      const cronjobId = await resolveAutomationProducer(client, id);
      await executeParsedCommand(
        client,
        internalCommand(['deploy', 'pause'], { id: String(cronjobId) }),
        meta,
        deps
      );
      try {
        await client.automation.stop({ id });
      } catch (error) {
        throw new Error(
          `Automation ${id} delivery pause failed after producer ${cronjobId} was paused: ${error instanceof Error ? error.message : String(error)}`
        );
      }
      return {
        automation_id: String(id),
        cronjob_id: cronjobId,
        status: 'paused',
      };
    }

    case 'automation-resume': {
      const id = automationID(parsed, 'automation resume');
      const cronjobId = await resolveAutomationProducer(client, id);
      await client.automation.resume({ id });
      try {
        await executeParsedCommand(
          client,
          internalCommand(['deploy', 'resume'], { id: String(cronjobId) }),
          meta,
          deps
        );
      } catch (error) {
        throw new Error(
          `Producer ${cronjobId} resume failed after automation ${id} delivery was resumed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
      return {
        automation_id: String(id),
        cronjob_id: cronjobId,
        status: 'active',
      };
    }

    case 'automation-delete': {
      const id = automationID(parsed, 'automation delete');
      const cronjobId = await findAutomationProducer(client, id);
      if (cronjobId === undefined) {
        await client.automation.delete({ id });
        return {
          automation_id: id,
          status: 'deleted',
        };
      }
      await executeParsedCommand(
        client,
        internalCommand(['deploy', 'pause'], { id: String(cronjobId) }),
        meta,
        deps
      );
      try {
        await client.automation.delete({ id });
      } catch (error) {
        throw new Error(
          `Automation ${id} delete failed after producer ${cronjobId} was paused; the producer remains paused: ${error instanceof Error ? error.message : String(error)}`
        );
      }
      try {
        await executeParsedCommand(
          client,
          internalCommand(['deploy', 'delete'], { id: String(cronjobId) }),
          meta,
          deps
        );
      } catch (error) {
        throw new Error(
          `Automation ${id} was deleted but paused producer ${cronjobId} could not be removed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
      return {
        automation_id: String(id),
        cronjob_id: cronjobId,
        status: 'deleted',
      };
    }

    case 'automation-trigger': {
      const id = automationID(parsed, 'automation trigger');
      const cronjobId = await resolveAutomationProducer(client, id);
      return executeParsedCommand(
        client,
        internalCommand(['deploy', 'trigger'], { id: String(cronjobId) }),
        meta,
        deps
      );
    }

    case 'automation-runs-list':
    case 'automation-runs-status':
    case 'automation-runs-logs': {
      const command = parsed.path.join(' ');
      const id = automationID(parsed, command);
      const cronjobId = await resolveAutomationProducer(client, id);
      const target =
        definition.action === 'automation-runs-list'
          ? 'runs'
          : definition.action === 'automation-runs-status'
            ? 'run-status'
            : 'run-logs';
      const extra =
        definition.action === 'automation-runs-list'
          ? selectedEmbeddedFlagValues(parsed, ['first', 'cursor'])
          : definition.action === 'automation-runs-status'
            ? selectedEmbeddedFlagValues(parsed, ['workflow-run-id'])
            : selectedEmbeddedFlagValues(parsed, ['run-id']);
      return executeParsedCommand(
        client,
        internalCommand(['deploy', target], {
          id: String(cronjobId),
          ...extra,
        }),
        meta,
        deps
      );
    }

    default:
      throw new Error(
        `Agent automation route '${parsed.path.join(' ')}' has no handler`
      );
  }
}

async function dispatchEmbedded(
  client: AlvaClient,
  args: string[],
  meta?: { profile?: string; baseUrl?: string; cliVersion?: string },
  deps?: DispatchRuntimeDeps
): Promise<unknown> {
  const group = args[0];
  if (group === '-v' || group === '--version') {
    return `alva version ${CLI_VERSION}`;
  }
  if (!group || group === '--help' || group === '-h') {
    return { _help: true, text: AGENT_HELP_TEXT };
  }
  const requestedHelp = args.some(
    (argument) => argument === '--help' || argument === '-h'
  );
  const requestedHelpIndex = args.findIndex(
    (argument) => argument === '--help' || argument === '-h'
  );
  const brokerNativeHelp =
    args[0] === 'trading' && args[1] === 'broker' && requestedHelpIndex > 2;
  const bareHelp = args.every((argument) => !argument.startsWith('-'))
    ? AGENT_COMMAND_HELP[args.join(' ')]
    : undefined;
  if (bareHelp !== undefined) {
    return { _help: true, text: bareHelp };
  }
  if (requestedHelp && !brokerNativeHelp) {
    const helpIndex = requestedHelpIndex;
    const helpPath = args.slice(0, helpIndex);
    const treeHelp =
      helpIndex === args.length - 1 &&
      helpPath.every((argument) => !argument.startsWith('-'))
        ? AGENT_COMMAND_HELP[helpPath.join(' ')]
        : undefined;
    if (
      treeHelp !== undefined &&
      !ALPI_ALVA_COMMAND_PATH_SET.has(helpPath.join(' '))
    ) {
      return { _help: true, text: treeHelp };
    }
  }

  const parsed = parseEmbeddedCommand(args);
  if ((requestedHelp && !brokerNativeHelp) || parsed.flags.help !== undefined) {
    return {
      _help: true,
      text: agentHelpFor(args) ?? AGENT_HELP_TEXT,
    };
  }
  const action = embeddedCommandDefinition(parsed.path).action;
  if (action?.startsWith('automation-')) {
    return dispatchEmbeddedAutomation(client, parsed, meta, deps);
  }
  if (parsed.path.join(' ') === 'trading broker') {
    const brokerArgv = parsed.passthrough ?? [];
    const command = brokerArgv[0];
    if (
      command === 'accounts' ||
      command === 'risk-rules' ||
      command === 'venues' ||
      command === 'help'
    ) {
      const replacement =
        command === 'accounts' || command === 'risk-rules'
          ? `alva trading ${command}`
          : 'alva trading broker describe';
      throw new CliUsageError(
        `'trading broker ${command}' is not part of the Slim Broker tree; use '${replacement}'`,
        'trading'
      );
    }
    const commandSelector = brokerArgv.findIndex(
      (argument) => argument === '--command'
    );
    if (
      command === 'describe' &&
      commandSelector !== -1 &&
      (brokerArgv[commandSelector + 1] === 'accounts' ||
        brokerArgv[commandSelector + 1] === 'risk-rules')
    ) {
      throw new CliUsageError(
        `Shared trading prerequisites are described by 'alva trading ${brokerArgv[commandSelector + 1]}'`,
        'trading'
      );
    }
    const result = await handleBroker(client, brokerArgv, deps);
    return command === 'describe'
      ? adaptEmbeddedBrokerDescription(result)
      : result;
  }
  return dispatchEmbeddedTarget(client, parsed, meta, deps);
}

async function dispatchEmbeddedTarget(
  client: AlvaClient,
  parsed: ParsedCommand,
  meta: { profile?: string; baseUrl?: string; cliVersion?: string } | undefined,
  deps: DispatchRuntimeDeps | undefined
): Promise<unknown> {
  const definition = embeddedCommandDefinition(parsed.path);
  let target: ParsedCommand;
  if (definition.action === 'notification-set-preference') {
    const value = parsed.flags['session-completed'];
    if (value !== 'enabled' && value !== 'disabled') {
      throw new CliUsageError(
        "--session-completed must be 'enabled' or 'disabled' for 'account notifications set-preference'",
        'account'
      );
    }
    target = internalCommand([
      'notification-preferences',
      value === 'enabled'
        ? 'enable-session-completed'
        : 'disable-session-completed',
    ]);
  } else if (definition.action === 'signal-execute') {
    const { live, ...flags } = parsed.flags;
    target = {
      ...parsed,
      path: ['trading', 'execute'],
      flags: live === 'true' ? flags : { ...flags, 'dry-run': 'true' },
    };
  } else if (definition.action === 'screenshot') {
    target = {
      ...parsed,
      path: ['screenshot'],
      flags: { ...parsed.flags, base64: 'true' },
    };
  } else if (definition.targetPath !== undefined) {
    target = { ...parsed, path: definition.targetPath };
  } else {
    throw new Error(
      `Embedded command '${parsed.path.join(' ')}' has no execution path`
    );
  }
  try {
    if (target.path[0] === 'broker') {
      return await handleBroker(
        client,
        [...target.path.slice(1), ...(target.passthrough ?? [])],
        deps
      );
    }
    return await executeParsedCommand(client, target, meta, deps);
  } catch (error) {
    if (!(error instanceof CliUsageError)) throw error;
    const targetName = target.path.join(' ');
    const command = parsed.path.join(' ');
    const message = error.message.replaceAll(targetName, command);
    throw new CliUsageError(message, parsed.path[0]);
  }
}

function adaptEmbeddedBrokerDescription(value: unknown, key?: string): unknown {
  if (typeof value === 'string') {
    return value
      .replaceAll('alva broker accounts', 'alva trading accounts')
      .replaceAll('alva broker risk-rules', 'alva trading risk-rules')
      .replaceAll('alva broker', 'alva trading broker');
  }
  if (Array.isArray(value)) {
    const items =
      key === 'commands'
        ? value.filter((item) => {
            if (typeof item !== 'object' || item === null) return true;
            const name = (item as Record<string, unknown>).name;
            return (
              name !== 'accounts' &&
              name !== 'risk-rules' &&
              name !== 'venues' &&
              name !== 'help'
            );
          })
        : value;
    return items.map((item) => adaptEmbeddedBrokerDescription(item));
  }
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value).map(([field, item]) => [
      field,
      adaptEmbeddedBrokerDescription(item, field),
    ])
  );
}

export async function dispatch(
  client: AlvaClient,
  args: string[],
  meta?: { profile?: string; baseUrl?: string; cliVersion?: string },
  deps?: DispatchRuntimeDeps
): Promise<unknown> {
  return dispatchEmbedded(client, args, meta, { ...deps, runtime: 'jagent' });
}

export { CLI_VERSION, DEFAULT_RUN_TIMEOUT_MS } from './dispatch.js';
export { CliUsageError } from '../error.js';
export type {
  DispatchLocalFiles,
  DispatchRuntime,
  DispatchRuntimeDeps,
} from './dispatch.js';
