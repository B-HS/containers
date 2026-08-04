import { ERROR_MESSAGE } from './error-message'
import type { ErrorCode } from './error-code'

export type AppError = {
    code: ErrorCode
    message: string
    statusCode: number
}

export const STATUS_MAP: Record<ErrorCode, number> = {
    BACKUP_TRAFFIC_CREATE_FAILED: 400,
    BACKUP_TRAFFIC_INVALID: 422,
    BACKUP_TRAFFIC_NOT_FOUND: 404,
    BACKUP_TRAFFIC_RESTORE_FAILED: 400,
    DB_WRITE_FAILED: 500,
    INTERNAL_ERROR: 500,
    TRAFFIC_STREAM_LIMIT: 429,
    UNAUTHORIZED: 401,
    UNKNOWN_ERROR: 500,
    VALIDATION_ERROR: 400,
}

export const getStatusCode = (code: ErrorCode): number => STATUS_MAP[code]

/**
 * Creates a domain error whose message is the stable error code consumed by route status mappers.
 */
export const createAppError = (code: string, cause?: unknown) => new Error(code, cause === undefined ? undefined : { cause })

export const isAppError = (error: unknown): error is AppError =>
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'message' in error &&
    'statusCode' in error &&
    typeof error.statusCode === 'number'

export type { ErrorCode }
export { ERROR_MESSAGE }
