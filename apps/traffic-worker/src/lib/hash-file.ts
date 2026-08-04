import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'

export const hashFile = async (filePath: string) => {
    const hash = createHash('sha256')
    let bytes = 0
    for await (const chunk of createReadStream(filePath)) {
        const buffer = chunk as Buffer
        hash.update(buffer)
        bytes += buffer.byteLength
    }
    return { bytes, sha256: hash.digest('hex') }
}
