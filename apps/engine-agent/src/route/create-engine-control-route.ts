import { Hono } from 'hono'
import type { EngineControlService } from '../service/create-engine-control-service'

type EngineControlRouteDependencies = {
    engineControlService: EngineControlService
}

export const createEngineControlRoute = ({ engineControlService }: EngineControlRouteDependencies) =>
    new Hono()
        .post('/containers', async (context) => {
            try {
                return context.json(await engineControlService.createContainer(await context.req.json()), 201)
            } catch (error) {
                return context.json({ error: error instanceof Error ? error.message : 'CONTROL_FAILED' }, 400)
            }
        })
        .get('/images', async (context) => context.json(await engineControlService.getImages(), 200))
        .get('/images/:imageId/removal-impact', async (context) => {
            try {
                return context.json(await engineControlService.getImageRemovalImpact(context.req.param('imageId')), 200)
            } catch (error) {
                return context.json({ error: error instanceof Error ? error.message : 'IMAGE_IMPACT_FAILED' }, 400)
            }
        })
        .get('/networks', async (context) => context.json(await engineControlService.getNetworks(), 200))
        .get('/volumes', async (context) => context.json(await engineControlService.getVolumes(), 200))
        .get('/system/prune-preview', async (context) => {
            try {
                return context.json(
                    await engineControlService.getPrunePreview({ includeVolumes: context.req.query('includeVolumes') === 'true' }),
                    200,
                )
            } catch (error) {
                return context.json({ error: error instanceof Error ? error.message : 'PRUNE_PREVIEW_FAILED' }, 400)
            }
        })
        .post('/system/prune-build-cache', async (context) => {
            try {
                return context.json(await engineControlService.pruneBuildCache(await context.req.json()), 200)
            } catch (error) {
                return context.json({ error: error instanceof Error ? error.message : 'BUILD_CACHE_PRUNE_FAILED' }, 400)
            }
        })
        .post('/networks', async (context) => {
            try {
                return context.json(await engineControlService.createNetwork(await context.req.json()), 201)
            } catch (error) {
                return context.json({ error: error instanceof Error ? error.message : 'CONTROL_FAILED' }, 400)
            }
        })
        .post('/volumes', async (context) => {
            try {
                return context.json(await engineControlService.createVolume(await context.req.json()), 201)
            } catch (error) {
                return context.json({ error: error instanceof Error ? error.message : 'CONTROL_FAILED' }, 400)
            }
        })
        .post('/images/pull', async (context) => {
            try {
                return context.json(await engineControlService.pullImage(await context.req.json()), 200)
            } catch (error) {
                return context.json({ error: error instanceof Error ? error.message : 'IMAGE_PULL_FAILED' }, 400)
            }
        })
        .post('/images/:imageId/tag', async (context) => {
            try {
                return context.json(await engineControlService.tagImage(context.req.param('imageId'), await context.req.json()), 200)
            } catch (error) {
                return context.json({ error: error instanceof Error ? error.message : 'IMAGE_TAG_FAILED' }, 400)
            }
        })
        .post('/images/load', async (context) => {
            try {
                return context.json(await engineControlService.loadImage(await context.req.json()), 200)
            } catch (error) {
                return context.json({ error: error instanceof Error ? error.message : 'IMAGE_LOAD_FAILED' }, 400)
            }
        })
        .post('/containers/:containerId/actions', async (context) => {
            try {
                return context.json(
                    await engineControlService.performContainerAction(context.req.param('containerId'), await context.req.json()),
                    200,
                )
            } catch (error) {
                const code = error instanceof Error ? error.message : 'CONTROL_FAILED'
                return context.json({ error: code }, code === 'CONFIRMATION_MISMATCH' ? 409 : 400)
            }
        })
        .post('/containers/:containerId/exec', async (context) => {
            try {
                return context.json(await engineControlService.executeContainer(context.req.param('containerId'), await context.req.json()), 200)
            } catch (error) {
                return context.json({ error: error instanceof Error ? error.message : 'EXEC_FAILED' }, 400)
            }
        })
        .post('/containers/:containerId/networks/connect', async (context) => {
            try {
                return context.json(
                    await engineControlService.connectContainerNetwork(context.req.param('containerId'), await context.req.json()),
                    200,
                )
            } catch (error) {
                return context.json({ error: error instanceof Error ? error.message : 'NETWORK_CONNECT_FAILED' }, 400)
            }
        })
        .post('/containers/:containerId/networks/disconnect', async (context) => {
            try {
                return context.json(
                    await engineControlService.disconnectContainerNetwork(context.req.param('containerId'), await context.req.json()),
                    200,
                )
            } catch (error) {
                return context.json({ error: error instanceof Error ? error.message : 'NETWORK_DISCONNECT_FAILED' }, 400)
            }
        })
        .post('/containers/:containerId/probe', async (context) => {
            try {
                return context.json(await engineControlService.probeContainer(context.req.param('containerId'), await context.req.json()), 200)
            } catch (error) {
                return context.json({ error: error instanceof Error ? error.message : 'CONTAINER_PROBE_FAILED' }, 400)
            }
        })
        .delete('/images/:imageId', async (context) => {
            try {
                return context.json(await engineControlService.removeImage(context.req.param('imageId'), await context.req.json()), 200)
            } catch (error) {
                const code = error instanceof Error ? error.message : 'CONTROL_FAILED'
                return context.json({ error: code }, code === 'CONFIRMATION_MISMATCH' ? 409 : 400)
            }
        })
        .delete('/networks/:networkId', async (context) => {
            try {
                return context.json(await engineControlService.removeNetwork(context.req.param('networkId'), await context.req.json()), 200)
            } catch (error) {
                const code = error instanceof Error ? error.message : 'CONTROL_FAILED'
                return context.json({ error: code }, code === 'CONFIRMATION_MISMATCH' ? 409 : 400)
            }
        })
        .delete('/volumes/:volumeName', async (context) => {
            try {
                return context.json(await engineControlService.removeVolume(context.req.param('volumeName'), await context.req.json()), 200)
            } catch (error) {
                const code = error instanceof Error ? error.message : 'CONTROL_FAILED'
                return context.json({ error: code }, code === 'CONFIRMATION_MISMATCH' ? 409 : 400)
            }
        })
