import { Hono } from 'hono'
import type { EngineQueryService } from '../service/create-engine-query-service'

type EngineQueryRouteDependencies = {
    engineQueryService: EngineQueryService
}

export const createEngineQueryRoute = ({ engineQueryService }: EngineQueryRouteDependencies) =>
    new Hono()
        .get('/system/overview', async (context) => context.json(await engineQueryService.getOverview(), 200))
        .get('/containers', async (context) => context.json(await engineQueryService.getContainers(), 200))
        .get('/containers/:containerId', async (context) => {
            try {
                return context.json(await engineQueryService.getContainer(context.req.param('containerId')), 200)
            } catch (error) {
                return context.json({ error: error instanceof Error ? error.message : 'CONTAINER_INSPECT_FAILED' }, 400)
            }
        })
        .get('/containers/:containerId/logs', async (context) => {
            try {
                return context.json(await engineQueryService.getContainerLogs(context.req.param('containerId'), context.req.query()), 200)
            } catch (error) {
                return context.json({ error: error instanceof Error ? error.message : 'CONTAINER_LOGS_FAILED' }, 400)
            }
        })
        .get('/containers/:containerId/top', async (context) => {
            try {
                return context.json(await engineQueryService.getContainerTop(context.req.param('containerId')), 200)
            } catch (error) {
                return context.json({ error: error instanceof Error ? error.message : 'CONTAINER_TOP_FAILED' }, 400)
            }
        })
        .get('/containers/:containerId/changes', async (context) => {
            try {
                return context.json(await engineQueryService.getContainerChanges(context.req.param('containerId')), 200)
            } catch (error) {
                return context.json({ error: error instanceof Error ? error.message : 'CONTAINER_CHANGES_FAILED' }, 400)
            }
        })
        .post('/containers/:containerId/wait', async (context) => {
            try {
                return context.json(await engineQueryService.waitContainer(context.req.param('containerId'), await context.req.json()), 200)
            } catch (error) {
                return context.json({ error: error instanceof Error ? error.message : 'CONTAINER_WAIT_FAILED' }, 400)
            }
        })
