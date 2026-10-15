/** HTTP-facing error codes and the status each maps to. */
export const ERROR_CODES = {
  INVALID_REQUEST: 400,
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_ERROR: 500,
  NOT_IMPLEMENTED: 501,
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

export interface HarborErrorBody {
  code: ErrorCode;
  message: string;
  request_id?: string;
}

/** The one error type the API turns into a JSON error response. */
export class HarborError extends Error {
  readonly status: number;
  constructor(readonly code: ErrorCode, message: string) {
    super(message);
    this.name = 'HarborError';
    this.status = ERROR_CODES[code];
  }
  toBody(requestId?: string): HarborErrorBody {
    return { code: this.code, message: this.message, request_id: requestId };
  }
}

/** Thrown by stubbed code paths (e.g. provider methods that don't call real APIs yet). */
export class NotImplementedError extends HarborError {
  constructor(readonly feature: string) {
    super('NOT_IMPLEMENTED', `${feature} is not implemented yet.`);
    this.name = 'NotImplementedError';
  }
}
