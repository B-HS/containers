'use client'

import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { deploymentSecretListSchema, deploymentSecretSchema } from '@containers/contracts/deployment-secret'
import { clientFetch, clientFetchData } from '@shared/lib/client-fetch'
import { QUERY_KEY } from '@shared/lib/query-key'
import { z } from 'zod'

const deploymentSecretCreateSchema = z.object({ data: deploymentSecretSchema, success: z.literal(true) })

export const deploymentSecretQueryOptions = () =>
    queryOptions({
        queryKey: QUERY_KEY.DEPLOYMENT.SECRET.LIST,
        queryFn: () => clientFetchData<z.infer<typeof deploymentSecretListSchema>>('/api/deployment-secrets'),
    })

export const useGetDeploymentSecrets = () => useQuery(deploymentSecretQueryOptions())

export const useCreateDeploymentSecret = () => {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (input: { reference: string; value: string }) =>
            deploymentSecretCreateSchema.parse(
                await clientFetch('/api/deployment-secrets', {
                    body: JSON.stringify(input),
                    headers: { 'content-type': 'application/json' },
                    method: 'POST',
                }),
            ).data,
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: QUERY_KEY.DEPLOYMENT.SECRET.LIST })
        },
    })
}

export const useRemoveDeploymentSecret = () => {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (input: { id: string; confirmation: string }) =>
            clientFetchData<unknown>(`/api/deployment-secrets/${encodeURIComponent(input.id)}`, {
                body: JSON.stringify({ confirmation: input.confirmation }),
                headers: { 'content-type': 'application/json' },
                method: 'DELETE',
            }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: QUERY_KEY.DEPLOYMENT.SECRET.LIST })
        },
    })
}
