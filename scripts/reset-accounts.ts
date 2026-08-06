#!/usr/bin/env bun

const CONTROL_DATABASE_PATH = '/data/control.sqlite'
const RESET_SCRIPT_PATH = '/tmp/reset-accounts-apply.ts'
const USAGE = `사용법: bun scripts/reset-accounts.ts [--confirm]

control DB 의 계정 정보를 모두 지워 최초 설정 상태로 되돌린다. user, user_role,
account, session, invitation 만 지우고 컨테이너·배포·nginx·트래픽 데이터는 건드리지 않는다.

되돌린 뒤에는 서버에서 http://127.0.0.1:18080 으로 접속해 첫 owner 계정을 만든다.
공개 주소에서는 최초 계정을 만들 수 없다.

--confirm 없이 실행하면 지워질 계정만 보여주고 아무것도 바꾸지 않는다.
실행 직전 control DB 사본을 ${CONTROL_DATABASE_PATH}.pre-reset 로 남긴다.`

const parseArguments = (argv: string[]) =>
    argv.reduce<Record<string, string>>((parsed, token, index) => {
        if (!token.startsWith('--')) return parsed
        return { ...parsed, [token.slice(2)]: argv[index + 1] ?? '' }
    }, {})

const run = async (command: string[], options: { stdin?: string } = {}) => {
    const child = Bun.spawn(command, {
        stderr: 'pipe',
        stdin: options.stdin === undefined ? 'ignore' : new TextEncoder().encode(options.stdin),
        stdout: 'pipe',
    })
    const [stdout, stderr, exitCode] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
    if (exitCode !== 0) throw new Error(`${command.join(' ')} 실패 (exit ${exitCode}): ${stderr.trim()}`)
    return stdout.trim()
}

const LIST_SCRIPT = `import { Database } from 'bun:sqlite'

const database = new Database(process.env.CONTROL_DB_PATH ?? '', { readonly: true })
const rows = database
    .query('select user.email as email, user_role.role as role from user left join user_role on user.id = user_role.user_id')
    .all()
console.log(JSON.stringify(rows))
`

const RESET_SCRIPT = `import { Database } from 'bun:sqlite'

const database = new Database(process.env.CONTROL_DB_PATH ?? '')
database.run('PRAGMA foreign_keys = ON')
database.transaction(() => {
    database.run('delete from session')
    database.run('delete from account')
    database.run('delete from user_role')
    database.run('delete from user')
    database.run('delete from invitation')
})()
const violations = database.query('pragma foreign_key_check').all()
if (violations.length > 0) {
    throw new Error(\`계정을 지운 뒤 참조 무결성이 깨졌다: \${violations.length}건\`)
}
console.log(JSON.stringify({ remaining: database.query('select count(*) as total from user').get() }))
`

const options = parseArguments(Bun.argv.slice(2))
if ('help' in options) {
    console.log(USAGE)
    process.exit(0)
}

const accounts = JSON.parse(await run(['docker', 'compose', 'exec', '-T', 'api', 'bun', '-e', LIST_SCRIPT])) as {
    email: string
    role: string | null
}[]

if (accounts.length === 0) {
    console.log('계정이 없다. 이미 최초 설정 상태다.')
    process.exit(0)
}

console.log(`지워질 계정 ${accounts.length}개:`)
for (const account of accounts) console.log(`  - ${account.email} (${account.role ?? 'role 없음'})`)

if (!('confirm' in options)) {
    console.log('\n실제로 지우려면 --confirm 을 붙여 다시 실행한다. 지금은 아무것도 바꾸지 않았다.')
    process.exit(0)
}

await run(['docker', 'compose', 'exec', '-T', 'api', 'cp', CONTROL_DATABASE_PATH, `${CONTROL_DATABASE_PATH}.pre-reset`])
console.log(`\ncontrol DB 사본: ${CONTROL_DATABASE_PATH}.pre-reset`)

await run(['docker', 'compose', 'exec', '-T', 'api', 'sh', '-c', `cat > ${RESET_SCRIPT_PATH}`], { stdin: RESET_SCRIPT })
const result = await run(['docker', 'compose', 'exec', '-T', 'api', 'bun', RESET_SCRIPT_PATH])
await run(['docker', 'compose', 'exec', '-T', 'api', 'rm', '-f', RESET_SCRIPT_PATH])

console.log(`계정 삭제 완료: ${result}`)
console.log('이제 서버에서 http://127.0.0.1:18080 으로 접속해 첫 owner 계정을 만든다.')
