import { describe, expect, test } from 'bun:test'
import { runStartupTasks, startRecurringTask } from './run-startup-tasks'

describe('runStartupTasks', () => {
    test('앞선 부가 단계가 던져도 이후 단계를 계속 실행한다', async () => {
        const executed: string[] = []
        const lines: string[] = []
        const failures = await runStartupTasks({
            log: (line) => lines.push(line),
            tasks: [
                {
                    name: 'reconcile-interrupted',
                    run: async () => {
                        executed.push('reconcile-interrupted')
                        throw new Error('agent unreachable')
                    },
                },
                {
                    name: 'reconcile-routes',
                    run: async () => {
                        executed.push('reconcile-routes')
                    },
                },
            ],
        })

        expect(executed).toEqual(['reconcile-interrupted', 'reconcile-routes'])
        expect(failures).toEqual([{ message: 'agent unreachable', name: 'reconcile-interrupted' }])
        expect(lines).toHaveLength(1)
        expect(JSON.parse(lines[0] ?? '{}')).toMatchObject({
            event: 'startup_task_failed',
            level: 'error',
            message: 'agent unreachable',
            task: 'reconcile-interrupted',
        })
    })

    test('모든 단계가 성공하면 실패 목록이 비어 있다', async () => {
        const failures = await runStartupTasks({ log: () => undefined, tasks: [{ name: 'ok', run: async () => undefined }] })
        expect(failures).toEqual([])
    })

    test('Error 가 아닌 값을 던져도 문자열로 기록한다', async () => {
        const failures = await runStartupTasks({
            log: () => undefined,
            tasks: [
                {
                    name: 'weird',
                    run: async () => {
                        throw 'boom'
                    },
                },
            ],
        })
        expect(failures).toEqual([{ message: 'boom', name: 'weird' }])
    })
})

describe('startRecurringTask', () => {
    test('주기 실행이 실패해도 구조화 로그만 남기고 계속 스케줄된다', async () => {
        const lines: string[] = []
        const timer = startRecurringTask({
            intervalMs: 1,
            log: (line) => lines.push(line),
            name: 'cleanup',
            run: async () => {
                throw new Error('cleanup failed')
            },
        })
        await Bun.sleep(20)
        clearInterval(timer)

        expect(lines.length).toBeGreaterThan(0)
        expect(JSON.parse(lines[0] ?? '{}')).toMatchObject({ event: 'recurring_task_failed', task: 'cleanup' })
    })
})
