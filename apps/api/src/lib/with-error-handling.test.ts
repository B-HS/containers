import { describe, expect, test } from 'bun:test'
import { Hono } from 'hono'
import { createAppError } from './error'
import { withErrorHandling } from './with-error-handling'

const REQUEST_ID = 'req-1'

const createApp = (thrown: unknown) =>
    new Hono()
        .use('*', async (context, next) => {
            context.set('requestId', REQUEST_ID)
            await next()
        })
        .get(
            '/',
            withErrorHandling(async () => {
                throw thrown
            }),
        )

const request = async (thrown: unknown) => {
    const response = await createApp(thrown).request('/')
    return {
        body: (await response.json()) as { error: { code: string; details?: { detail: string }; message: string; requestId: string } },
        status: response.status,
    }
}

describe('withErrorHandling', () => {
    test('AppError 의 statusCode 와 코드별 메시지를 응답합니다', async () => {
        const { body, status } = await request(createAppError('BACKUP_NOT_FOUND'))

        expect(status).toBe(404)
        expect(body.error.code).toBe('BACKUP_NOT_FOUND')
        expect(body.error.requestId).toBe(REQUEST_ID)
    })

    test('engine-agent 코드는 500 이 아닌 제 상태 코드로 응답합니다', async () => {
        expect((await request(createAppError('EXEC_FAILED'))).status).toBe(400)
        expect((await request(createAppError('DOCKER_NOT_FOUND'))).status).toBe(404)
        expect((await request(createAppError('EXEC_SESSION_LIMIT_REACHED'))).status).toBe(429)
    })

    test('검증 출력은 details 로 응답에 실립니다', async () => {
        const { body, status } = await request(createAppError('NGINX_CONFIG_INVALID:nginx: [emerg] invalid at line 12'))

        expect(status).toBe(400)
        expect(body.error.code).toBe('NGINX_CONFIG_INVALID')
        expect(body.error.details).toEqual({ detail: 'nginx: [emerg] invalid at line 12' })
    })

    test('AppError 가 아닌 Error 의 message 도 코드로 매핑합니다', async () => {
        const { body, status } = await request(new Error('DOCKER_NOT_FOUND:404'))

        expect(status).toBe(404)
        expect(body.error.code).toBe('DOCKER_NOT_FOUND')
        expect(body.error.details).toEqual({ detail: '404' })
    })

    test('알 수 없는 오류는 INTERNAL_ERROR 500 입니다', async () => {
        const { body, status } = await request(new Error('알 수 없는 실패'))

        expect(status).toBe(500)
        expect(body.error.code).toBe('INTERNAL_ERROR')
    })
})
