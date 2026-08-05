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
})
