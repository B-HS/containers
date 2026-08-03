'use client'

import type { FC, ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import type { DirectiveEntry } from '@shared/lib/nginx-config/nginx-directives'
import type { NginxConfigNode, NginxDirective } from '@shared/lib/nginx-config/parse-nginx-config'
import { findDirectiveNodes, removeDirectiveNodes, upsertDirectiveNode } from '@shared/lib/nginx-config/nginx-editor-model'
import { tokenizeNginxArgs } from '@shared/lib/nginx-config/parse-nginx-config'
import { Checkbox } from '@shared/ui/checkbox'
import { Input } from '@shared/ui/input'
import { Label } from '@shared/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/ui/select'
import { Button } from '@shared/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@shared/ui/tooltip'

type DirectiveTooltipProps = {
    children: ReactNode
    entry: DirectiveEntry
}

const DirectiveTooltip: FC<DirectiveTooltipProps> = ({ children, entry }) => {
    const t = useTranslations('Dashboard')
    const descriptionKey = `nginxGui.directive.${entry.name}`
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

type NginxDirectiveEditorProps = {
    entry: DirectiveEntry
    children: NginxConfigNode[]
    indent: string
    onChange: (children: NginxConfigNode[]) => void
}

export const NginxDirectiveEditor: FC<NginxDirectiveEditorProps> = ({ entry, children, indent, onChange }) => {
    const t = useTranslations('Dashboard')
    const existing = findDirectiveNodes(children, entry.name)
    const placeholder = entry.placeholderKey ? t(`nginxGui.placeholder.${entry.placeholderKey}`) : undefined

    if (entry.multiple) {
        const setNodeArgs = (node: NginxDirective, value: string) => {
            const nextArgs = value.trim() === '' ? [] : tokenizeNginxArgs(value)
            onChange(
                children.map((child) => (child === node ? { ...node, args: nextArgs, raw: `${indent}${entry.name} ${nextArgs.join(' ')};` } : child)),
            )
        }
        const removeNode = (node: NginxDirective) => {
            onChange(children.filter((child) => child !== node))
        }
        const addNode = () => {
            onChange([...children, { kind: 'directive', name: entry.name, args: [], raw: `${indent}${entry.name};` }])
        }

        return (
            <div className="grid gap-2">
                <div className="flex items-center gap-2">
                    <DirectiveTooltip entry={entry}>
                        <code className="font-mono text-sm text-foreground">{entry.name}</code>
                    </DirectiveTooltip>
                    <Button className="ml-auto h-7 px-2 text-xs" type="button" variant="outline" onClick={addNode}>
                        {t('nginxGui.add')}
                    </Button>
                </div>
                {existing.length === 0 ? <p className="pl-4 text-xs text-muted-foreground">{t('nginxGui.noValues')}</p> : null}
                {existing.map((node, index) => (
                    <div key={`${node.raw}-${index}`} className="flex items-center gap-2 pl-4">
                        <Input
                            className="h-7 font-mono text-xs"
                            placeholder={placeholder}
                            value={node.args.join(' ')}
                            onChange={(event) => setNodeArgs(node, event.target.value)}
                            spellCheck={false}
                        />
                        <Button className="h-7 px-2 text-xs" type="button" variant="ghost" onClick={() => removeNode(node)}>
                            {t('nginxGui.remove')}
                        </Button>
                    </div>
                ))}
            </div>
        )
    }

    const checked = existing.length > 0
    const node = existing[0]
    const value = node?.args.join(' ') ?? ''

    const toggle = (next: boolean) => {
        if (next) {
            const firstOption = entry.valueType === 'options' ? entry.options?.[0] : undefined
            const initialArgs = firstOption !== undefined ? [firstOption] : []
            onChange(upsertDirectiveNode(children, entry.name, initialArgs, indent))
        } else {
            onChange(removeDirectiveNodes(children, entry.name))
        }
    }

    const setValue = (next: string) => {
        if (next.trim() === '') {
            onChange(removeDirectiveNodes(children, entry.name))
            return
        }
        onChange(upsertDirectiveNode(children, entry.name, tokenizeNginxArgs(next), indent))
    }

    if (entry.valueType === 'boolean') {
        return (
            <div className="flex items-center gap-2">
                <Checkbox id={`nginx-${entry.name}`} checked={checked} onCheckedChange={(next) => toggle(next === true)} />
                <DirectiveTooltip entry={entry}>
                    <Label className="font-mono text-sm" htmlFor={`nginx-${entry.name}`}>
                        {entry.name}
                    </Label>
                </DirectiveTooltip>
            </div>
        )
    }

    if (entry.valueType === 'options' && entry.options) {
        return (
            <div className="flex items-center gap-2">
                <Checkbox id={`nginx-${entry.name}`} checked={checked} onCheckedChange={(next) => toggle(next === true)} />
                <DirectiveTooltip entry={entry}>
                    <Label className="font-mono text-sm" htmlFor={`nginx-${entry.name}`}>
                        {entry.name}
                    </Label>
                </DirectiveTooltip>
                <Select value={checked ? value : ''} onValueChange={setValue}>
                    <SelectTrigger className="ml-auto h-7 w-40">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="">{t('nginxGui.disabled')}</SelectItem>
                        {entry.options.map((option) => (
                            <SelectItem key={option} value={option}>
                                {option}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
        )
    }

    return (
        <div className="flex items-center gap-2">
            <Checkbox id={`nginx-${entry.name}`} checked={checked} onCheckedChange={(next) => toggle(next === true)} />
            <DirectiveTooltip entry={entry}>
                <Label className="shrink-0 font-mono text-sm" htmlFor={`nginx-${entry.name}`}>
                    {entry.name}
                </Label>
            </DirectiveTooltip>
            <Input
                className="h-7 font-mono text-xs"
                placeholder={placeholder}
                value={value}
                onChange={(event) => setValue(event.target.value)}
                spellCheck={false}
            />
        </div>
    )
}
