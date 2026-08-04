'use client'

import type { FC } from 'react'
import { useEffect, useState } from 'react'
import { deploymentReleaseListSchema, type DeploymentManifest, type DeploymentRelease } from '@containers/contracts/deployment'
import type { NetworkSummary } from '@containers/contracts/engine-control'
import { useCreateDeploymentManifest, useCreateDeploymentRelease, useRollbackDeploymentRelease } from '@entities/deployment/deployment.query'
import { clientFetchData } from '@shared/lib/client-fetch'
import { Badge } from '@shared/ui/badge'
import { Button } from '@shared/ui/button'
import { InlineAlert } from '@shared/ui/inline-alert'
import { Input } from '@shared/ui/input'
import { Label } from '@shared/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/ui/select'
import { Textarea } from '@shared/ui/textarea'
import { MasterDetail } from '@shared/common/master-detail/master-detail'
import { useMasterDetailSelection } from '@shared/common/master-detail/use-master-detail-selection'
import { WidgetSection } from '@shared/common/widget-section'
import { z } from 'zod'

const ACTIVE_RELEASE_STATUSES = ['creating', 'observing', 'probing', 'rolling-back', 'switching']

type DeploymentWidgetProps = {
    images: Array<{ id: string; repoTags: string[] }>
    labels: {
        command: string
        cpu: string
        create: string
        deploy: string
        deploying: string
        empty: string
        failed: string
        healthPath: string
        hostname: string
        image: string
        manifest: string
        memory: string
        name: string
        network: string
        observation: string
        path: string
        port: string
        recentAuth: string
        release: string
        rollback: string
        rollingBack: string
        secretBindings: string
        status: string
        title: string
        version: string
    }
    manifests: DeploymentManifest[]
    networks: NetworkSummary[]
    releases: DeploymentRelease[]
    role: string
}

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

const releaseStatusClass = (status: DeploymentRelease['status']) => {
    if (status === 'healthy') {
        return 'bg-emerald-950 text-emerald-100'
    }
    if (status === 'failed' || status === 'rolled-back') {
        return 'bg-red-950 text-red-100'
    }
    return 'bg-amber-950 text-amber-100'
}

export const DeploymentWidget: FC<DeploymentWidgetProps> = ({ images, labels, manifests, networks, releases, role }) => {
    const [busy, setBusy] = useState<string>()
    const [error, setError] = useState<string>()
    const [imageDigest, setImageDigest] = useState(images[0]?.id ?? '')
    const [manifestItems, setManifestItems] = useState(manifests)
    const [network, setNetwork] = useState('containers_edge')
    const [releaseItems, setReleaseItems] = useState(releases)
    const canManage = ['owner', 'admin'].includes(role)
    const hasActiveRelease = releaseItems.some((release) => ACTIVE_RELEASE_STATUSES.includes(release.status))
    const { onSelect, selectedId, selectedItem: selectedManifest } = useMasterDetailSelection(manifestItems)
    const createManifestMutation = useCreateDeploymentManifest()
    const createRelease = useCreateDeploymentRelease()
    const rollbackRelease = useRollbackDeploymentRelease()

    useEffect(() => {
        if (!hasActiveRelease) {
            return
        }
        const timer = window.setInterval(() => {
            void clientFetchData<z.infer<typeof deploymentReleaseListSchema>>('/api/deployment-releases')
                .then((parsed) => {
                    setReleaseItems(parsed)
                })
                .catch(() => undefined)
        }, 2_000)
        return () => window.clearInterval(timer)
    }, [hasActiveRelease])

    const createManifest = async (form: FormData) => {
        setBusy('manifest')
        setError(undefined)
        try {
            const created = await createManifestMutation.mutateAsync({
                command: splitLines(form.get('command')),
                entrypoint: [],
                environmentKeys: [],
                healthcheck: {
                    intervalSeconds: 5,
                    path: String(form.get('healthPath') ?? '/'),
                    retries: 6,
                    startPeriodSeconds: 5,
                    timeoutSeconds: 3,
                },
                imageDigest,
                internalPort: Number(form.get('internalPort')),
                memoryBytes: Number(form.get('memoryMiB')) * 1_048_576,
                name: String(form.get('name') ?? ''),
                nanoCpus: Number(form.get('cpu')) * 1_000_000_000,
                network,
                pidsLimit: 256,
                protocol: 'http',
                restartPolicy: 'unless-stopped',
                rollout: {
                    observationSeconds: Number(form.get('observationSeconds')),
                    rollbackRetentionSeconds: 86_400,
                },
                route: {
                    hostname: String(form.get('hostname') ?? ''),
                    path: String(form.get('routePath') ?? '/'),
                    stripPrefix: false,
                },
                secrets: splitSecretBindings(form.get('secretBindings')),
                version: String(form.get('version') ?? ''),
                volumes: [],
            })
            setManifestItems((current) => [created as DeploymentManifest, ...current])
        } catch (createError) {
            setError(createError instanceof Error ? createError.message : labels.failed)
        } finally {
            setBusy(undefined)
        }
    }

    const deploy = async (manifestId: string) => {
        setBusy(manifestId)
        setError(undefined)
        try {
            const created = await createRelease.mutateAsync(manifestId)
            setReleaseItems((current) => [created.release, ...current])
        } catch (deployError) {
            setError(deployError instanceof Error ? deployError.message : labels.failed)
        } finally {
            setBusy(undefined)
        }
    }

    const rollback = async (releaseId: string) => {
        setBusy(`rollback:${releaseId}`)
        setError(undefined)
        try {
            const prepared = await rollbackRelease.mutateAsync(releaseId)
            setReleaseItems((current) => current.map((item) => (item.id === prepared.release.id ? prepared.release : item)))
        } catch (rollbackError) {
            setError(rollbackError instanceof Error ? rollbackError.message : labels.failed)
        } finally {
            setBusy(undefined)
        }
    }

    return (
        <WidgetSection
            id="deployment-control-title"
            title={labels.title}
            notice={canManage ? labels.recentAuth : undefined}
            badge={manifestItems.length}
        >
            {error ? (
                <InlineAlert role="alert" tone="error">
                    {error}
                </InlineAlert>
            ) : null}
            {canManage ? (
                <form
                    className="grid gap-3 border-t border-background p-3 xl:grid-cols-4"
                    onSubmit={(event) => {
                        event.preventDefault()
                        void createManifest(new FormData(event.currentTarget))
                    }}
                >
                    <div className="grid gap-1">
                        <Label htmlFor="deployment-name">{labels.name}</Label>
                        <Input id="deployment-name" name="name" placeholder="my-service" required />
                    </div>
                    <div className="grid gap-1">
                        <Label htmlFor="deployment-version">{labels.version}</Label>
                        <Input id="deployment-version" name="version" placeholder="1.0.0" required />
                    </div>
                    <div className="grid min-w-0 gap-1 xl:col-span-2">
                        <Label htmlFor="deployment-image">{labels.image}</Label>
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
                    </div>
                    <div className="grid gap-1 xl:col-span-2">
                        <Label htmlFor="deployment-hostname">{labels.hostname}</Label>
                        <Input id="deployment-hostname" name="hostname" placeholder="app.example.com" required />
                    </div>
                    <div className="grid gap-1">
                        <Label htmlFor="deployment-path">{labels.path}</Label>
                        <Input id="deployment-path" name="routePath" defaultValue="/" required />
                    </div>
                    <div className="grid gap-1">
                        <Label htmlFor="deployment-health-path">{labels.healthPath}</Label>
                        <Input id="deployment-health-path" name="healthPath" defaultValue="/" required />
                    </div>
                    <div className="grid gap-1">
                        <Label htmlFor="deployment-network">{labels.network}</Label>
                        <Select value={network} onValueChange={setNetwork}>
                            <SelectTrigger id="deployment-network" className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {networks
                                    .filter((networkItem) => networkItem.driver === 'bridge' && networkItem.name === 'containers_edge')
                                    .map((networkItem) => (
                                        <SelectItem key={networkItem.id} value={networkItem.name}>
                                            {networkItem.name}
                                        </SelectItem>
                                    ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid gap-1">
                        <Label htmlFor="deployment-port">{labels.port}</Label>
                        <Input id="deployment-port" name="internalPort" type="number" min="1" max="65535" defaultValue="3000" required />
                    </div>
                    <div className="grid gap-1">
                        <Label htmlFor="deployment-memory">{labels.memory}</Label>
                        <Input id="deployment-memory" name="memoryMiB" type="number" min="16" max="65536" defaultValue="512" required />
                    </div>
                    <div className="grid gap-1">
                        <Label htmlFor="deployment-cpu">{labels.cpu}</Label>
                        <Input id="deployment-cpu" name="cpu" type="number" min="0.1" max="10" step="0.1" defaultValue="1" required />
                    </div>
                    <div className="grid gap-1">
                        <Label htmlFor="deployment-observation">{labels.observation}</Label>
                        <Input id="deployment-observation" name="observationSeconds" type="number" min="10" max="3600" defaultValue="60" required />
                    </div>
                    <div className="grid gap-1 xl:col-span-4">
                        <Label htmlFor="deployment-command">{labels.command}</Label>
                        <Textarea id="deployment-command" name="command" placeholder={'executable\nargument'} />
                    </div>
                    <div className="grid gap-1 xl:col-span-4">
                        <Label htmlFor="deployment-secret-bindings">{labels.secretBindings}</Label>
                        <Textarea
                            id="deployment-secret-bindings"
                            name="secretBindings"
                            placeholder={'TOKEN=apps/my-service/token\nDATABASE_URL=apps/my-service/database-url'}
                        />
                    </div>
                    <Button type="submit" variant="default" disabled={busy === 'manifest' || images.length === 0} className="xl:col-span-4">
                        {labels.create}
                    </Button>
                </form>
            ) : null}
            {manifestItems.length === 0 ? <p className="border-t border-background p-3 text-sm text-muted-foreground">{labels.empty}</p> : null}
            {selectedManifest ? (
                <MasterDetail
                    empty={labels.empty}
                    items={manifestItems.map((manifest) => {
                        const release = releaseItems.find((item) => item.manifestId === manifest.id)
                        return {
                            ...(release ? { badge: labels.status } : undefined),
                            id: manifest.id,
                            subtitle: release
                                ? `${manifest.route.hostname}${manifest.route.path} → :${manifest.internalPort} · ${release.status}`
                                : `${manifest.route.hostname}${manifest.route.path} → :${manifest.internalPort}`,
                            title: `${manifest.name} · ${manifest.version}`,
                        }
                    })}
                    listLabel={labels.manifest}
                    onSelect={onSelect}
                    selectedId={selectedId}
                >
                    <div className="grid gap-3 p-3">
                        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                                <p className="truncate text-sm font-semibold">
                                    {selectedManifest.name} · {selectedManifest.version}
                                </p>
                                <p className="truncate text-xs text-muted-foreground">
                                    {selectedManifest.route.hostname}
                                    {selectedManifest.route.path} → :{selectedManifest.internalPort}
                                </p>
                            </div>
                            <Badge variant="muted">{labels.manifest}</Badge>
                        </div>
                        <p className="truncate font-mono text-xs text-muted-foreground">{selectedManifest.imageDigest}</p>
                        {(() => {
                            const release = releaseItems.find((item) => item.manifestId === selectedManifest.id)
                            const hasActiveDeployment = releaseItems.some(
                                (item) =>
                                    ACTIVE_RELEASE_STATUSES.includes(item.status) &&
                                    manifestItems.find((candidate) => candidate.id === item.manifestId)?.name === selectedManifest.name,
                            )
                            return (
                                <div className="grid gap-px">
                                    {release ? (
                                        <div className="flex min-w-0 items-center justify-between gap-3 bg-background p-2">
                                            <div className="min-w-0">
                                                <p className="text-xs font-medium">{labels.release}</p>
                                                <p className="truncate font-mono text-xs text-muted-foreground">{release.id}</p>
                                            </div>
                                            <span className={`px-2 py-1 text-xs ${releaseStatusClass(release.status)}`}>
                                                {labels.status}: {release.status}
                                            </span>
                                        </div>
                                    ) : null}
                                    {canManage ? (
                                        <div className="flex flex-wrap gap-px">
                                            <Button
                                                type="button"
                                                disabled={busy === selectedManifest.id || hasActiveDeployment}
                                                onClick={() => void deploy(selectedManifest.id)}
                                            >
                                                {busy === selectedManifest.id ? labels.deploying : labels.deploy}
                                            </Button>
                                            {release?.status === 'healthy' && release.previousReleaseId ? (
                                                <Button
                                                    type="button"
                                                    variant="destructive"
                                                    disabled={busy === `rollback:${release.id}` || hasActiveDeployment}
                                                    onClick={() => void rollback(release.id)}
                                                >
                                                    {busy === `rollback:${release.id}` ? labels.rollingBack : labels.rollback}
                                                </Button>
                                            ) : null}
                                        </div>
                                    ) : null}
                                </div>
                            )
                        })()}
                    </div>
                </MasterDetail>
            ) : null}
        </WidgetSection>
    )
}
