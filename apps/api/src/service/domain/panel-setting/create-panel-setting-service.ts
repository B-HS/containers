import { resolveTrustedOrigins, toOrigin } from '@containers/config/origin'
import { panelSettingSchema, panelSettingUpdateSchema } from '@containers/contracts/panel-setting'
import { applyPanelHostname } from '@containers/nginx-config/panel-hostname'
import { createAppError } from '../../../lib/error'

type PanelSettingRecord = {
    extraTrustedOrigins: string[]
    nginxHostname: string | null
    publicOrigin: string | null
    updatedAt: Date
}

type PanelSettingServiceDb = {
    load: () => PanelSettingRecord | null
    save: (record: PanelSettingRecord & { updatedBy: string | null }) => void
}

type NginxConfigClient = {
    applyNginxConfig: (input: { config: string; expectedSha256: string }) => Promise<unknown>
    getNginxConfig: () => Promise<{ config: string; sha256: string }>
}

type PanelSettingServiceDependencies = {
    bootOrigin: string
    db: PanelSettingServiceDb
    environmentTrustedOrigins: readonly string[]
    nginxClient: NginxConfigClient
    now: () => Date
}

const hostnameOf = (origin: string) => {
    const parsed = URL.parse(origin)
    return parsed === null ? null : parsed.hostname
}

export const createPanelSettingService = ({ bootOrigin, db, environmentTrustedOrigins, nginxClient, now }: PanelSettingServiceDependencies) => {
    const environmentOrigins = resolveTrustedOrigins({ baseUrl: bootOrigin, origins: environmentTrustedOrigins })

    let state = db.load()

    const effectiveTrustedOrigins = () => {
        const stored = state === null ? [] : [...state.extraTrustedOrigins, ...(state.publicOrigin === null ? [] : [state.publicOrigin])]
        return Array.from(new Set([...environmentOrigins, ...stored.map((origin) => toOrigin(origin) ?? origin)]))
    }

    const toResponse = () =>
        panelSettingSchema.parse({
            bootOrigin,
            effectiveTrustedOrigins: effectiveTrustedOrigins(),
            environmentTrustedOrigins: environmentOrigins,
            extraTrustedOrigins: state?.extraTrustedOrigins ?? [],
            nginxHostname: state?.nginxHostname ?? null,
            publicOrigin: state?.publicOrigin ?? null,
            restartRequired: state?.publicOrigin != null && state.publicOrigin !== bootOrigin,
            updatedAt: state?.updatedAt.toISOString() ?? null,
        })

    const syncNginxHostname = async (nextHostname: string | null) => {
        const previousHostname = state?.nginxHostname ?? null
        if (nextHostname === previousHostname) return previousHostname

        const current = await nginxClient.getNginxConfig()
        const nextConfig = applyPanelHostname(current.config, { add: nextHostname, remove: previousHostname })
        if (nextConfig === null) return nextHostname

        await nginxClient.applyNginxConfig({ config: nextConfig, expectedSha256: current.sha256 })
        return nextHostname
    }

    return {
        get: () => toResponse(),
        getTrustedOrigins: () => effectiveTrustedOrigins(),
        update: async (actorId: string | null, input: unknown) => {
            const payload = panelSettingUpdateSchema.parse(input)
            const nextHostname = payload.publicOrigin === null ? null : hostnameOf(payload.publicOrigin)
            if (payload.publicOrigin !== null && nextHostname === null) {
                throw createAppError('PANEL_SETTING_ORIGIN_INVALID')
            }

            const appliedHostname = await syncNginxHostname(nextHostname)
            const record = {
                extraTrustedOrigins: payload.extraTrustedOrigins,
                nginxHostname: appliedHostname,
                publicOrigin: payload.publicOrigin,
                updatedAt: now(),
            }

            db.save({ ...record, updatedBy: actorId })
            state = record

            return toResponse()
        },
    }
}

export type PanelSettingService = ReturnType<typeof createPanelSettingService>
export type { PanelSettingRecord, PanelSettingServiceDb }
