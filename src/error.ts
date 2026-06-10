export class AlvaError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(
    code: string,
    message: string,
    status: number,
    details?: unknown
  ) {
    super(message);
    this.name = 'AlvaError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export class CliUsageError extends Error {
  readonly command?: string;

  constructor(message: string, command?: string) {
    super(message);
    this.name = 'CliUsageError';
    this.command = command;
  }
}
