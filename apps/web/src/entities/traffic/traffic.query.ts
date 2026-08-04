'use client'

import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { trafficAnalyticsSchema, trafficHealthSchema, trafficSummarySchema } from '@containers/contracts/traffic'
import { jobResponseSchema } from '@entities/job/job.api'
import { clientFetch, clientFetchData } from '@shared/lib/client-fetch'
import { QUERY_KEY } from '@shared/lib/query-key'
import { z } from 'zod'

export const trafficSummaryQueryOptions = () =>
    queryOptions({
        queryKey: QUERY_KEY.TRAFFIC.SUMMARY,
        queryFn: () => clientFetchData<z.infer<typeof trafficSummarySchema>>('/api/traffic/summary?windowMinutes=1'),
    })

export const trafficAnalyticsQueryOptions = () =>
    queryOptions({
        queryKey: QUERY_KEY.TRAFFIC.ANALYTICS,
        queryFn: () => clientFetchData<z.infer<typeof trafficAnalyticsSchema>>('/api/traffic/analytics?limit=25&statusClass=all&windowMinutes=60'),
    })

export const trafficHealthQueryOptions = () =>
    queryOptions({
        queryKey: QUERY_KEY.TRAFFIC.HEALTH,
        queryFn: () => clientFetchData<z.infer<typeof trafficHealthSchema>>('/api/traffic/health'),
    })

export const useGetTrafficHealth = () => useQuery(trafficHealthQueryOptions())

export const useGetTrafficSummary = () => useQuery(trafficSummaryQueryOptions())

export const useGetTrafficAnalytics = () => useQuery(trafficAnalyticsQueryOptions())

export const useCreateTrafficExport = () => {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (input: { format: 'csv' | 'ndjson'; from: string; to: string }) =>
            jobResponseSchema.parse(
                await clientFetch('/api/traffic/exports', {
                    body: JSON.stringify(input),
                    headers: { 'content-type': 'application/json' },
                    method: 'POST',
                }),
            ).data,
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: QUERY_KEY.TRAFFIC.ALL })
        },
    })
}
