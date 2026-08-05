import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const GLOBALS_CSS = readFileSync(join(import.meta.dir, 'globals.css'), 'utf8')
const LIGHT_ONLY_TOKENS = new Set(['--radius'])

const readBlock = (source: string, startPattern: RegExp) => {
    const start = source.search(startPattern)
    if (start === -1) return ''
    const open = source.indexOf('{', start)
    let depth = 0
    for (let index = open; index < source.length; index += 1) {
        if (source[index] === '{') depth += 1
        if (source[index] === '}') {
            depth -= 1
            if (depth === 0) return source.slice(open + 1, index)
        }
    }
    return ''
}

const readTokens = (block: string) =>
    new Set(
        Array.from(block.matchAll(/(--[a-z0-9-]+)\s*:/g))
            .map((match) => match[1] ?? '')
            .filter((token) => token !== ''),
    )

const lightTokens = readTokens(readBlock(GLOBALS_CSS, /^:root\s*\{/m))
const darkTokens = readTokens(readBlock(GLOBALS_CSS, /@media \(prefers-color-scheme: dark\)/))

describe('globals.css 테마 토큰', () => {
    test('라이트 토큰이 비어 있지 않다', () => {
        expect(lightTokens.size).toBeGreaterThan(0)
        expect(darkTokens.size).toBeGreaterThan(0)
    })

    test('다크 블록이 라이트에 없는 토큰을 새로 만들지 않는다', () => {
        expect(Array.from(darkTokens).filter((token) => !lightTokens.has(token))).toEqual([])
    })

    test('색 토큰은 다크에서 재정의되거나 재정의된 토큰만 참조한다', () => {
        const lightBlock = readBlock(GLOBALS_CSS, /^:root\s*\{/m)
        const unresolved = Array.from(lightTokens).filter((token) => {
            if (LIGHT_ONLY_TOKENS.has(token) || darkTokens.has(token)) return false
            const declaration = new RegExp(`${token}\\s*:\\s*([^;]+);`).exec(lightBlock)?.[1]?.trim() ?? ''
            const referenced = Array.from(declaration.matchAll(/var\((--[a-z0-9-]+)\)/g)).map((match) => match[1] ?? '')
            return referenced.length === 0 || referenced.some((reference) => !darkTokens.has(reference))
        })

        expect(unresolved).toEqual([])
    })

    test('앱 코드에 Tailwind 기본 팔레트 색이 없다', async () => {
        const paletteNames =
            'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose'
        const palettePattern = new RegExp(`\\b(?:bg|text|border|fill|stroke)-(?:${paletteNames})-[0-9]{2,3}\\b`)
        const sources = new Bun.Glob('**/*.{ts,tsx,css}').scan({ cwd: join(import.meta.dir, '..') })
        const offenders: string[] = []

        for await (const relativePath of sources) {
            const content = await Bun.file(join(import.meta.dir, '..', relativePath)).text()
            if (palettePattern.test(content)) offenders.push(relativePath)
        }

        expect(offenders).toEqual([])
    })
})
