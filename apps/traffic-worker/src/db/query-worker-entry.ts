import { Database } from 'bun:sqlite'
import { createTrafficReadQueries, type TrafficReadQueries } from './read-queries'

type QueryWorkerMessage = { filePath: string; type: 'init' } | { args: unknown[]; id: number; method: keyof TrafficReadQueries; type: 'query' }

let queries: TrafficReadQueries | undefined

self.onmessage = (event: MessageEvent<QueryWorkerMessage>) => {
    if (event.data.type === 'init') {
        const sqlite = new Database(event.data.filePath, { readonly: true, strict: true })
        sqlite.exec('PRAGMA busy_timeout = 5000')
        queries = createTrafficReadQueries(sqlite)
        return
    }

    const { args, id, method } = event.data
    try {
        if (!queries) throw new Error('TRAFFIC_QUERY_WORKER_NOT_READY')
        const run = queries[method] as (...values: unknown[]) => unknown
        self.postMessage({ id, result: run(...args) })
    } catch (error) {
        self.postMessage({ id, message: error instanceof Error ? error.message : 'TRAFFIC_QUERY_FAILED' })
    }
}
