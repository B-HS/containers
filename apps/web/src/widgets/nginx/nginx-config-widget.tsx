'use client'

import type { FC } from 'react'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { z } from 'zod'
import { nginxConfigStateSchema } from '@containers/contracts/nginx'
import { useApplyNginxConfig } from '@entities/nginx/nginx.query'
import { formatDateTime } from '@shared/lib/format-date-time'
import type { NginxBlock, NginxConfig, NginxDirective } from '@shared/lib/nginx-config/parse-nginx-config'
import { parseNginxConfig } from '@shared/lib/nginx-config/parse-nginx-config'
import { serializeNginxConfig } from '@shared/lib/nginx-config/serialize-nginx-config'
import { createBlockNode } from '@shared/lib/nginx-config/serialize-nginx-config'
import {
    collectServerBlocks,
    collectUpstreamBlocks,
    findFirstBlock,
    getChildIndent,
    replaceBlockChildrenInOrder,
} from '@shared/lib/nginx-config/nginx-editor-model'
import { Button } from '@shared/ui/button'
import { Card } from '@shared/ui/card'
import { InlineAlert } from '@shared/ui/inline-alert'
import { Input } from '@shared/ui/input'
import { Label } from '@shared/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@shared/ui/tabs'
import { Textarea } from '@shared/ui/textarea'
import { MasterDetail, type MasterDetailItem } from '@shared/common/master-detail/master-detail'
import { useMasterDetailSelection } from '@shared/common/master-detail/use-master-detail-selection'
import { WidgetSection } from '@shared/common/widget-section'
import { NginxBlockEditor } from './nginx-block-editor'
import { NginxGlobalEditor } from './nginx-global-editor'
import { NginxUpstreamEditor } from './nginx-upstream-editor'

type NginxConfigState = z.infer<typeof nginxConfigStateSchema>

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
    state: NginxConfigState | undefined
}

export const NginxConfigWidget: FC<NginxConfigWidgetProps> = ({ labels, role, state }) => {
    const t = useTranslations('Dashboard')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string>()
    const [success, setSuccess] = useState(false)
    const [mode, setMode] = useState<'gui' | 'raw'>('raw')
    const [section, setSection] = useState<'upstream' | 'server' | 'global'>('upstream')
    const [rawConfig, setRawConfig] = useState(state?.config ?? '')
    const [rootConfig, setRootConfig] = useState<NginxConfig>()
    const [serverBlocks, setServerBlocks] = useState<NginxBlock[]>([])
    const [upstreamBlocks, setUpstreamBlocks] = useState<NginxBlock[]>([])
    const [parseError, setParseError] = useState(false)
    const canApply = ['owner', 'admin'].includes(role)
    const applyNginxConfig = useApplyNginxConfig()

    const apply = async (config: string) => {
        if (!state) {
            return
        }
        setBusy(true)
        setError(undefined)
        setSuccess(false)
        try {
            await applyNginxConfig.mutateAsync({ config, expectedSha256: state.sha256 })
            setSuccess(true)
            window.location.reload()
        } catch (applyError) {
            setError(applyError instanceof Error ? applyError.message : labels.failed)
        } finally {
            setBusy(false)
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
        setRawConfig(serializeNginxConfig(config))
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

    return (
        <WidgetSection id="nginx-config-title" title={labels.title} badge={state?.history.length ?? 0}>
            {error ? (
                <InlineAlert role="alert" tone="error">
                    {error}
                </InlineAlert>
            ) : null}
            {success ? (
                <InlineAlert tone="notice" className="bg-muted text-foreground">
                    {labels.success}
                </InlineAlert>
            ) : null}
            {state ? (
                <div className="grid gap-3 border-t border-background p-3">
                    <div>
                        <Label htmlFor="nginx-config-editor">nginx.conf</Label>
                        <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                            {labels.sha256}: {state.sha256}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">{labels.protectedNotice}</p>
                    </div>
                    {canApply ? (
                        <Tabs value={mode} onValueChange={(next) => (next === 'gui' ? enterGui() : setMode('raw'))}>
                            <TabsList>
                                <TabsTrigger value="gui">{t('nginxGui.modeGui')}</TabsTrigger>
                                <TabsTrigger value="raw">{t('nginxGui.modeRaw')}</TabsTrigger>
                            </TabsList>
                            <TabsContent value="gui">
                                {parseError ? (
                                    <div className="grid gap-2 py-3">
                                        <InlineAlert role="alert" tone="error">
                                            {t('nginxGui.invalid')}
                                        </InlineAlert>
                                    </div>
                                ) : rootConfig ? (
                                    <div className="grid gap-3 py-3">
                                        <Tabs value={section} onValueChange={(next) => setSection(next as 'upstream' | 'server' | 'global')}>
                                            <TabsList>
                                                <TabsTrigger value="upstream">{t('nginxGui.sectionUpstream')}</TabsTrigger>
                                                <TabsTrigger value="server">{t('nginxGui.sectionServer')}</TabsTrigger>
                                                <TabsTrigger value="global">{t('nginxGui.sectionGlobal')}</TabsTrigger>
                                            </TabsList>
                                            <TabsContent value="upstream">
                                                <div className="grid gap-3">
                                                    {upstreamBlocks.length === 0 ? (
                                                        <p className="py-2 text-sm text-muted-foreground">{t('nginxGui.noUpstreams')}</p>
                                                    ) : null}
                                                    {upstreamBlocks.map((block, index) => (
                                                        <div key={`upstream-${index}`} className="grid gap-2 rounded-md border border-border p-3">
                                                            <div className="flex items-center justify-between">
                                                                <code className="font-mono text-sm">upstream</code>
                                                                <Button
                                                                    className="h-7 px-2 text-xs"
                                                                    type="button"
                                                                    variant="ghost"
                                                                    onClick={() => removeUpstream(block)}
                                                                >
                                                                    {t('nginxGui.remove')}
                                                                </Button>
                                                            </div>
                                                            <NginxUpstreamEditor
                                                                block={block}
                                                                onChange={(next) => handleUpstreamChange(index, next)}
                                                            />
                                                        </div>
                                                    ))}
                                                    <Button className="h-7 px-2 text-xs" type="button" variant="outline" onClick={addUpstream}>
                                                        {t('nginxGui.addUpstream')}
                                                    </Button>
                                                </div>
                                            </TabsContent>
                                            <TabsContent value="server">
                                                <div className="grid gap-3">
                                                    <MasterDetail
                                                        empty={<p className="py-2 text-sm text-muted-foreground">{t('nginxGui.noServers')}</p>}
                                                        items={serverItems}
                                                        listLabel={t('nginxGui.sectionServer')}
                                                        onSelect={onSelectServer}
                                                        selectedId={selectedServerId}
                                                    >
                                                        {selectedServerIndex !== undefined && selectedServer !== undefined ? (
                                                            selectedLocationIndex === undefined ? (
                                                                <div className="grid gap-3">
                                                                    <div className="flex items-center justify-between">
                                                                        <code className="font-mono text-sm">server</code>
                                                                        <div className="flex items-center gap-2">
                                                                            <Button
                                                                                className="h-7 px-2 text-xs"
                                                                                type="button"
                                                                                variant="outline"
                                                                                onClick={() => addLocation(selectedServerIndex)}
                                                                            >
                                                                                {t('nginxGui.addLocation')}
                                                                            </Button>
                                                                            <Button
                                                                                className="h-7 px-2 text-xs"
                                                                                type="button"
                                                                                variant="ghost"
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
                                                                <div className="grid gap-3">
                                                                    <div className="flex items-center gap-2">
                                                                        <Label
                                                                            className="shrink-0 text-xs"
                                                                            htmlFor={`location-path-${selectedServerIndex}-${selectedLocationIndex}`}
                                                                        >
                                                                            {t('nginxGui.locationPath')}
                                                                        </Label>
                                                                        <Input
                                                                            id={`location-path-${selectedServerIndex}-${selectedLocationIndex}`}
                                                                            className="h-7 font-mono text-xs"
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
                                                                            className="h-7 px-2 text-xs"
                                                                            type="button"
                                                                            variant="ghost"
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
                                                        className="h-7 justify-self-start px-2 text-xs"
                                                        type="button"
                                                        variant="outline"
                                                        onClick={addServer}
                                                    >
                                                        {t('nginxGui.addServer')}
                                                    </Button>
                                                </div>
                                            </TabsContent>
                                            <TabsContent value="global">
                                                <div className="grid gap-3 py-2">
                                                    <NginxGlobalEditor config={rootConfig} onChange={handleRootChange} />
                                                </div>
                                            </TabsContent>
                                        </Tabs>
                                        <Button
                                            className="justify-self-start"
                                            type="button"
                                            variant="default"
                                            disabled={busy}
                                            onClick={() => void apply(rawConfig)}
                                        >
                                            {busy ? labels.applying : t('nginxGui.apply')}
                                        </Button>
                                    </div>
                                ) : null}
                            </TabsContent>
                            <TabsContent value="raw">
                                <form
                                    className="grid gap-3"
                                    onSubmit={(event) => {
                                        event.preventDefault()
                                        void apply(String(new FormData(event.currentTarget).get('config') ?? ''))
                                    }}
                                >
                                    <Textarea
                                        id="nginx-config-editor"
                                        name="config"
                                        className="min-h-128 whitespace-pre overflow-auto"
                                        value={rawConfig}
                                        onChange={(event) => setRawConfig(event.target.value)}
                                        readOnly={!canApply}
                                        spellCheck={false}
                                    />
                                    {canApply ? (
                                        <Button className="justify-self-start" type="submit" variant="default" disabled={busy}>
                                            {busy ? labels.applying : labels.apply}
                                        </Button>
                                    ) : null}
                                </form>
                            </TabsContent>
                        </Tabs>
                    ) : (
                        <Textarea
                            id="nginx-config-editor"
                            className="min-h-128 whitespace-pre overflow-auto"
                            value={rawConfig}
                            onChange={(event) => setRawConfig(event.target.value)}
                            readOnly
                            spellCheck={false}
                        />
                    )}
                </div>
            ) : (
                <p className="p-3 text-sm text-muted-foreground">{labels.failed}</p>
            )}
            {state?.history.length ? (
                <div className="border-t border-background p-3">
                    <h3 className="text-sm font-semibold">{labels.history}</h3>
                    <div className="mt-2 grid gap-px bg-background">
                        {state.history.map((revision) => (
                            <Card key={revision.sha256} className="min-w-0 gap-1 p-3">
                                <p className="truncate font-mono text-xs">{revision.sha256}</p>
                                <p className="text-xs text-muted-foreground">{formatDateTime(revision.createdAt)}</p>
                            </Card>
                        ))}
                    </div>
                </div>
            ) : null}
        </WidgetSection>
    )
}
