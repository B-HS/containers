import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { eq } from 'drizzle-orm'
import { createControlDatabase } from '@containers/db-schema/database'
import { USER_ROLE, userRole } from '@containers/db-schema/schema'
import { createAuth } from '../../../auth/create-auth'
import { createAuthService } from './create-auth-service'

const temporaryDirectories: string[] = []

afterEach(async () => {
    await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })))
})

const createTestService = async () => {
    const directory = await mkdtemp(join(tmpdir(), 'containers-auth-'))
    temporaryDirectories.push(directory)
    const database = createControlDatabase({
        filePath: join(directory, 'control.sqlite'),
        migrationsFolder: resolve(process.cwd(), 'packages/db-schema/drizzle'),
    })
    const auth = createAuth({
        baseUrl: 'http://localhost:3001',
        db: database.db,
        secret: 'test-secret-that-is-at-least-thirty-two-characters-long',
        trustedOrigins: ['http://localhost:8080'],
    })
    const service = createAuthService({
        auth,
        db: database.db,
        invitationBaseUrl: 'http://localhost:8080',
        now: () => new Date('2026-07-31T00:00:00.000Z'),
    })

    return { ...database, auth, service }
}

describe('인증 서비스', () => {
    test('첫 사용자만 owner로 bootstrap합니다', async () => {
        const { db, service, sqlite } = await createTestService()

        expect(await service.getBootstrapStatus()).toEqual({ required: true })
        const result = await service.bootstrapOwner({
            email: 'owner@example.com',
            name: 'Owner',
            password: 'correct-horse-battery-staple',
        })
        const [role] = await db.select().from(userRole).where(eq(userRole.userId, result.user.id))

        expect(role?.role).toBe(USER_ROLE.OWNER)
        expect(await service.getBootstrapStatus()).toEqual({ required: false })
        await expect(
            service.bootstrapOwner({
                email: 'other@example.com',
                name: 'Other',
                password: 'another-secure-password',
            }),
        ).rejects.toThrow('BOOTSTRAP_COMPLETE')
        sqlite.close()
    })

    test('owner가 만든 단회 초대로 운영자를 생성합니다', async () => {
        const { auth, db, service, sqlite } = await createTestService()
        await service.bootstrapOwner({
            email: 'owner@example.com',
            name: 'Owner',
            password: 'correct-horse-battery-staple',
        })
        const signInResponse = await auth.handler(
            new Request('http://localhost:3001/api/auth/sign-in/email', {
                body: JSON.stringify({ email: 'owner@example.com', password: 'correct-horse-battery-staple' }),
                headers: { 'content-type': 'application/json', origin: 'http://localhost:8080' },
                method: 'POST',
            }),
        )
        const sessionCookie = signInResponse.headers.get('set-cookie')?.split(';')[0]
        const ownerHeaders = new Headers({ cookie: sessionCookie ?? '' })
        const invitation = await service.createInvitation(ownerHeaders, {
            email: 'operator@example.com',
            expiresInHours: 24,
            role: USER_ROLE.OPERATOR,
        })
        const invitationUrl = new URL(invitation.invitationUrl)
        const token = invitationUrl.searchParams.get('token')

        expect(token).not.toBeNull()
        const operator = await service.acceptInvitation({
            name: 'Operator',
            password: 'operator-secure-password',
            token,
        })
        const [role] = await db.select().from(userRole).where(eq(userRole.userId, operator.user.id))

        expect(role?.role).toBe(USER_ROLE.OPERATOR)
        const users = await service.listUsers(ownerHeaders)
        expect(users.map((managedUser) => managedUser.email)).toEqual(['owner@example.com', 'operator@example.com'])

        const operatorSignInResponse = await auth.handler(
            new Request('http://localhost:3001/api/auth/sign-in/email', {
                body: JSON.stringify({ email: 'operator@example.com', password: 'operator-secure-password' }),
                headers: { 'content-type': 'application/json', origin: 'http://localhost:8080' },
                method: 'POST',
            }),
        )
        const operatorCookie = operatorSignInResponse.headers.get('set-cookie')?.split(';')[0]
        const updated = await service.updateUser(ownerHeaders, operator.user.id, { disabled: true, role: USER_ROLE.VIEWER })

        expect(updated.role).toBe(USER_ROLE.VIEWER)
        expect(updated.disabledAt).not.toBeNull()
        expect(await service.isEmailDisabled('operator@example.com')).toBe(true)
        expect(await service.getSession(new Headers({ cookie: operatorCookie ?? '' }))).toBeUndefined()
        await expect(service.updateUser(ownerHeaders, users[0]?.id ?? '', { disabled: true })).rejects.toThrow('OWNER_IMMUTABLE')
        await expect(
            service.acceptInvitation({
                name: 'Operator Again',
                password: 'operator-other-password',
                token,
            }),
        ).rejects.toThrow('INVITATION_INVALID')
        sqlite.close()
    })
})
