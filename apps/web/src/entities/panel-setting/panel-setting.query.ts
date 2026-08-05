'use client'

import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { panelSettingSchema, type PanelSettingUpdate } from '@containers/contracts/panel-setting'
import { clientFetch, clientFetchData } from '@shared/lib/client-fetch'
import { QUERY_KEY } from '@shared/lib/query-key'
import { z } from 'zod'

const panelSettingResponseSchema = z.object({ data: panelSettingSchema, success: z.literal(true) })

export const panelSettingQueryOptions = () =>
    queryOptions({
        queryKey: QUERY_KEY.PANEL_SETTING.DETAIL,
        queryFn: () => clientFetchData<z.infer<typeof panelSettingSchema>>('/api/panel-settings'),
    })

export const useGetPanelSetting = () => useQuery(panelSettingQueryOptions())

export const useUpdatePanelSetting = () => {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (input: PanelSettingUpdate) =>
            panelSettingResponseSchema.parse(
                await clientFetch('/api/panel-settings', {
                    body: JSON.stringify(input),
                    headers: { 'content-type': 'application/json' },
                    method: 'PUT',
                }),
            ).data,
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: QUERY_KEY.PANEL_SETTING.ALL })
        },
    })
}
