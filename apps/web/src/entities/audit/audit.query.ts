'use client'

import { queryOptions, useQuery } from '@tanstack/react-query'
import { parseAuditIntegrity, parseAuditPage, toAuditSearchParams, type AuditFilters } from '@entities/audit/audit.api'
import { clientFetch } from '@shared/lib/client-fetch'
import { QUERY_KEY } from '@shared/lib/query-key'

export const auditQueryOptions = (filters: AuditFilters) => {
    const params = toAuditSearchParams(filters)

    return queryOptions({
        queryKey: QUERY_KEY.AUDIT.LIST(params),
        queryFn: async () => parseAuditPage(await clientFetch(`/api/audit?${new URLSearchParams(params).toString()}`)),
    })
}

export const useGetAuditEvents = (filters: AuditFilters) => useQuery(auditQueryOptions(filters))

export const auditIntegrityQueryOptions = () =>
    queryOptions({
        queryKey: QUERY_KEY.AUDIT.INTEGRITY,
        queryFn: async () => parseAuditIntegrity(await clientFetch('/api/audit/integrity')),
    })

export const useGetAuditIntegrity = () => useQuery(auditIntegrityQueryOptions())
