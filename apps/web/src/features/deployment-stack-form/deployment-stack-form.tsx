'use client'

import type { FC } from 'react'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { COMPOSE_SOURCE_MAX_BYTES, type ComposeStackInput } from '@containers/contracts/deployment-stack'
import { Button } from '@shared/ui/button'
import { Input } from '@shared/ui/input'
import { Label } from '@shared/ui/label'
import { Textarea } from '@shared/ui/textarea'

const COMPOSE_ROWS = 12

type DeploymentStackFormProps = {
    onPreview: (input: ComposeStackInput) => void
    onSubmit: (input: ComposeStackInput) => void
    pending: boolean
    previewing: boolean
}

export const DeploymentStackForm: FC<DeploymentStackFormProps> = ({ onPreview, onSubmit, pending, previewing }) => {
    const [compose, setCompose] = useState('')
    const [name, setName] = useState('')
    const [version, setVersion] = useState('')
    const t = useTranslations('Dashboard')
    const input = { compose, name, version }
    const incomplete = compose.trim().length === 0 || name.trim().length === 0 || version.trim().length === 0

    const readComposeFile = async (file: File | undefined) => {
        if (!file) return
        setCompose(await file.text())
    }

    return (
        <form
            className="grid gap-6 bg-surface-1 p-6"
            onSubmit={(event) => {
                event.preventDefault()
                onSubmit(input)
            }}
        >
            <fieldset className="grid gap-4 md:grid-cols-2">
                <legend className="pb-2 text-xs font-medium tracking-wide text-text-subtle uppercase">{t('deploymentStackSectionBasics')}</legend>
                <div className="grid gap-2">
                    <Label htmlFor="deployment-stack-name">{t('deploymentStackName')}</Label>
                    <Input
                        id="deployment-stack-name"
                        name="name"
                        onChange={(event) => setName(event.target.value)}
                        placeholder="shop"
                        required
                        value={name}
                    />
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="deployment-stack-version">{t('deploymentVersion')}</Label>
                    <Input
                        id="deployment-stack-version"
                        name="version"
                        onChange={(event) => setVersion(event.target.value)}
                        placeholder="1.0.0"
                        required
                        value={version}
                    />
                </div>
            </fieldset>
            <fieldset className="grid gap-4">
                <legend className="pb-2 text-xs font-medium tracking-wide text-text-subtle uppercase">{t('deploymentStackSectionCompose')}</legend>
                <div className="grid gap-2">
                    <Label htmlFor="deployment-stack-file">{t('deploymentStackFile')}</Label>
                    <Input
                        accept=".yml,.yaml"
                        id="deployment-stack-file"
                        onChange={(event) => void readComposeFile(event.target.files?.[0])}
                        type="file"
                    />
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="deployment-stack-compose">{t('deploymentStackCompose')}</Label>
                    <Textarea
                        className="font-mono text-xs"
                        id="deployment-stack-compose"
                        maxLength={COMPOSE_SOURCE_MAX_BYTES}
                        name="compose"
                        onChange={(event) => setCompose(event.target.value)}
                        placeholder={'services:\n  app:\n    image: app:1.0.0\n    expose: ["8080"]'}
                        required
                        rows={COMPOSE_ROWS}
                        value={compose}
                    />
                    <p className="text-xs text-text-subtle">{t('deploymentStackComposeHelp')}</p>
                </div>
            </fieldset>
            <div className="flex flex-wrap items-center gap-2">
                <Button disabled={incomplete || previewing} onClick={() => onPreview(input)} type="button" variant="secondary">
                    {previewing ? t('deploymentStackPreviewing') : t('deploymentStackPreview')}
                </Button>
                <Button disabled={incomplete || pending} type="submit">
                    {pending ? t('deploymentStackCreating') : t('deploymentStackCreate')}
                </Button>
            </div>
        </form>
    )
}
