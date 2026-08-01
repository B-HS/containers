import { Hono } from 'hono'
import type { NginxConfigService } from '../service/create-nginx-config-service'

type NginxConfigRouteDependencies = {
    nginxConfigService: NginxConfigService
}

export const createNginxConfigRoute = ({ nginxConfigService }: NginxConfigRouteDependencies) =>
    new Hono()
        .get('/nginx/config', async (context) => {
            try {
                return context.json(await nginxConfigService.getState(), 200)
            } catch (error) {
                return context.json({ error: error instanceof Error ? error.message : 'NGINX_CONFIG_READ_FAILED' }, 500)
            }
        })
        .post('/nginx/config/apply', async (context) => {
            try {
                return context.json(await nginxConfigService.apply(await context.req.json()), 200)
            } catch (error) {
                const code = error instanceof Error ? error.message : 'NGINX_CONFIG_APPLY_FAILED'
                return context.json({ error: code }, code === 'NGINX_CONFIG_CONFLICT' ? 409 : 400)
            }
        })
