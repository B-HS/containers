'use client'

import type { FC } from 'react'
import type { RegistryCredential } from '@containers/contracts/registry-credential'
import { ConfirmRemoveDialog } from '@features/confirm-remove-dialog/confirm-remove-dialog'
import { Badge } from '@shared/ui/badge'
import { Button } from '@shared/ui/button'
import { Input } from '@shared/ui/input'
import { Label } from '@shared/ui/label'

type RegistryCredentialDetailProps = {
    busy: boolean
    canManage: boolean
    credential: RegistryCredential
    labels: {
        cancel: string
        confirmation: string
        confirmationMismatch: string
        confirmRemoveTitle: string
        password: string
        remove: string
        removeImpact: string
        rotate: string
        serverAddress: string
        username: string
        version: string
    }
    onRemove: (confirmation: string) => void
    onRotate: (password: string) => Promise<boolean>
}

export const RegistryCredentialDetail: FC<RegistryCredentialDetailProps> = ({ busy, canManage, credential, labels, onRemove, onRotate }) => (
    <div className="grid min-w-0 gap-5 p-5">
        <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
                <h3 className="min-w-0 truncate text-base font-semibold text-text-strong">{credential.name}</h3>
                <Badge variant="neutral">
                    {labels.version} {credential.version}
                </Badge>
            </div>
            <dl className="mt-4 grid min-w-0 gap-4 text-xs sm:grid-cols-2">
                <div className="min-w-0">
                    <dt className="text-text-subtle">{labels.serverAddress}</dt>
                    <dd className="mt-1 truncate font-mono text-sm text-text-strong">{credential.serverAddress}</dd>
                </div>
                <div className="min-w-0">
                    <dt className="text-text-subtle">{labels.username}</dt>
                    <dd className="mt-1 truncate text-sm text-text-strong">{credential.username}</dd>
                </div>
            </dl>
        </div>
        {canManage && (
            <div className="grid gap-4 bg-overlay-subtle p-4">
                <form
                    className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
                    onSubmit={(event) => {
                        event.preventDefault()
                        const form = event.currentTarget
                        void onRotate(String(new FormData(form).get('password') ?? '')).then((rotated) => {
                            if (rotated) form.reset()
                        })
                    }}
                >
                    <div className="grid min-w-0 gap-2">
                        <Label htmlFor={`registry-password-${credential.id}`}>{labels.password}</Label>
                        <Input id={`registry-password-${credential.id}`} name="password" autoComplete="new-password" required type="password" />
                    </div>
                    <Button type="submit" size="sm" variant="outline" disabled={busy}>
                        {labels.rotate}
                    </Button>
                </form>
                <ConfirmRemoveDialog
                    cancelLabel={labels.cancel}
                    confirmationLabel={labels.confirmation}
                    description={labels.removeImpact}
                    disabled={busy}
                    expectedValue={credential.name}
                    inputId={`registry-confirm-${credential.id}`}
                    mismatchLabel={labels.confirmationMismatch}
                    onConfirm={() => onRemove(credential.name)}
                    removeLabel={labels.remove}
                    target={credential.name}
                    title={labels.confirmRemoveTitle}
                    trigger={
                        <Button className="justify-self-start" size="sm" type="button" variant="destructive">
                            {labels.remove}
                        </Button>
                    }
                />
            </div>
        )}
    </div>
)
