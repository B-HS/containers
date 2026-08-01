import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { eq } from 'drizzle-orm'
import { createControlDatabase } from '@containers/db-schema/database'
import { operationJob } from '@containers/db-schema/schema'
import { createAppError } from '../../../lib/app-error'
import { createOperationJobService, type OperationJobHandler } from './create-operation-job-service'

const temporaryDirectories: string[] = []

afterEach(async () => {
    await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })))
})

const createTestContext = async (handler: OperationJobHandler) => {
    const directory = await mkdtemp(join(tmpdir(), 'containers-job-'))
    temporaryDirectories.push(directory)
    const database = createControlDatabase({
        filePath: join(directory, 'control.sqlite'),
        migrationsFolder: resolve(process.cwd(), 'packages/db-schema/drizzle'),
    })
    const clock = { value: Date.parse('2026-08-01T00:00:00.000Z') }
    const service = createOperationJobService({
        db: database.db,
        handlers: { 'backup.create': handler },
        now: () => new Date(clock.value),
    })
    return { clock, database, service }
}

describe('operation job 서비스', () => {
    test('큐 등록부터 성공까지 상태·결과·이벤트를 영속화합니다', async () => {
        const { service } = await createTestContext(async ({ reportProgress }) => {
            await reportProgress('snapshot')
            return { backupId: 'backup-1' }
        })
        const queued = await service.enqueue({ kind: 'backup.create', payload: { label: 'automatic' } })
        expect(queued.status).toBe('queued')
        expect(queued.attempt).toBe(0)

        await service.tick()

        const finished = await service.get(queued.id)
        expect(finished.status).toBe('succeeded')
        expect(finished.attempt).toBe(1)
        expect(finished.result).toEqual({ backupId: 'backup-1' })
        expect(finished.progressStep).toBe('snapshot')
        expect(finished.finishedAt).not.toBeNull()
        expect((await service.listEvents(queued.id)).map((event) => event.event)).toEqual(['queued', 'started', 'progress', 'succeeded'])
    })

    test('unique 등록은 활성 job 이 있으면 새로 만들지 않습니다', async () => {
        const { service } = await createTestContext(async () => null)
        const first = await service.enqueue({ kind: 'backup.create', payload: {}, unique: true })
        const second = await service.enqueue({ kind: 'backup.create', payload: {}, unique: true })

        expect(second.id).toBe(first.id)
        expect(await service.list({})).toHaveLength(1)
    })

    test('실패하면 backoff 후 재시도하고 최대 횟수를 넘으면 실패로 확정합니다', async () => {
        const attempts = { value: 0 }
        const { clock, service } = await createTestContext(async () => {
            attempts.value += 1
            throw createAppError('BACKUP_CONTROL_INVALID')
        })
        const job = await service.enqueue({ kind: 'backup.create', maxAttempts: 2, payload: {} })

        await service.tick()
        const retried = await service.get(job.id)
        expect(retried.status).toBe('queued')
        expect(retried.failureCode).toBe('BACKUP_CONTROL_INVALID')

        await service.tick()
        expect((await service.get(job.id)).status).toBe('queued')
        expect(attempts.value).toBe(1)

        clock.value += 61_000
        await service.tick()
        const failed = await service.get(job.id)
        expect(failed.status).toBe('failed')
        expect(failed.attempt).toBe(2)
        expect(attempts.value).toBe(2)
        expect((await service.listEvents(job.id)).map((event) => event.event)).toEqual(['queued', 'started', 'retry-scheduled', 'started', 'failed'])
    })

    test('대기 중 취소는 즉시 cancelled 로 종결합니다', async () => {
        const { service } = await createTestContext(async () => null)
        const job = await service.enqueue({ kind: 'backup.create', payload: {} })

        const cancelled = await service.requestCancel(job.id)
        expect(cancelled.status).toBe('cancelled')
        expect(cancelled.finishedAt).not.toBeNull()

        await service.tick()
        expect((await service.get(job.id)).status).toBe('cancelled')
        await expect(service.requestCancel(job.id)).rejects.toThrow('JOB_ALREADY_FINISHED')
    })

    test('실행 중 협조 취소는 handler 확인 후 cancelled 로 종결합니다', async () => {
        const holder: { service?: Awaited<ReturnType<typeof createTestContext>>['service'] } = {}
        const context = await createTestContext(async ({ isCancelRequested, job }) => {
            await holder.service?.requestCancel(job.id)
            if (await isCancelRequested()) {
                throw createAppError('JOB_CANCELLED')
            }
            return null
        })
        holder.service = context.service
        const job = await context.service.enqueue({ kind: 'backup.create', payload: {} })

        await context.service.tick()

        const cancelled = await context.service.get(job.id)
        expect(cancelled.status).toBe('cancelled')
        expect(cancelled.failureCode).toBeNull()
        expect((await context.service.listEvents(job.id)).map((event) => event.event)).toContain('cancel-requested')
    })

    test('중단된 running job 은 재큐하고 소진된 job 은 실패로 확정합니다', async () => {
        const { database, service } = await createTestContext(async () => null)
        const retryable = await service.enqueue({ kind: 'backup.create', payload: {} })
        const exhausted = await service.enqueue({ kind: 'backup.create', maxAttempts: 1, payload: {} })
        await database.db.update(operationJob).set({ attempt: 1, status: 'running' }).where(eq(operationJob.id, retryable.id))
        await database.db.update(operationJob).set({ attempt: 1, status: 'running' }).where(eq(operationJob.id, exhausted.id))

        expect(await service.reconcileInterrupted()).toBe(2)
        expect((await service.get(retryable.id)).status).toBe('queued')
        const failedJob = await service.get(exhausted.id)
        expect(failedJob.status).toBe('failed')
        expect(failedJob.failureCode).toBe('JOB_INTERRUPTED')
    })

    test('보존 기간이 지난 종결 job 을 정리합니다', async () => {
        const { clock, service } = await createTestContext(async () => null)
        const job = await service.enqueue({ kind: 'backup.create', payload: {} })
        await service.tick()
        expect((await service.get(job.id)).status).toBe('succeeded')

        clock.value += 15 * 24 * 60 * 60 * 1_000
        await service.cleanupFinished()

        await expect(service.get(job.id)).rejects.toThrow('JOB_NOT_FOUND')
        expect(await service.list({})).toHaveLength(0)
    })
})
