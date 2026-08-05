'use client'

import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { trustedProxyStateSchema } from '@containers/contracts/trusted-proxy'
import { clientFetch, clientFetchData } from '@shared/lib/client-fetch'
import { QUERY_KEY } from '@shared/lib/query-key'
import { z } from 'zod'

const responseSchema = z.object({ data: trustedProxyStateSchema, success: z.literal(true) })

export const trustedProxyQueryOptions = () =>
    queryOptions({
        queryKey: QUERY_KEY.TRUSTED_PROXY.STATE,
        queryFn: () => clientFetchData<z.infer<typeof trustedProxyStateSchema>>('/api/trusted-proxies'),
    })

export const useGetTrustedProxies = () => useQuery(trustedProxyQueryOptions())

export const useApproveTrustedProxy = () => {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (input: { address: string; note: string | null }) =>
            responseSchema.parse(
                await clientFetch('/api/trusted-proxies', {
                    body: JSON.stringify(input),
                    headers: { 'content-type': 'application/json' },
                    method: 'POST',
                }),
            ).data,
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: QUERY_KEY.TRUSTED_PROXY.ALL })
        },
    })
}

export const useRevokeTrustedProxy = () => {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (address: string) =>
            responseSchema.parse(await clientFetch(`/api/trusted-proxies/${encodeURIComponent(address)}`, { method: 'DELETE' })).data,
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: QUERY_KEY.TRUSTED_PROXY.ALL })
        },
    })
}
