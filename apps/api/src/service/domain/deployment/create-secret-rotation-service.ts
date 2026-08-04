import { appendKeyVersion, type SecretKeyring } from '@containers/config/keyring'
import { secretRotateJobResultSchema } from '@containers/contracts/operation-job'
import type { DeploymentSecretService } from './create-deployment-secret-service'
import type { NotificationDestinationService } from '../notification/create-notification-destination-service'

type SecretKeyringFiles = {
    deployment: string
    notification: string
}

type SecretRotationServiceDependencies = {
    deploymentKeyring: SecretKeyring
    deploymentSecretService: Pick<DeploymentSecretService, 'rotate'>
    keyringFiles: SecretKeyringFiles
    notificationDestinationService: Pick<NotificationDestinationService, 'rotate'>
    notificationKeyring: SecretKeyring
}

export const createSecretRotationService = ({
    deploymentKeyring,
    deploymentSecretService,
    keyringFiles,
    notificationDestinationService,
    notificationKeyring,
}: SecretRotationServiceDependencies) => {
    let deployment = deploymentKeyring
    let notification = notificationKeyring

    return {
        getState: () => ({
            deploymentKeyVersion: deployment.activeVersion,
            notificationKeyVersion: notification.activeVersion,
        }),
        rotate: async () => {
            deployment = await appendKeyVersion(keyringFiles.deployment, deployment)
            const deploymentResult = await deploymentSecretService.rotate(deployment)
            notification = await appendKeyVersion(keyringFiles.notification, notification)
            const notificationResult = await notificationDestinationService.rotate(notification)
            return secretRotateJobResultSchema.parse({
                deploymentKeyVersion: deploymentResult.keyVersion,
                deploymentRotatedCount: deploymentResult.rotatedCount,
                notificationKeyVersion: notificationResult.keyVersion,
                notificationRotatedCount: notificationResult.rotatedCount,
            })
        },
    }
}

export type SecretRotationService = ReturnType<typeof createSecretRotationService>
