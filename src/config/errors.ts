/**
 * Application error codes and exit codes as defined in the specification.
 */

export type AppErrorCode =
    | 'CONFIG_INVALID'
    | 'USER_NOT_FOUND'
    | 'AUTH_FAILED'
    | 'PERMISSION_DENIED'
    | 'RATE_LIMITED'
    | 'API_UNAVAILABLE'
    | 'PARTIAL_DATA'
    | 'RENDER_FAILED';

export const EXIT_CODES: Record<AppErrorCode, number> = {
    CONFIG_INVALID: 2,
    USER_NOT_FOUND: 3,
    AUTH_FAILED: 4,
    PERMISSION_DENIED: 5,
    RATE_LIMITED: 6,
    API_UNAVAILABLE: 7,
    PARTIAL_DATA: 8, // or 0 if FAIL_ON_PARTIAL_ERROR is false
    RENDER_FAILED: 9
};

export class AppError extends Error {
    readonly code: AppErrorCode;
    readonly exitCode: number;

    constructor(code: AppErrorCode, message: string) {
        super(message);
        this.name = 'AppError';
        this.code = code;
        this.exitCode = EXIT_CODES[code];
        Object.setPrototypeOf(this, AppError.prototype);
    }
}
