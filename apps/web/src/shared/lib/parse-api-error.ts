import { z } from 'zod'

const ISSUE_SEPARATOR = ' · '
const REJECTION_SEPARATOR = ' · '

const envelopeSchema = z.object({
    error: z.object({
        code: z.string().optional(),
        details: z
            .object({
                rejections: z.array(z.object({ detail: z.string(), rule: z.string(), service: z.string() })).optional(),
            })
            .loose()
            .optional(),
        message: z.string(),
    }),
})

const flatMessageSchema = z.object({ message: z.string() })

const validationIssueListSchema = z.object({
    error: z.array(z.object({ message: z.string(), path: z.array(z.union([z.string(), z.number()])).optional() })).min(1),
})

const describeIssues = (issues: z.infer<typeof validationIssueListSchema>['error']) =>
    issues.map((issue) => (issue.path && issue.path.length > 0 ? `${issue.path.join('.')}: ${issue.message}` : issue.message)).join(ISSUE_SEPARATOR)

export const parseApiError = (input: unknown, fallback: string) => {
    const envelope = envelopeSchema.safeParse(input)
    if (envelope.success) {
        const rejections = envelope.data.error.details?.rejections ?? []
        if (rejections.length === 0) {
            return envelope.data.error.message
        }
        return `${envelope.data.error.message}${REJECTION_SEPARATOR}${rejections
            .map((rejection) => `${rejection.service}: ${rejection.detail}`)
            .join(REJECTION_SEPARATOR)}`
    }
    const issues = validationIssueListSchema.safeParse(input)
    if (issues.success) {
        return describeIssues(issues.data.error)
    }
    const flat = flatMessageSchema.safeParse(input)
    return flat.success ? flat.data.message : fallback
}

export const parseApiErrorCode = (input: unknown) => {
    const envelope = envelopeSchema.safeParse(input)
    return envelope.success ? (envelope.data.error.code ?? null) : null
}
