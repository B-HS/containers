import { ERROR_MESSAGE } from './error-message'
import type { ErrorCode } from './error-code'

export type AppError = {
    code: ErrorCode
    message: string
    statusCode: number
}

export const STATUS_MAP: Record<ErrorCode, number> = {
    EGRESS_DELIVERY_FAILED: 502,
    EGRESS_TARGET_BLOCKED: 422,
    INTERNAL_ERROR: 500,
    UNAUTHORIZED: 401,
    UNKNOWN_ERROR: 500,
    VALIDATION_ERROR: 400,
}

export const getStatusCode = (code: ErrorCode): number => STATUS_MAP[code]

/**
 * Creates a domain error whose status is derived from the central code-to-status mapping.
 */
export const createAppError = (code: string): AppError => ({
    code: code as ErrorCode,
    message: ERROR_MESSAGE[code as ErrorCode],
    statusCode: getStatusCode(code as ErrorCode),
})

export const isAppError = (error: unknown): error is AppError =>
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'message' in error &&
    'statusCode' in error &&
    typeof error.statusCode === 'number'

export type { ErrorCode }
export { ERROR_MESSAGE }
