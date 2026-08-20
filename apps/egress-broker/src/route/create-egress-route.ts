import { Hono } from 'hono'
import { successResponse } from '../lib/response'
import { withErrorHandling } from '../lib/with-error-handling'
import type { EgressService } from '../service/domain/create-egress-service'

type EgressRouteDependencies = {
    egressService: EgressService
}

export const createEgressRoute = ({ egressService }: EgressRouteDependencies) =>
    new Hono()
        .post(
            '/resolve',
            withErrorHandling(async (context) => context.json(successResponse(await egressService.resolve(await context.req.json())), 200)),
        )
        .post(
            '/webhook',
            withErrorHandling(async (context) => context.json(successResponse(await egressService.deliverWebhook(await context.req.json())), 200)),
        )
