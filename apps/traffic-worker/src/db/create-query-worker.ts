import type { TrafficReadQueries } from './read-queries'

type QueryWorkerResponse = { id: number; message: string } | { id: number; result: unknown }

type QueryWorkerDependencies = {
    filePath: string
}

export type TrafficQueryClient = {
    [Method in keyof TrafficReadQueries]: (...args: Parameters<TrafficReadQueries[Method]>) => Promise<ReturnType<TrafficReadQueries[Method]>>
}

const QUERY_METHODS = [
    'getAnalyticsSummary',
    'getExportEvents',
    'getPercentile',
    'getRecentEvents',
    'getRowCount',
    'getStatusCounts',
    'getSummary',
    'getTopPaths',
] as const

export const createQueryWorker = ({ filePath }: QueryWorkerDependencies) => {
    const worker = new Worker(new URL('./query-worker-entry.ts', import.meta.url), { type: 'module' })
    const pending = new Map<number, { reject: (error: Error) => void; resolve: (value: unknown) => void }>()
    let nextId = 0

    worker.postMessage({ filePath, type: 'init' })
    worker.onmessage = (event: MessageEvent<QueryWorkerResponse>) => {
        const entry = pending.get(event.data.id)
        if (!entry) return
        pending.delete(event.data.id)
        if ('message' in event.data) {
            entry.reject(new Error(event.data.message))
            return
        }
        entry.resolve(event.data.result)
    }
    worker.onerror = (event: ErrorEvent) => {
        const failure = new Error(event.message || 'TRAFFIC_QUERY_WORKER_FAILED')
        for (const entry of pending.values()) entry.reject(failure)
        pending.clear()
    }

    const run = (method: (typeof QUERY_METHODS)[number], args: unknown[]) =>
        new Promise((resolve, reject) => {
            const id = (nextId += 1)
            pending.set(id, { reject, resolve })
            worker.postMessage({ args, id, method, type: 'query' })
        })

    return {
        client: Object.fromEntries(
            QUERY_METHODS.map((method) => [method, (...args: unknown[]) => run(method, args)]),
        ) as unknown as TrafficQueryClient,
        close: () => worker.terminate(),
    }
}

export const createInlineQueryClient = (queries: TrafficReadQueries) =>
    Object.fromEntries(
        QUERY_METHODS.map((method) => [method, async (...args: unknown[]) => (queries[method] as (...values: unknown[]) => unknown)(...args)]),
    ) as unknown as TrafficQueryClient
