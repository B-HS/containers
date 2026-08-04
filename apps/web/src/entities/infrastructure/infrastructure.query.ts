'use client'

import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { networkSummaryListSchema, prunePreviewSchema, volumeSummaryListSchema } from '@containers/contracts/engine-control'
import { registryCredentialListSchema } from '@containers/contracts/registry-credential'
import { clientFetchData } from '@shared/lib/client-fetch'
import { QUERY_KEY } from '@shared/lib/query-key'
import { z } from 'zod'

export const infrastructureQueryOptions = () =>
    queryOptions({
        queryKey: ['infrastructure', 'overview'] as const,
        queryFn: () =>
            Promise.all([
                clientFetchData<z.infer<typeof networkSummaryListSchema>>('/api/networks'),
                clientFetchData<z.infer<typeof volumeSummaryListSchema>>('/api/volumes'),
            ]).then(([networks, volumes]) => ({ networks, volumes })),
    })

export const useGetInfrastructure = () => useQuery(infrastructureQueryOptions())

export const prunePreviewQueryOptions = () =>
    queryOptions({
        queryKey: QUERY_KEY.INFRASTRUCTURE.PRUNE_PREVIEW,
        queryFn: () => clientFetchData<z.infer<typeof prunePreviewSchema>>('/api/system/prune-preview?includeVolumes=false'),
    })

export const useGetPrunePreview = () => useQuery(prunePreviewQueryOptions())

export const registryCredentialQueryOptions = () =>
    queryOptions({
        queryKey: QUERY_KEY.INFRASTRUCTURE.REGISTRY.LIST,
        queryFn: () => clientFetchData<z.infer<typeof registryCredentialListSchema>>('/api/registry-credentials'),
    })

export const useGetRegistryCredentials = () => useQuery(registryCredentialQueryOptions())

export const useCreateNetwork = () => {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (input: unknown) =>
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
            void queryClient.invalidateQueries({ queryKey: QUERY_KEY.INFRASTRUCTURE.VOLUME.LIST })
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
            void queryClient.invalidateQueries({ queryKey: QUERY_KEY.INFRASTRUCTURE.PRUNE_PREVIEW })
        },
    })
}
