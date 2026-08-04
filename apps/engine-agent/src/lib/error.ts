import { ENGINE_AGENT_ERROR_STATUS, splitErrorCode } from '@containers/contracts/engine-error'
import { ERROR_CODE } from './error-code'
import { ERROR_MESSAGE } from './error-message'
import type { ErrorCode } from './error-code'

export type AppError = Error & {
    code: string
    statusCode: number
    details?: Record<string, unknown>
}

const INTERNAL_STATUS_CODE = 500

export const STATUS_MAP: Record<ErrorCode, number> = ENGINE_AGENT_ERROR_STATUS

export const getStatusCode = (code: ErrorCode): number => STATUS_MAP[code]

const statusForCode = (code: string): number => {
    if (code in STATUS_MAP) {
        return STATUS_MAP[code as ErrorCode]
    }
    const { code: baseCode } = splitErrorCode(code)
    return baseCode in STATUS_MAP ? STATUS_MAP[baseCode as ErrorCode] : INTERNAL_STATUS_CODE
}

export const createAppError = (code: string, cause?: unknown): AppError => {
    const error = new Error(code, cause === undefined ? undefined : { cause }) as AppError
    const { detail } = splitErrorCode(code)
    error.code = code
    error.statusCode = statusForCode(code)
    if (detail !== undefined) {
        error.details = { detail }
    }
    return error
}

export const isAppError = (error: unknown): error is AppError =>
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'message' in error &&
    'statusCode' in error &&
    typeof error.statusCode === 'number'

export type { ErrorCode }
export { ERROR_CODE, ERROR_MESSAGE }
