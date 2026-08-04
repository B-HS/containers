const MULTIPLEX_HEADER_BYTES = 8
const MULTIPLEX_STDERR_TYPE = 2
const MAX_FRAME_PAYLOAD_BYTES = 1_048_576
const MAX_LINE_BYTES = 1_048_576

export type MultiplexFrame = {
    stream: 'stderr' | 'stdout'
    text: string
    truncated: boolean
}

export const createMultiplexFrameParser = () => {
    let buffer: Buffer = Buffer.alloc(0)
    let skipRemaining = 0

    return {
        push: (chunk: Buffer) => {
            buffer = buffer.length === 0 ? chunk : Buffer.concat([buffer, chunk])
            const frames: MultiplexFrame[] = []

            while (true) {
                if (skipRemaining > 0) {
                    const dropped = Math.min(skipRemaining, buffer.length)
                    buffer = buffer.subarray(dropped)
                    skipRemaining -= dropped
                    if (skipRemaining > 0) {
                        break
                    }
                }
                if (buffer.length < MULTIPLEX_HEADER_BYTES) {
                    break
                }
                const streamType = buffer[0] === MULTIPLEX_STDERR_TYPE ? ('stderr' as const) : ('stdout' as const)
                const frameLength = buffer.readUInt32BE(4)
                if (frameLength > MAX_FRAME_PAYLOAD_BYTES) {
                    if (buffer.length < MULTIPLEX_HEADER_BYTES + MAX_FRAME_PAYLOAD_BYTES) {
                        break
                    }
                    const payload = buffer.subarray(MULTIPLEX_HEADER_BYTES, MULTIPLEX_HEADER_BYTES + MAX_FRAME_PAYLOAD_BYTES)
                    frames.push({ stream: streamType, text: payload.toString('utf8'), truncated: true })
                    buffer = buffer.subarray(MULTIPLEX_HEADER_BYTES + MAX_FRAME_PAYLOAD_BYTES)
                    skipRemaining = frameLength - MAX_FRAME_PAYLOAD_BYTES
                    continue
                }
                if (buffer.length < MULTIPLEX_HEADER_BYTES + frameLength) {
                    break
                }
                const payload = buffer.subarray(MULTIPLEX_HEADER_BYTES, MULTIPLEX_HEADER_BYTES + frameLength)
                frames.push({ stream: streamType, text: payload.toString('utf8'), truncated: false })
                buffer = buffer.subarray(MULTIPLEX_HEADER_BYTES + frameLength)
            }

            return frames
        },
    }
}

export const createLineParser = () => {
    let buffer: Buffer = Buffer.alloc(0)

    return {
        push: (chunk: Buffer) => {
            buffer = buffer.length === 0 ? chunk : Buffer.concat([buffer, chunk])
            const lines: string[] = []

            while (true) {
                const newlineIndex = buffer.indexOf(0x0a)
                if (newlineIndex < 0) {
                    break
                }
                const line = buffer.subarray(0, newlineIndex).toString('utf8').trim()
                buffer = buffer.subarray(newlineIndex + 1)
                if (line.length > 0) {
                    lines.push(line)
                }
            }
            if (buffer.length > MAX_LINE_BYTES) {
                buffer = Buffer.alloc(0)
            }

            return lines
        },
    }
}
