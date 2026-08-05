#!/usr/bin/env bun

import { randomBytes, randomUUID } from 'node:crypto'
import { resolve } from 'node:path'

const API_WORKSPACE = resolve(import.meta.dir, '../apps/api')
const CONTROL_DATABASE_PATH = '/data/control.sqlite'
const APPLY_SCRIPT_PATH = '/tmp/seed-e2e-apply.ts'
const GENERATED_PASSWORD_BYTES = 18
const DEFAULT_EMAIL = 'e2e@containers.local'
const DEFAULT_NAME = 'E2E'
const DEFAULT_ROLE = 'owner'
const USAGE = `사용법: bun scripts/seed-e2e.ts [--email <주소>] [--name <이름>] [--role <역할>] [--allow-configured]

개발·E2E 전용 도구다. 로그인 계정을 control DB 에 만들거나 비밀번호를 재설정한다.
비밀번호는 E2E_PASSWORD 환경변수를 쓰고, 없으면 무작위로 만들어 stdout 에 한 번만 출력한다.
출력된 비밀번호는 저장소·문서에 기록하지 않는다.

공개 주소가 설정된 스택에서는 실행을 거부한다. 운영 계정은 패널의 초기 설정 화면과
초대로 만든다. 개발 목적으로 그런 스택에 써야 하면 --allow-configured 를 명시한다.`

const parseArguments = (argv: string[]) =>
    argv.reduce<Record<string, string>>((parsed, token, index) => {
        if (!token.startsWith('--')) return parsed
        return { ...parsed, [token.slice(2)]: argv[index + 1] ?? '' }
    }, {})

const run = async (command: string[], options: { cwd?: string; env?: Record<string, string>; stdin?: string } = {}) => {
    const child = Bun.spawn(command, {
        cwd: options.cwd,
        env: { ...process.env, ...options.env },
        stderr: 'pipe',
        stdin: options.stdin === undefined ? 'ignore' : new TextEncoder().encode(options.stdin),
        stdout: 'pipe',
    })
    const [stdout, stderr, exitCode] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
    if (exitCode !== 0) throw new Error(`${command.join(' ')} 실패 (exit ${exitCode}): ${stderr.trim()}`)
    return stdout.trim()
}

const hashPassword = (password: string) =>
    run(['bun', '-e', 'import { hashPassword } from "better-auth/crypto"; console.log(await hashPassword(process.env.SEED_E2E_PASSWORD))'], {
        cwd: API_WORKSPACE,
        env: { SEED_E2E_PASSWORD: password },
    })

const PUBLIC_ORIGIN_SCRIPT = `import { Database } from 'bun:sqlite'
const database = new Database(process.env.CONTROL_DB_PATH ?? '', { readonly: true })
const row = database.query('select public_origin from panel_setting limit 1').get()
console.log(row?.public_origin ?? '')
`

const APPLY_SCRIPT = `import { Database } from 'bun:sqlite'

const MILLISECONDS_PER_SECOND = 1_000

const database = new Database(process.env.SEED_E2E_DATABASE_PATH ?? '')
const email = process.env.SEED_E2E_EMAIL ?? ''
const now = Math.floor(Date.now() / MILLISECONDS_PER_SECOND)
const existing = database.query('select id from user where email = ?').get(email) as { id: string } | null
const userId = existing?.id ?? (process.env.SEED_E2E_USER_ID ?? '')

database.transaction(() => {
    if (existing === null) {
        database.run('insert into user (id, name, email, email_verified, created_at, updated_at) values (?, ?, ?, 1, ?, ?)', [
            userId,
            process.env.SEED_E2E_NAME ?? '',
            email,
            now,
            now,
        ])
    } else {
        database.run('update user set name = ?, email_verified = 1, updated_at = ? where id = ?', [process.env.SEED_E2E_NAME ?? '', now, userId])
    }

    const account = database.query("select id from account where user_id = ? and provider_id = 'credential'").get(userId) as { id: string } | null
    if (account === null) {
        database.run(
            "insert into account (id, account_id, provider_id, user_id, password, created_at, updated_at) values (?, ?, 'credential', ?, ?, ?, ?)",
            [process.env.SEED_E2E_ACCOUNT_ID ?? '', userId, userId, process.env.SEED_E2E_PASSWORD_HASH ?? '', now, now],
        )
    } else {
        database.run('update account set password = ?, updated_at = ? where id = ?', [process.env.SEED_E2E_PASSWORD_HASH ?? '', now, account.id])
    }

    const role = database.query('select user_id from user_role where user_id = ?').get(userId)
    if (role === null) {
        database.run('insert into user_role (user_id, role, created_at, updated_at) values (?, ?, ?, ?)', [
            userId,
            process.env.SEED_E2E_ROLE ?? '',
            now,
            now,
        ])
    } else {
        database.run('update user_role set role = ?, disabled_at = null, updated_at = ? where user_id = ?', [
            process.env.SEED_E2E_ROLE ?? '',
            now,
            userId,
        ])
    }

    database.run('delete from session where user_id = ?', [userId])
})()

console.log(JSON.stringify({ created: existing === null, userId }))
`

const options = parseArguments(Bun.argv.slice(2))
if ('help' in options) {
    console.log(USAGE)
    process.exit(0)
}

const readPublicOrigin = async () => {
    const output = await run(['docker', 'compose', 'exec', '-T', 'api', 'bun', '-e', PUBLIC_ORIGIN_SCRIPT]).catch(() => '')
    return output.trim() === '' ? null : output.trim()
}

if (!('allow-configured' in options)) {
    const publicOrigin = await readPublicOrigin()
    if (publicOrigin !== null) {
        console.error(`이 스택에는 공개 주소(${publicOrigin})가 설정돼 있어 개발용 seed 를 거부한다.`)
        console.error('운영 계정은 패널의 초기 설정 화면과 초대로 만든다. 개발 목적이면 --allow-configured 를 붙인다.')
        process.exit(1)
    }
}

const email = options.email ?? DEFAULT_EMAIL
const password = process.env.E2E_PASSWORD ?? randomBytes(GENERATED_PASSWORD_BYTES).toString('base64url')
const passwordHash = await hashPassword(password)

const containerEnvironment = {
    SEED_E2E_ACCOUNT_ID: randomUUID(),
    SEED_E2E_DATABASE_PATH: CONTROL_DATABASE_PATH,
    SEED_E2E_EMAIL: email,
    SEED_E2E_NAME: options.name ?? DEFAULT_NAME,
    SEED_E2E_PASSWORD_HASH: passwordHash,
    SEED_E2E_ROLE: options.role ?? DEFAULT_ROLE,
    SEED_E2E_USER_ID: randomUUID(),
}

await run(['docker', 'compose', 'exec', '-T', 'api', 'sh', '-c', `cat > ${APPLY_SCRIPT_PATH}`], { stdin: APPLY_SCRIPT })
const applied = await run([
    'docker',
    'compose',
    'exec',
    '-T',
    ...Object.entries(containerEnvironment).flatMap(([key, value]) => ['-e', `${key}=${value}`]),
    'api',
    'bun',
    APPLY_SCRIPT_PATH,
])

const result = JSON.parse(applied) as { created: boolean; userId: string }

console.log(`${result.created ? '생성' : '갱신'} 완료: ${email} (role=${options.role ?? DEFAULT_ROLE}, userId=${result.userId})`)
console.log(`비밀번호: ${password}`)
console.log('이 값은 저장소·문서에 기록하지 않는다. 필요하면 E2E_PASSWORD 로 고정해서 다시 실행한다.')
