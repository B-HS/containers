'use client'

import { queryOptions, useQuery } from '@tanstack/react-query'
import { controlPlaneStatusSchema } from '@containers/contracts/control-plane'
import { clientFetchData } from '@shared/lib/client-fetch'
import { QUERY_KEY } from '@shared/lib/query-key'
import { z } from 'zod'

export const controlPlaneQueryOptions = () =>
    queryOptions({
        queryKey: QUERY_KEY.CONTROL_PLANE.STATUS,
        queryFn: () => clientFetchData<z.infer<typeof controlPlaneStatusSchema>>('/api/control-plane/status'),
    })

export const useGetControlPlaneStatus = () => useQuery(controlPlaneQueryOptions())
