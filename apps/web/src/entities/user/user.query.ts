'use client'

import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { managedUserListSchema } from '@containers/contracts/user-management'
import { clientFetchData } from '@shared/lib/client-fetch'
import { QUERY_KEY } from '@shared/lib/query-key'
import { z } from 'zod'

export const userQueryOptions = () =>
    queryOptions({
        queryKey: QUERY_KEY.USER.LIST,
        queryFn: () => clientFetchData<z.infer<typeof managedUserListSchema>>('/api/users'),
    })

export const useGetUsers = () => useQuery(userQueryOptions())

export const useUpdateUser = () => {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (input: { userId: string; disabled?: boolean; role?: string }) =>
            clientFetchData<unknown>(`/api/users/${encodeURIComponent(input.userId)}`, {
                body: JSON.stringify({ disabled: input.disabled, role: input.role }),
                headers: { 'content-type': 'application/json' },
                method: 'PATCH',
            }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: QUERY_KEY.USER.LIST })
        },
    })
}
