import { parseNginxConfig, type NginxBlock, type NginxConfigNode, type NginxDirective } from './parse-nginx-config'
import { serializeNginxConfig, updateDirectiveRaw } from './serialize-nginx-config'

const REAL_IP_SOURCE_DIRECTIVE = 'set_real_ip_from'
const LEADING_WHITESPACE_PATTERN = /^\s*/

const isBlock = (node: NginxConfigNode): node is NginxBlock => node.kind === 'block'
const isDirective = (node: NginxConfigNode): node is NginxDirective => node.kind === 'directive'
const isRealIpSource = (node: NginxConfigNode): node is NginxDirective => isDirective(node) && node.name === REAL_IP_SOURCE_DIRECTIVE

const collectRealIpSources = (nodes: NginxConfigNode[]): NginxDirective[] =>
    nodes.flatMap((node): NginxDirective[] => {
        if (isRealIpSource(node)) return [node]
        return isBlock(node) ? collectRealIpSources(node.children) : []
    })

/**
 * Returns every address the config currently trusts for the real client ip header.
 */
export const readTrustedProxies = (config: string) => collectRealIpSources(parseNginxConfig(config).children).flatMap((directive) => directive.args)

/**
 * Rewrites the `set_real_ip_from` list to exactly the given addresses, keeping the position and
 * indentation of the first directive. Returns null when the list is already identical, when the
 * config has no such directive, or when the requested list is empty — nginx needs at least one
 * source and the engine agent contract rejects a config without the directive.
 */
export const applyTrustedProxies = (config: string, addresses: readonly string[]) => {
    const parsed = parseNginxConfig(config)
    const directives = collectRealIpSources(parsed.children)
    const first = directives[0]
    if (first === undefined) return null

    const next = Array.from(new Set(addresses.map((address) => address.trim()).filter((address) => address.length > 0)))
    if (next.length === 0) return null
    if (directives.flatMap((directive) => directive.args).join(' ') === next.join(' ')) return null

    const indent = LEADING_WHITESPACE_PATTERN.exec(first.raw)?.[0] ?? ''
    const rewrite = (nodes: NginxConfigNode[]): NginxConfigNode[] =>
        nodes.flatMap((node): NginxConfigNode[] => {
            if (node === first) return next.map((address) => updateDirectiveRaw(first, [address], indent))
            if (isRealIpSource(node)) return []
            if (!isBlock(node)) return [node]
            return [{ ...node, children: rewrite(node.children) }]
        })

    return serializeNginxConfig({ ...parsed, children: rewrite(parsed.children) })
}
