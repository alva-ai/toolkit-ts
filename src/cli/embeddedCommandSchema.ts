import { EMBEDDED_GLOBAL_FLAG_DEFINITIONS } from './agentCommandDefinitions.js';
import { createCommandParser } from './commandParser.js';
import { EMBEDDED_COMMAND_DEFINITIONS } from './embeddedCommandDefinitions.js';

export const parseEmbeddedCommand = createCommandParser(
  EMBEDDED_COMMAND_DEFINITIONS,
  EMBEDDED_GLOBAL_FLAG_DEFINITIONS
);
