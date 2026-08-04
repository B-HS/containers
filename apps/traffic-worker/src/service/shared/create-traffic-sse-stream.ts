import type { TrafficLiveEvent } from '@containers/contracts/traffic'

const HEARTBEAT_INTERVAL_MS = 15_000

type TrafficSseStreamDependencies = {
    subscribe: (input: unknown, listener: (event: TrafficLiveEvent) => void) => () => boolean
}

export const createTrafficSseStream = ({ subscribe }: TrafficSseStreamDependencies) => {
    const live = (query: unknown, signal: AbortSignal) => {
        const encoder = new TextEncoder()
        let unsubscribe: (() => boolean) | undefined
        let heartbeat: ReturnType<typeof setInterval> | undefined
        const body = new ReadableStream<Uint8Array>({
            cancel: () => {
                clearInterval(heartbeat)
                unsubscribe?.()
            },
            start: (controller) => {
                unsubscribe = subscribe(query, (event) => {
                    if ((controller.desiredSize ?? 0) > 0) controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
                })
                heartbeat = setInterval(() => {
                    if ((controller.desiredSize ?? 0) > 0) controller.enqueue(encoder.encode(': keepalive\n\n'))
                }, HEARTBEAT_INTERVAL_MS)
                signal.addEventListener('abort', () => {
                    clearInterval(heartbeat)
                    unsubscribe?.()
                })
            },
        })
        return new Response(body, {
            headers: { 'cache-control': 'no-store', 'content-type': 'text/event-stream', 'x-accel-buffering': 'no' },
        })
    }

    return { live }
}

export type TrafficSseStream = ReturnType<typeof createTrafficSseStream>
