'use client'

import type { FC } from 'react'
import type { RegistryCredentialUpsert } from '@containers/contracts/registry-credential'
import { Button } from '@shared/ui/button'
import { Input } from '@shared/ui/input'
import { Label } from '@shared/ui/label'

const FIELDS = ['name', 'serverAddress', 'username', 'password'] as const

type RegistryCredentialFormProps = {
    busy: boolean
    labels: {
        credentialCreate: string
        name: string
        password: string
        save: string
        serverAddress: string
        username: string
    }
    onSave: (input: RegistryCredentialUpsert) => Promise<boolean>
}

export const RegistryCredentialForm: FC<RegistryCredentialFormProps> = ({ busy, labels, onSave }) => (
    <form
        className="grid gap-4 bg-surface-3 p-5"
        onSubmit={(event) => {
            event.preventDefault()
            const form = event.currentTarget
            const data = new FormData(form)
            void onSave({
                name: String(data.get('name') ?? ''),
                password: String(data.get('password') ?? ''),
                serverAddress: String(data.get('serverAddress') ?? ''),
                username: String(data.get('username') ?? ''),
            }).then((saved) => {
                if (saved) form.reset()
            })
        }}
    >
        <p className="text-sm font-medium text-text-strong">{labels.credentialCreate}</p>
        <div className="grid gap-4 sm:grid-cols-2">
            {FIELDS.map((field) => (
                <div key={field} className="grid min-w-0 gap-2">
                    <Label htmlFor={`registry-${field}`}>{labels[field]}</Label>
                    <Input
                        id={`registry-${field}`}
                        name={field}
                        autoComplete={field === 'password' ? 'new-password' : 'off'}
                        required
                        type={field === 'password' ? 'password' : 'text'}
                    />
                </div>
            ))}
        </div>
        <Button type="submit" size="sm" className="justify-self-start" disabled={busy}>
            {labels.save}
        </Button>
    </form>
)
