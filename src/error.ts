/** One request parameter an /api/v2 call was rejected for (INVALID_ARGUMENT). */
export interface InvalidParam {
  name: string;
  reason: string;
}

/** The RFC 9457 extension members an /api/v2 problem may carry. */
export interface ProblemFields {
  requiredPermission?: string;
  invalidParams?: InvalidParam[];
  retryAfter?: number;
}

export class AlvaError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;
  /** The permission the credential lacks, on INSUFFICIENT_PERMISSION. */
  declare readonly requiredPermission?: string;
  /** The rejected request parameters, on INVALID_ARGUMENT. */
  declare readonly invalidParams?: InvalidParam[];
  /** Seconds to wait before trying again, on RATE_LIMITED. */
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
    if (problem?.requiredPermission !== undefined)
      this.requiredPermission = problem.requiredPermission;
    if (problem?.invalidParams !== undefined)
      this.invalidParams = problem.invalidParams;
    if (problem?.retryAfter !== undefined) this.retryAfter = problem.retryAfter;
  }
}

/** The JSON the CLI writes to stderr for an AlvaError. */
export function alvaErrorOutput(error: AlvaError): { error: object } {
  return {
    error: {
      code: error.code,
      message: error.message,
      status: error.status,
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
