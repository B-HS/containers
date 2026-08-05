import { randomUUID } from 'node:crypto'
import {
    operationJobEventListSchema,
    operationJobListQuerySchema,
    operationJobListSchema,
    operationJobSchema,
    type OperationJob,
    type OperationJobKind,
    type OperationJobStatus,
} from '@containers/contracts/operation-job'
import { createAppError } from '../../../lib/error'

const FINISHED_JOB_STATUSES = ['succeeded', 'failed', 'cancelled'] as const
const DEFAULT_MAX_ATTEMPTS = 3
const POLL_INTERVAL_MS = 1_000
const HEARTBEAT_INTERVAL_MS = 30_000
const RETRY_BACKOFF_MS = 60_000
const FINISHED_RETENTION_MS = 14 * 24 * 60 * 60 * 1_000
const STALL_HEARTBEAT_MULTIPLIER = 3
const STALL_THRESHOLD_MS = HEARTBEAT_INTERVAL_MS * STALL_HEARTBEAT_MULTIPLIER
const STALL_SWEEP_INTERVAL_MS = 60_000

export { STALL_THRESHOLD_MS }

export type OperationJobHandlerContext = {
    isCancelRequested: () => Promise<boolean>
    job: OperationJob
    reportProgress: (step: string, detail?: Record<string, unknown>) => Promise<void>
}

export type OperationJobHandler = (context: OperationJobHandlerContext) => Promise<Record<string, unknown> | null>

export type JobErrorAttributes = {
    retryAfterMs?: number
    terminal?: boolean
}

export const createJobError = (code: string, attributes: JobErrorAttributes = {}) => {
    const error = new Error(code) as Error & JobErrorAttributes
    if (attributes.retryAfterMs !== undefined) {
        error.retryAfterMs = attributes.retryAfterMs
    }
    if (attributes.terminal === true) {
        error.terminal = true
    }
    return error
}

const getJobErrorAttributes = (error: unknown): JobErrorAttributes => {
    if (!(error instanceof Error)) {
        return {}
    }
    const candidate = error as Error & JobErrorAttributes
    const retryAfterMs =
        typeof candidate.retryAfterMs === 'number' && Number.isFinite(candidate.retryAfterMs) && candidate.retryAfterMs > 0
            ? Math.floor(candidate.retryAfterMs)
            : undefined
    const attributes: JobErrorAttributes = { terminal: candidate.terminal === true }
    if (retryAfterMs !== undefined) {
        attributes.retryAfterMs = retryAfterMs
    }
    return attributes
}

type OperationJobEnqueueInput = {
    createdBy?: string
    kind: OperationJobKind
    maxAttempts?: number
    payload: Record<string, unknown>
    unique?: boolean
    uniqueResourceKey?: string
}

type OperationJobRow = {
    attempt: number
    cancelRequestedAt: Date | null
    createdAt: Date
    createdBy: string | null
    failureCode: string | null
    finishedAt: Date | null
    heartbeatAt: Date | null
    id: string
    kind: OperationJobKind
    maxAttempts: number
    payload: string
    progressStep: string | null
    resourceKey: string | null
    result: string | null
    scheduledAt: Date
    startedAt: Date | null
    status: OperationJobStatus
    updatedAt: Date
}

type OperationJobEventRow = {
    createdAt: Date
    detail: string | null
    event: string
    id: string
    jobId: string
}

type OperationJobInsertRecord = {
    attempt: number
    createdAt: Date
    createdBy: string | null
    id: string
    kind: OperationJobKind
    maxAttempts: number
    payload: string
    resourceKey: string | null
    scheduledAt: Date
    status: OperationJobStatus
    updatedAt: Date
}

type OperationJobServiceDb = {
    findById: (id: string) => Promise<OperationJobRow | undefined>
    insert: (record: OperationJobInsertRecord) => Promise<void>
    insertEvent: (record: OperationJobEventRow) => Promise<void>
    listByKindsAndStatuses: (input: { kind?: OperationJobKind; status?: OperationJobStatus; limit: number }) => Promise<OperationJobRow[]>
    listEventsByJob: (jobId: string) => Promise<OperationJobEventRow[]>
    findActiveByKind: (input: { kind: OperationJobKind; resourceKey: string | undefined }) => Promise<OperationJobRow | undefined>
    claimNext: (now: Date) => Promise<OperationJobRow | undefined>
    claim: (
        id: string,
        values: { attempt: number; heartbeatAt: Date; startedAt: Date; status: OperationJobStatus; updatedAt: Date; workerId: string },
    ) => Promise<OperationJobRow | undefined>
    update: (id: string, values: Partial<Omit<OperationJobRow, 'id'>> & { updatedAt: Date }) => Promise<void>
    listInterrupted: (workerId: string) => Promise<OperationJobRow[]>
    listStalled: (heartbeatBefore: Date) => Promise<OperationJobRow[]>
    deleteFinishedBefore: (threshold: Date, statuses: OperationJobStatus[]) => Promise<void>
}

type OperationJobServiceDependencies = {
    db: OperationJobServiceDb
    handlers: Partial<Record<OperationJobKind, OperationJobHandler>>
    now: () => Date
    onFinished?: (job: OperationJob) => Promise<void>
    workerId: string
}

export type { OperationJobServiceDb }

const toJob = (record: OperationJobRow) =>
    operationJobSchema.parse({
        ...record,
        cancelRequestedAt: record.cancelRequestedAt?.toISOString() ?? null,
        createdAt: record.createdAt.toISOString(),
        finishedAt: record.finishedAt?.toISOString() ?? null,
        heartbeatAt: record.heartbeatAt?.toISOString() ?? null,
        payload: JSON.parse(record.payload) as unknown,
        resourceKey: record.resourceKey ?? null,
        result: record.result === null ? null : (JSON.parse(record.result) as unknown),
        scheduledAt: record.scheduledAt.toISOString(),
        startedAt: record.startedAt?.toISOString() ?? null,
        updatedAt: record.updatedAt.toISOString(),
    })

export const createOperationJobService = ({ db, handlers, now, onFinished, workerId }: OperationJobServiceDependencies) => {
    const recordEvent = async (jobId: string, event: string, detail?: Record<string, unknown>) => {
        await db.insertEvent({
            createdAt: now(),
            detail: detail === undefined ? null : JSON.stringify(detail),
            event,
            id: randomUUID(),
            jobId,
        })
    }

    const notifyFinished = async (job: OperationJob) => {
        if (onFinished === undefined) {
            return
        }
        void onFinished(job).catch(() => undefined)
    }

    const get = async (id: string) => {
        const record = await db.findById(id)
        if (!record) {
            throw createAppError('JOB_NOT_FOUND')
        }
        return toJob(record)
    }

    const update = async (id: string, values: Partial<Omit<OperationJobRow, 'id'>>) => {
        await db.update(id, { ...values, updatedAt: now() })
        return get(id)
    }

    const enqueue = async (input: OperationJobEnqueueInput) => {
        if (input.unique || input.uniqueResourceKey !== undefined) {
            const active = await db.findActiveByKind({ kind: input.kind, resourceKey: input.uniqueResourceKey })
            if (active) {
                return toJob(active)
            }
        }
        const timestamp = now()
        const id = randomUUID()
        await db.insert({
            attempt: 0,
            createdAt: timestamp,
            createdBy: input.createdBy ?? null,
            id,
            kind: input.kind,
            maxAttempts: input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
            payload: JSON.stringify(input.payload),
            resourceKey: input.uniqueResourceKey ?? null,
            scheduledAt: timestamp,
            status: 'queued',
            updatedAt: timestamp,
        })
        await recordEvent(id, 'queued')
        return get(id)
    }

    const claimNext = async () => {
        const candidate = await db.claimNext(now())
        if (!candidate) {
            return null
        }
        const claimed = await db.claim(candidate.id, {
            attempt: candidate.attempt + 1,
            heartbeatAt: now(),
            startedAt: now(),
            status: 'running',
            updatedAt: now(),
            workerId,
        })
        if (claimed === undefined) {
            return null
        }
        await recordEvent(candidate.id, 'started', { attempt: candidate.attempt + 1 })
        return get(candidate.id)
    }

    const isCancelRequested = async (id: string) => (await get(id)).status === 'cancelling'

    const finishFailure = async (job: OperationJob, code: string, attributes: JobErrorAttributes = {}) => {
        const cancelled = code === 'JOB_CANCELLED' || (await get(job.id)).status === 'cancelling'
        if (cancelled) {
            const cancelledJob = await update(job.id, {
                failureCode: code === 'JOB_CANCELLED' ? null : code,
                finishedAt: now(),
                status: 'cancelled',
            })
            await recordEvent(job.id, 'cancelled', code === 'JOB_CANCELLED' ? undefined : { code })
            await notifyFinished(cancelledJob)
            return
        }
        if (attributes.terminal || job.attempt >= job.maxAttempts) {
            const failedJob = await update(job.id, { failureCode: code, finishedAt: now(), status: 'failed' })
            await recordEvent(job.id, 'failed', { code })
            await notifyFinished(failedJob)
            return
        }
        const baseBackoffMs = job.attempt * RETRY_BACKOFF_MS
        const retryAt = new Date(now().getTime() + Math.max(baseBackoffMs, attributes.retryAfterMs ?? 0))
        await update(job.id, { failureCode: code, scheduledAt: retryAt, status: 'queued' })
        await recordEvent(job.id, 'retry-scheduled', {
            attempt: job.attempt,
            code,
            retryAfterMs: attributes.retryAfterMs ?? null,
            retryAt: retryAt.toISOString(),
        })
    }

    const runClaimed = async (job: OperationJob) => {
        const handler = handlers[job.kind]
        if (!handler) {
            await update(job.id, { failureCode: 'JOB_HANDLER_MISSING', finishedAt: now(), status: 'failed' })
            await recordEvent(job.id, 'failed', { code: 'JOB_HANDLER_MISSING' })
            return
        }
        const heartbeat = setInterval(() => {
            void update(job.id, { heartbeatAt: now() }).catch(() => undefined)
        }, HEARTBEAT_INTERVAL_MS)
        try {
            const result = await handler({
                isCancelRequested: () => isCancelRequested(job.id),
                job,
                reportProgress: async (step, detail) => {
                    await update(job.id, { progressStep: step })
                    await recordEvent(job.id, 'progress', { step, ...detail })
                },
            })
            const serialized = result === null ? null : JSON.stringify(result)
            if ((await get(job.id)).status === 'cancelling') {
                const cancelledJob = await update(job.id, {
                    failureCode: null,
                    finishedAt: now(),
                    result: serialized,
                    status: 'cancelled',
                })
                await recordEvent(job.id, 'cancelled', { completedBeforeCancel: true })
                await notifyFinished(cancelledJob)
                return
            }
            const succeeded = await update(job.id, {
                failureCode: null,
                finishedAt: now(),
                result: serialized,
                status: 'succeeded',
            })
            await recordEvent(job.id, 'succeeded')
            await notifyFinished(succeeded)
        } catch (error) {
            const code = error instanceof Error ? error.message : 'JOB_FAILED'
            await finishFailure(job, code, getJobErrorAttributes(error))
        } finally {
            clearInterval(heartbeat)
        }
    }

    let processing = false
    const tick = async () => {
        if (processing) {
            return
        }
        processing = true
        try {
            while (true) {
                const job = await claimNext()
                if (!job) {
                    break
                }
                await runClaimed(job)
            }
        } finally {
            processing = false
        }
    }

    let stopWorker: (() => void) | null = null
    const start = () => {
        if (stopWorker) {
            return stopWorker
        }
        const interval = setInterval(() => void tick().catch(() => undefined), POLL_INTERVAL_MS)
        const sweepInterval = setInterval(() => void sweepStalled().catch(() => undefined), STALL_SWEEP_INTERVAL_MS)
        stopWorker = () => {
            clearInterval(interval)
            clearInterval(sweepInterval)
            stopWorker = null
        }
        return stopWorker
    }

    const requestCancel = async (id: string) => {
        const job = await get(id)
        if (job.status === 'queued') {
            const cancelledJob = await update(id, { cancelRequestedAt: now(), finishedAt: now(), status: 'cancelled' })
            await recordEvent(id, 'cancelled')
            return cancelledJob
        }
        if (job.status === 'running') {
            const cancellingJob = await update(id, { cancelRequestedAt: now(), status: 'cancelling' })
            await recordEvent(id, 'cancel-requested')
            return cancellingJob
        }
        if (job.status === 'cancelling') {
            return job
        }
        throw createAppError('JOB_ALREADY_FINISHED')
    }

    const recoverAbandoned = async (records: OperationJobRow[], code: string) => {
        for (const record of records) {
            const job = toJob(record)
            if (job.status === 'cancelling') {
                await update(job.id, { failureCode: code, finishedAt: now(), status: 'cancelled' })
                await recordEvent(job.id, 'cancelled', { code })
                continue
            }
            if (job.attempt < job.maxAttempts) {
                await update(job.id, { scheduledAt: now(), status: 'queued' })
                await recordEvent(job.id, 'interrupted-requeued', { attempt: job.attempt, code })
                continue
            }
            const failedJob = await update(job.id, { failureCode: code, finishedAt: now(), status: 'failed' })
            await recordEvent(job.id, 'failed', { code })
            await notifyFinished(failedJob)
        }
        return records.length
    }

    const reconcileInterrupted = async () => recoverAbandoned(await db.listInterrupted(workerId), 'JOB_INTERRUPTED')

    const sweepStalled = async () => recoverAbandoned(await db.listStalled(new Date(now().getTime() - STALL_THRESHOLD_MS)), 'JOB_STALLED')

    const cleanupFinished = async () => {
        const threshold = new Date(now().getTime() - FINISHED_RETENTION_MS)
        await db.deleteFinishedBefore(threshold, [...FINISHED_JOB_STATUSES])
    }

    const list = async (input: unknown) => {
        const query = operationJobListQuerySchema.parse(input)
        const kind = query.kind
        const status = query.status
        const records = await db.listByKindsAndStatuses({
            limit: query.limit,
            ...(kind === undefined ? {} : { kind }),
            ...(status === undefined ? {} : { status }),
        })
        return operationJobListSchema.parse(records.map(toJob))
    }

    const listEvents = async (jobId: string) => {
        await get(jobId)
        const records = await db.listEventsByJob(jobId)
        return operationJobEventListSchema.parse(
            records.map((record) => ({
                ...record,
                createdAt: record.createdAt.toISOString(),
                detail: record.detail === null ? null : (JSON.parse(record.detail) as unknown),
            })),
        )
    }

    return { cleanupFinished, enqueue, get, list, listEvents, reconcileInterrupted, requestCancel, start, sweepStalled, tick }
}

export type OperationJobService = ReturnType<typeof createOperationJobService>
