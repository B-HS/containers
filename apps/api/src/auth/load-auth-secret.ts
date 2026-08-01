import { loadOrCreateSecret } from '@containers/config/secret'

export const loadAuthSecret = async (filePath: string) => loadOrCreateSecret(filePath)
