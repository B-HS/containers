type Awaitable<TData> = TData extends Promise<unknown> ? never : TData

/**
 * Wraps a handler result in the success envelope. A pending promise is rejected at the type level
 * because serializing one yields an empty object and the route silently returns `{"data":{}}`.
 */
export const successResponse = <TData>(data: Awaitable<TData>) => ({
    data,
    success: true as const,
})

type Pagination = {
    limit: number
    page: number
    total: number
    totalPages: number
}

export const paginatedResponse = <TData>(data: Awaitable<TData>[], pagination: Pagination) => ({
    data,
    pagination,
    success: true as const,
})

export const errorResponse = (code: string, message: string, requestId: string, details?: Record<string, unknown>) => ({
    error: {
        code,
        ...(details === undefined ? {} : { details }),
        message,
        requestId,
    },
    success: false as const,
})
