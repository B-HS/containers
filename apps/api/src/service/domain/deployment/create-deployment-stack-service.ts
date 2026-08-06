import { randomUUID } from 'node:crypto'
import { composeStackInputSchema, deploymentStackListSchema, deploymentStackSchema } from '@containers/contracts/deployment-stack'
import { buildImageDigestByReference, convertComposeStack } from '../../../lib/compose-stack'
import { createAppError } from '../../../lib/error'
import type { EngineAgentClient } from '../../../service/shared/engine-agent-client/create-engine-agent-client'
import {
    assertDeploymentManifestPolicy,
    assertManifestIdentityMatches,
    toDeploymentManifestRow,
    type ManifestIdentity,
    type ManifestRow,
} from './deployment-manifest-row'

type StackRow = {
    createdAt: Date
    createdBy: string
    id: string
    manifestIdsJson: string
    name: string
    serviceOrderJson: string
    updatedAt: Date
    version: string
}

type StackIdRecord = {
    id: string
}

type DeploymentStackServiceDb = {
    list: () => Promise<StackRow[]>
    findById: (id: string) => Promise<StackRow | undefined>
    findVersionCollision: (name: string, version: string) => Promise<StackIdRecord | undefined>
    findManifestIdentity: (name: string) => Promise<ManifestIdentity | undefined>
    findManifestVersionCollisions: (names: string[], version: string) => Promise<string[]>
    insertStack: (input: { manifestRows: ManifestRow[]; stack: StackRow }) => Promise<void>
}

type DeploymentStackServiceDependencies = {
    db: DeploymentStackServiceDb
    engineAgentClient: Pick<EngineAgentClient, 'getImages'>
    now: () => Date
    protectedHostnames: () => string[]
    protectedNetworks: string[]
}

export type { DeploymentStackServiceDb, StackRow }

const toStack = (row: StackRow) =>
    deploymentStackSchema.parse({
        createdAt: row.createdAt.toISOString(),
        createdBy: row.createdBy,
        id: row.id,
        manifestIds: JSON.parse(row.manifestIdsJson),
        name: row.name,
        serviceOrder: JSON.parse(row.serviceOrderJson),
        updatedAt: row.updatedAt.toISOString(),
        version: row.version,
    })

export const createDeploymentStackService = ({
    db,
    engineAgentClient,
    now,
    protectedHostnames,
    protectedNetworks,
}: DeploymentStackServiceDependencies) => {
    const preview = async (input: unknown) => {
        const payload = composeStackInputSchema.parse(input)
        const converted = convertComposeStack({
            compose: payload.compose,
            imageDigestByReference: buildImageDigestByReference(await engineAgentClient.getImages()),
            stackName: payload.name,
            stackVersion: payload.version,
        })
        const policy = { protectedHostnames: protectedHostnames(), protectedNetworks }
        for (const plan of converted.services) {
            assertDeploymentManifestPolicy(plan.manifest, policy)
        }
        return { converted, payload }
    }

    return {
        create: async (actorId: string, input: unknown) => {
            const { converted, payload } = await preview(input)
            if ((await db.findVersionCollision(payload.name, payload.version)) !== undefined) {
                throw createAppError('DEPLOYMENT_STACK_VERSION_EXISTS', undefined, { name: payload.name, version: payload.version })
            }
            for (const plan of converted.services) {
                assertManifestIdentityMatches(plan.manifest, await db.findManifestIdentity(plan.manifest.name))
            }
            const collisions = await db.findManifestVersionCollisions(
                converted.services.map((plan) => plan.manifest.name),
                payload.version,
            )
            if (collisions.length > 0) {
                throw createAppError('DEPLOYMENT_MANIFEST_VERSION_EXISTS', undefined, { names: collisions })
            }
            const timestamp = now()
            const manifestRows = converted.services.map((plan) => toDeploymentManifestRow(randomUUID(), actorId, timestamp, plan.manifest))
            const stack: StackRow = {
                createdAt: timestamp,
                createdBy: actorId,
                id: randomUUID(),
                manifestIdsJson: JSON.stringify(manifestRows.map((row) => row.id)),
                name: payload.name,
                serviceOrderJson: JSON.stringify(converted.order),
                updatedAt: timestamp,
                version: payload.version,
            }
            try {
                await db.insertStack({ manifestRows, stack })
            } catch (error) {
                throw createAppError('DEPLOYMENT_STACK_CREATE_FAILED', error)
            }
            return toStack(stack)
        },
        get: async (id: string) => {
            const record = await db.findById(id)
            if (!record) {
                throw createAppError('DEPLOYMENT_STACK_NOT_FOUND')
            }
            return toStack(record)
        },
        list: async () => deploymentStackListSchema.parse((await db.list()).map(toStack)),
        preview: async (input: unknown) => (await preview(input)).converted,
    }
}

export type DeploymentStackService = ReturnType<typeof createDeploymentStackService>
