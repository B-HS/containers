'use client'

import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { deploymentManifestListSchema, deploymentReleaseListSchema } from '@containers/contracts/deployment'
import { deploymentReleaseJobResponseSchema } from '@entities/deployment/deployment.api'
import { clientFetchData } from '@shared/lib/client-fetch'
import { QUERY_KEY } from '@shared/lib/query-key'
import { z } from 'zod'

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

export const useGetDeploymentReleases = () => useQuery(deploymentReleaseQueryOptions())

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
            void queryClient.invalidateQueries({ queryKey: QUERY_KEY.DEPLOYMENT.MANIFEST.LIST })
            void queryClient.invalidateQueries({ queryKey: QUERY_KEY.DEPLOYMENT.RELEASE.LIST })
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
            void queryClient.invalidateQueries({ queryKey: QUERY_KEY.DEPLOYMENT.RELEASE.LIST })
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
            void queryClient.invalidateQueries({ queryKey: QUERY_KEY.DEPLOYMENT.RELEASE.LIST })
        },
    })
}
