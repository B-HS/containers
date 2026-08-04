'use client'

import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { nginxConfigStateSchema, nginxProxyRouteInputSchema, nginxProxyRouteListSchema, nginxStatusSchema } from '@containers/contracts/nginx'
import { clientFetchData } from '@shared/lib/client-fetch'
import { QUERY_KEY } from '@shared/lib/query-key'
import { z } from 'zod'

export const nginxStatusQueryOptions = () =>
    queryOptions({
        queryKey: QUERY_KEY.NGINX.STATUS,
        queryFn: () => clientFetchData<z.infer<typeof nginxStatusSchema>>('/api/nginx/status'),
    })

export const nginxConfigQueryOptions = () =>
    queryOptions({
        queryKey: QUERY_KEY.NGINX.CONFIG,
        queryFn: () => clientFetchData<z.infer<typeof nginxConfigStateSchema>>('/api/nginx/config'),
    })

export const nginxRouteQueryOptions = () =>
    queryOptions({
        queryKey: QUERY_KEY.NGINX.ROUTE.LIST,
        queryFn: () => clientFetchData<z.infer<typeof nginxProxyRouteListSchema>>('/api/nginx/routes'),
    })

export const useGetNginxStatus = () => useQuery(nginxStatusQueryOptions())

export const useGetNginxConfig = () => useQuery(nginxConfigQueryOptions())

export const useGetNginxRoutes = () => useQuery(nginxRouteQueryOptions())

export const useApplyNginxConfig = () => {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (input: { config: string; expectedSha256: string }) =>
            clientFetchData<unknown>('/api/nginx/config/apply', {
                body: JSON.stringify(input),
                headers: { 'content-type': 'application/json' },
                method: 'POST',
            }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: QUERY_KEY.NGINX.ALL })
        },
    })
}

export const useCreateNginxRoute = () => {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (input: z.infer<typeof nginxProxyRouteInputSchema>) =>
            clientFetchData<unknown>('/api/nginx/routes', {
                body: JSON.stringify(input),
                headers: { 'content-type': 'application/json' },
                method: 'POST',
            }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: QUERY_KEY.NGINX.ALL })
        },
    })
}

export const useRemoveNginxRoute = () => {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (input: { routeId: string; confirmation: string }) =>
            clientFetchData<unknown>(`/api/nginx/routes/${encodeURIComponent(input.routeId)}`, {
                body: JSON.stringify({ confirmation: input.confirmation }),
                headers: { 'content-type': 'application/json' },
                method: 'DELETE',
            }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: QUERY_KEY.NGINX.ALL })
        },
    })
}
