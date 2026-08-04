'use client'

import { queryOptions, useQuery } from '@tanstack/react-query'
import type { Health } from '@containers/contracts/health'
import { clientFetchData } from '@shared/lib/client-fetch'
import { QUERY_KEY } from '@shared/lib/query-key'

export const apiHealthQueryOptions = () =>
    queryOptions({
        queryKey: QUERY_KEY.HEALTH.API,
        queryFn: () => clientFetchData<Health>('/api/health'),
    })

export const useGetApiHealth = () => useQuery(apiHealthQueryOptions())
