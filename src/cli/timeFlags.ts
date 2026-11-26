import { CliUsageError } from '../error.js';

const RFC3339 =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|[+-](\d{2}):(\d{2}))$/i;

/**
 * An RFC 3339 time with a timezone (`2026-11-20T09:00:00Z`), as epoch
 * milliseconds. Anything else is a usage error naming the flag.
 */
export function rfc3339Flag(
  value: string,
  flag: string,
  command: string
): number {
  const match = RFC3339.exec(value.trim());
  const ms = Date.parse(value.trim());
  const valid =
    match !== null &&
    Number.isFinite(ms) &&
    Number(match[2]) >= 1 &&
    Number(match[2]) <= 12 &&
    Number(match[3]) >= 1 &&
    Number(match[3]) <=
      new Date(Date.UTC(Number(match[1]), Number(match[2]), 0)).getUTCDate() &&
    Number(match[4]) <= 23 &&
    Number(match[5]) <= 59 &&
    Number(match[6]) <= 59 &&
    Number(match[7] ?? 0) <= 23 &&
    Number(match[8] ?? 0) <= 59;
  if (!valid) {
    throw new CliUsageError(
      /^\d+$/.test(value.trim())
        ? `--${flag} takes an RFC 3339 time such as 2026-11-20T09:00:00Z since toolkit 1.0; Unix timestamps are no longer accepted, got '${value}'`
        : `--${flag} must be an RFC 3339 time with a timezone for '${command}', got '${value}'`,
      command.split(' ')[0]
    );
  }
  return ms;
}

/** An optional RFC 3339 flag, normalized to `toISOString()`. */
export function optionalRfc3339Flag(
  flags: Record<string, string>,
  flag: string,
  command: string
): string | undefined {
  const value = flags[flag];
  return value === undefined
    ? undefined
    : new Date(rfc3339Flag(value, flag, command)).toISOString();
}
