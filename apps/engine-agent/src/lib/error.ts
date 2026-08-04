import { ERROR_CODE } from './error-code'
import { ERROR_MESSAGE } from './error-message'
import type { ErrorCode } from './error-code'

export type AppError = {
    code: ErrorCode
    message: string
    statusCode: number
    details?: Record<string, unknown>
}

export const STATUS_MAP: Record<ErrorCode, number> = {
    ARTIFACT_PATH_INVALID: 400,
    BUILD_CACHE_PRUNE_FAILED: 400,
    CONFIRMATION_MISMATCH: 409,
    CONTAINER_CHANGES_FAILED: 400,
    CONTAINER_INSPECT_FAILED: 400,
    CONTAINER_LOGS_FAILED: 400,
    CONTAINER_NAME_INVALID: 400,
    CONTAINER_NOT_RUNNING: 409,
    CONTAINER_PROBE_FAILED: 400,
    CONTAINER_TOP_FAILED: 400,
    CONTAINER_WAIT_FAILED: 400,
    CONTROL_FAILED: 400,
    DOCKER_NOT_FOUND: 404,
    ENGINE_STREAM_LIMIT: 429,
    EXEC_FAILED: 400,
    EXEC_SESSION_LIMIT_REACHED: 429,
    EXEC_TICKET_INVALID: 400,
    IMAGE_IMPACT_FAILED: 400,
    IMAGE_LOAD_FAILED: 400,
    IMAGE_PULL_FAILED: 400,
    IMAGE_TAG_FAILED: 400,
    INTERNAL_ERROR: 500,
    MANAGEMENT_NETWORK_PROTECTED: 409,
    MANAGEMENT_RESOURCE_PROTECTED: 409,
    MANAGEMENT_VOLUME_PROTECTED: 409,
    NETWORK_CONNECT_FAILED: 400,
    NETWORK_DISCONNECT_FAILED: 400,
    NGINX_CONFIG_CONFLICT: 409,
    NGINX_CONFIG_INVALID: 400,
    NGINX_CONFIG_READ_FAILED: 400,
    NGINX_CONTAINER_UNAVAILABLE: 404,
    NGINX_POST_RELOAD_PROBE_FAILED: 400,
    NGINX_PROTECTED_CONTRACT: 409,
    PRUNE_PREVIEW_FAILED: 400,
    REGISTRY_CREDENTIAL_DECRYPTION_FAILED: 500,
    REGISTRY_CREDENTIAL_FAILED: 400,
    REGISTRY_CREDENTIAL_NOT_FOUND: 404,
    REGISTRY_CREDENTIAL_SERVICE_UNAVAILABLE: 503,
    REGISTRY_CREDENTIAL_STORE_INVALID: 400,
    REGISTRY_HOST_INTERNAL: 400,
    REGISTRY_HOST_MISMATCH: 400,
    REGISTRY_RESOLVE_FAILED: 400,
    UNAUTHORIZED: 401,
}

export const getStatusCode = (code: ErrorCode): number => STATUS_MAP[code]

export const createAppError = (code: string, cause?: unknown) => new Error(code, cause === undefined ? undefined : { cause })

export const isAppError = (error: unknown): error is AppError =>
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'message' in error &&
    'statusCode' in error &&
    typeof error.statusCode === 'number'

export type { ErrorCode }
export { ERROR_CODE, ERROR_MESSAGE }
