'use client'

import type { FC, ReactNode } from 'react'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { NginxBlock, NginxConfigNode, NginxDirective } from '@shared/lib/nginx-config/parse-nginx-config'
import { getBlockIndent, getChildIndent, updateDirectiveArgs } from '@shared/lib/nginx-config/nginx-editor-model'
import { createDirectiveNode } from '@shared/lib/nginx-config/serialize-nginx-config'
import { tokenizeNginxArgs } from '@shared/lib/nginx-config/parse-nginx-config'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@shared/ui/accordion'
import { Button } from '@shared/ui/button'
import { Checkbox } from '@shared/ui/checkbox'
import { Input } from '@shared/ui/input'
import { Label } from '@shared/ui/label'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@shared/ui/tooltip'

type UpstreamOptionTooltipProps = {
    children: ReactNode
    optionKey: string
}

const UpstreamOptionTooltip: FC<UpstreamOptionTooltipProps> = ({ children, optionKey }) => {
    const t = useTranslations('Dashboard')
    const descriptionKey = `nginxGui.upstreamOption.${optionKey}`
    const description = t.has(descriptionKey) ? t(descriptionKey) : undefined
    if (description === undefined) {
        return <>{children}</>
    }
    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>{children}</TooltipTrigger>
                <TooltipContent>{description}</TooltipContent>
            </Tooltip>
        </TooltipProvider>
    )
}

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

export const NginxUpstreamEditor: FC<NginxUpstreamEditorProps> = ({ block, onChange }) => {
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
        <div className="grid gap-3">
            <div className="flex items-center gap-2">
                <Label className="shrink-0 text-xs" htmlFor={`upstream-name-${block.head}`}>
                    {t('nginxGui.upstreamName')}
                </Label>
                <Input
                    id={`upstream-name-${block.head}`}
                    className="h-7 font-mono text-xs"
                    value={block.args[0] ?? ''}
                    onChange={(event) => updateName(event.target.value)}
                    spellCheck={false}
                />
            </div>
            <div className="grid gap-2 border-t border-background pt-3">
                <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold">server</h4>
                    <Button className="h-7 px-2 text-xs" type="button" variant="outline" onClick={addServer}>
                        {t('nginxGui.addServer')}
                    </Button>
                </div>
                {serverNodes.length === 0 ? <p className="text-xs text-muted-foreground">{t('nginxGui.noServers')}</p> : null}
                {serverNodes.map((node, index) => {
                    const model = parseServerModel(node)
                    return (
                        <div key={`${node.raw}-${index}`} className="grid gap-2 rounded-md border border-border p-3">
                            <div className="flex items-center gap-2">
                                <UpstreamOptionTooltip optionKey="serverAddress">
                                    <Label className="shrink-0 text-xs" htmlFor={`upstream-address-${index}`}>
                                        {t('nginxGui.serverAddress')}
                                    </Label>
                                </UpstreamOptionTooltip>
                                <Input
                                    id={`upstream-address-${index}`}
                                    className="h-7 font-mono text-xs"
                                    value={model.address}
                                    onChange={(event) => updateServer(node, { address: event.target.value })}
                                    spellCheck={false}
                                />
                                <Button className="h-7 px-2 text-xs" type="button" variant="ghost" onClick={() => removeServer(node)}>
                                    {t('nginxGui.remove')}
                                </Button>
                            </div>
                            <div className="grid gap-2 pl-2 sm:grid-cols-4">
                                <div className="grid gap-1">
                                    <UpstreamOptionTooltip optionKey="weight">
                                        <Label className="text-xs text-muted-foreground" htmlFor={`upstream-weight-${index}`}>
                                            {t('nginxGui.weight')}
                                        </Label>
                                    </UpstreamOptionTooltip>
                                    <Input
                                        id={`upstream-weight-${index}`}
                                        className="h-7 font-mono text-xs"
                                        value={model.weight}
                                        onChange={(event) => updateServer(node, { weight: event.target.value })}
                                        spellCheck={false}
                                    />
                                </div>
                                <div className="grid gap-1">
                                    <UpstreamOptionTooltip optionKey="maxConns">
                                        <Label className="text-xs text-muted-foreground" htmlFor={`upstream-max-conns-${index}`}>
                                            {t('nginxGui.maxConns')}
                                        </Label>
                                    </UpstreamOptionTooltip>
                                    <Input
                                        id={`upstream-max-conns-${index}`}
                                        className="h-7 font-mono text-xs"
                                        value={model.maxConns}
                                        onChange={(event) => updateServer(node, { maxConns: event.target.value })}
                                        spellCheck={false}
                                    />
                                </div>
                                <div className="grid gap-1">
                                    <UpstreamOptionTooltip optionKey="maxFails">
                                        <Label className="text-xs text-muted-foreground" htmlFor={`upstream-max-fails-${index}`}>
                                            {t('nginxGui.maxFails')}
                                        </Label>
                                    </UpstreamOptionTooltip>
                                    <Input
                                        id={`upstream-max-fails-${index}`}
                                        className="h-7 font-mono text-xs"
                                        value={model.maxFails}
                                        onChange={(event) => updateServer(node, { maxFails: event.target.value })}
                                        spellCheck={false}
                                    />
                                </div>
                                <div className="grid gap-1">
                                    <UpstreamOptionTooltip optionKey="failTimeout">
                                        <Label className="text-xs text-muted-foreground" htmlFor={`upstream-fail-timeout-${index}`}>
                                            {t('nginxGui.failTimeout')}
                                        </Label>
                                    </UpstreamOptionTooltip>
                                    <Input
                                        id={`upstream-fail-timeout-${index}`}
                                        className="h-7 font-mono text-xs"
                                        value={model.failTimeout}
                                        onChange={(event) => updateServer(node, { failTimeout: event.target.value })}
                                        spellCheck={false}
                                    />
                                </div>
                            </div>
                            <div className="flex flex-wrap gap-4 pl-2">
                                <div className="flex items-center gap-2">
                                    <Checkbox
                                        id={`upstream-backup-${index}`}
                                        checked={model.backup}
                                        onCheckedChange={(next) => updateServer(node, { backup: next === true })}
                                    />
                                    <UpstreamOptionTooltip optionKey="backup">
                                        <Label className="text-xs" htmlFor={`upstream-backup-${index}`}>
                                            {t('nginxGui.backup')}
                                        </Label>
                                    </UpstreamOptionTooltip>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Checkbox
                                        id={`upstream-down-${index}`}
                                        checked={model.down}
                                        onCheckedChange={(next) => updateServer(node, { down: next === true })}
                                    />
                                    <UpstreamOptionTooltip optionKey="down">
                                        <Label className="text-xs" htmlFor={`upstream-down-${index}`}>
                                            {t('nginxGui.down')}
                                        </Label>
                                    </UpstreamOptionTooltip>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Checkbox
                                        id={`upstream-resolve-${index}`}
                                        checked={model.resolve}
                                        onCheckedChange={(next) => updateServer(node, { resolve: next === true })}
                                    />
                                    <UpstreamOptionTooltip optionKey="resolve">
                                        <Label className="text-xs" htmlFor={`upstream-resolve-${index}`}>
                                            {t('nginxGui.resolve')}
                                        </Label>
                                    </UpstreamOptionTooltip>
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
                                    <code className="shrink-0 font-mono text-sm text-foreground">{node.name}</code>
                                    <Input
                                        className="h-7 font-mono text-xs"
                                        value={node.args.join(' ')}
                                        onChange={(event) => updateOther(node, event.target.value)}
                                        spellCheck={false}
                                    />
                                    <Button className="h-7 px-2 text-xs" type="button" variant="ghost" onClick={() => removeOther(node)}>
                                        {t('nginxGui.remove')}
                                    </Button>
                                </div>
                            ))}
                            <div className="flex items-center gap-2">
                                <Input
                                    className="h-7 w-40 font-mono text-xs"
                                    placeholder={t('nginxGui.directiveName')}
                                    value={newName}
                                    onChange={(event) => setNewName(event.target.value)}
                                    spellCheck={false}
                                />
                                <Input
                                    className="h-7 font-mono text-xs"
                                    placeholder={t('nginxGui.directiveValue')}
                                    value={newValue}
                                    onChange={(event) => setNewValue(event.target.value)}
                                    spellCheck={false}
                                />
                                <Button className="h-7 px-2 text-xs" type="button" variant="outline" onClick={addOtherDirective}>
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
