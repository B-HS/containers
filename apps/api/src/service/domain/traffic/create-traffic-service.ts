import type { TrafficWorkerClient } from '../../../service/shared/traffic-worker-client/create-traffic-worker-client'

type TrafficServiceDependencies = {
    trafficWorkerClient: Pick<TrafficWorkerClient, 'getAnalytics' | 'getHealthState' | 'getSummary' | 'openLiveStream'>
}

export const createTrafficService = ({ trafficWorkerClient }: TrafficServiceDependencies) => ({
    getAnalytics: async (input: unknown) => trafficWorkerClient.getAnalytics(input),
    getHealthState: async () => trafficWorkerClient.getHealthState(),
    getSummary: async (windowMinutes: number) => trafficWorkerClient.getSummary(windowMinutes),
    openLiveStream: async (input: unknown, signal: AbortSignal) => trafficWorkerClient.openLiveStream(input, signal),
})

export type TrafficService = ReturnType<typeof createTrafficService>
