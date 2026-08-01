import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import type { ControlDatabase } from '@containers/db-schema/database'
import { schema } from '@containers/db-schema/schema'
import { betterAuth } from 'better-auth'

type AuthDependencies = {
    baseUrl: string
    db: ControlDatabase
    secret: string
    trustedOrigins: string[]
}

export const createAuth = ({ baseUrl, db, secret, trustedOrigins }: AuthDependencies) =>
    betterAuth({
        baseURL: baseUrl,
        database: drizzleAdapter(db, { provider: 'sqlite', schema }),
        emailAndPassword: {
            autoSignIn: true,
            enabled: true,
            maxPasswordLength: 128,
            minPasswordLength: 12,
        },
        secret,
        trustedOrigins,
    })

export type Auth = ReturnType<typeof createAuth>
