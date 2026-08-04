'use client'

import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { backupManifestSchema, backupListSchema } from '@containers/contracts/backup'
import { clientFetch, clientFetchData } from '@shared/lib/client-fetch'
import { QUERY_KEY } from '@shared/lib/query-key'
import { z } from 'zod'

const backupCreateSchema = z.object({ data: backupManifestSchema, success: z.literal(true) })

export const backupQueryOptions = () =>
    queryOptions({
        queryKey: QUERY_KEY.BACKUP.LIST,
        queryFn: () => clientFetchData<z.infer<typeof backupListSchema>>('/api/backups'),
    })

export const useGetBackups = () => useQuery(backupQueryOptions())

export const useCreateBackup = () => {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (label: string | null) =>
            backupCreateSchema.parse(
                await clientFetch('/api/backups', {
                    body: JSON.stringify({ label }),
                    headers: { 'content-type': 'application/json' },
                    method: 'POST',
                }),
            ).data,
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: QUERY_KEY.BACKUP.LIST })
        },
    })
}

export const useRemoveBackup = () => {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (input: { backupId: string; confirmation: string }) =>
            clientFetchData<unknown>(`/api/backups/${encodeURIComponent(input.backupId)}`, {
                body: JSON.stringify({ confirmation: input.confirmation }),
                headers: { 'content-type': 'application/json' },
                method: 'DELETE',
            }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: QUERY_KEY.BACKUP.LIST })
        },
    })
}

export const useRestoreBackup = () => {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (input: { backupId: string; confirmation: string }) =>
            clientFetchData<unknown>(`/api/backups/${encodeURIComponent(input.backupId)}/restore`, {
                body: JSON.stringify({ confirmation: input.confirmation }),
                headers: { 'content-type': 'application/json' },
                method: 'POST',
            }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: QUERY_KEY.BACKUP.LIST })
        },
    })
}
