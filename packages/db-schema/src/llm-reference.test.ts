import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { API_KEY_SCOPE_VALUES } from '@containers/contracts/api-key'
import { OPERATION_JOB_KIND } from '@containers/contracts/operation-job'
import { MAX_CONCURRENT_ENGINE_STREAMS } from '@containers/contracts/engine-stream'

const REPOSITORY_ROOT = join(import.meta.dir, '../../..')
const reference = readFileSync(join(REPOSITORY_ROOT, 'docs/llm.txt'), 'utf8')
const composeFile = readFileSync(join(REPOSITORY_ROOT, 'compose.yaml'), 'utf8')

const publishedPort = /PANEL_PORT:-(\d+)/.exec(composeFile)?.[1] ?? ''

describe('docs/llm.txt 가 코드와 어긋나지 않는다', () => {
    test('API key scope 를 하나도 빠뜨리지 않는다', () => {
        expect(API_KEY_SCOPE_VALUES.filter((scope) => !reference.includes(scope))).toEqual([])
    })

    test('없는 scope 를 적지 않는다', () => {
        const documented = Array.from(reference.matchAll(/\b([a-z-]+:[a-z-]+)\b/g)).map((match) => match[1] ?? '')
        const scopeLike = documented.filter(
            (candidate) => candidate.endsWith(':read') || candidate.endsWith(':write') || candidate.endsWith(':upload'),
        )

        expect(scopeLike.filter((scope) => !API_KEY_SCOPE_VALUES.includes(scope as (typeof API_KEY_SCOPE_VALUES)[number]))).toEqual([])
    })

    test('durable job kind 를 하나도 빠뜨리지 않는다', () => {
        expect(Object.values(OPERATION_JOB_KIND).filter((kind) => !reference.includes(kind))).toEqual([])
    })

    test('동시 스트림 상한이 코드값과 같다', () => {
        expect(reference).toContain(`MAX_CONCURRENT_ENGINE_STREAMS = ${MAX_CONCURRENT_ENGINE_STREAMS}`)
    })

    test('접속 포트가 compose 기본값과 같다', () => {
        expect(publishedPort).not.toBe('')
        expect(reference).toContain(`127.0.0.1:${publishedPort}`)
        expect(reference).not.toContain('127.0.0.1:8080')
    })
})
