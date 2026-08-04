import { describe, expect, test } from 'bun:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRegistryCredentialService } from './create-registry-credential-service'

describe('registry credential 서비스', () => {
    test('원문을 암호화 저장하고 일치하는 registry pull에만 AuthConfig를 제공합니다', async () => {
        const root = await mkdtemp(join(tmpdir(), 'containers-registry-credential-'))
        const filePath = join(root, 'credentials.json')
        const id = 'd7506e8c-9442-4cc0-9f58-27b55693bb1b'
        const service = createRegistryCredentialService({
            filePath,
            masterSecret: 'test-master-secret-that-is-longer-than-thirty-two-characters',
            now: () => new Date('2026-08-01T00:00:00.000Z'),
            randomId: () => id,
        })

        try {
            const created = await service.upsert(undefined, {
                name: 'Private registry',
                password: 'private-password',
                serverAddress: 'registry.example.com:5000',
                username: 'robot',
            })
            expect(created).toEqual({
                createdAt: '2026-08-01T00:00:00.000Z',
                id,
                name: 'Private registry',
                serverAddress: 'registry.example.com:5000',
                updatedAt: '2026-08-01T00:00:00.000Z',
                username: 'robot',
                version: 1,
            })
            expect(await readFile(filePath, 'utf8')).not.toContain('private-password')
            expect(await service.list()).toEqual([created])

            const registryAuth = await service.getRegistryAuth(id, 'registry.example.com:5000/team/image:1')
            expect(JSON.parse(Buffer.from(registryAuth, 'base64url').toString('utf8'))).toEqual({
                password: 'private-password',
                serveraddress: 'registry.example.com:5000',
                username: 'robot',
            })
            await expect(service.getRegistryAuth(id, 'other.example.com/team/image:1')).rejects.toThrow('REGISTRY_HOST_MISMATCH')

            const rotated = await service.upsert(id, {
                name: 'Private registry',
                password: 'rotated-password',
                serverAddress: 'registry.example.com:5000',
                username: 'robot',
            })
            expect(rotated.version).toBe(2)
            await expect(service.remove(id, { confirmation: 'wrong' })).rejects.toThrow('CONFIRMATION_MISMATCH')
            expect(await service.remove(id, { confirmation: 'Private registry' })).toEqual(rotated)
            expect(await service.list()).toEqual([])
        } finally {
            await rm(root, { force: true, recursive: true })
        }
    })
})
