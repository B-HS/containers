import { describe, expect, test } from 'bun:test'
import type { DeploymentRelease } from '@containers/contracts/deployment'
import type { DeploymentStack } from '@containers/contracts/deployment-stack'
import { createAppError, isAppError } from '../../../lib/error'
import { createDeploymentStackReleaseService, type DeploymentStackReleaseServiceDb } from './create-deployment-stack-release-service'

const TIMESTAMP = new Date('2026-08-06T00:00:00.000Z')
const ACTOR_ID = 'user-owner'
const STACK_ID = '11111111-1111-4111-8111-111111111111'
const MANIFEST_IDS = ['22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333']
const RELEASE_IDS = ['55555555-5555-4555-8555-555555555555', '66666666-6666-4666-8666-666666666666']
const PREVIOUS_RELEASE_ID = '77777777-7777-4777-8777-777777777777'

const STACK: DeploymentStack = {
    createdAt: TIMESTAMP.toISOString(),
    createdBy: ACTOR_ID,
    id: STACK_ID,
    manifestIds: MANIFEST_IDS,
    name: 'shop',
    serviceOrder: ['db', 'app'],
    updatedAt: TIMESTAMP.toISOString(),
    version: '1.0.0',
}

const createRelease = (overrides: Partial<DeploymentRelease> = {}): DeploymentRelease => ({
    activatedAt: null,
    containerId: 'container-id',
    containerName: 'shop-db-1-0-0-abcdef12',
    createdAt: TIMESTAMP.toISOString(),
    createdBy: ACTOR_ID,
    failureCode: null,
    finishedAt: null,
    id: '44444444-4444-4444-8444-444444444444',
    manifestId: MANIFEST_IDS[0] ?? '',
    nginxConfigSha256: null,
    nginxRouteId: null,
    previousReleaseId: null,
    status: 'healthy',
    updatedAt: TIMESTAMP.toISOString(),
    ...overrides,
})

const createMemoryDb = () => {
    const rows = new Map<string, Parameters<DeploymentStackReleaseServiceDb['insert']>[0] & { failureCode: string | null; finishedAt: Date | null }>()
    const db: DeploymentStackReleaseServiceDb = {
        findActiveByStack: async (stackId, statuses) =>
            [...rows.values()].filter((row) => row.stackId === stackId && statuses.includes(row.status)).map((row) => ({ id: row.id }))[0],
        findById: async (id) => rows.get(id),
        insert: async (record) => {
            rows.set(record.id, { ...record, failureCode: null, finishedAt: null })
        },
        list: async () => [...rows.values()],
        listByStatuses: async (statuses) => [...rows.values()].filter((row) => statuses.includes(row.status)),
        update: async (id, values) => {
            const row = rows.get(id)
            if (!row) throw createAppError('DEPLOYMENT_STACK_RELEASE_NOT_FOUND')
            rows.set(id, { ...row, ...values })
        },
    }
    return { db, rows }
}

type ReleaseBehavior = {
    createdReleases: DeploymentRelease[]
    reverted: string[]
    rolledBack: string[]
    runOutcomes: DeploymentRelease['status'][]
}

type ReleaseServiceOptions = {
    hasPrevious?: boolean
    rollbackFails?: boolean
}

const createReleaseService = (behavior: ReleaseBehavior, options: ReleaseServiceOptions = {}) => {
    const releasesById = new Map<string, DeploymentRelease>()
    let created = 0
    return {
        create: async (_actorId: string, manifestId: string) => {
            const previousReleaseId = options.hasPrevious === true || created > 0 ? PREVIOUS_RELEASE_ID : null
            const release = createRelease({ id: RELEASE_IDS[created] ?? '', manifestId, previousReleaseId })
            created += 1
            behavior.createdReleases.push(release)
            releasesById.set(release.id, release)
            return release
        },
        get: async (id: string) => releasesById.get(id) ?? createRelease({ id }),
        prepareRollback: async (id: string) => releasesById.get(id) ?? createRelease({ id, status: 'rolling-back' }),
        revert: async (id: string) => {
            behavior.reverted.push(id)
            return createRelease({ id, status: 'rolled-back' })
        },
        run: async (id: string) => {
            const outcome = behavior.runOutcomes[behavior.createdReleases.findIndex((release) => release.id === id)] ?? 'healthy'
            return createRelease({ failureCode: outcome === 'healthy' ? null : 'DEPLOYMENT_HEALTHCHECK_FAILED', id, status: outcome })
        },
        runRollback: async (id: string) => {
            behavior.rolledBack.push(id)
            return createRelease({ id, status: options.rollbackFails === true ? 'healthy' : 'rolled-back' })
        },
    }
}

const createTestContext = (runOutcomes: DeploymentRelease['status'][], options: ReleaseServiceOptions = {}) => {
    const behavior: ReleaseBehavior = { createdReleases: [], reverted: [], rolledBack: [], runOutcomes }
    const { db, rows } = createMemoryDb()
    const service = createDeploymentStackReleaseService({
        db,
        deploymentReleaseService: createReleaseService(behavior, options),
        deploymentStackService: { get: async () => STACK },
        now: () => TIMESTAMP,
    })
    return { behavior, rows, service }
}

const captureCode = async (execute: () => Promise<unknown>) => {
    try {
        await execute()
        return null
    } catch (error) {
        return isAppError(error) ? error.code : 'UNKNOWN'
    }
}

describe('compose 스택 릴리스 서비스', () => {
    test('serviceOrder 순서대로 릴리스하고 전부 healthy 면 스택도 healthy 다', async () => {
        const { behavior, service } = createTestContext(['healthy', 'healthy'])
        const created = await service.create(ACTOR_ID, STACK_ID)
        const finished = await service.run(created.id)

        expect(behavior.createdReleases.map((release) => release.manifestId)).toEqual(MANIFEST_IDS)
        expect(finished.status).toBe('healthy')
        expect(finished.releaseIds).toEqual(RELEASE_IDS)
        expect(finished.finishedAt).toBe(TIMESTAMP.toISOString())
    })

    test('두 번째 서비스가 실패하면 첫 서비스를 역순으로 되돌린다', async () => {
        const { behavior, service } = createTestContext(['healthy', 'failed'])
        const created = await service.create(ACTOR_ID, STACK_ID)
        const finished = await service.run(created.id)

        expect(behavior.reverted).toEqual(RELEASE_IDS.slice(0, 1))
        expect(behavior.rolledBack).toEqual([])
        expect(finished.status).toBe('rolled-back')
        expect(finished.failureCode).toBe('DEPLOYMENT_HEALTHCHECK_FAILED')
        expect(finished.releaseIds).toEqual(RELEASE_IDS)
    })

    test('이전 버전이 있는 서비스는 되돌리기로 이전 릴리스를 복구한다', async () => {
        const { behavior, service } = createTestContext(['healthy', 'failed'], { hasPrevious: true })
        const created = await service.create(ACTOR_ID, STACK_ID)
        const finished = await service.run(created.id)

        expect(behavior.rolledBack).toEqual(RELEASE_IDS.slice(0, 1))
        expect(behavior.reverted).toEqual([])
        expect(finished.status).toBe('rolled-back')
    })

    test('되돌리기가 실패하면 rolled-back 이 아니라 failed 다', async () => {
        const { service } = createTestContext(['healthy', 'failed'], { hasPrevious: true, rollbackFails: true })
        const created = await service.create(ACTOR_ID, STACK_ID)
        const finished = await service.run(created.id)

        expect(finished.status).toBe('failed')
    })

    test('첫 서비스가 실패하면 되돌릴 것이 없다', async () => {
        const { behavior, service } = createTestContext(['failed', 'healthy'])
        const created = await service.create(ACTOR_ID, STACK_ID)
        const finished = await service.run(created.id)

        expect(behavior.createdReleases).toHaveLength(1)
        expect(behavior.reverted).toEqual([])
        expect(finished.status).toBe('rolled-back')
    })

    test('같은 스택의 배포가 진행 중이면 새 배포를 거부한다', async () => {
        const { service } = createTestContext(['healthy', 'healthy'])
        await service.create(ACTOR_ID, STACK_ID)

        expect(await captureCode(() => service.create(ACTOR_ID, STACK_ID))).toBe('DEPLOYMENT_STACK_RELEASE_IN_PROGRESS')
    })

    test('releasing 이 아닌 배포는 실행하지 않는다', async () => {
        const { service } = createTestContext(['healthy', 'healthy'])
        const created = await service.create(ACTOR_ID, STACK_ID)
        await service.run(created.id)

        expect(await captureCode(() => service.run(created.id))).toBe('DEPLOYMENT_RELEASE_STATE_INVALID')
    })

    test('중단된 배포는 재기동 시 failed 로 수렴한다', async () => {
        const { service } = createTestContext(['healthy', 'healthy'])
        const created = await service.create(ACTOR_ID, STACK_ID)
        const reconciled = await service.reconcileInterrupted()

        expect(reconciled).toEqual([created.id])
        expect((await service.get(created.id)).status).toBe('failed')
        expect((await service.get(created.id)).failureCode).toBe('DEPLOYMENT_STACK_RELEASE_INTERRUPTED')
    })
})
