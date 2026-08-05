import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const REPOSITORY_ROOT = join(import.meta.dir, '../../..')
const CI_EXAMPLES = ['github-actions.yml', 'gitea-actions.yml', 'gitlab-ci.yml', 'github-actions-deploy.yml']
const RAW_TEST_COMMAND = /(^|[^a-z-])bun test(\s|$)/m

const readRepositoryFile = (relativePath: string) => readFileSync(join(REPOSITORY_ROOT, relativePath), 'utf8')

const rootScripts = (JSON.parse(readRepositoryFile('package.json')) as { scripts: Record<string, string> }).scripts

describe('저장소 스크립트 계약', () => {
    test('web 테스트는 별도 실행이라 루트 test 스크립트가 두 단계다', () => {
        expect(rootScripts.test).toContain('@containers/web')
    })

    test('CI 예시와 README 는 raw `bun test` 를 쓰지 않는다', () => {
        const sources = [...CI_EXAMPLES.map((name) => `docs/ci-examples/${name}`), 'README.md']
        const offenders = sources.filter((path) => RAW_TEST_COMMAND.test(readRepositoryFile(path)))

        expect(offenders).toEqual([])
    })

    test('check 사다리가 typecheck·lint·test·build 를 모두 포함한다', () => {
        for (const step of ['typecheck', 'lint', 'test', 'build']) {
            expect(rootScripts.check).toContain(`bun run ${step}`)
        }
    })

    test('런타임 보안 감사 스크립트가 등록돼 있다', () => {
        expect(rootScripts['audit:runtime']).toBe('bun scripts/audit-runtime-security.ts')
    })

    test('터널 스크립트는 패널 주소를 compose 에서 유도하고 값을 박지 않는다', () => {
        const source = readRepositoryFile('scripts/setup-cloudflare-tunnel.sh')

        expect(source).toContain('detect_panel_origin')
        expect(source).toContain('PANEL_BIND_ADDRESS')
        expect(source).not.toMatch(/http:\/\/127\.0\.0\.1:[0-9]+/)
    })

    test('터널 스크립트는 와일드카드 ingress 를 로컬 config 로 쓴다', () => {
        const source = readRepositoryFile('scripts/setup-cloudflare-tunnel.sh')

        expect(source).toContain('ingress:')
        expect(source).toContain('hostname: "*.%s"')
        expect(source).toContain('cloudflared tunnel ingress validate')
    })

    test('계정 초기화 스크립트는 --confirm 없이는 아무것도 지우지 않는다', () => {
        const source = readRepositoryFile('scripts/reset-accounts.ts')

        expect(source).toContain("if (!('confirm' in options))")
        expect(source).toContain('.pre-reset')
    })

    test('seed 스크립트가 공개 주소가 설정된 스택을 거부한다', () => {
        const source = readRepositoryFile('scripts/seed-e2e.ts')

        expect(source).toContain("if (!('allow-configured' in options))")
        expect(source).toContain('select public_origin from panel_setting')
    })

    test('seed 스크립트가 auth 테이블에 초 단위 timestamp 를 쓴다', () => {
        const source = readRepositoryFile('scripts/seed-e2e.ts')

        expect(source).toContain('Math.floor(Date.now() / MILLISECONDS_PER_SECOND)')
        expect(source).not.toMatch(/(^|[^/])\bnow = Date\.now\(\)/m)
    })

    test('seed 스크립트가 쓰는 auth 컬럼은 초 단위 timestamp 로 선언돼 있다', () => {
        const schema = readRepositoryFile('packages/db-schema/src/schema.ts')
        const seededColumns = ['created_at', 'updated_at', 'disabled_at']
        const millisecondColumns = seededColumns.filter((column) => schema.includes(`'${column}', { mode: 'timestamp_ms' }`))

        expect(millisecondColumns).toEqual([])
    })
})
