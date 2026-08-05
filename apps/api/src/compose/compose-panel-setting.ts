import { eq } from 'drizzle-orm'
import { PANEL_SETTING_ID } from '@containers/contracts/panel-setting'
import type { ControlDatabase } from '@containers/db-schema/database'
import { panelSetting } from '@containers/db-schema/schema'
import {
    createPanelSettingService,
    type PanelSettingRecord,
    type PanelSettingServiceDb,
} from '../service/domain/panel-setting/create-panel-setting-service'

const ORIGIN_SEPARATOR = ','

type ComposePanelSettingDependencies = {
    bootOrigin: string
    db: ControlDatabase
    environmentTrustedOrigins: readonly string[]
    listHostnameCandidates: (excluded: readonly string[]) => Promise<unknown>
    nginxClient: Parameters<typeof createPanelSettingService>[0]['nginxClient']
    now: () => Date
}

const parseStoredOrigins = (value: string | null) =>
    value === null
        ? []
        : value
              .split(ORIGIN_SEPARATOR)
              .map((origin) => origin.trim())
              .filter((origin) => origin.length > 0)

export const buildPanelSettingServiceDb = (db: ControlDatabase): PanelSettingServiceDb => ({
    load: (): PanelSettingRecord | null => {
        const [record] = db.select().from(panelSetting).where(eq(panelSetting.id, PANEL_SETTING_ID)).all()
        if (record === undefined) return null
        return {
            extraTrustedOrigins: parseStoredOrigins(record.extraTrustedOrigins),
            nginxHostname: record.nginxHostname,
            publicOrigin: record.publicOrigin,
            updatedAt: record.updatedAt,
        }
    },
    save: ({ extraTrustedOrigins, nginxHostname, publicOrigin, updatedAt, updatedBy }) => {
        const values = {
            extraTrustedOrigins: extraTrustedOrigins.length === 0 ? null : extraTrustedOrigins.join(ORIGIN_SEPARATOR),
            id: PANEL_SETTING_ID,
            nginxHostname,
            publicOrigin,
            updatedAt,
            updatedBy,
        }
        db.insert(panelSetting).values(values).onConflictDoUpdate({ set: values, target: panelSetting.id }).run()
    },
})

export const composePanelSetting = ({
    bootOrigin,
    db,
    environmentTrustedOrigins,
    listHostnameCandidates,
    nginxClient,
    now,
}: ComposePanelSettingDependencies) => ({
    panelSettingService: createPanelSettingService({
        bootOrigin,
        db: buildPanelSettingServiceDb(db),
        environmentTrustedOrigins,
        listHostnameCandidates,
        nginxClient,
        now,
    }),
})
