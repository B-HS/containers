import { describe, expect, test } from 'bun:test'
import { containerSummarySchema } from '@containers/contracts/engine'

const BASE = {
    command: 'nginx -g daemon off;',
    createdAt: '2026-08-05T00:00:00.000Z',
    exposedPorts: ['80/tcp'],
    id: 'container-id',
    image: 'nginx:alpine',
    imageId: 'sha256:image-id',
    labelKeys: [],
    names: ['app'],
    networks: ['containers_edge'],
    state: 'running',
    status: 'Up 1 minute',
}

describe('컨테이너 요약 계약', () => {
    test('라우트 대상 선택에 필요한 포트와 네트워크를 담는다', () => {
        const summary = containerSummarySchema.parse(BASE)

        expect(summary.exposedPorts).toEqual(['80/tcp'])
        expect(summary.networks).toEqual(['containers_edge'])
    })

    test('포트나 네트워크가 빠지면 거부한다', () => {
        for (const missing of ['exposedPorts', 'networks'] as const) {
            const rest = Object.fromEntries(Object.entries(BASE).filter(([key]) => key !== missing))

            expect(containerSummarySchema.safeParse(rest).success).toBe(false)
        }
    })

    test('포트가 없는 컨테이너도 허용한다', () => {
        expect(containerSummarySchema.parse({ ...BASE, exposedPorts: [] }).exposedPorts).toEqual([])
    })
})
