'use client'

import type { FC } from 'react'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { NginxBlock, NginxConfig, NginxConfigNode, NginxDirective } from '@shared/lib/nginx-config/parse-nginx-config'
import { findFirstBlock, getChildIndent, updateDirectiveArgs } from '@shared/lib/nginx-config/nginx-editor-model'
import { createDirectiveNode } from '@shared/lib/nginx-config/serialize-nginx-config'
import { tokenizeNginxArgs } from '@shared/lib/nginx-config/parse-nginx-config'
import { Button } from '@shared/ui/button'
import { Input } from '@shared/ui/input'
import { Label } from '@shared/ui/label'

const parseValue = (value: string) => (value.trim() === '' ? [] : tokenizeNginxArgs(value))

type DirectiveRowProps = {
    node: NginxDirective
    onValueChange: (node: NginxDirective, value: string) => void
    onRemove: (node: NginxDirective) => void
    removeLabel: string
}

const DirectiveRow: FC<DirectiveRowProps> = ({ node, onValueChange, onRemove, removeLabel }) => (
    <div className="flex items-center gap-2">
        <code className="shrink-0 font-mono text-sm text-foreground">{node.name}</code>
        <Input
            className="h-7 font-mono text-xs"
            value={node.args.join(' ')}
            onChange={(event) => onValueChange(node, event.target.value)}
            spellCheck={false}
        />
        <Button className="h-7 px-2 text-xs" type="button" variant="ghost" onClick={() => onRemove(node)}>
            {removeLabel}
        </Button>
    </div>
)

type DirectiveSectionProps = {
    directives: NginxDirective[]
    title: string
    namePlaceholder: string
    valuePlaceholder: string
    addLabel: string
    removeLabel: string
    onUpsert: (node: NginxDirective | undefined, name: string, value: string) => void
}

const DirectiveSection: FC<DirectiveSectionProps> = ({ directives, title, namePlaceholder, valuePlaceholder, addLabel, removeLabel, onUpsert }) => {
    const [newName, setNewName] = useState('')
    const [newValue, setNewValue] = useState('')

    const addDirective = () => {
        if (newName.trim() === '') {
            return
        }
        onUpsert(undefined, newName.trim(), newValue)
        setNewName('')
        setNewValue('')
    }

    return (
        <div className="grid gap-2">
            <h4 className="text-sm font-semibold">{title}</h4>
            {directives.length === 0 ? null : (
                <div className="grid gap-2">
                    {directives.map((node, index) => (
                        <DirectiveRow
                            key={`${node.raw}-${index}`}
                            node={node}
                            onValueChange={(target, value) => onUpsert(target, target.name, value)}
                            onRemove={(target) => onUpsert(target, '', '')}
                            removeLabel={removeLabel}
                        />
                    ))}
                </div>
            )}
            <div className="flex items-center gap-2">
                <Input
                    className="h-7 w-40 font-mono text-xs"
                    placeholder={namePlaceholder}
                    value={newName}
                    onChange={(event) => setNewName(event.target.value)}
                    spellCheck={false}
                />
                <Input
                    className="h-7 font-mono text-xs"
                    placeholder={valuePlaceholder}
                    value={newValue}
                    onChange={(event) => setNewValue(event.target.value)}
                    spellCheck={false}
                />
                <Button className="h-7 px-2 text-xs" type="button" variant="outline" onClick={addDirective}>
                    {addLabel}
                </Button>
            </div>
        </div>
    )
}

type NginxGlobalEditorProps = {
    config: NginxConfig
    onChange: (config: NginxConfig) => void
}

export const NginxGlobalEditor: FC<NginxGlobalEditorProps> = ({ config, onChange }) => {
    const t = useTranslations('Dashboard')
    const httpBlock = findFirstBlock(config, 'http')
    const rootDirectives = config.children.filter((child): child is NginxDirective => child.kind === 'directive')
    const httpDirectives = httpBlock?.children.filter((child): child is NginxDirective => child.kind === 'directive') ?? []

    const updateConfigChildren = (children: NginxConfigNode[]) => onChange({ ...config, children })

    const upsertRootDirective = (node: NginxDirective | undefined, name: string, value: string) => {
        if (node !== undefined && value.trim() === '') {
            updateConfigChildren(config.children.filter((child) => child !== node))
            return
        }
        if (node !== undefined) {
            updateConfigChildren(config.children.map((child) => (child === node ? updateDirectiveArgs(node, parseValue(value), '') : child)))
            return
        }
        updateConfigChildren([...config.children, createDirectiveNode(name, parseValue(value), '')])
    }

    const updateHttpChildren = (children: NginxConfigNode[]) => {
        if (httpBlock === undefined) {
            return
        }
        const nextHttp: NginxBlock = { ...httpBlock, children }
        onChange({ ...config, children: config.children.map((child) => (child === httpBlock ? nextHttp : child)) })
    }

    const upsertHttpDirective = (node: NginxDirective | undefined, name: string, value: string) => {
        if (httpBlock === undefined) {
            return
        }
        const indent = getChildIndent(httpBlock)
        if (node !== undefined && value.trim() === '') {
            updateHttpChildren(httpBlock.children.filter((child) => child !== node))
            return
        }
        if (node !== undefined) {
            updateHttpChildren(httpBlock.children.map((child) => (child === node ? updateDirectiveArgs(node, parseValue(value), indent) : child)))
            return
        }
        updateHttpChildren([...httpBlock.children, createDirectiveNode(name, parseValue(value), indent)])
    }

    return (
        <div className="grid gap-4">
            <DirectiveSection
                directives={rootDirectives}
                title="main"
                namePlaceholder={t('nginxGui.directiveName')}
                valuePlaceholder={t('nginxGui.directiveValue')}
                addLabel={t('nginxGui.add')}
                removeLabel={t('nginxGui.remove')}
                onUpsert={upsertRootDirective}
            />
            <div className="grid gap-2 border-t border-background pt-3">
                <div className="flex items-center gap-2">
                    <Label className="shrink-0 text-xs" htmlFor="nginx-http-editor">
                        http
                    </Label>
                </div>
                <DirectiveSection
                    directives={httpDirectives}
                    title=""
                    namePlaceholder={t('nginxGui.directiveName')}
                    valuePlaceholder={t('nginxGui.directiveValue')}
                    addLabel={t('nginxGui.add')}
                    removeLabel={t('nginxGui.remove')}
                    onUpsert={upsertHttpDirective}
                />
            </div>
        </div>
    )
}
