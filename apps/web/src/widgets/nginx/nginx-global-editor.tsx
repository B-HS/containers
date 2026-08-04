'use client'

import type { FC } from 'react'
import { useTranslations } from 'next-intl'
import type { NginxBlock, NginxConfig, NginxConfigNode, NginxDirective } from '@containers/nginx-config/parse'
import { findFirstBlock, getChildIndent, updateDirectiveArgs } from '@shared/lib/nginx-config/nginx-editor-model'
import { createDirectiveNode } from '@containers/nginx-config/serialize'
import { tokenizeNginxArgs } from '@containers/nginx-config/parse'
import { NginxDirectiveSection } from '@features/nginx-directive-section/nginx-directive-section'

const parseValue = (value: string) => (value.trim() === '' ? [] : tokenizeNginxArgs(value))

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
        <div className="grid gap-px bg-background">
            <div className="bg-surface-1 p-4">
                <NginxDirectiveSection
                    directives={rootDirectives}
                    title="main"
                    namePlaceholder={t('nginxGui.directiveName')}
                    valuePlaceholder={t('nginxGui.directiveValue')}
                    addLabel={t('nginxGui.add')}
                    removeLabel={t('nginxGui.remove')}
                    onUpsert={upsertRootDirective}
                />
            </div>
            <div className="bg-surface-1 p-4">
                <NginxDirectiveSection
                    directives={httpDirectives}
                    title="http"
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
