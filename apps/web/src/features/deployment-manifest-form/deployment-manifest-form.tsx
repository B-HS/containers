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
import { Switch } from '@shared/ui/switch'
import { Textarea } from '@shared/ui/textarea'

import { CONTAINER_RUNTIME_PROFILE } from '@containers/contracts/container-runtime'

const BYTES_PER_MIB = 1_048_576
const NANO_CPUS_PER_CORE = 1_000_000_000
const DEFAULT_NETWORK = 'containers_edge'
const DEFAULT_ROLLBACK_RETENTION_SECONDS = 86_400
const READ_ONLY_VOLUME_MODE = 'ro'

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

const splitVolumes = (value: FormDataEntryValue | null) =>
    splitLines(value).map((line) => {
        const [name, mountPath, mode] = line.split(':')
        return { mountPath: (mountPath ?? '').trim(), name: (name ?? '').trim(), readOnly: mode?.trim() === READ_ONLY_VOLUME_MODE }
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
    const [protocol, setProtocol] = useState<DeploymentManifestInput['protocol']>('http')
    const [restartPolicy, setRestartPolicy] = useState<DeploymentManifestInput['restartPolicy']>('unless-stopped')
    const [published, setPublished] = useState(true)
    const [stripPrefix, setStripPrefix] = useState(false)
    const [hardened, setHardened] = useState(false)
    const t = useTranslations('Dashboard')
    const networkOptions = networks.filter((item) => item.driver === 'bridge' && item.name === DEFAULT_NETWORK)

    const submit = (form: FormData) => {
        onSubmit({
            command: splitLines(form.get('command')),
            entrypoint: splitLines(form.get('entrypoint')),
            environmentKeys: [],
            healthcheck: {
                intervalSeconds: Number(form.get('healthInterval')),
                path: String(form.get('healthPath') ?? '/'),
                retries: Number(form.get('healthRetries')),
                startPeriodSeconds: Number(form.get('healthStartPeriod')),
                timeoutSeconds: Number(form.get('healthTimeout')),
            },
            imageDigest,
            internalPort: Number(form.get('internalPort')),
            memoryBytes: Number(form.get('memoryMiB')) * BYTES_PER_MIB,
            name: String(form.get('name') ?? ''),
            nanoCpus: Number(form.get('cpu')) * NANO_CPUS_PER_CORE,
            network,
            pidsLimit: Number(form.get('pidsLimit')),
            protocol,
            restartPolicy,
            rollout: {
                observationSeconds: Number(form.get('observationSeconds')),
                rollbackRetentionSeconds: DEFAULT_ROLLBACK_RETENTION_SECONDS,
            },
            route: published ? { hostname: String(form.get('hostname') ?? ''), path: String(form.get('routePath') ?? '/'), stripPrefix } : null,
            runtime: {
                capabilities: [],
                profile: hardened ? CONTAINER_RUNTIME_PROFILE.HARDENED : CONTAINER_RUNTIME_PROFILE.STANDARD,
                writablePaths: splitLines(form.get('writablePaths')),
            },
            secrets: splitSecretBindings(form.get('secretBindings')),
            version: String(form.get('version') ?? ''),
            volumes: splitVolumes(form.get('volumes')),
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
                <div className="grid gap-2 xl:col-span-4">
                    <Label htmlFor="deployment-published" className="text-text-muted">
                        <Switch id="deployment-published" checked={published} onCheckedChange={setPublished} />
                        {t('deploymentPublished')}
                    </Label>
                    <p className="text-xs text-text-subtle">{t('deploymentPublishedHelp')}</p>
                </div>
                {published ? (
                    <>
                        <div className="grid gap-2 xl:col-span-2">
                            <Label htmlFor="deployment-hostname">{t('nginxRouteHostname')}</Label>
                            <Input id="deployment-hostname" name="hostname" placeholder="app.example.com" required />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="deployment-path">{t('nginxRoutePath')}</Label>
                            <Input id="deployment-path" name="routePath" defaultValue="/" required />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="deployment-strip-prefix" className="text-text-muted">
                                <Switch id="deployment-strip-prefix" checked={stripPrefix} onCheckedChange={setStripPrefix} />
                                {t('nginxRouteStripPrefix')}
                            </Label>
                        </div>
                    </>
                ) : null}
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
                <div className="grid min-w-0 gap-2">
                    <Label htmlFor="deployment-protocol">{t('nginxRouteProtocol')}</Label>
                    <Select value={protocol} onValueChange={(value) => setProtocol(value === 'websocket' ? 'websocket' : 'http')}>
                        <SelectTrigger id="deployment-protocol" className="w-full">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="http">HTTP</SelectItem>
                            <SelectItem value="websocket">WebSocket</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </fieldset>
            <fieldset className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <legend className="pb-2 text-xs font-medium tracking-wide text-text-subtle uppercase">{t('deploymentSectionHealthcheck')}</legend>
                <div className="grid gap-2">
                    <Label htmlFor="deployment-health-interval">{t('deploymentHealthInterval')}</Label>
                    <Input id="deployment-health-interval" name="healthInterval" type="number" min="2" max="300" defaultValue="5" required />
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="deployment-health-timeout">{t('deploymentHealthTimeout')}</Label>
                    <Input id="deployment-health-timeout" name="healthTimeout" type="number" min="1" max="30" defaultValue="3" required />
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="deployment-health-retries">{t('deploymentHealthRetries')}</Label>
                    <Input id="deployment-health-retries" name="healthRetries" type="number" min="1" max="20" defaultValue="6" required />
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="deployment-health-start">{t('deploymentHealthStartPeriod')}</Label>
                    <Input id="deployment-health-start" name="healthStartPeriod" type="number" min="0" max="600" defaultValue="5" required />
                </div>
            </fieldset>
            <fieldset className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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
                <div className="grid gap-2">
                    <Label htmlFor="deployment-pids">{t('deploymentPidsLimit')}</Label>
                    <Input id="deployment-pids" name="pidsLimit" type="number" min="16" max="4096" defaultValue="256" required />
                </div>
                <div className="grid min-w-0 gap-2">
                    <Label htmlFor="deployment-restart">{t('deploymentRestartPolicy')}</Label>
                    <Select
                        value={restartPolicy}
                        onValueChange={(value) =>
                            setRestartPolicy(value === 'no' || value === 'on-failure' || value === 'unless-stopped' ? value : 'unless-stopped')
                        }
                    >
                        <SelectTrigger id="deployment-restart" className="w-full">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="unless-stopped">unless-stopped</SelectItem>
                            <SelectItem value="on-failure">on-failure</SelectItem>
                            <SelectItem value="no">no</SelectItem>
                        </SelectContent>
                    </Select>
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
                    <Label htmlFor="deployment-entrypoint">{t('deploymentEntrypoint')}</Label>
                    <Textarea id="deployment-entrypoint" name="entrypoint" placeholder={'/bin/sh\n-c'} />
                    <p className="text-xs text-text-subtle">{t('deploymentEntrypointHelp')}</p>
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="deployment-command">{t('command')}</Label>
                    <Textarea id="deployment-command" name="command" placeholder={'executable\nargument'} />
                    <p className="text-xs text-text-subtle">{t('commandHelp')}</p>
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="deployment-volumes">{t('deploymentVolumes')}</Label>
                    <Textarea id="deployment-volumes" name="volumes" placeholder={'my-data:/var/lib/data\nmy-config:/etc/app:ro'} />
                    <p className="text-xs text-text-subtle">{t('deploymentVolumesHelp')}</p>
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
                <div className="grid gap-2">
                    <Label htmlFor="deployment-hardened" className="text-text-muted">
                        <Switch id="deployment-hardened" checked={hardened} onCheckedChange={setHardened} />
                        {t('containerHardened')}
                    </Label>
                    <p className="text-xs text-text-subtle">{t('containerHardenedHelp')}</p>
                </div>
                {hardened ? (
                    <div className="grid gap-2">
                        <Label htmlFor="deployment-writable-paths">{t('containerWritablePaths')}</Label>
                        <Textarea id="deployment-writable-paths" name="writablePaths" placeholder={'/tmp\n/var/cache'} />
                        <p className="text-xs text-text-subtle">{t('containerWritablePathsHelp')}</p>
                    </div>
                ) : null}
            </fieldset>
            <Button className="justify-self-start" type="submit" disabled={pending || images.length === 0}>
                {t('deploymentManifestCreate')}
            </Button>
        </form>
    )
}
