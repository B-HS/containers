'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { clientFetch } from '@shared/lib/client-fetch'
import { QUERY_KEY } from '@shared/lib/query-key'

export const useSignInEmail = () => {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (input: { email: string; password: string }) =>
            clientFetch('/api/auth/sign-in/email', {
                body: JSON.stringify(input),
                credentials: 'same-origin',
                headers: { 'content-type': 'application/json' },
                method: 'POST',
            }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: QUERY_KEY.AUTH.SESSION })
        },
    })
}

export const useBootstrapOwner = () => {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (input: { email: string; name: string; password: string }) =>
            clientFetch('/api/bootstrap/owner', {
                body: JSON.stringify(input),
                credentials: 'same-origin',
                headers: { 'content-type': 'application/json' },
                method: 'POST',
            }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: QUERY_KEY.AUTH.SESSION })
        },
    })
}

export const useSignOut = () => {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: () =>
            clientFetch('/api/auth/sign-out', {
                credentials: 'same-origin',
                method: 'POST',
            }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: QUERY_KEY.AUTH.SESSION })
        },
    })
}

export const useAcceptInvitation = () => {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (input: { name: string; password: string; token: string }) =>
            clientFetch('/api/invitations/accept', {
                body: JSON.stringify(input),
                credentials: 'same-origin',
                headers: { 'content-type': 'application/json' },
                method: 'POST',
            }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: QUERY_KEY.AUTH.SESSION })
        },
    })
}
