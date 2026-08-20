'use client'

import type { FC } from 'react'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Layers } from 'lucide-react'
import { toast } from 'sonner'
import { useCreateContainer } from '@entities/engine/engine.query'
import { useGetImages } from '@entities/image/image.query'
import { useGetInfrastructure } from '@entities/infrastructure/infrastructure.query'
import { Button } from '@shared/ui/button'
import { Checkbox } from '@shared/ui/checkbox'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@shared/ui/empty'
import { Input } from '@shared/ui/input'
import { Label } from '@shared/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/ui/select'
import { Skeleton } from '@shared/ui/skeleton'
import { Spinner } from '@shared/ui/spinner'
import { Textarea } from '@shared/ui/textarea'
import { WidgetSection } from '@shared/common/widget-section'
import { CONTAINER_RUNTIME_PROFILE } from '@containers/contracts/container-runtime'
import { useSearchParams } from 'next/navigation'
import { Link, useRouter } from '../../i18n/navigation'

const splitLines = (value: string) =>
    value
        .split('\n')
        .map((part) => part.trim())
        .filter((part) => part.length > 0)

const CREATE_ROLES = ['owner', 'admin']
const DEFAULT_NETWORK = 'containers_edge'
const MEBIBYTE = 1_048_576
const NANO_CPU = 1_000_000_000
const NAME_PATTERN = /^[a-z0-9][a-z0-9_-]*$/
const ENVIRONMENT_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*=.*$/
const VOLUME_PATTERN = /^([a-zA-Z0-9][a-zA-Z0-9_.-]*):(\/[^:]*)(:ro)?$/
const SKELETON_ROWS = [0, 1, 2, 3]

type ContainerCreateWidgetProps = {
    role: string
}

export const ContainerCreateWidget: FC<ContainerCreateWidgetProps> = ({ role }) => {
    const [autoStart, setAutoStart] = useState(true)
    const [errors, setErrors] = useState<{ environment?: string; image?: string; name?: string; volumes?: string }>({})
    const [image, setImage] = useState('')
    const [network, setNetwork] = useState(DEFAULT_NETWORK)
    const [hardened, setHardened] = useState(false)
    const [writablePaths, setWritablePaths] = useState('')
    const t = useTranslations('Dashboard')
    const router = useRouter()
    const searchParams = useSearchParams()
    const requestedImage = searchParams.get('image') ?? ''
    const imageList = useGetImages()
    const infrastructure = useGetInfrastructure()
    const createContainer = useCreateContainer()
    const images = imageList.data ?? []
    const networks = (infrastructure.data?.networks ?? []).filter((candidate) => candidate.driver === 'bridge')
    const selectedImage = image || requestedImage || images[0]?.repoTags[0] || images[0]?.id || ''

    if (!CREATE_ROLES.includes(role)) {
        return null
    }

    const submit = (formData: FormData) => {
        const name = String(formData.get('name') ?? '').trim()
        const environmentLines = splitLines(String(formData.get('environment') ?? ''))
        const volumeLines = splitLines(String(formData.get('volumes') ?? ''))
        const volumeMounts = volumeLines.map((line) => {
            const matched = VOLUME_PATTERN.exec(line)
            return matched ? { mountPath: matched[2] ?? '', name: matched[1] ?? '', readOnly: matched[3] === ':ro' } : null
        })
        const nextErrors = {
            ...(NAME_PATTERN.test(name) ? {} : { name: t('containerNameInvalid') }),
            ...(selectedImage ? {} : { image: t('containerImageRequired') }),
            ...(environmentLines.every((line) => ENVIRONMENT_PATTERN.test(line)) ? {} : { environment: t('containerEnvironmentInvalid') }),
            ...(volumeMounts.every((mount) => mount !== null) ? {} : { volumes: t('containerVolumesInvalid') }),
        }
        setErrors(nextErrors)
        if (Object.keys(nextErrors).length > 0) {
            toast.error(t('containerCreateFailed'))
            return
        }

        const port = String(formData.get('port') ?? '').trim()
        createContainer.mutate(
            {
                autoStart,
                command: splitLines(String(formData.get('command') ?? '')),
                containerPort: port ? Number(port) : undefined,
                environment: environmentLines,
                volumes: volumeMounts.filter((mount) => mount !== null),
                image: selectedImage,
                memoryBytes: Number(formData.get('memoryMiB')) * MEBIBYTE,
                name,
                nanoCpus: Number(formData.get('cpu')) * NANO_CPU,
                network,
                runtime: {
                    capabilities: [],
                    profile: hardened ? CONTAINER_RUNTIME_PROFILE.HARDENED : CONTAINER_RUNTIME_PROFILE.STANDARD,
                    writablePaths: splitLines(writablePaths),
                },
            },
            {
                onError: (error) => toast.error(error instanceof Error ? error.message : t('containerCreateFailed')),
                onSuccess: () => {
                    toast.success(t('containerCreated'))
                    if (port) {
                        router.push(`/nginx/routes?container=${encodeURIComponent(name)}&port=${encodeURIComponent(port)}`)
                        return
                    }
                    router.push('/containers')
                },
            },
        )
    }

    if (imageList.isPending || infrastructure.isPending) {
        return (
            <WidgetSection id="container-create-title" title={t('containerCreate')}>
                <div className="grid gap-3 p-6">
                    {SKELETON_ROWS.map((row) => (
                        <Skeleton key={row} className="h-10 w-full" />
                    ))}
                </div>
            </WidgetSection>
        )
    }

    if (images.length === 0) {
        return (
            <WidgetSection id="container-create-title" title={t('containerCreate')}>
                <Empty>
                    <EmptyHeader>
                        <EmptyMedia variant="icon">
                            <Layers aria-hidden="true" />
                        </EmptyMedia>
                        <EmptyTitle>{t('containerNoImages')}</EmptyTitle>
                        <EmptyDescription>{t('containerNoImagesDescription')}</EmptyDescription>
                    </EmptyHeader>
                    <EmptyContent>
                        <Button asChild size="sm">
                            <Link href="/registry">{t('registryPull')}</Link>
                        </Button>
                    </EmptyContent>
                </Empty>
            </WidgetSection>
        )
    }

    return (
        <WidgetSection id="container-create-title" title={t('containerCreate')}>
            <form
                className="grid gap-px bg-background"
                onSubmit={(event) => {
                    event.preventDefault()
                    submit(new FormData(event.currentTarget))
                }}
            >
                <fieldset className="grid gap-4 bg-surface-1 p-6">
                    <legend className="sr-only">{t('containerSectionBasic')}</legend>
                    <div>
                        <h3 className="text-sm font-semibold text-text-strong">{t('containerSectionBasic')}</h3>
                        <p className="mt-1 text-xs text-text-muted">{t('containerSectionBasicHelp')}</p>
                    </div>
                    <div className="grid gap-4 xl:grid-cols-2">
                        <div className="grid gap-2">
                            <Label htmlFor="container-create-name">{t('containerName')}</Label>
                            <Input
                                id="container-create-name"
                                name="name"
                                autoComplete="off"
                                aria-invalid={errors.name !== undefined}
                                aria-describedby="container-create-name-help"
                                required
                            />
                            <p id="container-create-name-help" className={errors.name ? 'text-xs text-danger' : 'text-xs text-text-subtle'}>
                                {errors.name ?? t('containerNameHelp')}
                            </p>
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="container-create-image">{t('image')}</Label>
                            <Select value={selectedImage} onValueChange={setImage}>
                                <SelectTrigger id="container-create-image" className="w-full" aria-invalid={errors.image !== undefined}>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {images.map((candidate) => {
                                        const identifier = candidate.repoTags[0] ?? candidate.id
                                        return (
                                            <SelectItem key={candidate.id} value={identifier}>
                                                {identifier}
                                            </SelectItem>
                                        )
                                    })}
                                </SelectContent>
                            </Select>
                            <p className={errors.image ? 'text-xs text-danger' : 'text-xs text-text-subtle'}>
                                {errors.image ?? t('containerImageHelp')}
                            </p>
                        </div>
                    </div>
                </fieldset>

                <fieldset className="grid gap-4 bg-surface-1 p-6">
                    <legend className="sr-only">{t('containerSectionNetwork')}</legend>
                    <div>
                        <h3 className="text-sm font-semibold text-text-strong">{t('containerSectionNetwork')}</h3>
                        <p className="mt-1 text-xs text-text-muted">{t('containerSectionNetworkHelp')}</p>
                    </div>
                    <div className="grid gap-4 xl:grid-cols-2">
                        <div className="grid gap-2">
                            <Label htmlFor="container-create-network">{t('containerNetwork')}</Label>
                            <Select value={network} onValueChange={setNetwork}>
                                <SelectTrigger id="container-create-network" className="w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {networks.map((candidate) => (
                                        <SelectItem key={candidate.id} value={candidate.name}>
                                            {candidate.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-text-subtle">{t('containerNetworkHelp')}</p>
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="container-create-port">{t('containerPort')}</Label>
                            <Input id="container-create-port" name="port" type="number" min="1" max="65535" />
                            <p className="text-xs text-text-subtle">{t('containerPortHelp')}</p>
                        </div>
                    </div>
                </fieldset>

                <fieldset className="grid gap-4 bg-surface-1 p-6">
                    <legend className="sr-only">{t('containerSectionResource')}</legend>
                    <div>
                        <h3 className="text-sm font-semibold text-text-strong">{t('containerSectionResource')}</h3>
                        <p className="mt-1 text-xs text-text-muted">{t('containerSectionResourceHelp')}</p>
                    </div>
                    <div className="grid gap-4 xl:grid-cols-2">
                        <div className="grid gap-2">
                            <Label htmlFor="container-create-memory">{t('containerMemory')}</Label>
                            <Input id="container-create-memory" name="memoryMiB" type="number" min="16" max="65536" defaultValue="512" required />
                            <p className="text-xs text-text-subtle">{t('containerMemoryHelp')}</p>
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="container-create-cpu">{t('containerCpu')}</Label>
                            <Input id="container-create-cpu" name="cpu" type="number" min="0.1" max="10" step="0.1" defaultValue="1" required />
                            <p className="text-xs text-text-subtle">{t('containerCpuHelp')}</p>
                        </div>
                    </div>
                </fieldset>

                <fieldset className="grid gap-4 bg-surface-1 p-6">
                    <legend className="sr-only">{t('containerSectionData')}</legend>
                    <div>
                        <h3 className="text-sm font-semibold text-text-strong">{t('containerSectionData')}</h3>
                        <p className="mt-1 text-xs text-text-muted">{t('containerSectionDataHelp')}</p>
                    </div>
                    <div className="grid gap-4 xl:grid-cols-2">
                        <div className="grid gap-2">
                            <Label htmlFor="container-create-environment">{t('containerEnvironment')}</Label>
                            <Textarea
                                id="container-create-environment"
                                name="environment"
                                rows={4}
                                placeholder={'MYSQL_DATABASE=app\nMYSQL_USER=app'}
                                aria-invalid={errors.environment !== undefined}
                            />
                            <p className={errors.environment ? 'text-xs text-danger' : 'text-xs text-text-subtle'}>
                                {errors.environment ?? t('containerEnvironmentHelp')}
                            </p>
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="container-create-volumes">{t('containerVolumes')}</Label>
                            <Textarea
                                id="container-create-volumes"
                                name="volumes"
                                rows={4}
                                placeholder={'app-data:/var/lib/app\nconfig:/etc/app:ro'}
                                aria-invalid={errors.volumes !== undefined}
                            />
                            <p className={errors.volumes ? 'text-xs text-danger' : 'text-xs text-text-subtle'}>
                                {errors.volumes ?? t('containerVolumesHelp')}
                            </p>
                        </div>
                    </div>
                </fieldset>

                <fieldset className="grid gap-4 bg-surface-1 p-6">
                    <legend className="sr-only">{t('containerSectionSecurity')}</legend>
                    <div>
                        <h3 className="text-sm font-semibold text-text-strong">{t('containerSectionSecurity')}</h3>
                        <p className="mt-1 text-xs text-text-muted">{t('containerSectionSecurityHelp')}</p>
                    </div>
                    <div className="grid gap-3">
                        <div className="grid gap-1 bg-overlay-subtle p-3">
                            <Label htmlFor="container-create-hardened">
                                <Checkbox
                                    id="container-create-hardened"
                                    checked={hardened}
                                    onCheckedChange={(checked) => setHardened(checked === true)}
                                />
                                {t('containerHardened')}
                            </Label>
                            <p className="pl-6 text-xs text-text-subtle">{t('containerHardenedHelp')}</p>
                        </div>
                        {hardened && (
                            <div className="grid gap-2 bg-overlay-subtle p-3">
                                <Label htmlFor="container-create-writable-paths">{t('containerWritablePaths')}</Label>
                                <Textarea
                                    id="container-create-writable-paths"
                                    rows={3}
                                    placeholder={'/var/cache/nginx\n/run'}
                                    value={writablePaths}
                                    onChange={(event) => setWritablePaths(event.target.value)}
                                />
                                <p className="text-xs text-text-subtle">{t('containerWritablePathsHelp')}</p>
                            </div>
                        )}
                        <div className="grid gap-1 bg-overlay-subtle p-3">
                            <Label htmlFor="container-create-auto-start">
                                <Checkbox
                                    id="container-create-auto-start"
                                    checked={autoStart}
                                    onCheckedChange={(checked) => setAutoStart(checked === true)}
                                />
                                {t('containerAutoStart')}
                            </Label>
                            <p className="pl-6 text-xs text-text-subtle">{t('containerAutoStartHelp')}</p>
                        </div>
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="container-create-command">{t('command')}</Label>
                        <Textarea id="container-create-command" name="command" placeholder={'executable\nargument'} />
                        <p className="text-xs text-text-subtle">{t('commandHelp')}</p>
                    </div>
                </fieldset>

                <div className="flex justify-end bg-surface-2 px-6 py-4">
                    <Button type="submit" disabled={createContainer.isPending}>
                        {createContainer.isPending ? <Spinner /> : null}
                        {t('create')}
                    </Button>
                </div>
            </form>
        </WidgetSection>
    )
}
