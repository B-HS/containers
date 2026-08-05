import { and, asc, desc, eq, inArray, isNull, lt, lte, or, sql } from 'drizzle-orm'
import type { ControlDatabase } from '@containers/db-schema/database'
import { operationJob, operationJobEvent } from '@containers/db-schema/schema'
import type { OperationJob, OperationJobKind } from '@containers/contracts/operation-job'
import { createOperationJobService, type OperationJobHandler, type OperationJobServiceDb } from '../service/domain/job/create-operation-job-service'

type ComposeOperationJobDependencies = {
    db: ControlDatabase
    handlers: Partial<Record<OperationJobKind, OperationJobHandler>>
    onFinished?: (job: OperationJob) => Promise<void>
    workerId: string
}

export const buildOperationJobServiceDb = (db: ControlDatabase): OperationJobServiceDb => ({
    findById: async (id) => {
        const [record] = await db.select().from(operationJob).where(eq(operationJob.id, id)).limit(1)
        return record
    },
    insert: async (record) => {
        await db.insert(operationJob).values(record)
    },
    insertEvent: async (record) => {
        await db.insert(operationJobEvent).values(record)
    },
    listByKindsAndStatuses: async (input) => {
        const conditions = [
            input.kind === undefined ? undefined : eq(operationJob.kind, input.kind),
            input.status === undefined ? undefined : eq(operationJob.status, input.status),
        ].filter((condition) => condition !== undefined)
        return db
            .select()
            .from(operationJob)
            .where(conditions.length > 0 ? and(...conditions) : undefined)
            .orderBy(desc(operationJob.createdAt))
            .limit(input.limit)
    },
    listEventsByJob: async (jobId) =>
        db
            .select()
            .from(operationJobEvent)
            .where(eq(operationJobEvent.jobId, jobId))
            .orderBy(sql`rowid`),
    findActiveByKind: async (input) => {
        const conditions = [
            eq(operationJob.kind, input.kind),
            input.resourceKey === undefined ? undefined : eq(operationJob.resourceKey, input.resourceKey),
            inArray(operationJob.status, ['queued', 'running', 'cancelling']),
        ].filter((condition) => condition !== undefined)
        const [record] = await db
            .select()
            .from(operationJob)
            .where(and(...conditions))
            .limit(1)
        return record
    },
    claimNext: async (now) => {
        const [record] = await db
            .select()
            .from(operationJob)
            .where(and(eq(operationJob.status, 'queued'), lte(operationJob.scheduledAt, now)))
            .orderBy(asc(operationJob.scheduledAt), asc(operationJob.createdAt))
            .limit(1)
        return record
    },
    claim: async (id, values) => {
        const [record] = await db
            .update(operationJob)
            .set(values)
            .where(and(eq(operationJob.id, id), eq(operationJob.status, 'queued')))
            .returning()
        return record
    },
    update: async (id, values) => {
        await db.update(operationJob).set(values).where(eq(operationJob.id, id))
    },
    listInterrupted: async (workerId) =>
        db
            .select()
            .from(operationJob)
            .where(
                and(inArray(operationJob.status, ['running', 'cancelling']), or(isNull(operationJob.workerId), eq(operationJob.workerId, workerId))),
            ),
    listStalled: async (heartbeatBefore) =>
        db
            .select()
            .from(operationJob)
            .where(
                and(
                    inArray(operationJob.status, ['running', 'cancelling']),
                    or(isNull(operationJob.heartbeatAt), lt(operationJob.heartbeatAt, heartbeatBefore)),
                ),
            ),
    deleteFinishedBefore: async (threshold, statuses) => {
        await db.delete(operationJob).where(and(inArray(operationJob.status, statuses), lt(operationJob.finishedAt, threshold)))
    },
})

export const composeOperationJob = ({ db, handlers, onFinished, workerId }: ComposeOperationJobDependencies) => ({
    operationJobService: createOperationJobService({
        db: buildOperationJobServiceDb(db),
        handlers,
        now: () => new Date(),
        workerId,
        ...(onFinished === undefined ? {} : { onFinished }),
    }),
})
