import { describe, expect, test } from 'bun:test'
import { z } from 'zod'
import { parseEnv } from './env'

describe('환경변수 검증', () => {
    test('스키마에 맞는 값을 반환합니다', () => {
        const schema = z.object({ PORT: z.coerce.number().int().positive() })

        expect(parseEnv(schema, { PORT: '3000' })).toEqual({ PORT: 3000 })
    })

    test('잘못된 값을 거부합니다', () => {
        const schema = z.object({ PORT: z.coerce.number().int().positive() })

        expect(() => parseEnv(schema, { PORT: 'invalid' })).toThrow()
    })
})
