import { describe, expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseNginxConfig, type NginxBlock } from './parse-nginx-config'
import { serializeNginxConfig } from './serialize-nginx-config'

const blocks = (parent: NginxBlock, name: string) => parent.children.filter((node): node is NginxBlock => node.kind === 'block' && node.name === name)

describe('nginx config 파서', () => {
    test('실제 nginx.conf를 바이트 동일하게 왕복합니다', async () => {
        const config = await readFile(resolve(process.cwd(), 'infra/nginx/nginx.conf'), 'utf8')

        expect(serializeNginxConfig(parseNginxConfig(config))).toBe(config)
    })

    test('주석 줄 바로 다음에 오는 블록을 주석에 삼키지 않습니다', () => {
        const config = 'http {\n# managed:start\nserver { listen 8080; }\n# managed:end\n}\n'

        const root = parseNginxConfig(config)
        const [http] = blocks(root, 'http')

        expect(root.tail).toBe('')
        expect(http).toBeDefined()
        expect(blocks(http as NginxBlock, 'server')).toHaveLength(1)
        expect(serializeNginxConfig(root)).toBe(config)
    })

    test('한 줄에 중첩 블록이 있어도 계층을 유지합니다', () => {
        const config = 'http {\nserver { listen 8080; location ^~ /api/ { proxy_pass http://upstream; } location / { return 404; } }\n}\n'

        const root = parseNginxConfig(config)
        const [http] = blocks(root, 'http')
        const [server] = blocks(http as NginxBlock, 'server')

        expect(blocks(server as NginxBlock, 'location')).toHaveLength(2)
        expect(serializeNginxConfig(root)).toBe(config)
    })

    test('지시어 뒤에 붙은 주석은 지시어의 일부로 유지합니다', () => {
        const config = 'events {\n    worker_connections 4096; # 동시 연결\n}\n'

        const root = parseNginxConfig(config)
        const [events] = blocks(root, 'events')
        const directives = (events as NginxBlock).children.filter((node) => node.kind === 'directive')

        expect(directives).toHaveLength(1)
        expect(serializeNginxConfig(root)).toBe(config)
    })

    test('따옴표 안의 # 는 주석으로 보지 않습니다', () => {
        const config = "http {\n    log_format main '#not-a-comment $status';\n}\n"

        const root = parseNginxConfig(config)
        const [http] = blocks(root, 'http')
        const directives = (http as NginxBlock).children.filter((node) => node.kind === 'directive')

        expect(directives).toHaveLength(1)
        expect(serializeNginxConfig(root)).toBe(config)
    })
})
