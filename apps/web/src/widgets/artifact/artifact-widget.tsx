'use client'

import type { FC } from 'react'
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { useGetArtifacts, useLoadArtifact } from '@entities/artifact/artifact.query'
import { useOperationJobPolling } from '@entities/job/job.query'
import { formatBytes } from '@shared/lib/format-bytes'
import { formatDateTime } from '@shared/lib/format-date-time'
import { QUERY_KEY } from '@shared/lib/query-key'
import { Alert, AlertDescription, AlertTitle } from '@shared/ui/alert'
import { Badge } from '@shared/ui/badge'
import { Button } from '@shared/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@shared/ui/empty'
import { Skeleton } from '@shared/ui/skeleton'
import { Spinner } from '@shared/ui/spinner'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@shared/ui/table'
import { WidgetSection } from '@shared/common/widget-section'
import { ArtifactUploadForm } from '@widgets/artifact/artifact-upload-form'
import { Link } from '../../i18n/navigation'

const LOADED_IMAGE_PREFIX = 'Loaded image: '

const readLoadedTags = (result: Record<string, unknown> | null) => {
    const messages = result?.messages
    if (!Array.isArray(messages)) return []
    return messages
        .filter((message): message is string => typeof message === 'string' && message.startsWith(LOADED_IMAGE_PREFIX))
        .map((message) => message.slice(LOADED_IMAGE_PREFIX.length).trim())
}

const UPLOAD_ROLES = ['owner', 'admin', 'operator']
const LOAD_ROLES = ['owner', 'admin']
const ARTIFACT_STATUS_READY = 'ready'
const SKELETON_ROW_COUNT = 3

type ArtifactWidgetProps = {
    role: string
}

export const ArtifactWidget: FC<ArtifactWidgetProps> = ({ role }) => {
    const [loadedTags, setLoadedTags] = useState<string[]>([])
    const [loadingArtifactId, setLoadingArtifactId] = useState<string>()
    const translations = useTranslations('Dashboard')
    const queryClient = useQueryClient()
    const artifacts = useGetArtifacts()
    const loadArtifact = useLoadArtifact()
    const { failureCode, isJobActive, trackJob } = useOperationJobPolling({
        failureLabel: translations('uploadFailed'),
        onFailed: (code) => {
            toast.error(code ?? translations('jobFailedUnknown'))
        },
        onSucceeded: (result) => {
            setLoadedTags(readLoadedTags(result))
            void queryClient.invalidateQueries({ queryKey: QUERY_KEY.ARTIFACT.ALL })
            void queryClient.invalidateQueries({ queryKey: QUERY_KEY.IMAGE.ALL })
        },
    })

    const items = artifacts.data ?? []
    const busy = loadArtifact.isPending || isJobActive

    const load = (artifactId: string) => {
        setLoadedTags([])
        setLoadingArtifactId(artifactId)
        loadArtifact.mutate(artifactId, {
            onError: (loadError) => {
                setLoadingArtifactId(undefined)
                toast.error(loadError instanceof Error ? loadError.message : translations('uploadFailed'))
            },
            onSuccess: (loaded) => {
                if ('job' in loaded) {
                    trackJob(loaded.job)
                }
                setLoadingArtifactId(undefined)
                toast.success(translations('artifactLoaded'))
            },
        })
    }

    return (
        <WidgetSection id="artifact-control-title" title={translations('artifactControl')} badge={items.length}>
            {UPLOAD_ROLES.includes(role) ? <ArtifactUploadForm /> : null}
            {loadedTags.length > 0 ? (
                <Alert aria-live="polite" className="mx-6">
                    <AlertTitle>{translations('artifactLoadedTitle')}</AlertTitle>
                    <AlertDescription>
                        <div className="grid gap-2">
                            <span className="font-mono break-all">{loadedTags.join(', ')}</span>
                            <div className="flex flex-wrap gap-2">
                                <Button asChild size="xs" variant="outline">
                                    <Link href={{ pathname: '/containers/new', query: { image: loadedTags[0] ?? '' } }}>
                                        {translations('artifactCreateContainer')}
                                    </Link>
                                </Button>
                                <Button asChild size="xs" variant="outline">
                                    <Link href="/images">{translations('imageControl')}</Link>
                                </Button>
                            </div>
                        </div>
                    </AlertDescription>
                </Alert>
            ) : null}
            {failureCode !== undefined ? (
                <Alert aria-live="polite" variant="destructive" className="mx-6">
                    <AlertTitle>{translations('jobFailedTitle')}</AlertTitle>
                    <AlertDescription>
                        <span className="font-mono break-all">{failureCode ?? translations('jobFailedUnknown')}</span>
                    </AlertDescription>
                </Alert>
            ) : null}
            {artifacts.isPending ? (
                <div className="grid gap-2 p-6">
                    {Array.from({ length: SKELETON_ROW_COUNT }, (_, index) => (
                        <Skeleton key={index} className="h-9 w-full" />
                    ))}
                </div>
            ) : null}
            {!artifacts.isPending && items.length === 0 ? (
                <Empty>
                    <EmptyHeader>
                        <EmptyTitle>{translations('artifactEmpty')}</EmptyTitle>
                        <EmptyDescription>{translations('artifactEmptyDescription')}</EmptyDescription>
                    </EmptyHeader>
                </Empty>
            ) : null}
            {items.length > 0 ? (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>{translations('artifactFile')}</TableHead>
                            <TableHead>{translations('artifactStatus')}</TableHead>
                            <TableHead>{translations('size')}</TableHead>
                            <TableHead>{translations('checksum')}</TableHead>
                            <TableHead>{translations('createdAt')}</TableHead>
                            <TableHead className="text-right">{translations('loadImage')}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {items.map((artifact) => (
                            <TableRow key={artifact.id} className="odd:bg-overlay-subtle">
                                <TableCell className="max-w-64 truncate font-medium text-text-strong">{artifact.fileName}</TableCell>
                                <TableCell>
                                    <Badge variant={artifact.status === ARTIFACT_STATUS_READY ? 'success' : 'neutral'}>{artifact.status}</Badge>
                                </TableCell>
                                <TableCell className="text-text-muted">{formatBytes(artifact.sizeBytes)}</TableCell>
                                <TableCell className="max-w-56 truncate font-mono text-xs text-text-subtle">{artifact.sha256}</TableCell>
                                <TableCell className="text-text-muted">{formatDateTime(artifact.createdAt)}</TableCell>
                                <TableCell className="text-right">
                                    {LOAD_ROLES.includes(role) && artifact.status === ARTIFACT_STATUS_READY ? (
                                        <Button type="button" variant="outline" size="xs" disabled={busy} onClick={() => load(artifact.id)}>
                                            {busy && loadingArtifactId === artifact.id ? <Spinner className="size-3" /> : null}
                                            {translations('loadImage')}
                                        </Button>
                                    ) : null}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            ) : null}
        </WidgetSection>
    )
}
