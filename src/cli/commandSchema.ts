import {
  COMMAND_DEFINITIONS,
  GLOBAL_FLAG_DEFINITIONS,
} from './commandDefinitions.js';
import { createCommandParser } from './commandParser.js';

export type { ParsedCommand } from './commandParser.js';

export const parseCommand = createCommandParser(
  COMMAND_DEFINITIONS,
  GLOBAL_FLAG_DEFINITIONS
);
