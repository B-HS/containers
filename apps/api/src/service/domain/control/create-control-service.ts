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
import { registryCredentialDeleteSchema, registryCredentialUpsertSchema } from '@containers/contracts/registry-credential'

type ControlServiceDependencies = {
    engineAgentClient: EngineAgentClient
}

export const createControlService = ({ engineAgentClient }: ControlServiceDependencies) => ({
    createContainer: async (input: unknown) => engineAgentClient.createContainer(containerCreateRequestSchema.parse(input)),
    createNetwork: async (input: unknown) => engineAgentClient.createNetwork(networkCreateRequestSchema.parse(input)),
    createVolume: async (input: unknown) => engineAgentClient.createVolume(volumeCreateRequestSchema.parse(input)),
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
