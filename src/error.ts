export class AlvaError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'AlvaError';
    this.code = code;
    this.status = status;
  }
}
