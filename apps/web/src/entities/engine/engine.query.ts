'use client'

import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { containerDetailSchema, containerLogResultSchema, containerSummaryListSchema, engineOverviewSchema } from '@containers/contracts/engine'
import { clientFetchData } from '@shared/lib/client-fetch'
import { QUERY_KEY } from '@shared/lib/query-key'
import { z } from 'zod'

const CONTAINER_QUERY_KEY = ['engine', 'container'] as const

export const engineOverviewQueryOptions = () =>
    queryOptions({
        queryKey: QUERY_KEY.ENGINE.OVERVIEW,
        queryFn: () => clientFetchData<z.infer<typeof engineOverviewSchema>>('/api/system/engine'),
    })

export const useGetEngineOverview = () => useQuery(engineOverviewQueryOptions())

export const containerListQueryOptions = () =>
    queryOptions({
        queryKey: ['engine', 'container', 'list'] as const,
        queryFn: () => clientFetchData<z.infer<typeof containerSummaryListSchema>>('/api/containers'),
    })

export const useGetContainerList = () => useQuery(containerListQueryOptions())

export const containerDetailQueryOptions = (containerId: string) =>
    queryOptions({
        queryKey: ['engine', 'container', 'detail', containerId] as const,
        queryFn: () => clientFetchData<z.infer<typeof containerDetailSchema>>(`/api/containers/${encodeURIComponent(containerId)}`),
        enabled: containerId.length > 0,
    })

export const useGetContainerDetail = (containerId: string) => useQuery(containerDetailQueryOptions(containerId))

export const containerLogQueryOptions = (containerId: string) =>
    queryOptions({
        queryKey: ['engine', 'container', 'log', containerId] as const,
        queryFn: () => clientFetchData<z.infer<typeof containerLogResultSchema>>(`/api/containers/${encodeURIComponent(containerId)}/logs?tail=200`),
        enabled: containerId.length > 0,
    })

export const useGetContainerLog = (containerId: string) => useQuery(containerLogQueryOptions(containerId))

type ContainerActionInput = { containerId: string; action: string; timeoutSeconds?: number; confirmation?: string; force?: boolean }

export const usePerformContainerAction = () => {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (input: ContainerActionInput) =>
            clientFetchData<unknown>(`/api/containers/${encodeURIComponent(input.containerId)}/actions`, {
                body: JSON.stringify({
                    action: input.action,
                    ...(input.timeoutSeconds !== undefined ? { timeoutSeconds: input.timeoutSeconds } : {}),
                }),
                headers: { 'content-type': 'application/json' },
                method: 'POST',
            }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: CONTAINER_QUERY_KEY })
        },
    })
}

export const useRemoveContainer = () => {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (input: { containerId: string; confirmation: string; force: boolean }) =>
            clientFetchData<unknown>(`/api/containers/${encodeURIComponent(input.containerId)}/actions`, {
                body: JSON.stringify({ action: 'remove', confirmation: input.confirmation, force: input.force, removeVolumes: false }),
                headers: { 'content-type': 'application/json' },
                method: 'POST',
            }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: CONTAINER_QUERY_KEY })
        },
    })
}

export const useExecuteContainerCommand = () => {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (input: { containerId: string; command: string[] }) =>
            clientFetchData<{ stdout: string; stderr: string }>(`/api/containers/${encodeURIComponent(input.containerId)}/exec`, {
                body: JSON.stringify({ command: input.command }),
                headers: { 'content-type': 'application/json' },
                method: 'POST',
            }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: CONTAINER_QUERY_KEY })
        },
    })
}

export const useCreateContainer = () => {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (input: unknown) =>
            clientFetchData<unknown>('/api/containers', {
                body: JSON.stringify(input),
                headers: { 'content-type': 'application/json' },
                method: 'POST',
            }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: CONTAINER_QUERY_KEY })
        },
    })
}
