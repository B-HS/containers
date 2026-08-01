import type { TrafficWorkerClient } from '../../../traffic/create-traffic-worker-client'

type TrafficServiceDependencies = {
    trafficWorkerClient: Pick<TrafficWorkerClient, 'getAnalytics' | 'getSummary' | 'openLiveStream'>
}

export const createTrafficService = ({ trafficWorkerClient }: TrafficServiceDependencies) => ({
    getAnalytics: async (input: unknown) => trafficWorkerClient.getAnalytics(input),
    getSummary: async (windowMinutes: number) => trafficWorkerClient.getSummary(windowMinutes),
    openLiveStream: async (input: unknown, signal: AbortSignal) => trafficWorkerClient.openLiveStream(input, signal),
})

export type TrafficService = ReturnType<typeof createTrafficService>
