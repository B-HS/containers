import { Hono } from 'hono'
import { describeRoute, validator } from 'hono-openapi'
import { nginxConfigApplySchema } from '@containers/contracts/nginx'
import type { NginxConfigService } from '../service/create-nginx-config-service'
import { withErrorHandling } from '../lib/with-error-handling'

type NginxConfigRouteDependencies = {
    nginxConfigService: NginxConfigService
}

export const createNginxConfigRoute = ({ nginxConfigService }: NginxConfigRouteDependencies) => {
    const route = new Hono()

    route.get(
        '/nginx/config',
        describeRoute({ tags: ['nginx-config'], summary: 'Nginx 설정 상태 조회', responses: { 200: { description: '설정 상태' } } }),
        withErrorHandling(async (context) => context.json(await nginxConfigService.getState(), 200)),
    )
    route.post(
        '/nginx/config/apply',
        describeRoute({ tags: ['nginx-config'], summary: 'Nginx 설정 적용', responses: { 200: { description: '적용 결과' } } }),
        validator('json', nginxConfigApplySchema),
        withErrorHandling(async (context) => context.json(await nginxConfigService.apply(context.req.valid('json' as never)), 200)),
    )

    return route
}
