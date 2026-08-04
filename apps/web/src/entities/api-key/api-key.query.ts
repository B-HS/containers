'use client'

import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiKeyListSchema } from '@containers/contracts/api-key'
import { clientFetch, clientFetchData } from '@shared/lib/client-fetch'
import { QUERY_KEY } from '@shared/lib/query-key'
import { z } from 'zod'

const apiKeyCreateSchema = z.object({ data: apiKeyListSchema.element.extend({ token: z.string() }), success: z.literal(true) })

export const apiKeyQueryOptions = () =>
    queryOptions({
        queryKey: QUERY_KEY.API_KEY.LIST,
        queryFn: () => clientFetchData<z.infer<typeof apiKeyListSchema>>('/api/api-keys'),
    })

export const useGetApiKeys = () => useQuery(apiKeyQueryOptions())

export const useCreateApiKey = () => {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (input: { expiresInDays: number; name: string; scopes: string[] }) =>
            apiKeyCreateSchema.parse(
                await clientFetch('/api/api-keys', {
                    body: JSON.stringify(input),
                    headers: { 'content-type': 'application/json' },
                    method: 'POST',
                }),
            ).data,
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: QUERY_KEY.API_KEY.ALL })
        },
    })
}

export const useRevokeApiKey = () => {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (id: string) => clientFetchData<unknown>(`/api/api-keys/${encodeURIComponent(id)}`, { method: 'DELETE' }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: QUERY_KEY.API_KEY.ALL })
        },
    })
}
