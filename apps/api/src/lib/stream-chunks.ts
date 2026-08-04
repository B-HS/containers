export const toStreamChunks = (stream: ReadableStream<Uint8Array>): AsyncIterable<Uint8Array> => ({
    [Symbol.asyncIterator]: () => {
        const reader = stream.getReader()
        return {
            next: async () => {
                const { done, value } = await reader.read()
                return done || !value ? { done: true as const, value: undefined } : { done: false as const, value }
            },
            return: async () => {
                await reader.cancel()
                return { done: true as const, value: undefined }
            },
        }
    },
})
