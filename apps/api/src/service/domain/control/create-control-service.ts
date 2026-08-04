import {
    containerActionSchema,
    containerCreateRequestSchema,
    containerExecRequestSchema,
    containerWaitRequestSchema,
    dockerResourceRemoveRequestSchema,
    imageRemoveRequestSchema,
    imageTagRequestSchema,
    networkCreateRequestSchema,
    prunePreviewRequestSchema,
    volumeCreateRequestSchema,
} from '@containers/contracts/engine-control'
import type { EngineAgentClient } from '../../../agent/create-engine-agent-client'
import { createAppError } from '../../../lib/error'
import { registryCredentialDeleteSchema, registryCredentialUpsertSchema } from '@containers/contracts/registry-credential'

const PROTECTED_NETWORKS = ['containers_control', 'containers_ingress', 'containers_probe']
const PROTECTED_VOLUMES = [
    'containers_agent-credentials',
    'containers_artifacts',
    'containers_backups',
    'containers_control-data',
    'containers_nginx-config',
    'containers_nginx-logs',
    'containers_registry-credentials',
    'containers_traffic-credentials',
    'containers_traffic-data',
]

type ControlServiceDependencies = {
    engineAgentClient: EngineAgentClient
}

export const createControlService = ({ engineAgentClient }: ControlServiceDependencies) => ({
    createContainer: async (input: unknown) => {
        const container = containerCreateRequestSchema.parse(input)
        if (container.network === 'host' || container.network === 'none' || PROTECTED_NETWORKS.includes(container.network)) {
            throw createAppError('MANAGEMENT_NETWORK_PROTECTED')
        }
        if (container.volumes.some((volume) => PROTECTED_VOLUMES.includes(volume.name))) {
            throw createAppError('MANAGEMENT_VOLUME_PROTECTED')
        }
        return engineAgentClient.createContainer(container)
    },
    createNetwork: async (input: unknown) => {
        const payload = networkCreateRequestSchema.parse(input)
        if (PROTECTED_NETWORKS.includes(payload.name)) {
            throw createAppError('MANAGEMENT_NETWORK_PROTECTED')
        }
        return engineAgentClient.createNetwork(payload)
    },
    createVolume: async (input: unknown) => {
        const payload = volumeCreateRequestSchema.parse(input)
        if (PROTECTED_VOLUMES.includes(payload.name)) {
            throw createAppError('MANAGEMENT_VOLUME_PROTECTED')
        }
        return engineAgentClient.createVolume(payload)
    },
    executeContainer: async (containerId: string, input: unknown) =>
        engineAgentClient.executeContainer(containerId, containerExecRequestSchema.parse(input)),
    getContainerChanges: async (containerId: string) => engineAgentClient.changesContainer(containerId),
    getContainerTop: async (containerId: string) => engineAgentClient.topContainer(containerId),
    getImages: async () => engineAgentClient.getImages(),
    getImageRemovalImpact: async (imageId: string) => engineAgentClient.getImageRemovalImpact(imageId),
    getNetworks: async () => engineAgentClient.getNetworks(),
    getVolumes: async () => engineAgentClient.getVolumes(),
    getPrunePreview: async (input: unknown) => engineAgentClient.getPrunePreview(prunePreviewRequestSchema.parse(input)),
    getRegistryCredentials: async () => engineAgentClient.getRegistryCredentials(),
    performContainerAction: async (containerId: string, input: unknown) => {
        const action = containerActionSchema.parse(input)
        return engineAgentClient.performContainerAction(containerId, action)
    },
    removeImage: async (imageId: string, input: unknown) => engineAgentClient.removeImage(imageId, imageRemoveRequestSchema.parse(input)),
    removeNetwork: async (networkId: string, input: unknown) =>
        engineAgentClient.removeNetwork(networkId, dockerResourceRemoveRequestSchema.parse(input)),
    removeRegistryCredential: async (credentialId: string, input: unknown) =>
        engineAgentClient.removeRegistryCredential(credentialId, registryCredentialDeleteSchema.parse(input)),
    removeVolume: async (volumeName: string, input: unknown) =>
        engineAgentClient.removeVolume(volumeName, dockerResourceRemoveRequestSchema.parse(input)),
    tagImage: async (imageId: string, input: unknown) => engineAgentClient.tagImage(imageId, imageTagRequestSchema.parse(input)),
    upsertRegistryCredential: async (credentialId: string | undefined, input: unknown) =>
        engineAgentClient.upsertRegistryCredential(credentialId, registryCredentialUpsertSchema.parse(input)),
    waitContainer: async (containerId: string, input: unknown) =>
        engineAgentClient.waitContainer(containerId, containerWaitRequestSchema.parse(input)),
})

export type ControlService = ReturnType<typeof createControlService>
