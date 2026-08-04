'use client'

import type { FC } from 'react'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { DIRECTIVE_GROUPS, SERVER_DIRECTIVES, SERVER_DIRECTIVE_NAMES } from '@shared/lib/nginx-config/nginx-directives'
import type { NginxBlock, NginxConfigNode, NginxDirective } from '@shared/lib/nginx-config/parse-nginx-config'
import { getChildIndent, updateDirectiveArgs } from '@shared/lib/nginx-config/nginx-editor-model'
import { createBlockNode, createDirectiveNode } from '@shared/lib/nginx-config/serialize-nginx-config'
import { tokenizeNginxArgs } from '@shared/lib/nginx-config/parse-nginx-config'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@shared/ui/accordion'
import { Button } from '@shared/ui/button'
import { Input } from '@shared/ui/input'
import { Label } from '@shared/ui/label'
import { NginxDirectiveEditor } from '@widgets/nginx/nginx-directive-editor'

type NginxBlockEditorProps = {
    block: NginxBlock
    onChange: (block: NginxBlock) => void
    isLocation?: boolean
    hideLocations?: boolean
}

export const NginxBlockEditor: FC<NginxBlockEditorProps> = ({ block, onChange, isLocation = false, hideLocations = false }) => {
    const t = useTranslations('Dashboard')
    const childIndent = getChildIndent(block)
    const [newName, setNewName] = useState('')
    const [newValue, setNewValue] = useState('')

    const updateChildren = (children: NginxConfigNode[]) => onChange({ ...block, children })

    const locations = block.children.filter((child): child is NginxBlock => child.kind === 'block' && child.name === 'location')
    const otherDirectives = block.children.filter(
        (child): child is NginxDirective => child.kind === 'directive' && !SERVER_DIRECTIVE_NAMES.has(child.name),
    )

    const updateLocationChildren = (location: NginxBlock, next: NginxBlock) => {
        updateChildren(block.children.map((child) => (child === location ? next : child)))
    }

    const updateLocationPath = (location: NginxBlock, path: string) => {
        updateChildren(
            block.children.map((child) =>
                child === location ? { ...location, args: [path], head: `${getChildIndent(block)}location ${path} {` } : child,
            ),
        )
    }

    const removeLocation = (location: NginxBlock) => updateChildren(block.children.filter((child) => child !== location))

    const addLocation = () => updateChildren([...block.children, createBlockNode('location', [''], [], childIndent)])

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
            <Accordion className="grid gap-px bg-background" type="multiple" defaultValue={['nginx-group-basic']}>
                {DIRECTIVE_GROUPS.map((group) => (
                    <AccordionItem className="bg-surface-1 px-3" key={group.id} value={`nginx-group-${group.id}`}>
                        <AccordionTrigger>{t(group.labelKey)}</AccordionTrigger>
                        <AccordionContent>
                            <div className="grid gap-3">
                                {SERVER_DIRECTIVES.filter((entry) => entry.group === group.id).map((entry) => (
                                    <NginxDirectiveEditor
                                        key={entry.name}
                                        entry={entry}
                                        children={block.children}
                                        indent={childIndent}
                                        onChange={updateChildren}
                                    />
                                ))}
                            </div>
                        </AccordionContent>
                    </AccordionItem>
                ))}
                <AccordionItem className="bg-surface-1 px-3" value="nginx-group-other">
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
            {!isLocation && !hideLocations ? (
                <div className="grid gap-3">
                    <div className="flex items-center justify-between">
                        <h4 className="text-sm font-semibold text-text-strong">location</h4>
                        <Button type="button" variant="outline" size="xs" onClick={addLocation}>
                            {t('nginxGui.addLocation')}
                        </Button>
                    </div>
                    {locations.length === 0 ? <p className="text-xs text-text-subtle">{t('nginxGui.noLocations')}</p> : null}
                    {locations.map((location, index) => (
                        <div key={`${location.head}-${index}`} className="grid gap-3 bg-overlay-subtle p-4">
                            <div className="flex items-center gap-2">
                                <Label className="shrink-0 text-xs" htmlFor={`location-path-${index}`}>
                                    {t('nginxGui.locationPath')}
                                </Label>
                                <Input
                                    id={`location-path-${index}`}
                                    className="h-8 font-mono text-xs"
                                    value={location.args[0] ?? ''}
                                    onChange={(event) => updateLocationPath(location, event.target.value)}
                                    spellCheck={false}
                                />
                                <Button type="button" variant="ghost" size="xs" onClick={() => removeLocation(location)}>
                                    {t('nginxGui.remove')}
                                </Button>
                            </div>
                            <NginxBlockEditor block={location} isLocation onChange={(next) => updateLocationChildren(location, next)} />
                        </div>
                    ))}
                </div>
            ) : null}
        </div>
    )
}
