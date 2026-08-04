'use client'

import { queryOptions, useQuery } from '@tanstack/react-query'
import { auditEventListSchema } from '@containers/contracts/audit'
import { clientFetchData } from '@shared/lib/client-fetch'
import { QUERY_KEY } from '@shared/lib/query-key'
import { z } from 'zod'

export const auditQueryOptions = () =>
    queryOptions({
        queryKey: QUERY_KEY.AUDIT.LIST,
        queryFn: () => clientFetchData<z.infer<typeof auditEventListSchema>>('/api/audit?limit=100'),
    })

export const useGetAuditEvents = () => useQuery(auditQueryOptions())
