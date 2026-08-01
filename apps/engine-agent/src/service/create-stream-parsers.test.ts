import { describe, expect, test } from 'bun:test'
import { createLineParser, createMultiplexFrameParser } from './create-stream-parsers'

const frame = (streamType: number, payload: string) => {
    const body = Buffer.from(payload, 'utf8')
    const header = Buffer.alloc(8)
    header[0] = streamType
    header.writeUInt32BE(body.byteLength, 4)
    return Buffer.concat([header, body])
}

describe('multiplex frame parser', () => {
    test('chunk 경계에 걸친 frame 을 잔여 buffer 로 이어서 파싱합니다', () => {
        const parser = createMultiplexFrameParser()
        const combined = Buffer.concat([frame(1, 'hello '), frame(2, 'error line')])
        const first = parser.push(combined.subarray(0, 10))
        const second = parser.push(combined.subarray(10))

        expect(first).toEqual([])
        expect(second).toEqual([
            { stream: 'stdout', text: 'hello ', truncated: false },
            { stream: 'stderr', text: 'error line', truncated: false },
        ])
    })

    test('상한을 넘는 frame 은 잘라서 방출하고 초과분을 건너뜁니다', () => {
        const parser = createMultiplexFrameParser()
        const oversizedLength = 1_048_576 + 5
        const header = Buffer.alloc(8)
        header[0] = 1
        header.writeUInt32BE(oversizedLength, 4)
        const payload = Buffer.alloc(oversizedLength, 0x61)

        const emitted = [...parser.push(Buffer.concat([header, payload])), ...parser.push(frame(1, 'next'))]

        expect(emitted).toHaveLength(2)
        expect(emitted[0]?.truncated).toBe(true)
        expect(emitted[0]?.text.length).toBe(1_048_576)
        expect(emitted[1]).toEqual({ stream: 'stdout', text: 'next', truncated: false })
    })
})

describe('line parser', () => {
    test('chunk 경계의 부분 line 을 이어붙이고 빈 line 은 건너뜁니다', () => {
        const parser = createLineParser()
        const first = parser.push(Buffer.from('{"a":1}\n\n{"b"', 'utf8'))
        const second = parser.push(Buffer.from(':2}\n', 'utf8'))

        expect(first).toEqual(['{"a":1}'])
        expect(second).toEqual(['{"b":2}'])
    })
})
