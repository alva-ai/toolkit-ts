import { describe, it, expect } from 'vitest';
import { CliUsageError } from '../src/error.js';

describe('CliUsageError', () => {
  it('sets name, message, and command correctly', () => {
    const err = new CliUsageError('Missing subcommand', 'fs');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('CliUsageError');
    expect(err.message).toBe('Missing subcommand');
    expect(err.command).toBe('fs');
  });

  it('command can be undefined', () => {
    const err = new CliUsageError('Unknown command');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('CliUsageError');
    expect(err.message).toBe('Unknown command');
    expect(err.command).toBeUndefined();
  });
});
