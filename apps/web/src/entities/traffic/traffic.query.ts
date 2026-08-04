'use client'

import { queryOptions, useQuery } from '@tanstack/react-query'
import { trafficAnalyticsSchema, trafficSummarySchema } from '@containers/contracts/traffic'
import { clientFetchData } from '@shared/lib/client-fetch'
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

export const useGetTrafficSummary = () => useQuery(trafficSummaryQueryOptions())

export const useGetTrafficAnalytics = () => useQuery(trafficAnalyticsQueryOptions())
