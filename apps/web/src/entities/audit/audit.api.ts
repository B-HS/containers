import { AUDIT_PAGE_SIZE_DEFAULT, auditEventListSchema, auditPaginationSchema } from '@containers/contracts/audit'
import { z } from 'zod'

const responseSchema = z.object({ data: auditEventListSchema, pagination: auditPaginationSchema, success: z.literal(true) })

export type AuditFilters = {
    actorEmail: string
    from: string
    operation: string
    page: number
    result: string
    targetId: string
    targetType: string
    to: string
}

export const AUDIT_DEFAULT_FILTERS: AuditFilters = {
    actorEmail: '',
    from: '',
    operation: '',
    page: 1,
    result: '',
    targetId: '',
    targetType: '',
    to: '',
}

const DAY_START_SUFFIX = 'T00:00:00.000Z'
const DAY_END_SUFFIX = 'T23:59:59.999Z'

export const toAuditSearchParams = (filters: AuditFilters) => {
    const params: Record<string, string> = { limit: String(AUDIT_PAGE_SIZE_DEFAULT), page: String(filters.page) }
    const actorEmail = filters.actorEmail.trim()
    const operation = filters.operation.trim()
    const targetId = filters.targetId.trim()

    if (actorEmail) {
        params.actorEmail = actorEmail
    }
    if (filters.from) {
        params.from = `${filters.from}${DAY_START_SUFFIX}`
    }
    if (operation) {
        params.operation = operation
    }
    if (filters.result) {
        params.result = filters.result
    }
    if (targetId) {
        params.targetId = targetId
    }
    if (filters.targetType) {
        params.targetType = filters.targetType
    }
    if (filters.to) {
        params.to = `${filters.to}${DAY_END_SUFFIX}`
    }

    return params
}

export const parseAuditPage = (body: unknown) => {
    const parsed = responseSchema.parse(body)

    return { data: parsed.data, pagination: parsed.pagination }
}

export const getAuditEvents = async (baseUrl: string, cookie: string, params: Record<string, string>) => {
    const response = await fetch(`${baseUrl}/api/audit?${new URLSearchParams(params).toString()}`, { headers: { cookie } })

    if (!response.ok) {
        throw new Error(`감사 기록 조회 실패: ${response.status}`)
    }

    return parseAuditPage(await response.json())
}
