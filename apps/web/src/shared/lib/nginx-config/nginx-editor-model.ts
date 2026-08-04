import type { NginxBlock, NginxConfig, NginxConfigNode, NginxDirective } from '@containers/nginx-config/parse'
import { createDirectiveNode, renderDirectiveRaw } from '@containers/nginx-config/serialize'

export const getBlockIndent = (block: NginxBlock): string => block.head.match(/^\s*/)?.[0] ?? ''

export const getChildIndent = (block: NginxBlock): string => `${getBlockIndent(block)}    `

export const updateDirectiveArgs = (node: NginxDirective, args: string[], indent: string): NginxDirective => ({
    ...node,
    args,
    raw: renderDirectiveRaw(node.name, args, indent),
})

export const findDirectiveNodes = (children: NginxConfigNode[], name: string): NginxDirective[] =>
    children.filter((child): child is NginxDirective => child.kind === 'directive' && child.name === name)

export const upsertDirectiveNode = (children: NginxConfigNode[], name: string, args: string[], indent: string): NginxConfigNode[] => {
    const existing = children.find((child): child is NginxDirective => child.kind === 'directive' && child.name === name)
    if (existing) {
        return children.map((child) => (child === existing ? updateDirectiveArgs(existing, args, indent) : child))
    }
    return [...children, createDirectiveNode(name, args, indent)]
}

export const removeDirectiveNodes = (children: NginxConfigNode[], name: string): NginxConfigNode[] =>
    children.filter((child) => !(child.kind === 'directive' && child.name === name))

export const replaceBlockChildrenInOrder = (root: NginxConfig, blockName: string, newChildrenList: NginxConfigNode[][]): NginxConfig => {
    let index = 0
    const walk = (node: NginxConfigNode): NginxConfigNode => {
        if (node.kind === 'block') {
            let next: NginxBlock = node
            const replacement = newChildrenList[index]
            if (node.name === blockName && replacement !== undefined) {
                next = { ...node, children: replacement }
                index += 1
            }
            if (next.children.some((child) => child.kind === 'block')) {
                return { ...next, children: next.children.map(walk) }
            }
        }
        return node
    }
    return { ...root, children: root.children.map(walk) }
}

export const collectBlocks = (node: NginxConfigNode | NginxConfig, name: string): NginxBlock[] => {
    if (node.kind !== 'block') {
        return []
    }
    const direct = node.name === name ? [node] : []
    return [...direct, ...node.children.flatMap((child) => collectBlocks(child, name))]
}

export const collectServerBlocks = (config: NginxConfig): NginxBlock[] => collectBlocks(config, 'server')

export const collectUpstreamBlocks = (config: NginxConfig): NginxBlock[] => collectBlocks(config, 'upstream')

export const findFirstBlock = (node: NginxConfigNode | NginxConfig, name: string): NginxBlock | undefined => {
    if (node.kind !== 'block') {
        return undefined
    }
    if (node.name === name) {
        return node
    }
    for (const child of node.children) {
        const found = findFirstBlock(child, name)
        if (found) {
            return found
        }
    }
    return undefined
}
