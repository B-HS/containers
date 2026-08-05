#!/usr/bin/env bun

import { DOCKER_SOCKET_PATH, LOOPBACK_PUBLISH_PREFIXES, SOCKET_ALLOWED_SERVICES } from '../packages/config/src/compose-security'

const COMPOSE_PROJECT_LABEL = 'com.docker.compose.project'
const COMPOSE_SERVICE_LABEL = 'com.docker.compose.service'
const PROJECT = process.env.COMPOSE_PROJECT_NAME ?? 'containers'
const FORBIDDEN_CAPABILITIES = ['ALL', 'SYS_ADMIN', 'SYS_PTRACE', 'SYS_MODULE', 'NET_ADMIN']

type InspectedContainer = {
    Config: { Labels: Record<string, string> }
    HostConfig: {
        Binds: string[] | null
        CapAdd: string[] | null
        IpcMode: string
        NetworkMode: string
        PidMode: string
        Privileged: boolean
        PortBindings: Record<string, { HostIp: string; HostPort: string }[] | null> | null
        ReadonlyRootfs: boolean
        SecurityOpt: string[] | null
        UTSMode: string
    }
    Name: string
}

const run = async (command: string[]) => {
    const child = Bun.spawn(command, { stderr: 'pipe', stdout: 'pipe' })
    const [stdout, stderr, exitCode] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
    if (exitCode !== 0) throw new Error(`${command.join(' ')} 실패: ${stderr.trim()}`)
    return stdout.trim()
}

const isLoopbackHost = (hostIp: string) => LOOPBACK_PUBLISH_PREFIXES.some((prefix) => `${hostIp}:`.startsWith(prefix))

const auditContainer = (container: InspectedContainer) => {
    const service = container.Config.Labels[COMPOSE_SERVICE_LABEL] ?? container.Name.replace(/^\//, '')
    const host = container.HostConfig
    const violations: string[] = []

    if (host.Privileged) violations.push('privileged 로 실행 중이다')
    if (host.PidMode.includes('host')) violations.push(`PidMode=${host.PidMode}`)
    if (host.IpcMode.includes('host')) violations.push(`IpcMode=${host.IpcMode}`)
    if (host.UTSMode.includes('host')) violations.push(`UTSMode=${host.UTSMode}`)
    if (host.NetworkMode === 'host') violations.push('NetworkMode=host')
    if (!host.ReadonlyRootfs) violations.push('ReadonlyRootfs 가 false 다')
    if (!(host.SecurityOpt ?? []).includes('no-new-privileges:true')) violations.push('no-new-privileges 가 없다')

    for (const capability of host.CapAdd ?? []) {
        if (FORBIDDEN_CAPABILITIES.includes(capability.toUpperCase())) violations.push(`CapAdd=${capability}`)
    }

    for (const bind of host.Binds ?? []) {
        const source = bind.split(':')[0] ?? ''
        if (source === DOCKER_SOCKET_PATH && !SOCKET_ALLOWED_SERVICES.includes(service as (typeof SOCKET_ALLOWED_SERVICES)[number])) {
            violations.push(`docker socket 마운트: ${bind}`)
        }
        if (source === '/' || source === '/etc' || source === '/usr') violations.push(`호스트 경로 마운트: ${bind}`)
    }

    for (const [port, bindings] of Object.entries(host.PortBindings ?? {})) {
        for (const binding of bindings ?? []) {
            if (!isLoopbackHost(binding.HostIp))
                violations.push(`loopback 이 아닌 publish: ${binding.HostIp || '0.0.0.0'}:${binding.HostPort} → ${port}`)
        }
    }

    return { service, violations }
}

const ids = (await run(['docker', 'ps', '--quiet', '--filter', `label=${COMPOSE_PROJECT_LABEL}=${PROJECT}`])).split('\n').filter(Boolean)
if (ids.length === 0) {
    console.error(`실행 중인 ${PROJECT} 컨테이너가 없습니다. 스택을 먼저 기동하세요.`)
    process.exit(2)
}

const containers = JSON.parse(await run(['docker', 'inspect', ...ids])) as InspectedContainer[]
const results = containers.map(auditContainer)
const failed = results.filter((result) => result.violations.length > 0)

for (const result of results.toSorted((left, right) => left.service.localeCompare(right.service))) {
    const status = result.violations.length === 0 ? 'ok' : result.violations.join(' / ')
    console.log(`${result.service.padEnd(16)} ${status}`)
}

if (failed.length > 0) {
    console.error(`\n런타임 보안 불변식 위반 ${failed.length}건`)
    process.exit(1)
}

console.log(`\n런타임 보안 불변식 통과 (${results.length}개 컨테이너)`)
