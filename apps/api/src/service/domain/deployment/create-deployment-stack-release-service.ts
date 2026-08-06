import { randomUUID } from 'node:crypto'
import {
    DEPLOYMENT_STACK_RELEASE_STATUS,
    deploymentStackReleaseListSchema,
    deploymentStackReleaseSchema,
    type DeploymentStackRelease,
} from '@containers/contracts/deployment-stack'
import { createAppError } from '../../../lib/error'
import type { DeploymentReleaseRunOptions, DeploymentReleaseService } from './create-deployment-release-service'
import type { DeploymentStackService } from './create-deployment-stack-service'

const ACTIVE_STACK_RELEASE_STATUSES = [DEPLOYMENT_STACK_RELEASE_STATUS.RELEASING] as const
const INTERRUPTED_FAILURE_CODE = 'DEPLOYMENT_STACK_RELEASE_INTERRUPTED'

type StackReleaseRow = {
    createdAt: Date
    createdBy: string | null
    failureCode: string | null
    finishedAt: Date | null
    id: string
    releaseIdsJson: string
    stackId: string
    status: DeploymentStackRelease['status']
    updatedAt: Date
}

type StackReleaseUpdateValues = Partial<{
    failureCode: string | null
    finishedAt: Date
    releaseIdsJson: string
    status: DeploymentStackRelease['status']
    updatedAt: Date
}>

type StackReleaseIdRecord = {
    id: string
}

type DeploymentStackReleaseServiceDb = {
    list: () => Promise<StackReleaseRow[]>
    listByStatuses: (statuses: DeploymentStackRelease['status'][]) => Promise<StackReleaseRow[]>
    findById: (id: string) => Promise<StackReleaseRow | undefined>
    findActiveByStack: (stackId: string, statuses: DeploymentStackRelease['status'][]) => Promise<StackReleaseIdRecord | undefined>
    insert: (record: Omit<StackReleaseRow, 'failureCode' | 'finishedAt'>) => Promise<void>
    update: (id: string, values: StackReleaseUpdateValues) => Promise<void>
}

type DeploymentStackReleaseServiceDependencies = {
    db: DeploymentStackReleaseServiceDb
    deploymentReleaseService: Pick<DeploymentReleaseService, 'create' | 'get' | 'prepareRollback' | 'revert' | 'run' | 'runRollback'>
    deploymentStackService: Pick<DeploymentStackService, 'get'>
    now: () => Date
}

export type { DeploymentStackReleaseServiceDb }

const toStackRelease = (row: StackReleaseRow) =>
    deploymentStackReleaseSchema.parse({
        createdAt: row.createdAt.toISOString(),
        createdBy: row.createdBy,
        failureCode: row.failureCode,
        finishedAt: row.finishedAt?.toISOString() ?? null,
        id: row.id,
        releaseIds: JSON.parse(row.releaseIdsJson),
        stackId: row.stackId,
        status: row.status,
        updatedAt: row.updatedAt.toISOString(),
    })

export const createDeploymentStackReleaseService = ({
    db,
    deploymentReleaseService,
    deploymentStackService,
    now,
}: DeploymentStackReleaseServiceDependencies) => {
    const get = async (id: string) => {
        const record = await db.findById(id)
        if (!record) {
            throw createAppError('DEPLOYMENT_STACK_RELEASE_NOT_FOUND')
        }
        return toStackRelease(record)
    }
    const update = async (id: string, values: Omit<StackReleaseUpdateValues, 'updatedAt'>) => {
        await db.update(id, { ...values, updatedAt: now() })
        return get(id)
    }
    const rollbackReleases = async (releaseIds: string[]) => {
        let reverted = true
        for (const releaseId of [...releaseIds].reverse()) {
            try {
                const release = await deploymentReleaseService.get(releaseId)
                if (release.previousReleaseId === null) {
                    await deploymentReleaseService.revert(releaseId)
                    continue
                }
                await deploymentReleaseService.prepareRollback(releaseId)
                const rolledBack = await deploymentReleaseService.runRollback(releaseId)
                if (rolledBack.status !== 'rolled-back') {
                    reverted = false
                }
            } catch {
                reverted = false
            }
        }
        return reverted
    }

    return {
        create: async (actorId: string, stackId: string) => {
            const stack = await deploymentStackService.get(stackId)
            const active = await db.findActiveByStack(stack.id, [...ACTIVE_STACK_RELEASE_STATUSES])
            if (active) {
                throw createAppError('DEPLOYMENT_STACK_RELEASE_IN_PROGRESS')
            }
            const timestamp = now()
            const id = randomUUID()
            await db.insert({
                createdAt: timestamp,
                createdBy: actorId,
                id,
                releaseIdsJson: JSON.stringify([]),
                stackId: stack.id,
                status: DEPLOYMENT_STACK_RELEASE_STATUS.RELEASING,
                updatedAt: timestamp,
            })
            return get(id)
        },
        get,
        list: async () => deploymentStackReleaseListSchema.parse((await db.list()).map(toStackRelease)),
        reconcileInterrupted: async () => {
            const interrupted = (await db.listByStatuses([...ACTIVE_STACK_RELEASE_STATUSES])).map(toStackRelease)
            for (const stackRelease of interrupted) {
                await update(stackRelease.id, {
                    failureCode: INTERRUPTED_FAILURE_CODE,
                    finishedAt: now(),
                    status: DEPLOYMENT_STACK_RELEASE_STATUS.FAILED,
                })
            }
            return interrupted.map((stackRelease) => stackRelease.id)
        },
        run: async (id: string, options: DeploymentReleaseRunOptions = {}) => {
            const stackRelease = await get(id)
            if (stackRelease.status !== DEPLOYMENT_STACK_RELEASE_STATUS.RELEASING) {
                throw createAppError('DEPLOYMENT_RELEASE_STATE_INVALID')
            }
            const stack = await deploymentStackService.get(stackRelease.stackId)
            const startedReleaseIds: string[] = []

            for (const manifestId of stack.manifestIds) {
                if (stackRelease.createdBy === null) {
                    throw createAppError('DEPLOYMENT_STACK_RELEASE_ACTOR_MISSING')
                }
                const release = await deploymentReleaseService.create(stackRelease.createdBy, manifestId)
                startedReleaseIds.push(release.id)
                await update(id, { releaseIdsJson: JSON.stringify(startedReleaseIds) })
                const result = await deploymentReleaseService.run(release.id, options)
                if (result.status === 'healthy') {
                    continue
                }
                const reverted = await rollbackReleases(startedReleaseIds.slice(0, -1))
                return update(id, {
                    failureCode: result.failureCode ?? 'DEPLOYMENT_RELEASE_FAILED',
                    finishedAt: now(),
                    status: reverted ? DEPLOYMENT_STACK_RELEASE_STATUS.ROLLED_BACK : DEPLOYMENT_STACK_RELEASE_STATUS.FAILED,
                })
            }

            return update(id, { finishedAt: now(), status: DEPLOYMENT_STACK_RELEASE_STATUS.HEALTHY })
        },
    }
}

export type DeploymentStackReleaseService = ReturnType<typeof createDeploymentStackReleaseService>
