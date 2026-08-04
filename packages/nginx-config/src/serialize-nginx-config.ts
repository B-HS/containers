import type { NginxBlock, NginxConfig, NginxConfigNode, NginxDirective } from './parse-nginx-config'

const serializeNode = (node: NginxConfigNode): string => {
    if (node.kind === 'block') {
        return `${node.head}${node.children.map(serializeNode).join('')}${node.tail}`
    }
    return node.raw
}

export const serializeNginxConfig = (config: NginxConfig): string => `${config.children.map(serializeNode).join('')}${config.tail}`

export const renderDirectiveRaw = (name: string, args: string[], indent = ''): string =>
    `${indent}${name}${args.length > 0 ? ` ${args.join(' ')}` : ''};`

export const createDirectiveNode = (name: string, args: string[], indent = ''): NginxDirective => ({
    kind: 'directive',
    name,
    args,
    raw: renderDirectiveRaw(name, args, indent),
})

export const createBlockNode = (name: string, args: string[], children: NginxConfigNode[] = [], indent = ''): NginxBlock => ({
    kind: 'block',
    name,
    args,
    head: `${indent}${name}${args.length > 0 ? ` ${args.join(' ')}` : ''} {`,
    tail: `${indent}}`,
    children,
})

export const updateDirectiveRaw = (node: NginxDirective, args: string[], indent = ''): NginxDirective => {
    const raw = renderDirectiveRaw(node.name, args, indent)
    return { ...node, args, raw }
}
