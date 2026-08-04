import { Hono } from 'hono'
import { describeRoute, validator } from 'hono-openapi'
import { z } from 'zod'
import { registryCredentialDeleteSchema, registryCredentialUpsertSchema } from '@containers/contracts/registry-credential'
import type { RegistryCredentialService } from '../service/domain/create-registry-credential-service'
import { withErrorHandling } from '../lib/with-error-handling'

type RegistryCredentialRouteDependencies = {
    registryCredentialService: RegistryCredentialService
}

const credentialIdParamSchema = z.object({ credentialId: z.uuid() })

export const createRegistryCredentialRoute = ({ registryCredentialService }: RegistryCredentialRouteDependencies) => {
    const route = new Hono()

    route.get(
        '/registry-credentials',
        describeRoute({
            tags: ['registry-credential'],
            summary: '레지스트리 자격 증명 목록 조회',
            responses: { 200: { description: '목록' } },
        }),
        withErrorHandling(async (context) => context.json(await registryCredentialService.list(), 200)),
    )
    route.post(
        '/registry-credentials',
        describeRoute({
            tags: ['registry-credential'],
            summary: '레지스트리 자격 증명 생성',
            responses: { 201: { description: '생성 결과' } },
        }),
        validator('json', registryCredentialUpsertSchema),
        withErrorHandling(async (context) =>
            context.json(await registryCredentialService.upsert(undefined, context.req.valid('json' as never)), 201),
        ),
    )
    route.post(
        '/registry-credentials/:credentialId',
        describeRoute({
            tags: ['registry-credential'],
            summary: '레지스트리 자격 증명 갱신',
            responses: { 200: { description: '갱신 결과' } },
        }),
        validator('param', credentialIdParamSchema),
        validator('json', registryCredentialUpsertSchema),
        withErrorHandling(async (context) =>
            context.json(
                await registryCredentialService.upsert(
                    (context.req.valid('param' as never) as { credentialId: string }).credentialId,
                    context.req.valid('json' as never),
                ),
                200,
            ),
        ),
    )
    route.delete(
        '/registry-credentials/:credentialId',
        describeRoute({
            tags: ['registry-credential'],
            summary: '레지스트리 자격 증명 삭제',
            responses: { 200: { description: '삭제 결과' } },
        }),
        validator('param', credentialIdParamSchema),
        validator('json', registryCredentialDeleteSchema),
        withErrorHandling(async (context) =>
            context.json(
                await registryCredentialService.remove(
                    (context.req.valid('param' as never) as { credentialId: string }).credentialId,
                    context.req.valid('json' as never),
                ),
                200,
            ),
        ),
    )

    return route
}
