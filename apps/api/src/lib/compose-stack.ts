import {
    COMPOSE_REJECTION_RULE,
    COMPOSE_SERVICE_MAX_COUNT,
    composeStackPreviewSchema,
    type ComposeIgnoredKey,
    type ComposeRejection,
} from '@containers/contracts/deployment-stack'
import { FORBIDDEN_CONTAINER_CAPABILITIES } from '@containers/contracts/container-runtime'
import { createAppError } from './error'

const SECRET_REFERENCE_PREFIX = 'secret:'
const ROUTE_HOSTNAME_LABEL = 'containers.route.hostname'
const ROUTE_PATH_LABEL = 'containers.route.path'
const ROUTE_STRIP_PREFIX_LABEL = 'containers.route.strip-prefix'
const HEALTH_PATH_LABEL = 'containers.health-path'
const INTERNAL_PORT_LABEL = 'containers.internal-port'
const DOCKER_SOCKET_PATH = '/var/run/docker.sock'
const HOST_NAMESPACE_KEYS = ['ipc', 'network_mode', 'pid', 'uts'] as const
const DEFAULT_HEALTH_PATH = '/'
const SECONDS_PER_MINUTE = 60
const SECONDS_PER_HOUR = 3_600
const MILLISECONDS_PER_SECOND = 1_000
const BYTES_PER_KIBIBYTE = 1_024
const NANO_CPUS_PER_CORE = 1_000_000_000
const DURATION_PATTERN = /^(\d+(?:\.\d+)?)(ms|s|m|h)$/
const MEMORY_PATTERN = /^(\d+(?:\.\d+)?)\s*([kmgt]?)b?$/i
const MEMORY_UNIT_EXPONENT: Record<string, number> = { '': 0, g: 3, k: 1, m: 2, t: 4 }

const IGNORED_SERVICE_KEYS: Record<string, string> = {
    build: '패널은 이미지를 빌드하지 않는다. 업로드한 이미지 digest 를 쓴다.',
    container_name: '컨테이너 이름은 릴리스마다 자동으로 만든다.',
    develop: '로컬 개발 전용 키다.',
    env_file: '파일 기반 환경변수는 받지 않는다. secret 참조를 쓴다.',
    extends: '다른 파일 상속은 지원하지 않는다.',
    logging: '로그 드라이버는 호스트 정책을 따른다.',
    networks: '스택 서비스는 배포 네트워크에 함께 붙는다.',
    ports: '호스트 포트 publish 는 하지 않는다. 도메인 라우트로 노출한다.',
    profiles: '로컬 개발 전용 키다.',
    pull_policy: '이미지는 업로드된 것만 쓴다.',
    stdin_open: '대화형 옵션은 배포에 쓰지 않는다.',
    tty: '대화형 옵션은 배포에 쓰지 않는다.',
}

type ComposeService = Record<string, unknown>

type ComposeStackConversionInput = {
    compose: string
    imageDigestByReference: Map<string, string>
    stackName: string
    stackVersion: string
}

const asRecord = (value: unknown) =>
    typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined

const asStringArray = (value: unknown) => (Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [])

const parseDurationSeconds = (value: unknown) => {
    if (typeof value === 'number') return Math.round(value / MILLISECONDS_PER_SECOND)
    if (typeof value !== 'string') return undefined
    const matched = DURATION_PATTERN.exec(value.trim())
    if (!matched) return undefined
    const amount = Number(matched[1])
    if (matched[2] === 'ms') return Math.round(amount / MILLISECONDS_PER_SECOND)
    if (matched[2] === 's') return Math.round(amount)
    if (matched[2] === 'm') return Math.round(amount * SECONDS_PER_MINUTE)
    return Math.round(amount * SECONDS_PER_HOUR)
}

const parseMemoryBytes = (value: unknown) => {
    if (typeof value === 'number') return Math.round(value)
    if (typeof value !== 'string') return undefined
    const matched = MEMORY_PATTERN.exec(value.trim())
    if (!matched) return undefined
    const exponent = MEMORY_UNIT_EXPONENT[(matched[2] ?? '').toLowerCase()]
    if (exponent === undefined) return undefined
    return Math.round(Number(matched[1]) * BYTES_PER_KIBIBYTE ** exponent)
}

const parseEnvironmentEntries = (value: unknown) => {
    const record = asRecord(value)
    if (record) return Object.entries(record).map(([key, entry]) => ({ key, value: entry === null ? undefined : String(entry) }))
    return asStringArray(value).map((entry) => {
        const separator = entry.indexOf('=')
        return separator < 0 ? { key: entry, value: undefined } : { key: entry.slice(0, separator), value: entry.slice(separator + 1) }
    })
}

const collectRejections = (service: string, definition: ComposeService): ComposeRejection[] => {
    const rejections: ComposeRejection[] = []
    if (definition.privileged === true) {
        rejections.push({ detail: 'privileged 컨테이너는 허용하지 않는다.', rule: COMPOSE_REJECTION_RULE.PRIVILEGED, service })
    }
    for (const key of HOST_NAMESPACE_KEYS) {
        const value = definition[key]
        if (typeof value === 'string' && value.includes('host')) {
            rejections.push({ detail: `${key}: ${value}`, rule: COMPOSE_REJECTION_RULE.HOST_NAMESPACE, service })
        }
    }
    if (Array.isArray(definition.devices) && definition.devices.length > 0) {
        rejections.push({ detail: '호스트 장치를 컨테이너에 넘길 수 없다.', rule: COMPOSE_REJECTION_RULE.DEVICE_MAPPING, service })
    }
    for (const capability of asStringArray(definition.cap_add)) {
        const normalized = capability.toUpperCase().replace(/^CAP_/, '')
        if (FORBIDDEN_CONTAINER_CAPABILITIES.some((forbidden) => forbidden === normalized)) {
            rejections.push({ detail: capability, rule: COMPOSE_REJECTION_RULE.FORBIDDEN_CAPABILITY, service })
        }
    }
    for (const mapping of asStringArray(definition.volumes)) {
        const source = mapping.split(':')[0] ?? ''
        if (source === DOCKER_SOCKET_PATH) {
            rejections.push({ detail: mapping, rule: COMPOSE_REJECTION_RULE.DOCKER_SOCKET, service })
            continue
        }
        if (source.startsWith('/') || source.startsWith('.') || source.startsWith('~')) {
            rejections.push({ detail: mapping, rule: COMPOSE_REJECTION_RULE.HOST_BIND_MOUNT, service })
        }
    }
    for (const entry of parseEnvironmentEntries(definition.environment)) {
        if (entry.value !== undefined && entry.value.length > 0 && !entry.value.startsWith(SECRET_REFERENCE_PREFIX)) {
            rejections.push({
                detail: `${entry.key} 값을 그대로 담을 수 없다. secret:<reference> 형식만 받는다.`,
                rule: COMPOSE_REJECTION_RULE.PLAINTEXT_ENVIRONMENT,
                service,
            })
        }
    }
    return rejections
}

const collectIgnored = (service: string, definition: ComposeService) =>
    Object.keys(definition)
        .filter((key) => IGNORED_SERVICE_KEYS[key] !== undefined)
        .map((key) => ({ key, reason: IGNORED_SERVICE_KEYS[key] ?? '', service }))

const readInternalPort = (definition: ComposeService, labels: Record<string, string>) => {
    const labelled = labels[INTERNAL_PORT_LABEL]
    if (labelled !== undefined) return Number(labelled)
    const exposed = asStringArray(definition.expose)[0] ?? (typeof definition.expose === 'number' ? String(definition.expose) : undefined)
    if (exposed !== undefined) return Number(exposed.split('/')[0])
    const published = asStringArray(definition.ports)[0]
    if (published === undefined) return undefined
    const segments = published.split(':')
    return Number((segments[segments.length - 1] ?? '').split('/')[0])
}

const readLabels = (definition: ComposeService) => {
    const record = asRecord(definition.labels)
    if (record) return Object.fromEntries(Object.entries(record).map(([key, value]) => [key, String(value)]))
    return Object.fromEntries(
        asStringArray(definition.labels).map((entry) => {
            const separator = entry.indexOf('=')
            return separator < 0 ? [entry, ''] : [entry.slice(0, separator), entry.slice(separator + 1)]
        }),
    )
}

const readCommand = (service: string, key: 'command' | 'entrypoint', value: unknown) => {
    if (value === undefined) return []
    if (Array.isArray(value)) return asStringArray(value)
    throw createAppError('DEPLOYMENT_STACK_SHELL_FORM_UNSUPPORTED', undefined, { key, service })
}

const orderServices = (dependencies: Map<string, string[]>) => {
    const ordered: string[] = []
    const visiting = new Set<string>()
    const visit = (name: string) => {
        if (ordered.includes(name)) return
        if (visiting.has(name)) throw createAppError('DEPLOYMENT_STACK_DEPENDENCY_CYCLE', undefined, { service: name })
        visiting.add(name)
        for (const dependency of dependencies.get(name) ?? []) {
            if (!dependencies.has(dependency)) throw createAppError('DEPLOYMENT_STACK_DEPENDENCY_MISSING', undefined, { service: dependency })
            visit(dependency)
        }
        visiting.delete(name)
        ordered.push(name)
    }
    for (const name of [...dependencies.keys()].sort()) visit(name)
    return ordered
}

export const convertComposeStack = ({ compose, imageDigestByReference, stackName, stackVersion }: ComposeStackConversionInput) => {
    let parsed: unknown
    try {
        parsed = Bun.YAML.parse(compose)
    } catch (error) {
        throw createAppError('DEPLOYMENT_STACK_PARSE_FAILED', error, { reason: error instanceof Error ? error.message : 'unknown' })
    }
    const document = Array.isArray(parsed) ? asRecord(parsed[0]) : asRecord(parsed)
    const services = asRecord(document?.services)
    if (!services || Object.keys(services).length === 0) throw createAppError('DEPLOYMENT_STACK_SERVICES_MISSING')
    if (Object.keys(services).length > COMPOSE_SERVICE_MAX_COUNT) {
        throw createAppError('DEPLOYMENT_STACK_SERVICE_LIMIT', undefined, { limit: COMPOSE_SERVICE_MAX_COUNT })
    }

    const ignored: ComposeIgnoredKey[] = []
    const rejections: ComposeRejection[] = []
    const dependencies = new Map<string, string[]>()
    const plans: unknown[] = []

    for (const [service, rawDefinition] of Object.entries(services)) {
        const definition = asRecord(rawDefinition) ?? {}
        rejections.push(...collectRejections(service, definition))
        ignored.push(...collectIgnored(service, definition))
        dependencies.set(
            service,
            Array.isArray(definition.depends_on) ? asStringArray(definition.depends_on) : Object.keys(asRecord(definition.depends_on) ?? {}),
        )
    }
    if (rejections.length > 0) throw createAppError('DEPLOYMENT_STACK_REJECTED', undefined, { rejections })

    const order = orderServices(dependencies)

    for (const service of order) {
        const definition = asRecord(services[service]) ?? {}
        const labels = readLabels(definition)
        const reference = typeof definition.image === 'string' ? definition.image : undefined
        if (reference === undefined) throw createAppError('DEPLOYMENT_STACK_IMAGE_MISSING', undefined, { service })
        const imageDigest = imageDigestByReference.get(reference)
        if (imageDigest === undefined) throw createAppError('DEPLOYMENT_IMAGE_DIGEST_NOT_FOUND', undefined, { reference, service })
        const internalPort = readInternalPort(definition, labels)
        if (internalPort === undefined || !Number.isInteger(internalPort)) {
            throw createAppError('DEPLOYMENT_STACK_PORT_MISSING', undefined, { service })
        }
        const hostname = labels[ROUTE_HOSTNAME_LABEL]
        const healthcheck = asRecord(definition.healthcheck) ?? {}
        const limits = asRecord(asRecord(asRecord(definition.deploy)?.resources)?.limits) ?? {}
        const memoryBytes = parseMemoryBytes(limits.memory)
        const cpus = typeof limits.cpus === 'string' || typeof limits.cpus === 'number' ? Number(limits.cpus) : undefined
        const restart = typeof definition.restart === 'string' ? definition.restart : undefined
        const secrets = parseEnvironmentEntries(definition.environment)
            .filter((entry) => entry.value?.startsWith(SECRET_REFERENCE_PREFIX) === true)
            .map((entry) => ({ environmentKey: entry.key, reference: (entry.value ?? '').slice(SECRET_REFERENCE_PREFIX.length) }))
        const volumes = asStringArray(definition.volumes).map((mapping) => {
            const [name, mountPath, mode] = mapping.split(':')
            return { mountPath: mountPath ?? '/', name: name ?? '', readOnly: mode === 'ro' }
        })

        plans.push({
            dependsOn: dependencies.get(service) ?? [],
            manifest: {
                command: readCommand(service, 'command', definition.command),
                entrypoint: readCommand(service, 'entrypoint', definition.entrypoint),
                environmentKeys: [],
                healthcheck: {
                    ...(parseDurationSeconds(healthcheck.interval) === undefined
                        ? {}
                        : { intervalSeconds: parseDurationSeconds(healthcheck.interval) }),
                    path: labels[HEALTH_PATH_LABEL] ?? DEFAULT_HEALTH_PATH,
                    ...(typeof healthcheck.retries === 'number' ? { retries: healthcheck.retries } : {}),
                    ...(parseDurationSeconds(healthcheck.start_period) === undefined
                        ? {}
                        : { startPeriodSeconds: parseDurationSeconds(healthcheck.start_period) }),
                    ...(parseDurationSeconds(healthcheck.timeout) === undefined ? {} : { timeoutSeconds: parseDurationSeconds(healthcheck.timeout) }),
                },
                imageDigest,
                internalPort,
                ...(memoryBytes === undefined ? {} : { memoryBytes }),
                name: `${stackName}-${service}`,
                ...(cpus === undefined || Number.isNaN(cpus) ? {} : { nanoCpus: Math.round(cpus * NANO_CPUS_PER_CORE) }),
                ...(restart === undefined ? {} : { restartPolicy: restart === 'always' ? 'unless-stopped' : restart }),
                rollout: {},
                ...(hostname === undefined
                    ? {}
                    : {
                          route: {
                              hostname,
                              ...(labels[ROUTE_PATH_LABEL] === undefined ? {} : { path: labels[ROUTE_PATH_LABEL] }),
                              ...(labels[ROUTE_STRIP_PREFIX_LABEL] === undefined ? {} : { stripPrefix: labels[ROUTE_STRIP_PREFIX_LABEL] === 'true' }),
                          },
                      }),
                secrets,
                version: stackVersion,
                volumes,
            },
            service,
        })
    }

    return composeStackPreviewSchema.parse({ ignored, order, services: plans })
}
