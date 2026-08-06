import { and, count, desc, eq, gt, gte, inArray, isNotNull, lte } from 'drizzle-orm'
import type { AuditIntegrity } from '@containers/contracts/audit'
import type { ControlDatabase } from '@containers/db-schema/database'
import { apiKey, loginLockout, notificationDelivery, operationJob } from '@containers/db-schema/schema'
import { createOperationsReportService, type OperationsReportServiceDb } from '../service/domain/notification/create-operations-report-service'

type ComposeOperationsReportDependencies = {
    db: ControlDatabase
    listArtifacts: () => Promise<{ sizeBytes: number }[]>
    listBackups: () => Promise<{ controlBytes: number; createdAt: string }[]>
    listContainers: () => Promise<{ state: string }[]>
    verifyAuditIntegrity: () => Promise<AuditIntegrity>
}

const FAILED_JOB_STATUSES = ['failed', 'cancelled'] as const
const SUCCEEDED_JOB_STATUS = 'succeeded'

const REPORT_EVENT_TYPE = 'system.report'

export const buildOperationsReportServiceDb = (db: ControlDatabase): OperationsReportServiceDb => ({
    findLastReportAt: async () => {
        const [row] = await db
            .select({ createdAt: notificationDelivery.createdAt })
            .from(notificationDelivery)
            .where(eq(notificationDelivery.eventType, REPORT_EVENT_TYPE))
            .orderBy(desc(notificationDelivery.createdAt))
            .limit(1)
        return row?.createdAt
    },
    countActiveApiKeys: async (now) => {
        const [row] = await db
            .select({ value: count() })
            .from(apiKey)
            .where(and(isNotNull(apiKey.expiresAt), gt(apiKey.expiresAt, now)))
        return row?.value ?? 0
    },
    countExpiringApiKeys: async (now, until) => {
        const [row] = await db
            .select({ value: count() })
            .from(apiKey)
            .where(and(gt(apiKey.expiresAt, now), lte(apiKey.expiresAt, until)))
        return row?.value ?? 0
    },
    countLockedAccounts: async (now) => {
        const [row] = await db.select({ value: count() }).from(loginLockout).where(gt(loginLockout.lockedUntil, now))
        return row?.value ?? 0
    },
    countRecentLockouts: async (since) => {
        const [row] = await db
            .select({ value: count() })
            .from(loginLockout)
            .where(and(isNotNull(loginLockout.lockedUntil), gte(loginLockout.updatedAt, since)))
        return row?.value ?? 0
    },
    summarizeJobs: async (since) => {
        const [succeeded] = await db
            .select({ value: count() })
            .from(operationJob)
            .where(and(eq(operationJob.status, SUCCEEDED_JOB_STATUS), gte(operationJob.updatedAt, since)))
        const failedRows = await db
            .select({ kind: operationJob.kind })
            .from(operationJob)
            .where(and(inArray(operationJob.status, [...FAILED_JOB_STATUSES]), gte(operationJob.updatedAt, since)))
        return {
            failedKinds: Array.from(new Set(failedRows.map((row) => row.kind))).sort(),
            failure: failedRows.length,
            success: succeeded?.value ?? 0,
        }
    },
})

export const composeOperationsReport = ({
    db,
    listArtifacts,
    listBackups,
    listContainers,
    verifyAuditIntegrity,
}: ComposeOperationsReportDependencies) => ({
    operationsReportService: createOperationsReportService({
        db: buildOperationsReportServiceDb(db),
        listArtifacts,
        listBackups,
        listContainers,
        now: () => new Date(),
        verifyAuditIntegrity,
    }),
})
