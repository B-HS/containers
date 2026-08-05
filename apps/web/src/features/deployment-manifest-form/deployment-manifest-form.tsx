'use client'

import type { FC } from 'react'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { DeploymentManifestInput } from '@containers/contracts/deployment'
import type { NetworkSummary } from '@containers/contracts/engine-control'
import { Button } from '@shared/ui/button'
import { Input } from '@shared/ui/input'
import { Label } from '@shared/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/ui/select'
import { Textarea } from '@shared/ui/textarea'

import { CONTAINER_RUNTIME_PROFILE } from '@containers/contracts/container-runtime'

const BYTES_PER_MIB = 1_048_576
const NANO_CPUS_PER_CORE = 1_000_000_000
const DEFAULT_NETWORK = 'containers_edge'
const DEFAULT_HEALTHCHECK = { intervalSeconds: 5, retries: 6, startPeriodSeconds: 5, timeoutSeconds: 3 }
const DEFAULT_RUNTIME = { capabilities: [], profile: CONTAINER_RUNTIME_PROFILE.STANDARD, writablePaths: [] }
const DEFAULT_PIDS_LIMIT = 256
const DEFAULT_ROLLBACK_RETENTION_SECONDS = 86_400

const splitLines = (value: FormDataEntryValue | null) =>
    String(value ?? '')
        .split('\n')
        .map((part) => part.trim())
        .filter((part) => part.length > 0)

const splitSecretBindings = (value: FormDataEntryValue | null) =>
    splitLines(value).map((line) => {
        const separator = line.indexOf('=')
        return {
            environmentKey: separator < 0 ? line : line.slice(0, separator).trim(),
            reference: separator < 0 ? '' : line.slice(separator + 1).trim(),
        }
    })

type DeploymentManifestFormProps = {
    images: Array<{ id: string; repoTags: string[] }>
    networks: NetworkSummary[]
    onSubmit: (input: DeploymentManifestInput) => void
    pending: boolean
}

export const DeploymentManifestForm: FC<DeploymentManifestFormProps> = ({ images, networks, onSubmit, pending }) => {
    const [imageDigest, setImageDigest] = useState(images[0]?.id ?? '')
    const [network, setNetwork] = useState(DEFAULT_NETWORK)
    const t = useTranslations('Dashboard')
    const networkOptions = networks.filter((item) => item.driver === 'bridge' && item.name === DEFAULT_NETWORK)

    const submit = (form: FormData) => {
        onSubmit({
            command: splitLines(form.get('command')),
            entrypoint: [],
            environmentKeys: [],
            healthcheck: { ...DEFAULT_HEALTHCHECK, path: String(form.get('healthPath') ?? '/') },
            imageDigest,
            internalPort: Number(form.get('internalPort')),
            memoryBytes: Number(form.get('memoryMiB')) * BYTES_PER_MIB,
            name: String(form.get('name') ?? ''),
            nanoCpus: Number(form.get('cpu')) * NANO_CPUS_PER_CORE,
            network,
            pidsLimit: DEFAULT_PIDS_LIMIT,
            protocol: 'http',
            restartPolicy: 'unless-stopped',
            rollout: {
                observationSeconds: Number(form.get('observationSeconds')),
                rollbackRetentionSeconds: DEFAULT_ROLLBACK_RETENTION_SECONDS,
            },
            route: { hostname: String(form.get('hostname') ?? ''), path: String(form.get('routePath') ?? '/'), stripPrefix: false },
            runtime: DEFAULT_RUNTIME,
            secrets: splitSecretBindings(form.get('secretBindings')),
            version: String(form.get('version') ?? ''),
            volumes: [],
        })
    }

    return (
        <form
            className="grid gap-6 bg-surface-1 p-6"
            onSubmit={(event) => {
                event.preventDefault()
                submit(new FormData(event.currentTarget))
            }}
        >
            <fieldset className="grid gap-4 md:grid-cols-2">
                <legend className="pb-2 text-xs font-medium tracking-wide text-text-subtle uppercase">{t('deploymentSectionBasics')}</legend>
                <div className="grid gap-2">
                    <Label htmlFor="deployment-name">{t('containerName')}</Label>
                    <Input id="deployment-name" name="name" placeholder="my-service" required />
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="deployment-version">{t('deploymentVersion')}</Label>
                    <Input id="deployment-version" name="version" placeholder="1.0.0" required />
                </div>
                <div className="grid min-w-0 gap-2 md:col-span-2">
                    <Label htmlFor="deployment-image">{t('image')}</Label>
                    <Select value={imageDigest} onValueChange={setImageDigest} disabled={images.length === 0}>
                        <SelectTrigger id="deployment-image" className="w-full">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {images.map((image) => (
                                <SelectItem key={image.id} value={image.id}>
                                    {image.repoTags[0] ?? image.id}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    {images.length === 0 ? <p className="text-xs text-danger">{t('deploymentImagesRequired')}</p> : null}
                </div>
            </fieldset>
            <fieldset className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <legend className="pb-2 text-xs font-medium tracking-wide text-text-subtle uppercase">{t('deploymentSectionRouting')}</legend>
                <div className="grid gap-2 xl:col-span-2">
                    <Label htmlFor="deployment-hostname">{t('nginxRouteHostname')}</Label>
                    <Input id="deployment-hostname" name="hostname" placeholder="app.example.com" required />
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="deployment-path">{t('nginxRoutePath')}</Label>
                    <Input id="deployment-path" name="routePath" defaultValue="/" required />
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="deployment-health-path">{t('deploymentHealthPath')}</Label>
                    <Input id="deployment-health-path" name="healthPath" defaultValue="/" required />
                </div>
                <div className="grid min-w-0 gap-2">
                    <Label htmlFor="deployment-network">{t('containerNetwork')}</Label>
                    <Select value={network} onValueChange={setNetwork}>
                        <SelectTrigger id="deployment-network" className="w-full">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {networkOptions.map((item) => (
                                <SelectItem key={item.id} value={item.name}>
                                    {item.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="deployment-port">{t('containerPort')}</Label>
                    <Input id="deployment-port" name="internalPort" type="number" min="1" max="65535" defaultValue="3000" required />
                </div>
            </fieldset>
            <fieldset className="grid gap-4 md:grid-cols-2">
                <legend className="pb-2 text-xs font-medium tracking-wide text-text-subtle uppercase">{t('deploymentSectionResources')}</legend>
                <div className="grid gap-2">
                    <Label htmlFor="deployment-memory">{t('containerMemory')}</Label>
                    <Input id="deployment-memory" name="memoryMiB" type="number" min="16" max="65536" defaultValue="512" required />
                    <p className="text-xs text-text-subtle">{t('deploymentMemoryHelp')}</p>
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="deployment-cpu">{t('containerCpu')}</Label>
                    <Input id="deployment-cpu" name="cpu" type="number" min="0.1" max="10" step="0.1" defaultValue="1" required />
                    <p className="text-xs text-text-subtle">{t('deploymentCpuHelp')}</p>
                </div>
            </fieldset>
            <fieldset className="grid gap-4">
                <legend className="pb-2 text-xs font-medium tracking-wide text-text-subtle uppercase">{t('deploymentSectionRollout')}</legend>
                <div className="grid gap-2 md:max-w-xs">
                    <Label htmlFor="deployment-observation">{t('deploymentObservation')}</Label>
                    <Input id="deployment-observation" name="observationSeconds" type="number" min="10" max="3600" defaultValue="60" required />
                    <p className="text-xs text-text-subtle">{t('deploymentObservationHelp')}</p>
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="deployment-command">{t('command')}</Label>
                    <Textarea id="deployment-command" name="command" placeholder={'executable\nargument'} />
                    <p className="text-xs text-text-subtle">{t('commandHelp')}</p>
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="deployment-secret-bindings">{t('deploymentSecretBindings')}</Label>
                    <Textarea
                        id="deployment-secret-bindings"
                        name="secretBindings"
                        placeholder={'TOKEN=apps/my-service/token\nDATABASE_URL=apps/my-service/database-url'}
                    />
                    <p className="text-xs text-text-subtle">{t('deploymentSecretBindingsHelp')}</p>
                </div>
            </fieldset>
            <Button className="justify-self-start" type="submit" disabled={pending || images.length === 0}>
                {t('deploymentManifestCreate')}
            </Button>
        </form>
    )
}
