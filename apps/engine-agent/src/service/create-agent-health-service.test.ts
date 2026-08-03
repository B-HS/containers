import { describe, expect, test } from 'bun:test'
import { SERVICE_STATUS } from '@containers/contracts/health'
import { createAppError } from '../lib/app-error'
import { createAgentHealthService } from './create-agent-health-service'

describe('Engine Agent 상태', () => {
    test('Docker Engine 연결 성공을 반환합니다', async () => {
        const service = createAgentHealthService({
            dockerEngineClient: {
                getVersion: async () => ({
                    ApiVersion: '1.52',
                    Arch: 'arm64',
                    MinAPIVersion: '1.24',
                    Os: 'linux',
                    Version: '29.6.2',
                }),
            },
            now: () => new Date('2026-07-31T00:00:00.000Z'),
        })

        expect((await service.getHealth()).status).toBe(SERVICE_STATUS.OK)
    })

    test('Docker Engine 연결 실패를 저하 상태로 반환합니다', async () => {
        const service = createAgentHealthService({
            dockerEngineClient: {
                getVersion: async () => {
                    throw createAppError('연결 실패')
                },
            },
            now: () => new Date('2026-07-31T00:00:00.000Z'),
        })

        expect((await service.getHealth()).status).toBe(SERVICE_STATUS.DEGRADED)
    })
})
