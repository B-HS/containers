import { describe, expect, test } from 'bun:test'
import { ENGINE_AGENT_ERROR_CODE, ENGINE_AGENT_ERROR_STATUS } from '@containers/contracts/engine-error'
import { ERROR_CODE, ERROR_MESSAGE, STATUS_MAP, createAppError, isAppError, resolveErrorCode } from './error'

describe('createAppError', () => {
    test('code 와 statusCode 를 부착하고 message 는 코드 문자열로 유지합니다', () => {
        const error = createAppError('BACKUP_NOT_FOUND')

        expect(error).toBeInstanceOf(Error)
        expect(error.code).toBe('BACKUP_NOT_FOUND')
        expect(error.statusCode).toBe(404)
        expect(error.message).toBe('BACKUP_NOT_FOUND')
        expect(error.details).toBeUndefined()
    })

    test('isAppError 가 true 를 반환합니다', () => {
        expect(isAppError(createAppError('VALIDATION_ERROR'))).toBe(true)
        expect(isAppError(new Error('VALIDATION_ERROR'))).toBe(false)
    })

    test('cause 와 details 를 보존합니다', () => {
        const cause = new Error('boom')
        const error = createAppError('BACKUP_FAILED', cause, { backupId: 'b-1' })

        expect(error.cause).toBe(cause)
        expect(error.details).toEqual({ backupId: 'b-1' })
    })

    test('알 수 없는 코드는 INTERNAL_ERROR 500 으로 정규화합니다', () => {
        const error = createAppError('테스트에서 호출되지 않습니다.')

        expect(error.code).toBe(ERROR_CODE.INTERNAL_ERROR)
        expect(error.statusCode).toBe(500)
        expect(error.message).toBe('테스트에서 호출되지 않습니다.')
    })

    test('접미사가 붙은 코드는 기본 코드로 매핑하고 detail 을 details 로 옮깁니다', () => {
        const error = createAppError('NGINX_CONFIG_INVALID:nginx: [emerg] invalid at line 12')

        expect(error.code).toBe('NGINX_CONFIG_INVALID')
        expect(error.statusCode).toBe(400)
        expect(error.details).toEqual({ detail: 'nginx: [emerg] invalid at line 12' })
    })

    test('DOCKER_NOT_FOUND:404 형태도 기본 코드 상태로 매핑합니다', () => {
        const error = createAppError('DOCKER_NOT_FOUND:404')

        expect(error.code).toBe('DOCKER_NOT_FOUND')
        expect(error.statusCode).toBe(404)
        expect(error.details).toEqual({ detail: '404' })
    })

    test('engine-agent 코드는 500 이 아니라 각자의 상태 코드로 매핑됩니다', () => {
        expect(createAppError('EXEC_FAILED').statusCode).toBe(400)
        expect(createAppError('EXEC_SESSION_LIMIT_REACHED').statusCode).toBe(429)
        expect(createAppError('NGINX_CONTAINER_UNAVAILABLE').statusCode).toBe(404)
        expect(createAppError('REGISTRY_CREDENTIAL_SERVICE_UNAVAILABLE').statusCode).toBe(503)
    })
})

describe('resolveErrorCode', () => {
    test('알려진 코드는 그대로, detail 은 undefined 입니다', () => {
        expect(resolveErrorCode('JOB_NOT_FOUND')).toEqual({ code: 'JOB_NOT_FOUND', detail: undefined })
    })

    test('알 수 없는 접두사는 INTERNAL_ERROR 로 떨어집니다', () => {
        expect(resolveErrorCode('Traffic Worker 응답 코드: 500')).toEqual({ code: ERROR_CODE.INTERNAL_ERROR, detail: undefined })
    })
})

describe('engine-agent 코드 미러링', () => {
    test('engine-agent 의 모든 코드가 api STATUS_MAP 과 ERROR_MESSAGE 에 존재합니다', () => {
        for (const code of Object.values(ENGINE_AGENT_ERROR_CODE)) {
            expect(STATUS_MAP[code]).toBeNumber()
            expect(ERROR_MESSAGE[code]).toBeString()
        }
    })

    test('api 가 별도로 정의하지 않은 코드는 engine-agent 상태 코드를 그대로 씁니다', () => {
        expect(STATUS_MAP.DOCKER_NOT_FOUND).toBe(ENGINE_AGENT_ERROR_STATUS.DOCKER_NOT_FOUND)
        expect(STATUS_MAP.NGINX_CONFIG_INVALID).toBe(ENGINE_AGENT_ERROR_STATUS.NGINX_CONFIG_INVALID)
    })
})
