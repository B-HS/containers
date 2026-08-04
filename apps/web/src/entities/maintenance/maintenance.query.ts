'use client'

import { queryOptions, useQuery } from '@tanstack/react-query'
import { maintenanceStatusSchema } from '@containers/contracts/maintenance'
import { clientFetchData } from '@shared/lib/client-fetch'
import { QUERY_KEY } from '@shared/lib/query-key'
import { z } from 'zod'

export const maintenanceQueryOptions = () =>
    queryOptions({
        queryKey: QUERY_KEY.MAINTENANCE.STATUS,
        queryFn: () => clientFetchData<z.infer<typeof maintenanceStatusSchema>>('/api/maintenance'),
    })

export const useGetMaintenanceStatus = () => useQuery(maintenanceQueryOptions())
