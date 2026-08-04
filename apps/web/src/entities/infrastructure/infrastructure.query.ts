'use client'

import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { networkSummaryListSchema, prunePreviewSchema, volumeSummaryListSchema } from '@containers/contracts/engine-control'
import { clientFetchData } from '@shared/lib/client-fetch'
import { QUERY_KEY } from '@shared/lib/query-key'
import { z } from 'zod'

export const networkListQueryOptions = () =>
    queryOptions({
        queryKey: QUERY_KEY.INFRASTRUCTURE.NETWORK.LIST,
        queryFn: () => clientFetchData<z.infer<typeof networkSummaryListSchema>>('/api/networks'),
    })

export const volumeListQueryOptions = () =>
    queryOptions({
        queryKey: QUERY_KEY.INFRASTRUCTURE.VOLUME.LIST,
        queryFn: () => clientFetchData<z.infer<typeof volumeSummaryListSchema>>('/api/volumes'),
    })

export const infrastructureQueryOptions = () =>
    queryOptions({
        queryKey: QUERY_KEY.INFRASTRUCTURE.OVERVIEW,
        queryFn: () =>
            Promise.all([
                clientFetchData<z.infer<typeof networkSummaryListSchema>>('/api/networks'),
                clientFetchData<z.infer<typeof volumeSummaryListSchema>>('/api/volumes'),
            ]).then(([networks, volumes]) => ({ networks, volumes })),
    })

export const useGetNetworks = () => useQuery(networkListQueryOptions())

export const useGetVolumes = () => useQuery(volumeListQueryOptions())

export const useGetInfrastructure = () => useQuery(infrastructureQueryOptions())

export const prunePreviewQueryOptions = (includeVolumes: boolean) =>
    queryOptions({
        queryKey: QUERY_KEY.INFRASTRUCTURE.PRUNE_PREVIEW.DETAIL(includeVolumes),
        queryFn: () => clientFetchData<z.infer<typeof prunePreviewSchema>>(`/api/system/prune-preview?includeVolumes=${includeVolumes}`),
    })

export const useGetPrunePreview = (includeVolumes: boolean) => useQuery(prunePreviewQueryOptions(includeVolumes))

type NetworkCreateInput = {
    attachable: boolean
    gateway?: string
    internal: boolean
    name: string
    subnet?: string
}

export const useCreateNetwork = () => {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (input: NetworkCreateInput) =>
            clientFetchData<unknown>('/api/networks', {
                body: JSON.stringify(input),
                headers: { 'content-type': 'application/json' },
                method: 'POST',
            }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: QUERY_KEY.INFRASTRUCTURE.ALL })
        },
    })
}

export const useRemoveNetwork = () => {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (input: { networkId: string; confirmation: string }) =>
            clientFetchData<unknown>(`/api/networks/${encodeURIComponent(input.networkId)}`, {
                body: JSON.stringify({ confirmation: input.confirmation, force: false }),
                headers: { 'content-type': 'application/json' },
                method: 'DELETE',
            }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: QUERY_KEY.INFRASTRUCTURE.ALL })
        },
    })
}

export const useCreateVolume = () => {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (name: string) =>
            clientFetchData<unknown>('/api/volumes', {
                body: JSON.stringify({ name }),
                headers: { 'content-type': 'application/json' },
                method: 'POST',
            }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: QUERY_KEY.INFRASTRUCTURE.ALL })
        },
    })
}

export const useRemoveVolume = () => {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (input: { volumeName: string; confirmation: string; force: boolean }) =>
            clientFetchData<unknown>(`/api/volumes/${encodeURIComponent(input.volumeName)}`, {
                body: JSON.stringify({ confirmation: input.confirmation, force: input.force }),
                headers: { 'content-type': 'application/json' },
                method: 'DELETE',
            }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: QUERY_KEY.INFRASTRUCTURE.ALL })
        },
    })
}

export const usePrune = () => {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (input: { confirmation: string; includeVolumes: boolean; previewSha256: string }) =>
            clientFetchData<unknown>('/api/system/prune', {
                body: JSON.stringify(input),
                headers: { 'content-type': 'application/json' },
                method: 'POST',
            }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: QUERY_KEY.INFRASTRUCTURE.ALL })
            void queryClient.invalidateQueries({ queryKey: QUERY_KEY.ENGINE.ALL })
            void queryClient.invalidateQueries({ queryKey: QUERY_KEY.IMAGE.ALL })
        },
    })
}
