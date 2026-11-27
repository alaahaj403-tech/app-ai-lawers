/**
 * Typed application failures. These are the ONLY error shapes that cross
 * module boundaries. Never expose stack traces or provider internals to users.
 */
export type FailureCode =
  | 'NETWORK_FAILURE'
  | 'AUTHENTICATION_FAILURE'
  | 'AUTHORIZATION_FAILURE'
  | 'VALIDATION_FAILURE'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'PROVIDER_UNAVAILABLE'
  | 'MODEL_UNSUPPORTED'
  | 'OFFLINE_CAPABILITY_MISSING'
  | 'UNSUPPORTED_PLATFORM_CAPABILITY'
  | 'QUOTA_EXCEEDED'
  | 'RATE_LIMITED'
  | 'PERMISSION_DENIED'
  | 'REALTIME_DISCONNECTED'
  | 'DOCUMENT_PROCESSING_FAILURE'
  | 'TRANSLATION_INTEGRITY_FAILURE'
  | 'TIMEOUT'
  | 'INTERNAL';

const HTTP_STATUS: Record<FailureCode, number> = {
  NETWORK_FAILURE: 502,
  AUTHENTICATION_FAILURE: 401,
  AUTHORIZATION_FAILURE: 403,
  VALIDATION_FAILURE: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PROVIDER_UNAVAILABLE: 503,
  MODEL_UNSUPPORTED: 422,
  OFFLINE_CAPABILITY_MISSING: 422,
  UNSUPPORTED_PLATFORM_CAPABILITY: 422,
  QUOTA_EXCEEDED: 429,
  RATE_LIMITED: 429,
  PERMISSION_DENIED: 403,
  REALTIME_DISCONNECTED: 503,
  DOCUMENT_PROCESSING_FAILURE: 422,
  TRANSLATION_INTEGRITY_FAILURE: 502,
  TIMEOUT: 504,
  INTERNAL: 500,
};

/** Whether a failure of this kind may be retried by a caller without side effects. */
const RETRYABLE: ReadonlySet<FailureCode> = new Set<FailureCode>([
  'NETWORK_FAILURE',
  'PROVIDER_UNAVAILABLE',
  'REALTIME_DISCONNECTED',
  'TIMEOUT',
]);

export class AppFailure extends Error {
  readonly code: FailureCode;
  /** Safe-for-user, non-localized message key or short text. Never includes internals. */
  readonly userMessage: string;
  /** Internal details for logs. Never sent to clients. */
  readonly details: Readonly<Record<string, unknown>> | undefined;
  override readonly cause: unknown;

  constructor(
    code: FailureCode,
    userMessage: string,
    options: { details?: Record<string, unknown>; cause?: unknown } = {},
  ) {
    super(`${code}: ${userMessage}`);
    this.name = 'AppFailure';
    this.code = code;
    this.userMessage = userMessage;
    this.details = options.details;
    this.cause = options.cause;
  }

  get httpStatus(): number {
    return HTTP_STATUS[this.code];
  }

  get retryable(): boolean {
    return RETRYABLE.has(this.code);
  }

  /** Client-safe representation. */
  toPublic(): { code: FailureCode; message: string; retryable: boolean } {
    return { code: this.code, message: this.userMessage, retryable: this.retryable };
  }

  static is(error: unknown): error is AppFailure {
    return error instanceof AppFailure;
  }

  static from(error: unknown, fallback: FailureCode = 'INTERNAL'): AppFailure {
    if (error instanceof AppFailure) return error;
    return new AppFailure(fallback, 'Unexpected error', { cause: error });
  }
}

export const failures = {
  network: (msg = 'Network error', o?: { cause?: unknown }) =>
    new AppFailure('NETWORK_FAILURE', msg, o),
  auth: (msg = 'Authentication required') => new AppFailure('AUTHENTICATION_FAILURE', msg),
  forbidden: (msg = 'Not allowed') => new AppFailure('AUTHORIZATION_FAILURE', msg),
  validation: (msg: string, details?: Record<string, unknown>) =>
    new AppFailure('VALIDATION_FAILURE', msg, details ? { details } : {}),
  notFound: (msg = 'Not found') => new AppFailure('NOT_FOUND', msg),
  conflict: (msg = 'Conflict') => new AppFailure('CONFLICT', msg),
  providerUnavailable: (
    msg = 'Service temporarily unavailable',
    o?: { cause?: unknown; details?: Record<string, unknown> },
  ) => new AppFailure('PROVIDER_UNAVAILABLE', msg, o),
  modelUnsupported: (msg = 'Requested capability is not supported') =>
    new AppFailure('MODEL_UNSUPPORTED', msg),
  unsupportedPlatform: (msg = 'Not supported on this platform') =>
    new AppFailure('UNSUPPORTED_PLATFORM_CAPABILITY', msg),
  quota: (msg = 'Quota exceeded', details?: Record<string, unknown>) =>
    new AppFailure('QUOTA_EXCEEDED', msg, details ? { details } : {}),
  rateLimited: (msg = 'Too many requests') => new AppFailure('RATE_LIMITED', msg),
  timeout: (msg = 'Request timed out') => new AppFailure('TIMEOUT', msg),
  integrity: (msg: string, details?: Record<string, unknown>) =>
    new AppFailure('TRANSLATION_INTEGRITY_FAILURE', msg, details ? { details } : {}),
  internal: (msg = 'Internal error', o?: { cause?: unknown }) => new AppFailure('INTERNAL', msg, o),
};
