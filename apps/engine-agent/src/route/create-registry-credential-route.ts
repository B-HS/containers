import { Hono } from 'hono'
import type { RegistryCredentialService } from '../service/create-registry-credential-service'

type RegistryCredentialRouteDependencies = {
    registryCredentialService: RegistryCredentialService
}

export const createRegistryCredentialRoute = ({ registryCredentialService }: RegistryCredentialRouteDependencies) =>
    new Hono()
        .get('/registry-credentials', async (context) => context.json(await registryCredentialService.list(), 200))
        .post('/registry-credentials', async (context) => {
            try {
                return context.json(await registryCredentialService.upsert(undefined, await context.req.json()), 201)
            } catch (error) {
                return context.json({ error: error instanceof Error ? error.message : 'REGISTRY_CREDENTIAL_FAILED' }, 400)
            }
        })
        .post('/registry-credentials/:credentialId', async (context) => {
            try {
                return context.json(await registryCredentialService.upsert(context.req.param('credentialId'), await context.req.json()), 200)
            } catch (error) {
                return context.json({ error: error instanceof Error ? error.message : 'REGISTRY_CREDENTIAL_FAILED' }, 400)
            }
        })
        .delete('/registry-credentials/:credentialId', async (context) => {
            try {
                return context.json(await registryCredentialService.remove(context.req.param('credentialId'), await context.req.json()), 200)
            } catch (error) {
                const code = error instanceof Error ? error.message : 'REGISTRY_CREDENTIAL_FAILED'
                return context.json({ error: code }, code === 'CONFIRMATION_MISMATCH' ? 409 : 400)
            }
        })
