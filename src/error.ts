import type { components } from './generated/platform-v2.js';

/** One request parameter an /api/v2 call was rejected for (INVALID_ARGUMENT). */
export interface InvalidParam {
  name: string;
  reason: string;
}

/** A public reason an /api/v2 problem may carry (AIP-193, UPPER_SNAKE). */
export type ProblemReason = NonNullable<
  components['schemas']['Problem']['reason']
>;

/** The RFC 9457 members an /api/v2 problem may carry beside code and detail. */
export interface ProblemFields {
  /** A newer server may send a reason this SDK does not list yet. */
  reason?: ProblemReason | (string & {});
  type?: string;
  requiredPermission?: string;
  invalidParams?: InvalidParam[];
  retryAfter?: number;
}

export class AlvaError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;
  /** The problem's reason, such as IDEMPOTENCY_KEY_REUSED; finer than code. */
  declare readonly reason?: ProblemReason | (string & {});
  /** The problem type URI, https://alva.ai/problems/<kebab reason or code>. */
  declare readonly type?: string;
  /** The permission the credential lacks, on INSUFFICIENT_PERMISSION. */
  declare readonly requiredPermission?: string;
  /** The rejected request parameters, on INVALID_ARGUMENT. */
  declare readonly invalidParams?: InvalidParam[];
  /** Seconds to wait before trying again (the problem's, else Retry-After). */
  declare readonly retryAfter?: number;

  constructor(
    code: string,
    message: string,
    status: number,
    details?: unknown,
    problem?: ProblemFields
  ) {
    super(message);
    this.name = 'AlvaError';
    this.code = code;
    this.status = status;
    this.details = details;
    // Declared, not defined, and assigned only when present: errors without
    // them keep their own properties.
    if (problem?.reason !== undefined) this.reason = problem.reason;
    if (problem?.type !== undefined) this.type = problem.type;
    if (problem?.requiredPermission !== undefined)
      this.requiredPermission = problem.requiredPermission;
    if (problem?.invalidParams !== undefined)
      this.invalidParams = problem.invalidParams;
    if (problem?.retryAfter !== undefined) this.retryAfter = problem.retryAfter;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function seconds(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? value
    : undefined;
}

function invalidParams(value: unknown): InvalidParam[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter(isRecord).map((p) => ({
    name: String(p.name ?? ''),
    reason: String(p.reason ?? ''),
  }));
}

/** Delta-seconds of a Retry-After header, the form the gateway sends. */
function retryAfterHeader(value: string | null): number | undefined {
  const v = value?.trim();
  return v && /^[0-9]+$/.test(v) ? Number(v) : undefined;
}

/**
 * Turns a failed response of any Alva route into an AlvaError. An RFC 9457
 * problem (/api/v2) gives code, detail (else title), reason, type and the
 * extension members; the v1 envelope `{error: {code, message}, details}`
 * gives code, message and details; any other body is UNKNOWN with the status
 * and the start of the body. retryAfter is the problem's, else Retry-After.
 */
export async function responseError(response: Response): Promise<AlvaError> {
  let bodyText = '';
  try {
    bodyText = await Promise.resolve(response.text());
  } catch {
    bodyText = '';
  }
  const status = response.status;
  const headerRetryAfter = retryAfterHeader(
    response.headers.get('retry-after')
  );
  const contentType = (
    response.headers.get('content-type') ?? ''
  ).toLowerCase();
  let data: unknown;
  if (
    bodyText &&
    (contentType.includes('application/json') || contentType.includes('+json'))
  ) {
    try {
      data = JSON.parse(bodyText);
    } catch {
      data = undefined;
    }
  }
  if (isRecord(data) && isRecord(data.error)) {
    return new AlvaError(
      nonEmptyString(data.error.code) ?? 'UNKNOWN',
      nonEmptyString(data.error.message) ?? `HTTP ${status}`,
      status,
      data.details,
      { retryAfter: headerRetryAfter }
    );
  }
  if (
    isRecord(data) &&
    (contentType.includes('application/problem+json') ||
      typeof data.code === 'string')
  ) {
    return new AlvaError(
      nonEmptyString(data.code) ?? 'UNKNOWN',
      nonEmptyString(data.detail) ??
        nonEmptyString(data.title) ??
        `HTTP ${status}`,
      status,
      undefined,
      {
        reason: nonEmptyString(data.reason),
        type: nonEmptyString(data.type),
        requiredPermission: nonEmptyString(data.requiredPermission),
        invalidParams: invalidParams(data.invalidParams),
        retryAfter: seconds(data.retryAfter) ?? headerRetryAfter,
      }
    );
  }
  return new AlvaError(
    'UNKNOWN',
    `HTTP ${status}: ${bodyText.slice(0, 200)}`,
    status,
    undefined,
    { retryAfter: headerRetryAfter }
  );
}

/** The JSON the CLI writes to stderr for an AlvaError. */
export function alvaErrorOutput(error: AlvaError): { error: object } {
  return {
    error: {
      code: error.code,
      reason: error.reason,
      message: error.message,
      status: error.status,
      type: error.type,
      details: error.details,
      requiredPermission: error.requiredPermission,
      invalidParams: error.invalidParams,
      retryAfter: error.retryAfter,
    },
  };
}

export class CliUsageError extends Error {
  readonly command?: string;

  constructor(message: string, command?: string) {
    super(message);
    this.name = 'CliUsageError';
    this.command = command;
  }
}
