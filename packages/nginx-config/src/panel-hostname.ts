import { parseNginxConfig, type NginxBlock, type NginxConfigNode, type NginxDirective } from './parse-nginx-config'
import { serializeNginxConfig, updateDirectiveRaw } from './serialize-nginx-config'

export const PANEL_SERVER_NAME_MARKER = 'panel.containers.local'

const SERVER_NAME_DIRECTIVE = 'server_name'
const LEADING_WHITESPACE_PATTERN = /^\s*/

const isBlock = (node: NginxConfigNode): node is NginxBlock => node.kind === 'block'
const isDirective = (node: NginxConfigNode): node is NginxDirective => node.kind === 'directive'

const findServerNameDirective = (block: NginxBlock) =>
    block.children.filter(isDirective).find((directive) => directive.name === SERVER_NAME_DIRECTIVE)

const findPanelServerBlock = (nodes: NginxConfigNode[]): NginxBlock | null => {
    for (const node of nodes) {
        if (!isBlock(node)) continue
        if (node.name === 'server') {
            const serverName = findServerNameDirective(node)
            if (serverName?.args.includes(PANEL_SERVER_NAME_MARKER) === true) return node
        }
        const nested = findPanelServerBlock(node.children)
        if (nested !== null) return nested
    }
    return null
}

const replaceNode = (nodes: NginxConfigNode[], target: NginxConfigNode, replacement: NginxConfigNode): NginxConfigNode[] =>
    nodes.map((node) => {
        if (node === target) return replacement
        if (!isBlock(node)) return node
        return { ...node, children: replaceNode(node.children, target, replacement) }
    })

/**
 * Returns the hostnames currently served by the panel server block, or null when the block is absent.
 */
export const readPanelServerNames = (config: string) => {
    const parsed = parseNginxConfig(config)
    const block = findPanelServerBlock(parsed.children)
    if (block === null) return null
    return findServerNameDirective(block)?.args ?? null
}

type PanelHostnameChange = {
    add?: string | null
    remove?: string | null
}

/**
 * Adds and removes a single managed hostname on the panel server block, leaving every other
 * directive and the surrounding formatting untouched. Returns null when nothing changes so the
 * caller can skip an nginx reload.
 */
export const applyPanelHostname = (config: string, { add = null, remove = null }: PanelHostnameChange) => {
    const parsed = parseNginxConfig(config)
    const block = findPanelServerBlock(parsed.children)
    if (block === null) return null

    const directive = findServerNameDirective(block)
    if (directive === undefined) return null

    const kept = directive.args.filter((name) => name !== remove)
    const next = add === null || kept.includes(add) ? kept : [...kept, add]
    if (next.length === 0 || next.join(' ') === directive.args.join(' ')) return null

    const indent = LEADING_WHITESPACE_PATTERN.exec(directive.raw)?.[0] ?? ''
    const updated = updateDirectiveRaw(directive, next, indent)

    return serializeNginxConfig({ ...parsed, children: replaceNode(parsed.children, directive, updated) })
}
