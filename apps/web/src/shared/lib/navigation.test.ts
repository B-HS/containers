import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as lucide from 'lucide-react'
import { NAV_SECTIONS } from './navigation'

const NAV_COMPONENT = readFileSync(join(import.meta.dir, '../../widgets/panel-shell/panel-shell-nav.tsx'), 'utf8')
const NAV_ICON_MAP = /const NAV_ICONS: Record<string, LucideIcon> = \{([^}]*)\}/.exec(NAV_COMPONENT)?.[1] ?? ''
const mappedIcons = new Set(
    NAV_ICON_MAP.split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0),
)

const items = NAV_SECTIONS.flatMap((section) => section.items)

describe('사이드바 네비게이션', () => {
    test('모든 항목의 아이콘이 아이콘 맵에 등록돼 있다', () => {
        expect(items.filter((item) => !mappedIcons.has(item.icon)).map((item) => `${item.key}:${item.icon}`)).toEqual([])
    })

    test('아이콘 이름이 실제 lucide 아이콘이다', () => {
        expect(items.filter((item) => !(item.icon in lucide)).map((item) => item.icon)).toEqual([])
    })

    test('모든 항목이 ko/en/ja 라벨과 설명을 가진다', () => {
        for (const locale of ['ko', 'en', 'ja']) {
            const messages = JSON.parse(readFileSync(join(import.meta.dir, `../../../messages/${locale}.json`), 'utf8')) as {
                Nav: { items: Record<string, string>; subtitles: Record<string, string> }
            }
            expect(items.filter((item) => messages.Nav.items[item.key] === undefined).map((item) => `${locale}:${item.key}`)).toEqual([])
            expect(items.filter((item) => messages.Nav.subtitles[item.key] === undefined).map((item) => `${locale}:${item.key}`)).toEqual([])
        }
    })

    test('href 가 중복되지 않는다', () => {
        expect(new Set(items.map((item) => item.href)).size).toBe(items.length)
    })
})
