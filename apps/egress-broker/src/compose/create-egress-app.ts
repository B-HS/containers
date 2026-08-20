import { Hono } from 'hono'
import { SERVICE_STATUS, healthSchema } from '@containers/contracts/health'
import { createInternalAuthMiddleware } from '../middleware/create-internal-auth-middleware'
import { createEgressRoute } from '../route/create-egress-route'
import type { EgressService } from '../service/domain/create-egress-service'

type EgressAppDependencies = {
    egressService: EgressService
    now: () => Date
    sharedSecret: string
}

export const createEgressApp = ({ egressService, now, sharedSecret }: EgressAppDependencies) =>
    new Hono()
        .get('/health', (context) =>
            context.json(
                healthSchema.parse({
                    service: 'egress-broker',
                    status: SERVICE_STATUS.OK,
                    timestamp: now().toISOString(),
                    version: '0.1.0',
                }),
                200,
            ),
        )
        .use('/v1/*', createInternalAuthMiddleware({ now: Date.now, secret: sharedSecret }))
        .route('/v1/egress', createEgressRoute({ egressService }))
