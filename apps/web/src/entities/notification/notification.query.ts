'use client'

import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { notificationDestinationListSchema, notificationDestinationSchema } from '@containers/contracts/notification'
import { clientFetch, clientFetchData } from '@shared/lib/client-fetch'
import { QUERY_KEY } from '@shared/lib/query-key'
import { z } from 'zod'

const notificationCreateSchema = z.object({ data: notificationDestinationSchema, success: z.literal(true) })

export const notificationQueryOptions = () =>
    queryOptions({
        queryKey: QUERY_KEY.NOTIFICATION.LIST,
        queryFn: () => clientFetchData<z.infer<typeof notificationDestinationListSchema>>('/api/notification-destinations'),
    })

export const useGetNotificationDestinations = () => useQuery(notificationQueryOptions())

export const useSaveNotificationDestination = () => {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (input: { enabled: boolean; eventTypes: string[]; name: string; webhookUrl: string }) =>
            notificationCreateSchema.parse(
                await clientFetch('/api/notification-destinations', {
                    body: JSON.stringify({ ...input, type: 'discord' }),
                    headers: { 'content-type': 'application/json' },
                    method: 'POST',
                }),
            ).data,
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: QUERY_KEY.NOTIFICATION.LIST })
        },
    })
}

export const useToggleNotificationDestination = () => {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async (input: { id: string; enabled: boolean }) =>
            notificationCreateSchema.parse(
                await clientFetch(`/api/notification-destinations/${encodeURIComponent(input.id)}`, {
                    body: JSON.stringify({ enabled: input.enabled }),
                    headers: { 'content-type': 'application/json' },
                    method: 'PATCH',
                }),
            ).data,
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: QUERY_KEY.NOTIFICATION.LIST })
        },
    })
}

export const useTestNotificationDestination = () => {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (id: string) =>
            clientFetchData<Record<string, unknown>>(`/api/notification-destinations/${encodeURIComponent(id)}/test`, { method: 'POST' }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: QUERY_KEY.NOTIFICATION.LIST })
        },
    })
}

export const useRemoveNotificationDestination = () => {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (input: { id: string; confirmation: string }) =>
            clientFetchData<unknown>(`/api/notification-destinations/${encodeURIComponent(input.id)}`, {
                body: JSON.stringify({ confirmation: input.confirmation }),
                headers: { 'content-type': 'application/json' },
                method: 'DELETE',
            }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: QUERY_KEY.NOTIFICATION.LIST })
        },
    })
}
