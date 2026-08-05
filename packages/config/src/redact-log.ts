const REDACTED = '[REDACTED]'
const MAX_LINE_LENGTH = 512
const TRUNCATION_SUFFIX = '…'

const SENSITIVE_ASSIGNMENT_PATTERN =
    /([A-Za-z0-9_.-]*(?:password|passwd|secret|token|apikey|api_key|access_key|private_key|credential|authorization|session)[A-Za-z0-9_.-]*)("?\s*[=:]\s*)("[^"]*"|'[^']*'|\S+)/gi
const AUTHORIZATION_SCHEME_PATTERN = /\b(bearer|basic)\s+([A-Za-z0-9._~+/=-]{8,})/gi
const JSON_WEB_TOKEN_PATTERN = /\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\b/g
const URL_CREDENTIAL_PATTERN = /([a-z][a-z0-9+.-]*:\/\/)([^\s:@/]+):([^\s@/]+)@/gi

const truncate = (value: string) => (value.length <= MAX_LINE_LENGTH ? value : `${value.slice(0, MAX_LINE_LENGTH)}${TRUNCATION_SUFFIX}`)

export const redactSecretText = (value: string) =>
    truncate(
        value
            .replace(URL_CREDENTIAL_PATTERN, (_match, scheme: string, user: string) => `${scheme}${user}:${REDACTED}@`)
            .replace(SENSITIVE_ASSIGNMENT_PATTERN, (_match, key: string, separator: string) => `${key}${separator}${REDACTED}`)
            .replace(AUTHORIZATION_SCHEME_PATTERN, (_match, scheme: string) => `${scheme} ${REDACTED}`)
            .replace(JSON_WEB_TOKEN_PATTERN, REDACTED),
    )

export const redactSecretLines = (value: string, limit: number) =>
    value
        .split('\n')
        .map((line) => line.replace(/\r$/, ''))
        .filter((line) => line.trim().length > 0)
        .slice(-limit)
        .map(redactSecretText)
