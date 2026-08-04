'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { clientFetchData } from '@shared/lib/client-fetch'
import { QUERY_KEY } from '@shared/lib/query-key'

export const useCreateInvitation = () => {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (input: { email: string; expiresInHours: number; role: string }) =>
            clientFetchData<{ invitationUrl: string }>('/api/invitations', {
                body: JSON.stringify(input),
                headers: { 'content-type': 'application/json' },
                method: 'POST',
            }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: QUERY_KEY.INVITATION.ALL })
        },
    })
}
