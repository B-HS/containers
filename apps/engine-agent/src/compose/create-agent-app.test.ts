import { describe, expect, test } from 'bun:test'
import { createAgentApp } from './create-agent-app'

describe('Engine Agent 애플리케이션', () => {
    test('Docker socket에 연결할 수 없으면 503을 반환합니다', async () => {
        const response = await createAgentApp({
            artifactRoot: '/artifacts',
            nginxRevisionKeepCount: 20,
            nginxConfigRoot: '/nginx-config',
            nginxStatusUrl: 'http://nginx:8081/status',
            registryCredentialFile: '/tmp/containers-test-registry-credentials.json',
            registryCredentialSecret: 'test-registry-secret-that-is-at-least-thirty-two-characters-long',
            sharedSecret: 'test-secret-that-is-at-least-thirty-two-characters-long',
            socketPath: '/tmp/containers-missing-docker.sock',
        }).request('/health')

        expect(response.status).toBe(503)
    })
})
