'use client'

import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
    DEPLOYMENT_STACK_RELEASE_STATUS,
    type ComposeStackInput,
    type ComposeStackPreview,
    type DeploymentStack,
    type DeploymentStackRelease,
} from '@containers/contracts/deployment-stack'
import { deploymentStackReleaseJobResponseSchema } from '@entities/deployment/deployment-stack.api'
import { clientFetchData } from '@shared/lib/client-fetch'
import { QUERY_KEY } from '@shared/lib/query-key'
import { z } from 'zod'

const ACTIVE_STACK_RELEASE_POLL_MS = 2_000

export const deploymentStackQueryOptions = () =>
    queryOptions({
        queryKey: QUERY_KEY.DEPLOYMENT.STACK.LIST,
        queryFn: () => clientFetchData<DeploymentStack[]>('/api/deployment-stacks'),
    })

export const deploymentStackReleaseQueryOptions = () =>
    queryOptions({
        queryKey: QUERY_KEY.DEPLOYMENT.STACK.RELEASE.LIST,
        queryFn: () => clientFetchData<DeploymentStackRelease[]>('/api/deployment-stack-releases'),
    })

export const useGetDeploymentStacks = () => useQuery(deploymentStackQueryOptions())

export const useGetDeploymentStackReleases = (pollWhileActive = false) =>
    useQuery({
        ...deploymentStackReleaseQueryOptions(),
        refetchInterval: (query) =>
            pollWhileActive && (query.state.data ?? []).some((release) => release.status === DEPLOYMENT_STACK_RELEASE_STATUS.RELEASING)
                ? ACTIVE_STACK_RELEASE_POLL_MS
                : false,
    })

export const usePreviewDeploymentStack = () =>
    useMutation({
        mutationFn: (input: ComposeStackInput) =>
            clientFetchData<ComposeStackPreview>('/api/deployment-stacks/preview', {
                body: JSON.stringify(input),
                headers: { 'content-type': 'application/json' },
                method: 'POST',
            }),
    })

export const useCreateDeploymentStack = () => {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (input: ComposeStackInput) =>
            clientFetchData<DeploymentStack>('/api/deployment-stacks', {
                body: JSON.stringify(input),
                headers: { 'content-type': 'application/json' },
                method: 'POST',
            }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: QUERY_KEY.DEPLOYMENT.ALL })
        },
    })
}

export const useCreateDeploymentStackRelease = () => {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (stackId: string) =>
            clientFetchData<z.infer<typeof deploymentStackReleaseJobResponseSchema>['data']>(
                `/api/deployment-stacks/${encodeURIComponent(stackId)}/releases`,
                { method: 'POST' },
            ),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: QUERY_KEY.DEPLOYMENT.ALL })
        },
    })
}
