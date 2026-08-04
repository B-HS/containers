'use client'

import type { FC } from 'react'
import { useState } from 'react'
import { toast } from 'sonner'
import type { RegistryCredentialUpsert } from '@containers/contracts/registry-credential'
import { useGetRegistryCredentials, usePullImage, useRemoveRegistryCredential, useSaveRegistryCredential } from '@entities/registry/registry.query'
import { RegistryCredentialDetail } from '@features/registry/registry-credential-detail'
import { RegistryCredentialForm } from '@features/registry/registry-credential-form'
import { RegistryPullForm } from '@features/registry/registry-pull-form'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@shared/ui/empty'
import { Skeleton } from '@shared/ui/skeleton'
import { MasterDetail } from '@shared/common/master-detail/master-detail'
import { useMasterDetailSelection } from '@shared/common/master-detail/use-master-detail-selection'
import { WidgetSection } from '@shared/common/widget-section'
import type { RegistryLabels } from './registry-labels'

type RegistryWidgetProps = {
    labels: RegistryLabels
    role: string
}

const SKELETON_ROW_COUNT = 3

export const RegistryWidget: FC<RegistryWidgetProps> = ({ labels, role }) => {
    const [busy, setBusy] = useState<string>()
    const { data, isPending } = useGetRegistryCredentials()
    const credentials = data ?? []
    const isOwner = role === 'owner'
    const { onSelect, selectedId, selectedItem: selectedCredential } = useMasterDetailSelection(credentials)
    const saveCredential = useSaveRegistryCredential()
    const removeCredential = useRemoveRegistryCredential()
    const pullImage = usePullImage()

    const toMessage = (error: unknown) => (error instanceof Error ? error.message : labels.failed)

    const save = async (credentialId: string | undefined, credential: RegistryCredentialUpsert, successMessage: string) => {
        setBusy(credentialId ?? 'create')
        try {
            await saveCredential.mutateAsync({ credential, ...(credentialId === undefined ? {} : { credentialId }) })
            toast.success(successMessage)
            return true
        } catch (saveError) {
            toast.error(toMessage(saveError))
            return false
        } finally {
            setBusy(undefined)
        }
    }

    const remove = async (credentialId: string, confirmation: string) => {
        setBusy(credentialId)
        try {
            await removeCredential.mutateAsync({ credentialId, confirmation })
            toast.success(labels.removed)
        } catch (removeError) {
            toast.error(toMessage(removeError))
        } finally {
            setBusy(undefined)
        }
    }

    const pull = async (reference: string, credentialId: string | undefined) => {
        setBusy('pull')
        try {
            await pullImage.mutateAsync({ reference, ...(credentialId === undefined ? {} : { credentialId }) })
            toast.success(labels.started)
        } catch (pullError) {
            toast.error(toMessage(pullError))
        } finally {
            setBusy(undefined)
        }
    }

    return (
        <WidgetSection id="registry-control-title" title={labels.title} badge={credentials.length} notice={labels.notice}>
            <RegistryPullForm
                busy={busy !== undefined}
                credentials={credentials}
                labels={labels}
                onPull={(reference, id) => void pull(reference, id)}
            />
            {isOwner && (
                <RegistryCredentialForm
                    busy={busy !== undefined}
                    labels={labels}
                    onSave={(credential) => save(undefined, credential, labels.created)}
                />
            )}
            {isPending && (
                <div className="grid gap-px bg-background p-px">
                    {Array.from({ length: SKELETON_ROW_COUNT }, (_, index) => index).map((index) => (
                        <Skeleton key={index} className="h-12 w-full" />
                    ))}
                </div>
            )}
            {!isPending && credentials.length === 0 && (
                <Empty>
                    <EmptyHeader>
                        <EmptyTitle>{labels.empty}</EmptyTitle>
                        <EmptyDescription>{labels.emptyDescription}</EmptyDescription>
                    </EmptyHeader>
                </Empty>
            )}
            {!isPending && credentials.length > 0 && (
                <MasterDetail
                    empty={null}
                    items={credentials.map((credential) => ({
                        badge: labels.credential,
                        id: credential.id,
                        subtitle: `${credential.serverAddress} · ${labels.version} ${credential.version}`,
                        title: credential.name,
                    }))}
                    listLabel={labels.credential}
                    onSelect={onSelect}
                    selectedId={selectedId}
                >
                    {selectedCredential && (
                        <RegistryCredentialDetail
                            busy={busy !== undefined}
                            canManage={isOwner}
                            credential={selectedCredential}
                            labels={labels}
                            onRemove={(confirmation) => void remove(selectedCredential.id, confirmation)}
                            onRotate={(password) =>
                                save(
                                    selectedCredential.id,
                                    {
                                        name: selectedCredential.name,
                                        password,
                                        serverAddress: selectedCredential.serverAddress,
                                        username: selectedCredential.username,
                                    },
                                    labels.rotated,
                                )
                            }
                        />
                    )}
                </MasterDetail>
            )}
        </WidgetSection>
    )
}
