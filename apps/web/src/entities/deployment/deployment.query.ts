'use client'

import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { deploymentManifestListSchema, deploymentReleaseListSchema } from '@containers/contracts/deployment'
import { deploymentReleaseJobResponseSchema } from '@entities/deployment/deployment.api'
import { clientFetchData } from '@shared/lib/client-fetch'
import { QUERY_KEY } from '@shared/lib/query-key'
import { z } from 'zod'

const ACTIVE_RELEASE_STATUSES: string[] = ['creating', 'observing', 'probing', 'rolling-back', 'switching']
const ACTIVE_RELEASE_POLL_MS = 2_000

export const deploymentManifestQueryOptions = () =>
    queryOptions({
        queryKey: QUERY_KEY.DEPLOYMENT.MANIFEST.LIST,
        queryFn: () => clientFetchData<z.infer<typeof deploymentManifestListSchema>>('/api/deployment-manifests'),
    })

export const deploymentReleaseQueryOptions = () =>
    queryOptions({
        queryKey: QUERY_KEY.DEPLOYMENT.RELEASE.LIST,
        queryFn: () => clientFetchData<z.infer<typeof deploymentReleaseListSchema>>('/api/deployment-releases'),
    })

export const useGetDeploymentManifests = () => useQuery(deploymentManifestQueryOptions())

export const useGetDeploymentReleases = (pollWhileActive = false) =>
    useQuery({
        ...deploymentReleaseQueryOptions(),
        refetchInterval: (query) =>
            pollWhileActive && (query.state.data ?? []).some((release) => ACTIVE_RELEASE_STATUSES.includes(release.status))
                ? ACTIVE_RELEASE_POLL_MS
                : false,
    })

export const useCreateDeploymentManifest = () => {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (input: unknown) =>
            clientFetchData<unknown>('/api/deployment-manifests', {
                body: JSON.stringify(input),
                headers: { 'content-type': 'application/json' },
                method: 'POST',
            }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: QUERY_KEY.DEPLOYMENT.ALL })
        },
    })
}

export const useCreateDeploymentRelease = () => {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (manifestId: string) =>
            clientFetchData<z.infer<typeof deploymentReleaseJobResponseSchema>['data']>(
                `/api/deployment-manifests/${encodeURIComponent(manifestId)}/releases`,
                { method: 'POST' },
            ),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: QUERY_KEY.DEPLOYMENT.ALL })
        },
    })
}

export const useRollbackDeploymentRelease = () => {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (releaseId: string) =>
            clientFetchData<z.infer<typeof deploymentReleaseJobResponseSchema>['data']>(
                `/api/deployment-releases/${encodeURIComponent(releaseId)}/rollback`,
                { method: 'POST' },
            ),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: QUERY_KEY.DEPLOYMENT.ALL })
        },
    })
}
