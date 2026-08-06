import type { AuditIntegrity } from '@containers/contracts/audit'

const DAY_MS = 24 * 60 * 60 * 1_000
const HEAD_HASH_PREFIX_LENGTH = 16
const EXPIRY_WARNING_DAYS = 30
const BYTES_PER_MEBIBYTE = 1_048_576

type JobOutcomeSummary = {
    failedKinds: string[]
    failure: number
    success: number
}

type OperationsReportServiceDb = {
    countActiveApiKeys: (now: Date) => Promise<number>
    countExpiringApiKeys: (now: Date, until: Date) => Promise<number>
    countLockedAccounts: (now: Date) => Promise<number>
    countRecentLockouts: (since: Date) => Promise<number>
    summarizeJobs: (since: Date) => Promise<JobOutcomeSummary>
}

type BackupSummary = {
    controlBytes: number
    createdAt: string
}

type ArtifactSummary = {
    sizeBytes: number
}

type ContainerSummary = {
    state: string
}

type OperationsReportServiceDependencies = {
    db: OperationsReportServiceDb
    listArtifacts: () => Promise<ArtifactSummary[]>
    listBackups: () => Promise<BackupSummary[]>
    listContainers: () => Promise<ContainerSummary[]>
    now: () => Date
    verifyAuditIntegrity: () => Promise<AuditIntegrity>
}

export type { OperationsReportServiceDb }

const toMebibytes = (bytes: number) => Math.round(bytes / BYTES_PER_MEBIBYTE)

const describeChain = (integrity: AuditIntegrity) => {
    if (integrity.brokenAt !== null) {
        const entry = integrity.brokenEntry
        return `끊김 — ${integrity.brokenAt}번${entry === null ? '' : ` (${entry.operation})`}`
    }
    return `온전 — ${integrity.checked}건 검증`
}

/**
 * Builds the periodic operations report. The audit chain head is the point of the report: recording
 * it outside this host is what makes truncating recent audit entries detectable, since a chain that
 * lost its tail stays internally consistent and cannot be caught by verification alone.
 */
export const createOperationsReportService = ({
    db,
    listArtifacts,
    listBackups,
    listContainers,
    now,
    verifyAuditIntegrity,
}: OperationsReportServiceDependencies) => ({
    build: async () => {
        const timestamp = now()
        const since = new Date(timestamp.getTime() - DAY_MS)
        const expiryLimit = new Date(timestamp.getTime() + EXPIRY_WARNING_DAYS * DAY_MS)
        const [integrity, jobs, artifacts, backups, containers, activeKeys, expiringKeys, lockedAccounts, recentLockouts] = await Promise.all([
            verifyAuditIntegrity(),
            db.summarizeJobs(since),
            listArtifacts(),
            listBackups(),
            listContainers(),
            db.countActiveApiKeys(timestamp),
            db.countExpiringApiKeys(timestamp, expiryLimit),
            db.countLockedAccounts(timestamp),
            db.countRecentLockouts(since),
        ])

        const latestBackup = backups[0]
        const artifactBytes = artifacts.reduce((total, artifact) => total + artifact.sizeBytes, 0)
        const runningContainers = containers.filter((container) => container.state === 'running').length

        return [
            { name: '감사 체인', value: describeChain(integrity) },
            {
                name: '체인 head',
                value: integrity.headHash === null ? '없음' : `#${integrity.headSequence} ${integrity.headHash.slice(0, HEAD_HASH_PREFIX_LENGTH)}`,
            },
            { name: '체인 이전 기록', value: `${integrity.unchained}건` },
            { name: '작업 24시간', value: `성공 ${jobs.success} · 실패 ${jobs.failure}` },
            { name: '실패한 작업 종류', value: jobs.failedKinds.length === 0 ? '없음' : jobs.failedKinds.join(', ') },
            { name: '로그인 잠금 24시간', value: `발생 ${recentLockouts}건 · 현재 잠김 ${lockedAccounts}건` },
            { name: 'API 키', value: `활성 ${activeKeys}개 · ${EXPIRY_WARNING_DAYS}일 내 만료 ${expiringKeys}개` },
            { name: '컨테이너', value: `실행 ${runningContainers} / 전체 ${containers.length}` },
            { name: 'artifact', value: `${artifacts.length}건 · ${toMebibytes(artifactBytes)} MiB` },
            {
                name: '마지막 백업',
                value: latestBackup === undefined ? '없음' : `${latestBackup.createdAt} · ${toMebibytes(latestBackup.controlBytes)} MiB`,
            },
        ]
    },
})

export type OperationsReportService = ReturnType<typeof createOperationsReportService>
