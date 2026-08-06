import { parseApiError, parseApiErrorCode } from './parse-api-error'

const REQUEST_FAILED_FALLBACK = '요청 실패'

export type ApiError = Error & { code: string | null }

const createApiError = (body: unknown) => {
    const error = new Error(parseApiError(body, REQUEST_FAILED_FALLBACK)) as ApiError
    error.code = parseApiErrorCode(body)
    return error
}

export const clientFetch = async (path: string, init?: RequestInit) => {
    const response = await fetch(path, init)
    const body: unknown = await response.json().catch(() => undefined)
    if (!response.ok) {
        throw createApiError(body)
    }
    return body
}

export const clientFetchData = async <T>(path: string, init?: RequestInit) => {
    const body: unknown = await clientFetch(path, init)
    if (body === null || typeof body !== 'object' || !('data' in body)) {
        throw new Error('응답 형식이 올바르지 않습니다.')
    }
    return (body as { data: T }).data
}
