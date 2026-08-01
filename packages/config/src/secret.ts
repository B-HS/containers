import { randomBytes } from 'node:crypto'
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export const loadOrCreateSecret = async (filePath: string) => {
    try {
        const existingSecret = (await readFile(filePath, 'utf8')).trim()

        if (existingSecret.length < 32) {
            throw new Error('비밀키 파일이 32자보다 짧습니다.')
        }

        return existingSecret
    } catch (error) {
        if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') {
            throw error
        }
    }

    await mkdir(dirname(filePath), { recursive: true })
    const generatedSecret = randomBytes(48).toString('base64url')

    try {
        await writeFile(filePath, generatedSecret, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
        await chmod(filePath, 0o600)
        return generatedSecret
    } catch (error) {
        if (!(error instanceof Error) || !('code' in error) || error.code !== 'EEXIST') {
            throw error
        }

        return (await readFile(filePath, 'utf8')).trim()
    }
}
