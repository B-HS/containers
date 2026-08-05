import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import { resolveTrustedOrigins } from '@containers/config/origin'
import type { ControlDatabase } from '@containers/db-schema/database'
import { schema } from '@containers/db-schema/schema'
import { betterAuth } from 'better-auth'

const HTTPS_PREFIX = 'https://'

type AuthDependencies = {
    baseUrl: string
    db: ControlDatabase
    secret: string
    trustedOrigins: () => readonly string[]
}

export const createAuth = ({ baseUrl, db, secret, trustedOrigins }: AuthDependencies) =>
    betterAuth({
        advanced: { useSecureCookies: baseUrl.startsWith(HTTPS_PREFIX) },
        baseURL: baseUrl,
        database: drizzleAdapter(db, { provider: 'sqlite', schema }),
        emailAndPassword: {
            autoSignIn: true,
            enabled: true,
            maxPasswordLength: 128,
            minPasswordLength: 12,
        },
        secret,
        trustedOrigins: () => resolveTrustedOrigins({ baseUrl, origins: trustedOrigins() }),
    })

export type Auth = ReturnType<typeof createAuth>
