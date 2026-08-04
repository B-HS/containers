import { randomBytes } from 'node:crypto'
import { chmod, readdir, writeFile } from 'node:fs/promises'
import { basename, dirname } from 'node:path'
import { loadOrCreateSecret } from './secret'

const KEY_FILE_MODE = 0o600
const INITIAL_KEY_VERSION = 1
const GENERATED_KEY_BYTES = 48

export type SecretKeyring = {
    activeVersion: number
    keys: Map<number, string>
}

const versionFilePath = (filePath: string, version: number) => (version === INITIAL_KEY_VERSION ? filePath : `${filePath}.v${version}`)

const parseVersion = (fileName: string, baseName: string) => {
    if (fileName === baseName) return INITIAL_KEY_VERSION
    if (!fileName.startsWith(`${baseName}.v`)) return undefined
    const version = Number(fileName.slice(baseName.length + 2))
    return Number.isSafeInteger(version) && version > INITIAL_KEY_VERSION ? version : undefined
}

export const loadKeyring = async (filePath: string): Promise<SecretKeyring> => {
    const keys = new Map<number, string>([[INITIAL_KEY_VERSION, await loadOrCreateSecret(filePath)]])
    const baseName = basename(filePath)
    const entries = await readdir(dirname(filePath), { withFileTypes: true })
    await Promise.all(
        entries.map(async (entry) => {
            if (!entry.isFile()) return
            const version = parseVersion(entry.name, baseName)
            if (version === undefined || version === INITIAL_KEY_VERSION) return
            keys.set(version, await loadOrCreateSecret(versionFilePath(filePath, version)))
        }),
    )
    return { activeVersion: Math.max(...keys.keys()), keys }
}

export const appendKeyVersion = async (filePath: string, keyring: SecretKeyring): Promise<SecretKeyring> => {
    const version = keyring.activeVersion + 1
    const secret = randomBytes(GENERATED_KEY_BYTES).toString('base64url')
    const destination = versionFilePath(filePath, version)
    await writeFile(destination, secret, { encoding: 'utf8', flag: 'wx', mode: KEY_FILE_MODE })
    await chmod(destination, KEY_FILE_MODE)
    return { activeVersion: version, keys: new Map(keyring.keys).set(version, secret) }
}
