import { asc, eq, inArray } from 'drizzle-orm'
import type { ControlDatabase } from '@containers/db-schema/database'
import { deploymentManifest, deploymentSecret } from '@containers/db-schema/schema'
import { createDeploymentSecretService, type DeploymentSecretServiceDb } from '../service/domain/deployment/create-deployment-secret-service'

type ComposeDeploymentSecretDependencies = {
    db: ControlDatabase
    masterSecret: string
}

export const buildDeploymentSecretServiceDb = (db: ControlDatabase): DeploymentSecretServiceDb => ({
    list: async () => db.select().from(deploymentSecret).orderBy(asc(deploymentSecret.reference)),
    findByReference: async (reference) => {
        const [record] = await db.select().from(deploymentSecret).where(eq(deploymentSecret.reference, reference)).limit(1)
        return record
    },
    findById: async (id) => {
        const [record] = await db.select().from(deploymentSecret).where(eq(deploymentSecret.id, id)).limit(1)
        return record
    },
    listManifestSecretReferences: async () =>
        db.select({ id: deploymentManifest.id, secretsJson: deploymentManifest.secretsJson }).from(deploymentManifest),
    findByReferences: async (references) => db.select().from(deploymentSecret).where(inArray(deploymentSecret.reference, references)),
    insert: async (record) => {
        await db.insert(deploymentSecret).values(record)
    },
    update: async (id, values) => {
        await db.update(deploymentSecret).set(values).where(eq(deploymentSecret.id, id))
    },
    delete: async (id) => {
        await db.delete(deploymentSecret).where(eq(deploymentSecret.id, id))
    },
})

export const composeDeploymentSecret = ({ db, masterSecret }: ComposeDeploymentSecretDependencies) => ({
    deploymentSecretService: createDeploymentSecretService({ db: buildDeploymentSecretServiceDb(db), masterSecret, now: () => new Date() }),
})
