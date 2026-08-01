/**
 * Creates a domain error whose message is the stable error code consumed by route status mappers.
 */
export const createAppError = (code: string, cause?: unknown) => new Error(code, cause === undefined ? undefined : { cause })
