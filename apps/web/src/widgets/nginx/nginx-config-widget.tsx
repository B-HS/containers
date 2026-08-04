'use client'

import type { FC } from 'react'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { useApplyNginxConfig, useGetNginxConfig } from '@entities/nginx/nginx.query'
import { formatDateTime } from '@shared/lib/format-date-time'
import type { NginxBlock, NginxConfig, NginxDirective } from '@containers/nginx-config/parse'
import { parseNginxConfig } from '@containers/nginx-config/parse'
import { serializeNginxConfig } from '@containers/nginx-config/serialize'
import { createBlockNode } from '@containers/nginx-config/serialize'
import {
    collectServerBlocks,
    collectUpstreamBlocks,
    findFirstBlock,
    getChildIndent,
    replaceBlockChildrenInOrder,
} from '@shared/lib/nginx-config/nginx-editor-model'
import { Alert, AlertDescription } from '@shared/ui/alert'
import { Button } from '@shared/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@shared/ui/empty'
import { Input } from '@shared/ui/input'
import { Label } from '@shared/ui/label'
import { Skeleton } from '@shared/ui/skeleton'
import { Spinner } from '@shared/ui/spinner'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@shared/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@shared/ui/tabs'
import { Textarea } from '@shared/ui/textarea'
import { MasterDetail, type MasterDetailItem } from '@shared/common/master-detail/master-detail'
import { useMasterDetailSelection } from '@shared/common/master-detail/use-master-detail-selection'
import { WidgetSection } from '@shared/common/widget-section'
import { NginxBlockEditor } from '@widgets/nginx/nginx-block-editor'
import { NginxGlobalEditor } from '@widgets/nginx/nginx-global-editor'
import { NginxUpstreamEditor } from '@widgets/nginx/nginx-upstream-editor'

const APPLY_ROLES = ['owner', 'admin']

type ServerSidebarItem = MasterDetailItem & {
    serverIndex: number
    locationIndex?: number
}

type NginxConfigWidgetProps = {
    labels: {
        apply: string
        applying: string
        failed: string
        history: string
        protectedNotice: string
        sha256: string
        success: string
        title: string
    }
    role: string
}

export const NginxConfigWidget: FC<NginxConfigWidgetProps> = ({ labels, role }) => {
    const t = useTranslations('Dashboard')
    const { data: state, isPending } = useGetNginxConfig()
    const applyNginxConfig = useApplyNginxConfig()
    const [error, setError] = useState<string>()
    const [mode, setMode] = useState<'gui' | 'raw'>('raw')
    const [section, setSection] = useState<'upstream' | 'server' | 'global'>('upstream')
    const [draftConfig, setDraftConfig] = useState<string>()
    const [rootConfig, setRootConfig] = useState<NginxConfig>()
    const [serverBlocks, setServerBlocks] = useState<NginxBlock[]>([])
    const [upstreamBlocks, setUpstreamBlocks] = useState<NginxBlock[]>([])
    const [parseError, setParseError] = useState(false)
    const canApply = APPLY_ROLES.includes(role)
    const rawConfig = draftConfig ?? state?.config ?? ''
    const busy = applyNginxConfig.isPending

    const apply = async (config: string) => {
        if (!state) {
            return
        }
        setError(undefined)
        try {
            await applyNginxConfig.mutateAsync({ config, expectedSha256: state.sha256 })
            setDraftConfig(undefined)
            toast.success(labels.success)
        } catch (applyError) {
            const message = applyError instanceof Error ? applyError.message : labels.failed
            setError(message)
            toast.error(message)
        }
    }

    const syncRaw = (nextRoot: NginxConfig, nextServers: NginxBlock[], nextUpstreams: NginxBlock[]) => {
        const withServers = replaceBlockChildrenInOrder(
            nextRoot,
            'server',
            nextServers.map((block) => block.children),
        )
        const config = replaceBlockChildrenInOrder(
            withServers,
            'upstream',
            nextUpstreams.map((block) => block.children),
        )
        setDraftConfig(serializeNginxConfig(config))
    }

    const enterGui = () => {
        try {
            const parsed = parseNginxConfig(rawConfig)
            setRootConfig(parsed)
            setServerBlocks(collectServerBlocks(parsed))
            setUpstreamBlocks(collectUpstreamBlocks(parsed))
            setParseError(false)
            setMode('gui')
        } catch {
            setParseError(true)
            setMode('gui')
        }
    }

    const handleRootChange = (next: NginxConfig) => {
        setRootConfig(next)
        syncRaw(next, serverBlocks, upstreamBlocks)
    }

    const handleServerChange = (index: number, next: NginxBlock) => {
        const nextServers = serverBlocks.map((block, blockIndex) => (blockIndex === index ? next : block))
        setServerBlocks(nextServers)
        if (rootConfig) {
            syncRaw(rootConfig, nextServers, upstreamBlocks)
        }
    }

    const handleUpstreamChange = (index: number, next: NginxBlock) => {
        const nextUpstreams = upstreamBlocks.map((block, blockIndex) => (blockIndex === index ? next : block))
        setUpstreamBlocks(nextUpstreams)
        if (rootConfig) {
            syncRaw(rootConfig, serverBlocks, nextUpstreams)
        }
    }

    const removeBlock = (target: NginxBlock, list: NginxBlock[], setList: (next: NginxBlock[]) => void) => {
        if (rootConfig === undefined) {
            return
        }
        const removeFromChildren = (children: typeof rootConfig.children): typeof rootConfig.children =>
            children
                .filter((child) => child !== target)
                .map((child) => (child.kind === 'block' ? { ...child, children: removeFromChildren(child.children) } : child))
        const nextRoot = { ...rootConfig, children: removeFromChildren(rootConfig.children) }
        const nextList = list.filter((block) => block !== target)
        setRootConfig(nextRoot)
        setList(nextList)
        syncRaw(nextRoot, nextList, upstreamBlocks)
    }

    const removeServer = (target: NginxBlock) => removeBlock(target, serverBlocks, setServerBlocks)

    const removeUpstream = (target: NginxBlock) => removeBlock(target, upstreamBlocks, setUpstreamBlocks)

    const addServer = () => {
        if (rootConfig === undefined) {
            return
        }
        const httpBlock = findFirstBlock(rootConfig, 'http')
        if (httpBlock === undefined) {
            return
        }
        const block = createBlockNode('server', [], [], getChildIndent(httpBlock))
        const nextRoot = {
            ...rootConfig,
            children: rootConfig.children.map((child) => (child === httpBlock ? { ...httpBlock, children: [...httpBlock.children, block] } : child)),
        }
        const nextServers = [...serverBlocks, block]
        setRootConfig(nextRoot)
        setServerBlocks(nextServers)
        syncRaw(nextRoot, nextServers, upstreamBlocks)
    }

    const nextUpstreamName = () => {
        const existing = new Set(upstreamBlocks.map((block) => block.args[0]))
        let index = 1
        while (existing.has(`upstream_${index}`)) {
            index += 1
        }
        return `upstream_${index}`
    }

    const addUpstream = () => {
        if (rootConfig === undefined) {
            return
        }
        const httpBlock = findFirstBlock(rootConfig, 'http')
        if (httpBlock === undefined) {
            return
        }
        const block = createBlockNode('upstream', [nextUpstreamName()], [], getChildIndent(httpBlock))
        const nextRoot = {
            ...rootConfig,
            children: rootConfig.children.map((child) => (child === httpBlock ? { ...httpBlock, children: [...httpBlock.children, block] } : child)),
        }
        const nextUpstreams = [...upstreamBlocks, block]
        setRootConfig(nextRoot)
        setUpstreamBlocks(nextUpstreams)
        syncRaw(nextRoot, serverBlocks, nextUpstreams)
    }

    const serverTitle = (block: NginxBlock): string => {
        const serverName = block.children.find((child): child is NginxDirective => child.kind === 'directive' && child.name === 'server_name')
        return serverName && serverName.args.length > 0 ? serverName.args.join(' ') : 'server'
    }

    const serverItems: ServerSidebarItem[] = serverBlocks.flatMap((block, serverIndex) => {
        const locations = block.children.filter((child): child is NginxBlock => child.kind === 'block' && child.name === 'location')
        return [
            {
                id: `server-${serverIndex}`,
                serverIndex,
                title: serverTitle(block),
                ...(locations.length > 0 ? { badge: String(locations.length) } : {}),
            },
            ...locations.map((location, locationIndex) => ({
                id: `server-${serverIndex}-location-${locationIndex}`,
                serverIndex,
                locationIndex,
                indent: true,
                title: location.args[0] ?? '/',
            })),
        ]
    })
    const { onSelect: onSelectServer, selectedId: selectedServerId, selectedItem: selectedServerItem } = useMasterDetailSelection(serverItems)

    const findLocationBlock = (serverIndex: number, locationIndex: number): NginxBlock | undefined => {
        const server = serverBlocks[serverIndex]
        if (!server) {
            return undefined
        }
        const locations = server.children.filter((child): child is NginxBlock => child.kind === 'block' && child.name === 'location')
        return locations[locationIndex]
    }
    const selectedServerIndex = selectedServerItem?.serverIndex
    const selectedServer = selectedServerIndex !== undefined ? serverBlocks[selectedServerIndex] : undefined
    const selectedLocationIndex = selectedServerItem?.locationIndex
    const selectedLocation =
        selectedServerIndex !== undefined && selectedLocationIndex !== undefined
            ? findLocationBlock(selectedServerIndex, selectedLocationIndex)
            : undefined

    const handleLocationChange = (serverIndex: number, locationIndex: number, next: NginxBlock) => {
        const server = serverBlocks[serverIndex]
        if (!server) {
            return
        }
        const locations = server.children.filter((child): child is NginxBlock => child.kind === 'block' && child.name === 'location')
        const target = locations[locationIndex]
        if (!target) {
            return
        }
        const nextServer = { ...server, children: server.children.map((child) => (child === target ? next : child)) }
        const nextServers = serverBlocks.map((block, blockIndex) => (blockIndex === serverIndex ? nextServer : block))
        setServerBlocks(nextServers)
        if (rootConfig) {
            syncRaw(rootConfig, nextServers, upstreamBlocks)
        }
    }

    const updateLocationPath = (serverIndex: number, locationIndex: number, path: string) => {
        const server = serverBlocks[serverIndex]
        if (!server) {
            return
        }
        const locations = server.children.filter((child): child is NginxBlock => child.kind === 'block' && child.name === 'location')
        const target = locations[locationIndex]
        if (!target) {
            return
        }
        handleLocationChange(serverIndex, locationIndex, {
            ...target,
            args: [path],
            head: `${getChildIndent(server)}location ${path} {`,
        })
    }

    const removeLocation = (serverIndex: number, locationIndex: number) => {
        const server = serverBlocks[serverIndex]
        if (!server) {
            return
        }
        const locations = server.children.filter((child): child is NginxBlock => child.kind === 'block' && child.name === 'location')
        const target = locations[locationIndex]
        if (!target) {
            return
        }
        const nextServers = serverBlocks.map((block, blockIndex) =>
            blockIndex === serverIndex ? { ...server, children: server.children.filter((child) => child !== target) } : block,
        )
        setServerBlocks(nextServers)
        if (rootConfig) {
            syncRaw(rootConfig, nextServers, upstreamBlocks)
        }
        onSelectServer(`server-${serverIndex}`)
    }

    const addLocation = (serverIndex: number) => {
        const server = serverBlocks[serverIndex]
        if (!server) {
            return
        }
        const location = createBlockNode('location', [''], [], getChildIndent(server))
        const nextServer = { ...server, children: [...server.children, location] }
        const nextServers = serverBlocks.map((block, blockIndex) => (blockIndex === serverIndex ? nextServer : block))
        setServerBlocks(nextServers)
        if (rootConfig) {
            syncRaw(rootConfig, nextServers, upstreamBlocks)
        }
        const locations = nextServer.children.filter((child): child is NginxBlock => child.kind === 'block' && child.name === 'location')
        onSelectServer(`server-${serverIndex}-location-${locations.length - 1}`)
    }

    if (isPending) {
        return (
            <WidgetSection id="nginx-config-title" title={labels.title}>
                <div className="grid gap-3 p-6">
                    <Skeleton className="h-4 w-64" />
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-64 w-full" />
                </div>
            </WidgetSection>
        )
    }

    if (!state) {
        return (
            <WidgetSection id="nginx-config-title" title={labels.title}>
                <Empty>
                    <EmptyHeader>
                        <EmptyTitle>{labels.failed}</EmptyTitle>
                        <EmptyDescription>{t('nginxGui.loadFailed')}</EmptyDescription>
                    </EmptyHeader>
                </Empty>
            </WidgetSection>
        )
    }

    return (
        <WidgetSection id="nginx-config-title" title={labels.title} badge={state.history.length}>
            <div className="grid gap-px bg-background">
                <div className="grid gap-1 bg-surface-2 px-4 py-3">
                    <Label htmlFor="nginx-config-editor">nginx.conf</Label>
                    <p className="font-mono text-xs break-all tabular-nums text-text-muted">
                        {labels.sha256}: {state.sha256}
                    </p>
                    <p className="text-xs text-text-subtle">{labels.protectedNotice}</p>
                </div>
                {canApply ? null : (
                    <Alert className="bg-surface-1">
                        <AlertDescription>{t('nginxGui.readOnly')}</AlertDescription>
                    </Alert>
                )}
                {error ? (
                    <Alert variant="destructive">
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                ) : null}
                <div className="bg-surface-1 p-4">
                    {canApply ? (
                        <Tabs value={mode} onValueChange={(next) => (next === 'gui' ? enterGui() : setMode('raw'))}>
                            <TabsList>
                                <TabsTrigger value="gui">{t('nginxGui.modeGui')}</TabsTrigger>
                                <TabsTrigger value="raw">{t('nginxGui.modeRaw')}</TabsTrigger>
                            </TabsList>
                            <TabsContent value="gui">
                                {parseError ? (
                                    <Alert className="mt-4" variant="warning">
                                        <AlertDescription>{t('nginxGui.invalid')}</AlertDescription>
                                    </Alert>
                                ) : rootConfig ? (
                                    <div className="grid gap-4 pt-4">
                                        <Tabs value={section} onValueChange={(next) => setSection(next as 'upstream' | 'server' | 'global')}>
                                            <TabsList>
                                                <TabsTrigger value="upstream">{t('nginxGui.sectionUpstream')}</TabsTrigger>
                                                <TabsTrigger value="server">{t('nginxGui.sectionServer')}</TabsTrigger>
                                                <TabsTrigger value="global">{t('nginxGui.sectionGlobal')}</TabsTrigger>
                                            </TabsList>
                                            <TabsContent value="upstream">
                                                <div className="grid gap-4 pt-4">
                                                    {upstreamBlocks.length === 0 ? (
                                                        <p className="text-sm text-text-subtle">{t('nginxGui.noUpstreams')}</p>
                                                    ) : null}
                                                    {upstreamBlocks.map((block, index) => (
                                                        <div key={`upstream-${index}`} className="grid gap-3 bg-overlay-subtle p-4">
                                                            <div className="flex items-center justify-between">
                                                                <code className="font-mono text-sm text-text-strong">upstream</code>
                                                                <Button type="button" variant="ghost" size="xs" onClick={() => removeUpstream(block)}>
                                                                    {t('nginxGui.remove')}
                                                                </Button>
                                                            </div>
                                                            <NginxUpstreamEditor
                                                                block={block}
                                                                onChange={(next) => handleUpstreamChange(index, next)}
                                                            />
                                                        </div>
                                                    ))}
                                                    <Button
                                                        className="justify-self-start"
                                                        type="button"
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={addUpstream}
                                                    >
                                                        {t('nginxGui.addUpstream')}
                                                    </Button>
                                                </div>
                                            </TabsContent>
                                            <TabsContent value="server">
                                                <div className="grid gap-4 pt-4">
                                                    <MasterDetail
                                                        empty={<p className="text-sm text-text-subtle">{t('nginxGui.noServers')}</p>}
                                                        items={serverItems}
                                                        listLabel={t('nginxGui.sectionServer')}
                                                        onSelect={onSelectServer}
                                                        selectedId={selectedServerId}
                                                    >
                                                        {selectedServerIndex !== undefined && selectedServer !== undefined ? (
                                                            selectedLocationIndex === undefined ? (
                                                                <div className="grid gap-4">
                                                                    <div className="flex items-center justify-between">
                                                                        <code className="font-mono text-sm text-text-strong">server</code>
                                                                        <div className="flex items-center gap-2">
                                                                            <Button
                                                                                type="button"
                                                                                variant="outline"
                                                                                size="xs"
                                                                                onClick={() => addLocation(selectedServerIndex)}
                                                                            >
                                                                                {t('nginxGui.addLocation')}
                                                                            </Button>
                                                                            <Button
                                                                                type="button"
                                                                                variant="ghost"
                                                                                size="xs"
                                                                                onClick={() => removeServer(selectedServer)}
                                                                            >
                                                                                {t('nginxGui.remove')}
                                                                            </Button>
                                                                        </div>
                                                                    </div>
                                                                    <NginxBlockEditor
                                                                        block={selectedServer}
                                                                        hideLocations
                                                                        onChange={(next) => handleServerChange(selectedServerIndex, next)}
                                                                    />
                                                                </div>
                                                            ) : selectedLocation ? (
                                                                <div className="grid gap-4">
                                                                    <div className="flex items-center gap-2">
                                                                        <Label
                                                                            className="shrink-0 text-xs"
                                                                            htmlFor={`location-path-${selectedServerIndex}-${selectedLocationIndex}`}
                                                                        >
                                                                            {t('nginxGui.locationPath')}
                                                                        </Label>
                                                                        <Input
                                                                            id={`location-path-${selectedServerIndex}-${selectedLocationIndex}`}
                                                                            className="h-8 font-mono text-xs"
                                                                            value={selectedLocation.args[0] ?? ''}
                                                                            onChange={(event) =>
                                                                                updateLocationPath(
                                                                                    selectedServerIndex,
                                                                                    selectedLocationIndex,
                                                                                    event.target.value,
                                                                                )
                                                                            }
                                                                            spellCheck={false}
                                                                        />
                                                                        <Button
                                                                            type="button"
                                                                            variant="ghost"
                                                                            size="xs"
                                                                            onClick={() => removeLocation(selectedServerIndex, selectedLocationIndex)}
                                                                        >
                                                                            {t('nginxGui.remove')}
                                                                        </Button>
                                                                    </div>
                                                                    <NginxBlockEditor
                                                                        block={selectedLocation}
                                                                        isLocation
                                                                        onChange={(next) =>
                                                                            handleLocationChange(selectedServerIndex, selectedLocationIndex, next)
                                                                        }
                                                                    />
                                                                </div>
                                                            ) : null
                                                        ) : null}
                                                    </MasterDetail>
                                                    <Button
                                                        className="justify-self-start"
                                                        type="button"
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={addServer}
                                                    >
                                                        {t('nginxGui.addServer')}
                                                    </Button>
                                                </div>
                                            </TabsContent>
                                            <TabsContent value="global">
                                                <div className="pt-4">
                                                    <NginxGlobalEditor config={rootConfig} onChange={handleRootChange} />
                                                </div>
                                            </TabsContent>
                                        </Tabs>
                                        <Button className="justify-self-start" type="button" disabled={busy} onClick={() => void apply(rawConfig)}>
                                            {busy ? <Spinner /> : null}
                                            {busy ? labels.applying : t('nginxGui.apply')}
                                        </Button>
                                    </div>
                                ) : null}
                            </TabsContent>
                            <TabsContent value="raw">
                                <form
                                    className="grid gap-4 pt-4"
                                    onSubmit={(event) => {
                                        event.preventDefault()
                                        void apply(String(new FormData(event.currentTarget).get('config') ?? ''))
                                    }}
                                >
                                    <Textarea
                                        id="nginx-config-editor"
                                        name="config"
                                        className="min-h-128 overflow-auto whitespace-pre"
                                        value={rawConfig}
                                        onChange={(event) => setDraftConfig(event.target.value)}
                                        spellCheck={false}
                                    />
                                    <Button className="justify-self-start" type="submit" disabled={busy}>
                                        {busy ? <Spinner /> : null}
                                        {busy ? labels.applying : labels.apply}
                                    </Button>
                                </form>
                            </TabsContent>
                        </Tabs>
                    ) : (
                        <Textarea
                            id="nginx-config-editor"
                            className="min-h-128 overflow-auto whitespace-pre"
                            value={rawConfig}
                            readOnly
                            spellCheck={false}
                        />
                    )}
                </div>
                {state.history.length > 0 ? (
                    <div className="grid gap-3 bg-surface-1 p-4">
                        <h3 className="text-sm font-semibold text-text-strong">{labels.history}</h3>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>{labels.sha256}</TableHead>
                                    <TableHead>{t('nginxGui.appliedAt')}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {state.history.map((revision) => (
                                    <TableRow key={revision.sha256}>
                                        <TableCell className="max-w-0 truncate font-mono text-xs tabular-nums">{revision.sha256}</TableCell>
                                        <TableCell className="text-xs tabular-nums text-text-muted">{formatDateTime(revision.createdAt)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                ) : null}
            </div>
        </WidgetSection>
    )
}
