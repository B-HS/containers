'use client'

import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { RegistryCredential } from '@containers/contracts/registry-credential'
import { registryCredentialListSchema } from '@containers/contracts/registry-credential'
import { clientFetchData } from '@shared/lib/client-fetch'
import { QUERY_KEY } from '@shared/lib/query-key'
import { z } from 'zod'

type RegistryCredentialInput = {
    name: string
    password: string
    serverAddress: string
    username: string
}

export const registryCredentialQueryOptions = () =>
    queryOptions({
        queryKey: QUERY_KEY.REGISTRY.LIST,
        queryFn: () => clientFetchData<z.infer<typeof registryCredentialListSchema>>('/api/registry-credentials'),
    })

export const useGetRegistryCredentials = () => useQuery(registryCredentialQueryOptions())

export const useSaveRegistryCredential = () => {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (input: { credentialId?: string; credential: RegistryCredentialInput }) =>
            clientFetchData<RegistryCredential>(
                input.credentialId === undefined
                    ? '/api/registry-credentials'
                    : `/api/registry-credentials/${encodeURIComponent(input.credentialId)}`,
                {
                    body: JSON.stringify(input.credential),
                    headers: { 'content-type': 'application/json' },
                    method: 'POST',
                },
            ),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: QUERY_KEY.REGISTRY.ALL })
        },
    })
}

export const useRemoveRegistryCredential = () => {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (input: { credentialId: string; confirmation: string }) =>
            clientFetchData<unknown>(`/api/registry-credentials/${encodeURIComponent(input.credentialId)}`, {
                body: JSON.stringify({ confirmation: input.confirmation }),
                headers: { 'content-type': 'application/json' },
                method: 'DELETE',
            }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: QUERY_KEY.REGISTRY.ALL })
        },
    })
}

export const usePullImage = () => {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (input: { credentialId?: string; reference: string }) =>
            clientFetchData<unknown>('/api/images/pull', {
                body: JSON.stringify({ ...(input.credentialId ? { credentialId: input.credentialId } : {}), reference: input.reference }),
                headers: { 'content-type': 'application/json' },
                method: 'POST',
            }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: QUERY_KEY.IMAGE.ALL })
            void queryClient.invalidateQueries({ queryKey: QUERY_KEY.JOB.ALL })
        },
    })
}
