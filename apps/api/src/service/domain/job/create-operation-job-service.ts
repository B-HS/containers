import { randomUUID } from 'node:crypto'
import { and, asc, desc, eq, inArray, lt, lte, sql } from 'drizzle-orm'
import {
    operationJobEventListSchema,
    operationJobListQuerySchema,
    operationJobListSchema,
    operationJobSchema,
    type OperationJob,
    type OperationJobKind,
} from '@containers/contracts/operation-job'
import type { ControlDatabase } from '@containers/db-schema/database'
import { operationJob, operationJobEvent } from '@containers/db-schema/schema'
import { createAppError } from '../../../lib/app-error'

const ACTIVE_JOB_STATUSES = ['queued', 'running', 'cancelling'] as const
const FINISHED_JOB_STATUSES = ['succeeded', 'failed', 'cancelled'] as const
const DEFAULT_MAX_ATTEMPTS = 3
const POLL_INTERVAL_MS = 1_000
const HEARTBEAT_INTERVAL_MS = 30_000
const RETRY_BACKOFF_MS = 60_000
const FINISHED_RETENTION_MS = 14 * 24 * 60 * 60 * 1_000

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

type OperationJobServiceDependencies = {
    db: ControlDatabase
    handlers: Partial<Record<OperationJobKind, OperationJobHandler>>
    now: () => Date
    onFinished?: (job: OperationJob) => Promise<void>
}

const toJob = (record: typeof operationJob.$inferSelect) =>
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

export const createOperationJobService = ({ db, handlers, now, onFinished }: OperationJobServiceDependencies) => {
    const recordEvent = async (jobId: string, event: string, detail?: Record<string, unknown>) => {
        await db.insert(operationJobEvent).values({
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
        const [record] = await db.select().from(operationJob).where(eq(operationJob.id, id)).limit(1)
        if (!record) {
            throw createAppError('JOB_NOT_FOUND')
        }
        return toJob(record)
    }

    const update = async (id: string, values: Partial<typeof operationJob.$inferInsert>) => {
        await db
            .update(operationJob)
            .set({ ...values, updatedAt: now() })
            .where(eq(operationJob.id, id))
        return get(id)
    }

    const enqueue = async (input: OperationJobEnqueueInput) => {
        if (input.unique || input.uniqueResourceKey !== undefined) {
            const conditions = [
                eq(operationJob.kind, input.kind),
                input.uniqueResourceKey === undefined ? undefined : eq(operationJob.resourceKey, input.uniqueResourceKey),
                inArray(operationJob.status, [...ACTIVE_JOB_STATUSES]),
            ].filter((condition) => condition !== undefined)
            const [active] = await db
                .select()
                .from(operationJob)
                .where(and(...conditions))
                .limit(1)
            if (active) {
                return toJob(active)
            }
        }
        const timestamp = now()
        const id = randomUUID()
        await db.insert(operationJob).values({
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
        const [candidate] = await db
            .select()
            .from(operationJob)
            .where(and(eq(operationJob.status, 'queued'), lte(operationJob.scheduledAt, now())))
            .orderBy(asc(operationJob.scheduledAt), asc(operationJob.createdAt))
            .limit(1)
        if (!candidate) {
            return null
        }
        const claimed = await db
            .update(operationJob)
            .set({
                attempt: candidate.attempt + 1,
                heartbeatAt: now(),
                startedAt: now(),
                status: 'running',
                updatedAt: now(),
            })
            .where(and(eq(operationJob.id, candidate.id), eq(operationJob.status, 'queued')))
            .returning()
        if (claimed.length === 0) {
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
            const succeeded = await update(job.id, {
                failureCode: null,
                finishedAt: now(),
                result: result === null ? null : JSON.stringify(result),
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
        stopWorker = () => {
            clearInterval(interval)
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

    const reconcileInterrupted = async () => {
        const interrupted = await db
            .select()
            .from(operationJob)
            .where(inArray(operationJob.status, ['running', 'cancelling']))
        for (const record of interrupted) {
            const job = toJob(record)
            if (job.status === 'cancelling') {
                await update(job.id, { failureCode: 'JOB_INTERRUPTED', finishedAt: now(), status: 'cancelled' })
                await recordEvent(job.id, 'cancelled', { code: 'JOB_INTERRUPTED' })
                continue
            }
            if (job.attempt < job.maxAttempts) {
                await update(job.id, { scheduledAt: now(), status: 'queued' })
                await recordEvent(job.id, 'interrupted-requeued', { attempt: job.attempt })
                continue
            }
            await update(job.id, { failureCode: 'JOB_INTERRUPTED', finishedAt: now(), status: 'failed' })
            await recordEvent(job.id, 'failed', { code: 'JOB_INTERRUPTED' })
        }
        return interrupted.length
    }

    const cleanupFinished = async () => {
        const threshold = new Date(now().getTime() - FINISHED_RETENTION_MS)
        await db.delete(operationJob).where(and(inArray(operationJob.status, [...FINISHED_JOB_STATUSES]), lt(operationJob.finishedAt, threshold)))
    }

    const list = async (input: unknown) => {
        const query = operationJobListQuerySchema.parse(input)
        const conditions = [
            query.kind === undefined ? undefined : eq(operationJob.kind, query.kind),
            query.status === undefined ? undefined : eq(operationJob.status, query.status),
        ].filter((condition) => condition !== undefined)
        const records = await db
            .select()
            .from(operationJob)
            .where(conditions.length > 0 ? and(...conditions) : undefined)
            .orderBy(desc(operationJob.createdAt))
            .limit(query.limit)
        return operationJobListSchema.parse(records.map(toJob))
    }

    const listEvents = async (jobId: string) => {
        await get(jobId)
        const records = await db
            .select()
            .from(operationJobEvent)
            .where(eq(operationJobEvent.jobId, jobId))
            .orderBy(sql`rowid`)
        return operationJobEventListSchema.parse(
            records.map((record) => ({
                ...record,
                createdAt: record.createdAt.toISOString(),
                detail: record.detail === null ? null : (JSON.parse(record.detail) as unknown),
            })),
        )
    }

    return { cleanupFinished, enqueue, get, list, listEvents, reconcileInterrupted, requestCancel, start, tick }
}

export type OperationJobService = ReturnType<typeof createOperationJobService>
