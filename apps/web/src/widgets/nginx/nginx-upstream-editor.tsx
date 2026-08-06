'use client'

import type { FC } from 'react'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { NginxBlock, NginxConfigNode, NginxDirective } from '@containers/nginx-config/parse'
import { getBlockIndent, getChildIndent, updateDirectiveArgs } from '@shared/lib/nginx-config/nginx-editor-model'
import { createDirectiveNode } from '@containers/nginx-config/serialize'
import { tokenizeNginxArgs } from '@containers/nginx-config/parse'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@shared/ui/accordion'
import { Button } from '@shared/ui/button'
import { Checkbox } from '@shared/ui/checkbox'
import { Input } from '@shared/ui/input'
import { Label } from '@shared/ui/label'
import { useGetContainerList } from '@entities/engine/engine.query'
import { NginxHelpTooltip } from '@features/nginx-help-tooltip/nginx-help-tooltip'

type UpstreamServerModel = {
    address: string
    weight: string
    maxConns: string
    maxFails: string
    failTimeout: string
    backup: boolean
    down: boolean
    resolve: boolean
}

const EMPTY_SERVER: UpstreamServerModel = {
    address: '',
    weight: '',
    maxConns: '',
    maxFails: '',
    failTimeout: '',
    backup: false,
    down: false,
    resolve: false,
}

const parseServerModel = (node: NginxDirective): UpstreamServerModel => {
    const [address = '', ...rest] = node.args
    const model: UpstreamServerModel = { ...EMPTY_SERVER, address }
    for (const token of rest) {
        if (token === 'backup') {
            model.backup = true
        } else if (token === 'down') {
            model.down = true
        } else if (token === 'resolve') {
            model.resolve = true
        } else if (token.startsWith('weight=')) {
            model.weight = token.slice('weight='.length)
        } else if (token.startsWith('max_conns=')) {
            model.maxConns = token.slice('max_conns='.length)
        } else if (token.startsWith('max_fails=')) {
            model.maxFails = token.slice('max_fails='.length)
        } else if (token.startsWith('fail_timeout=')) {
            model.failTimeout = token.slice('fail_timeout='.length)
        }
    }
    return model
}

const buildServerArgs = (model: UpstreamServerModel): string[] => {
    const args: string[] = []
    if (model.address.trim() !== '') {
        args.push(model.address.trim())
    }
    if (model.weight.trim() !== '') {
        args.push(`weight=${model.weight.trim()}`)
    }
    if (model.maxConns.trim() !== '') {
        args.push(`max_conns=${model.maxConns.trim()}`)
    }
    if (model.maxFails.trim() !== '') {
        args.push(`max_fails=${model.maxFails.trim()}`)
    }
    if (model.failTimeout.trim() !== '') {
        args.push(`fail_timeout=${model.failTimeout.trim()}`)
    }
    if (model.backup) {
        args.push('backup')
    }
    if (model.down) {
        args.push('down')
    }
    if (model.resolve) {
        args.push('resolve')
    }
    return args
}

type NginxUpstreamEditorProps = {
    block: NginxBlock
    onChange: (block: NginxBlock) => void
}

const UPSTREAM_SUGGESTION_LIST_ID = 'nginx-upstream-address-options'

export const NginxUpstreamEditor: FC<NginxUpstreamEditorProps> = ({ block, onChange }) => {
    const containerSuggestions = (useGetContainerList().data ?? []).flatMap((container) => {
        const name = container.names[0]
        if (name === undefined) return []
        const ports = container.exposedPorts.map((port) => port.split('/')[0]).filter((port): port is string => port !== undefined)
        return ports.length === 0 ? [name] : ports.map((port) => `${name}:${port}`)
    })
    const t = useTranslations('Dashboard')
    const childIndent = getChildIndent(block)
    const [newName, setNewName] = useState('')
    const [newValue, setNewValue] = useState('')

    const updateChildren = (children: NginxConfigNode[]) => onChange({ ...block, children })

    const serverNodes = block.children.filter((child): child is NginxDirective => child.kind === 'directive' && child.name === 'server')
    const otherDirectives = block.children.filter((child): child is NginxDirective => child.kind === 'directive' && child.name !== 'server')

    const updateName = (name: string) => {
        onChange({ ...block, args: [name], head: `${getBlockIndent(block)}upstream ${name} {` })
    }

    const updateServer = (node: NginxDirective, patch: Partial<UpstreamServerModel>) => {
        const nextArgs = buildServerArgs({ ...parseServerModel(node), ...patch })
        updateChildren(block.children.map((child) => (child === node ? updateDirectiveArgs(node, nextArgs, childIndent) : child)))
    }

    const removeServer = (node: NginxDirective) => updateChildren(block.children.filter((child) => child !== node))

    const addServer = () => updateChildren([...block.children, createDirectiveNode('server', [''], childIndent)])

    const updateOther = (node: NginxDirective, value: string) => {
        const nextArgs = value.trim() === '' ? [] : tokenizeNginxArgs(value)
        updateChildren(block.children.map((child) => (child === node ? updateDirectiveArgs(node, nextArgs, childIndent) : child)))
    }

    const removeOther = (node: NginxDirective) => updateChildren(block.children.filter((child) => child !== node))

    const addOtherDirective = () => {
        if (newName.trim() === '') {
            return
        }
        const nextArgs = newValue.trim() === '' ? [] : tokenizeNginxArgs(newValue)
        updateChildren([...block.children, createDirectiveNode(newName.trim(), nextArgs, childIndent)])
        setNewName('')
        setNewValue('')
    }

    return (
        <div className="grid gap-4">
            <datalist id={UPSTREAM_SUGGESTION_LIST_ID}>
                {containerSuggestions.map((suggestion) => (
                    <option key={suggestion} value={suggestion} />
                ))}
            </datalist>
            <div className="flex items-center gap-2">
                <Label className="shrink-0 text-xs" htmlFor={`upstream-name-${block.head}`}>
                    {t('nginxGui.upstreamName')}
                </Label>
                <Input
                    id={`upstream-name-${block.head}`}
                    className="h-8 font-mono text-xs"
                    value={block.args[0] ?? ''}
                    onChange={(event) => updateName(event.target.value)}
                    spellCheck={false}
                />
            </div>
            <div className="grid gap-3">
                <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-text-strong">server</h4>
                    <Button type="button" variant="outline" size="xs" onClick={addServer}>
                        {t('nginxGui.addServer')}
                    </Button>
                </div>
                {serverNodes.length === 0 ? <p className="text-xs text-text-subtle">{t('nginxGui.noServers')}</p> : null}
                {serverNodes.map((node, index) => {
                    const model = parseServerModel(node)
                    return (
                        <div key={`${node.raw}-${index}`} className="grid gap-3 bg-overlay-subtle p-4">
                            <div className="flex items-center gap-2">
                                <NginxHelpTooltip messageKey="nginxGui.upstreamOption.serverAddress">
                                    <Label className="shrink-0 text-xs" htmlFor={`upstream-address-${index}`}>
                                        {t('nginxGui.serverAddress')}
                                    </Label>
                                </NginxHelpTooltip>
                                <Input
                                    id={`upstream-address-${index}`}
                                    className="h-8 font-mono text-xs"
                                    list={UPSTREAM_SUGGESTION_LIST_ID}
                                    value={model.address}
                                    onChange={(event) => updateServer(node, { address: event.target.value })}
                                    spellCheck={false}
                                />
                                <Button type="button" variant="ghost" size="xs" onClick={() => removeServer(node)}>
                                    {t('nginxGui.remove')}
                                </Button>
                            </div>
                            <div className="grid gap-3 sm:grid-cols-4">
                                <div className="grid gap-1">
                                    <NginxHelpTooltip messageKey="nginxGui.upstreamOption.weight">
                                        <Label className="text-xs text-text-muted" htmlFor={`upstream-weight-${index}`}>
                                            {t('nginxGui.weight')}
                                        </Label>
                                    </NginxHelpTooltip>
                                    <Input
                                        id={`upstream-weight-${index}`}
                                        className="h-8 font-mono text-xs"
                                        value={model.weight}
                                        onChange={(event) => updateServer(node, { weight: event.target.value })}
                                        spellCheck={false}
                                    />
                                </div>
                                <div className="grid gap-1">
                                    <NginxHelpTooltip messageKey="nginxGui.upstreamOption.maxConns">
                                        <Label className="text-xs text-text-muted" htmlFor={`upstream-max-conns-${index}`}>
                                            {t('nginxGui.maxConns')}
                                        </Label>
                                    </NginxHelpTooltip>
                                    <Input
                                        id={`upstream-max-conns-${index}`}
                                        className="h-8 font-mono text-xs"
                                        value={model.maxConns}
                                        onChange={(event) => updateServer(node, { maxConns: event.target.value })}
                                        spellCheck={false}
                                    />
                                </div>
                                <div className="grid gap-1">
                                    <NginxHelpTooltip messageKey="nginxGui.upstreamOption.maxFails">
                                        <Label className="text-xs text-text-muted" htmlFor={`upstream-max-fails-${index}`}>
                                            {t('nginxGui.maxFails')}
                                        </Label>
                                    </NginxHelpTooltip>
                                    <Input
                                        id={`upstream-max-fails-${index}`}
                                        className="h-8 font-mono text-xs"
                                        value={model.maxFails}
                                        onChange={(event) => updateServer(node, { maxFails: event.target.value })}
                                        spellCheck={false}
                                    />
                                </div>
                                <div className="grid gap-1">
                                    <NginxHelpTooltip messageKey="nginxGui.upstreamOption.failTimeout">
                                        <Label className="text-xs text-text-muted" htmlFor={`upstream-fail-timeout-${index}`}>
                                            {t('nginxGui.failTimeout')}
                                        </Label>
                                    </NginxHelpTooltip>
                                    <Input
                                        id={`upstream-fail-timeout-${index}`}
                                        className="h-8 font-mono text-xs"
                                        value={model.failTimeout}
                                        onChange={(event) => updateServer(node, { failTimeout: event.target.value })}
                                        spellCheck={false}
                                    />
                                </div>
                            </div>
                            <div className="flex flex-wrap gap-4">
                                <div className="flex items-center gap-2">
                                    <Checkbox
                                        id={`upstream-backup-${index}`}
                                        checked={model.backup}
                                        onCheckedChange={(next) => updateServer(node, { backup: next === true })}
                                    />
                                    <NginxHelpTooltip messageKey="nginxGui.upstreamOption.backup">
                                        <Label className="text-xs" htmlFor={`upstream-backup-${index}`}>
                                            {t('nginxGui.backup')}
                                        </Label>
                                    </NginxHelpTooltip>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Checkbox
                                        id={`upstream-down-${index}`}
                                        checked={model.down}
                                        onCheckedChange={(next) => updateServer(node, { down: next === true })}
                                    />
                                    <NginxHelpTooltip messageKey="nginxGui.upstreamOption.down">
                                        <Label className="text-xs" htmlFor={`upstream-down-${index}`}>
                                            {t('nginxGui.down')}
                                        </Label>
                                    </NginxHelpTooltip>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Checkbox
                                        id={`upstream-resolve-${index}`}
                                        checked={model.resolve}
                                        onCheckedChange={(next) => updateServer(node, { resolve: next === true })}
                                    />
                                    <NginxHelpTooltip messageKey="nginxGui.upstreamOption.resolve">
                                        <Label className="text-xs" htmlFor={`upstream-resolve-${index}`}>
                                            {t('nginxGui.resolve')}
                                        </Label>
                                    </NginxHelpTooltip>
                                </div>
                            </div>
                        </div>
                    )
                })}
            </div>
            <Accordion type="single" collapsible>
                <AccordionItem value="nginx-upstream-other">
                    <AccordionTrigger>{t('nginxGui.otherDirectives')}</AccordionTrigger>
                    <AccordionContent>
                        <div className="grid gap-2">
                            {otherDirectives.map((node, index) => (
                                <div key={`${node.raw}-${index}`} className="flex items-center gap-2">
                                    <code className="shrink-0 font-mono text-sm text-text-strong">{node.name}</code>
                                    <Input
                                        className="h-8 font-mono text-xs"
                                        value={node.args.join(' ')}
                                        onChange={(event) => updateOther(node, event.target.value)}
                                        spellCheck={false}
                                    />
                                    <Button type="button" variant="ghost" size="xs" onClick={() => removeOther(node)}>
                                        {t('nginxGui.remove')}
                                    </Button>
                                </div>
                            ))}
                            <div className="flex items-center gap-2 bg-overlay-subtle p-3">
                                <Input
                                    className="h-8 w-40 font-mono text-xs"
                                    placeholder={t('nginxGui.directiveName')}
                                    value={newName}
                                    onChange={(event) => setNewName(event.target.value)}
                                    spellCheck={false}
                                />
                                <Input
                                    className="h-8 font-mono text-xs"
                                    placeholder={t('nginxGui.directiveValue')}
                                    value={newValue}
                                    onChange={(event) => setNewValue(event.target.value)}
                                    spellCheck={false}
                                />
                                <Button type="button" variant="outline" size="xs" onClick={addOtherDirective}>
                                    {t('nginxGui.add')}
                                </Button>
                            </div>
                        </div>
                    </AccordionContent>
                </AccordionItem>
            </Accordion>
        </div>
    )
}
