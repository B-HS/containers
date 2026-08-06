import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import { resolveTrustedOrigins } from '@containers/config/origin'
import type { ControlDatabase } from '@containers/db-schema/database'
import { schema } from '@containers/db-schema/schema'
import { betterAuth } from 'better-auth'

type AuthDependencies = {
    baseUrl: string
    db: ControlDatabase
    secret: string
    trustedOrigins: () => readonly string[]
}

/**
 * Better Auth resolves cookie security once at construction, which cannot serve the panel over
 * both loopback http and a public https origin. The Secure attribute is therefore added per
 * request by the response middleware in create-app, based on the forwarded protocol.
 *
 * Sessions are deliberately short lived because the panel is reachable from a public origin: an
 * idle session dies within half a day and an active one is refreshed hourly.
 */
const HOUR_SECONDS = 60 * 60
const SESSION_EXPIRES_SECONDS = 12 * HOUR_SECONDS
const SESSION_UPDATE_SECONDS = HOUR_SECONDS

export const createAuth = ({ baseUrl, db, secret, trustedOrigins }: AuthDependencies) =>
    betterAuth({
        advanced: { useSecureCookies: false },
        baseURL: baseUrl,
        database: drizzleAdapter(db, { provider: 'sqlite', schema }),
        emailAndPassword: {
            autoSignIn: true,
            enabled: true,
            maxPasswordLength: 128,
            minPasswordLength: 12,
        },
        secret,
        session: { expiresIn: SESSION_EXPIRES_SECONDS, updateAge: SESSION_UPDATE_SECONDS },
        trustedOrigins: () => resolveTrustedOrigins({ baseUrl, origins: trustedOrigins() }),
    })

export type Auth = ReturnType<typeof createAuth>
