'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { FC, PropsWithChildren } from 'react'

const DEFAULT_STALE_TIME_MS = 60_000

const createQueryClient = () =>
    new QueryClient({
        defaultOptions: {
            queries: {
                staleTime: DEFAULT_STALE_TIME_MS,
            },
        },
    })

let browserQueryClient: QueryClient | undefined

const getQueryClient = () => {
    if (typeof window === 'undefined') {
        return createQueryClient()
    }

    browserQueryClient = browserQueryClient ?? createQueryClient()

    return browserQueryClient
}

export const TanstackQueryProvider: FC<PropsWithChildren> = ({ children }) => (
    <QueryClientProvider client={getQueryClient()}>{children}</QueryClientProvider>
)
