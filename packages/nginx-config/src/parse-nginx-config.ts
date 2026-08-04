export type NginxText = {
    kind: 'text'
    raw: string
}

export type NginxComment = {
    kind: 'comment'
    raw: string
}

export type NginxDirective = {
    kind: 'directive'
    name: string
    args: string[]
    raw: string
}

export type NginxBlock = {
    kind: 'block'
    name: string
    args: string[]
    head: string
    tail: string
    children: NginxConfigNode[]
}

export type NginxConfigNode = NginxText | NginxComment | NginxDirective | NginxBlock

export type NginxConfig = NginxBlock

type ScanResult = {
    end: number
    terminator: 'comment' | 'semicolon' | 'open' | 'close' | 'eof'
}

const findLineEnd = (text: string, start: number) => {
    let index = start
    while (index < text.length && text[index] !== '\n') {
        index += 1
    }
    return index
}

const scanStatementEnd = (text: string, start: number): ScanResult => {
    let quote: "'" | '"' | undefined
    let hasContent = false
    for (let index = start; index < text.length; index += 1) {
        const char = text[index]
        if (quote !== undefined) {
            if (char === quote) {
                quote = undefined
            }
            continue
        }
        if (char === "'" || char === '"') {
            quote = char
            hasContent = true
            continue
        }
        if (char === '#') {
            if (!hasContent) {
                return { end: findLineEnd(text, index), terminator: 'comment' }
            }
            index = findLineEnd(text, index)
            continue
        }
        if (char === ';') {
            return { end: index + 1, terminator: 'semicolon' }
        }
        if (char === '{') {
            return { end: index + 1, terminator: 'open' }
        }
        if (char === '}') {
            return { end: index + 1, terminator: 'close' }
        }
        if (char !== ' ' && char !== '\t' && char !== '\n' && char !== '\r') {
            hasContent = true
        }
    }
    return { end: text.length, terminator: 'eof' }
}

export const tokenizeNginxArgs = (source: string): string[] => {
    const tokens: string[] = []
    let current = ''
    let quote: "'" | '"' | undefined
    for (const char of source) {
        if (quote !== undefined) {
            if (char === quote) {
                quote = undefined
            } else {
                current += char
            }
            continue
        }
        if (char === "'" || char === '"') {
            quote = char
            continue
        }
        if (char === '#') {
            break
        }
        if (char === ' ' || char === '\t' || char === '\n' || char === '\r') {
            if (current !== '') {
                tokens.push(current)
                current = ''
            }
            continue
        }
        current += char
    }
    if (current !== '') {
        tokens.push(current)
    }
    return tokens
}

const parseBlockBody = (text: string, start: number, block: NginxBlock): number => {
    let position = start
    while (position < text.length) {
        const { end, terminator } = scanStatementEnd(text, position)
        const raw = text.slice(position, end)
        const trimmed = raw.trim()

        if (terminator === 'close') {
            block.tail = raw
            return end
        }
        if (terminator === 'comment') {
            block.children.push({ kind: 'comment', raw })
            position = end
            continue
        }
        if (trimmed === '') {
            block.children.push({ kind: 'text', raw })
            position = end
            continue
        }
        if (terminator === 'semicolon') {
            const body = raw.slice(0, raw.length - 1)
            const [name, ...args] = tokenizeNginxArgs(body)
            if (name === undefined) {
                block.children.push({ kind: 'text', raw })
            } else {
                block.children.push({ kind: 'directive', name, args, raw })
            }
            position = end
            continue
        }
        if (terminator === 'open') {
            const headText = raw.slice(0, raw.lastIndexOf('{'))
            const [name, ...args] = tokenizeNginxArgs(headText)
            if (name === undefined) {
                block.children.push({ kind: 'text', raw })
                position = end
                continue
            }
            const childBlock: NginxBlock = { kind: 'block', name, args, head: raw, tail: '', children: [] }
            block.children.push(childBlock)
            position = parseBlockBody(text, end, childBlock)
            continue
        }
        block.children.push({ kind: 'text', raw })
        position = end
    }
    return position
}

export const parseNginxConfig = (text: string): NginxConfig => {
    const root: NginxBlock = { kind: 'block', name: '', args: [], head: '', tail: '', children: [] }
    parseBlockBody(text, 0, root)
    return root
}
