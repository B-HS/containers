export const successResponse = <TData>(data: TData) => ({
    data,
    success: true as const,
})

export const errorResponse = (code: string, message: string, requestId: string) => ({
    error: {
        code,
        message,
        requestId,
    },
    success: false as const,
})
