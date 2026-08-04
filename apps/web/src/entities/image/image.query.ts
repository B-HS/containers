'use client'

import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { imageSummaryListSchema } from '@containers/contracts/engine-control'
import { clientFetchData } from '@shared/lib/client-fetch'
import { QUERY_KEY } from '@shared/lib/query-key'
import { z } from 'zod'

export const imageQueryOptions = () =>
    queryOptions({
        queryKey: QUERY_KEY.IMAGE.LIST,
        queryFn: () => clientFetchData<z.infer<typeof imageSummaryListSchema>>('/api/images'),
    })

export const useGetImages = () => useQuery(imageQueryOptions())

export const useRemoveImage = () => {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (input: { id: string; confirmation: string; force: boolean }) =>
            clientFetchData<unknown>(`/api/images/${encodeURIComponent(input.id)}`, {
                body: JSON.stringify({ confirmation: input.confirmation, force: input.force, pruneChildren: false }),
                headers: { 'content-type': 'application/json' },
                method: 'DELETE',
            }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: QUERY_KEY.IMAGE.LIST })
        },
    })
}
