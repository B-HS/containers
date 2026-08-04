export const successResponse = <TData>(data: TData) => ({
    data,
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
