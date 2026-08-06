'use client'

import type { FC } from 'react'
import { useTranslations } from 'next-intl'
import { Layers } from 'lucide-react'
import { toast } from 'sonner'
import { useGetContainerList } from '@entities/engine/engine.query'
import { useGetImages, useRemoveImage } from '@entities/image/image.query'
import { formatBytes } from '@shared/lib/format-bytes'
import { Button } from '@shared/ui/button'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@shared/ui/empty'
import { Skeleton } from '@shared/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@shared/ui/table'
import { WidgetSection } from '@shared/common/widget-section'
import { Link } from '../../i18n/navigation'
import { ImageRemoveDialog } from './image-remove-dialog'

const REMOVE_ROLES = ['owner', 'admin']
const SHORT_ID_LENGTH = 12
const SKELETON_ROWS = [0, 1, 2]

type ImageWidgetProps = {
    role: string
}

export const ImageWidget: FC<ImageWidgetProps> = ({ role }) => {
    const t = useTranslations('Dashboard')
    const imageList = useGetImages()
    const containerList = useGetContainerList()
    const removeImage = useRemoveImage()
    const images = imageList.data ?? []
    const containers = containerList.data ?? []
    const canRemove = REMOVE_ROLES.includes(role)

    const runRemove = (id: string, input: { confirmation: string; force: boolean }) => {
        removeImage.mutate(
            { id, ...input },
            {
                onError: (removeError) => toast.error(removeError instanceof Error ? removeError.message : t('imageActionFailed')),
                onSuccess: () => toast.success(t('imageRemoved')),
            },
        )
    }

    return (
        <WidgetSection id="image-control-title" title={t('imageControl')} badge={images.length}>
            {imageList.isPending ? (
                <div className="grid gap-2 p-4">
                    {SKELETON_ROWS.map((row) => (
                        <Skeleton key={row} className="h-10 w-full" />
                    ))}
                </div>
            ) : null}
            {!imageList.isPending && images.length === 0 ? (
                <Empty>
                    <EmptyHeader>
                        <EmptyMedia variant="icon">
                            <Layers aria-hidden="true" />
                        </EmptyMedia>
                        <EmptyTitle>{t('imageEmpty')}</EmptyTitle>
                        <EmptyDescription>{t('imageEmptyDescription')}</EmptyDescription>
                    </EmptyHeader>
                    <EmptyContent>
                        <Button asChild size="sm">
                            <Link href="/registry">{t('registryPull')}</Link>
                        </Button>
                    </EmptyContent>
                </Empty>
            ) : null}
            {!imageList.isPending && images.length > 0 ? (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>{t('image')}</TableHead>
                            <TableHead>{t('imageId')}</TableHead>
                            <TableHead className="text-right">{t('size')}</TableHead>
                            <TableHead className="text-right">{t('containerCreate')}</TableHead>
                            {canRemove ? <TableHead className="text-right">{t('remove')}</TableHead> : null}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {images.map((image) => {
                            const displayName =
                                image.repoTags[0] ?? image.repoDigests[0] ?? image.id.replace(/^sha256:/, '').slice(0, SHORT_ID_LENGTH)
                            const usedByNames = containers
                                .filter((container) => container.imageId === image.id || image.repoTags.includes(container.image))
                                .map((container) => container.names[0] ?? container.id.slice(0, SHORT_ID_LENGTH))
                            return (
                                <TableRow key={image.id} className="odd:bg-overlay-subtle">
                                    <TableCell className="max-w-80 truncate font-medium text-text-strong">{displayName}</TableCell>
                                    <TableCell className="font-mono text-xs text-text-subtle">
                                        {image.id.replace(/^sha256:/, '').slice(0, SHORT_ID_LENGTH)}
                                    </TableCell>
                                    <TableCell className="text-right text-text-muted">{formatBytes(image.sizeBytes)}</TableCell>
                                    <TableCell className="text-right">
                                        <Button asChild size="xs" variant="outline">
                                            <Link href={{ pathname: '/containers/new', query: { image: displayName } }}>{t('containerCreate')}</Link>
                                        </Button>
                                    </TableCell>
                                    {canRemove ? (
                                        <TableCell className="text-right">
                                            <ImageRemoveDialog
                                                imageId={image.id}
                                                imageName={displayName}
                                                isRemoving={removeImage.isPending}
                                                onConfirm={(input) => runRemove(image.id, input)}
                                                usedByNames={usedByNames}
                                            />
                                        </TableCell>
                                    ) : null}
                                </TableRow>
                            )
                        })}
                    </TableBody>
                </Table>
            ) : null}
        </WidgetSection>
    )
}
