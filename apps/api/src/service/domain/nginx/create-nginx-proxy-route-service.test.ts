import { describe, expect, test } from 'bun:test'
import type { NginxProxyRoute } from '@containers/contracts/nginx'
import { renderNginxProxyRoutes } from './create-nginx-proxy-route-service'

const BASE_CONFIG = "events {} http { map $http_upgrade $connection_upgrade { default upgrade; '' close; } resolver 127.0.0.11; }"

const route = (values: Partial<NginxProxyRoute> = {}): NginxProxyRoute => ({
    bodySizeMegabytes: 64,
    createdAt: '2026-01-01T00:00:00.000Z',
    enabled: true,
    hostname: 'app.example.com',
    id: '01958c26-65b5-7c22-9254-03b914e61cc5',
    path: '/',
    pathMode: 'prefix',
    protocol: 'http',
    stripPrefix: false,
    targetContainer: 'example-app',
    targetPort: 3000,
    timeoutSeconds: 60,
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...values,
})

describe('Nginx 구조화 route renderer', () => {
    test('hostname 순서와 무관하게 deterministic config를 생성합니다', () => {
        const first = route()
        const second = route({ hostname: 'api.example.com', id: '01958c26-65b5-7c22-9254-03b914e61cc6', targetPort: 8080 })

        expect(renderNginxProxyRoutes(BASE_CONFIG, [first, second])).toBe(renderNginxProxyRoutes(BASE_CONFIG, [second, first]))
    })

    test('이전 managed block을 교체하고 관리 header를 upstream에 전달하지 않습니다', () => {
        const first = renderNginxProxyRoutes(BASE_CONFIG, [route()])
        const second = renderNginxProxyRoutes(first, [route({ protocol: 'websocket', targetPort: 8080 })])

        expect(second.match(/containers-routes:start/g)).toHaveLength(1)
        expect(second).toContain('proxy_set_header Cookie "";')
        expect(second).toContain('proxy_set_header Authorization "";')
        expect(second).toContain('proxy_set_header Upgrade $http_upgrade;')
        expect(second).toContain('example-app:8080')
        expect(second).not.toContain('example-app:3000')
        expect(second.match(/location \^~ \/ /g)).toHaveLength(1)
        expect(second).not.toContain('location / { return 404; }')
    })
})
