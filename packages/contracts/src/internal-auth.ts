import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'

export const INTERNAL_AUTH_HEADERS = {
    NONCE: 'x-containers-nonce',
    SIGNATURE: 'x-containers-signature',
    TIMESTAMP: 'x-containers-timestamp',
} as const

const internalAuthInputSchema = z.object({
    body: z.string(),
    method: z.string().min(1),
    nonce: z.uuid(),
    path: z.string().startsWith('/'),
    secret: z.string().min(32),
    timestamp: z.string().regex(/^\d{13}$/),
})

const AUTH_CLOCK_SKEW_MS = 30_000

const createCanonicalRequest = (input: z.infer<typeof internalAuthInputSchema>) => {
    const bodyHash = createHash('sha256').update(input.body).digest('hex')
    return `${input.timestamp}\n${input.nonce}\n${input.method.toUpperCase()}\n${input.path}\n${bodyHash}`
}

export const createInternalRequestSignature = (input: z.input<typeof internalAuthInputSchema>) => {
    const parsedInput = internalAuthInputSchema.parse(input)
    return createHmac('sha256', parsedInput.secret).update(createCanonicalRequest(parsedInput)).digest('hex')
}

export const verifyInternalRequestSignature = (input: z.input<typeof internalAuthInputSchema> & { signature: string }) => {
    const expected = Buffer.from(createInternalRequestSignature(input), 'hex')
    const received = Buffer.from(input.signature, 'hex')
    return expected.length === received.length && timingSafeEqual(expected, received)
}

export const createInternalRequestAuthorizer = ({ now, secret }: { now: () => number; secret: string }) => {
    const usedNonces = new Map<string, number>()

    return (input: Omit<z.input<typeof internalAuthInputSchema>, 'secret'> & { signature: string }) => {
        const requestTime = now()
        const timestampNumber = Number(input.timestamp)

        for (const [nonce, expiresAt] of usedNonces) {
            if (expiresAt <= requestTime) {
                usedNonces.delete(nonce)
            }
        }

        if (!Number.isSafeInteger(timestampNumber) || Math.abs(requestTime - timestampNumber) > AUTH_CLOCK_SKEW_MS || usedNonces.has(input.nonce)) {
            return false
        }

        try {
            const valid = verifyInternalRequestSignature({ ...input, secret })

            if (valid) {
                usedNonces.set(input.nonce, requestTime + AUTH_CLOCK_SKEW_MS)
            }

            return valid
        } catch {
            return false
        }
    }
}
