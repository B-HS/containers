'use client'

import type { FC } from 'react'
import { useState } from 'react'
import { Button } from '@shared/ui/button'
import { Input } from '@shared/ui/input'
import { Label } from '@shared/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/ui/select'

const PUBLIC_CREDENTIAL_VALUE = '__public__'

type RegistryPullFormProps = {
    busy: boolean
    credentials: { id: string; name: string; serverAddress: string }[]
    labels: {
        credential: string
        publicCredential: string
        pull: string
        pullReference: string
    }
    onPull: (reference: string, credentialId: string | undefined) => void
}

export const RegistryPullForm: FC<RegistryPullFormProps> = ({ busy, credentials, labels, onPull }) => {
    const [credentialId, setCredentialId] = useState(PUBLIC_CREDENTIAL_VALUE)

    return (
        <form
            className="grid gap-4 bg-surface-3 p-5 sm:grid-cols-[minmax(0,1fr)_14rem_auto] sm:items-end"
            onSubmit={(event) => {
                event.preventDefault()
                const reference = String(new FormData(event.currentTarget).get('reference') ?? '').trim()
                onPull(reference, credentialId === PUBLIC_CREDENTIAL_VALUE ? undefined : credentialId)
            }}
        >
            <div className="grid min-w-0 gap-2">
                <Label htmlFor="registry-pull-reference">{labels.pullReference}</Label>
                <Input id="registry-pull-reference" name="reference" required placeholder="registry.example.com/team/image:tag" />
            </div>
            <div className="grid min-w-0 gap-2">
                <Label htmlFor="registry-pull-credential">{labels.credential}</Label>
                <Select value={credentialId} onValueChange={setCredentialId}>
                    <SelectTrigger id="registry-pull-credential" className="w-full">
                        <SelectValue placeholder={labels.publicCredential} />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value={PUBLIC_CREDENTIAL_VALUE}>{labels.publicCredential}</SelectItem>
                        {credentials.map((credential) => (
                            <SelectItem key={credential.id} value={credential.id}>
                                {credential.name} · {credential.serverAddress}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            <Button type="submit" size="sm" disabled={busy}>
                {labels.pull}
            </Button>
        </form>
    )
}
