'use client'

import { queryOptions, useQuery } from '@tanstack/react-query'
import { artifactListSchema } from '@containers/contracts/upload'
import { clientFetchData } from '@shared/lib/client-fetch'
import { QUERY_KEY } from '@shared/lib/query-key'
import { z } from 'zod'

export const artifactQueryOptions = () =>
    queryOptions({
        queryKey: QUERY_KEY.ARTIFACT.LIST,
        queryFn: () => clientFetchData<z.infer<typeof artifactListSchema>>('/api/artifacts'),
    })

export const useGetArtifacts = () => useQuery(artifactQueryOptions())
