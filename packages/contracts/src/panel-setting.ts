import { z } from 'zod'

export const PANEL_SETTING_ID = 'panel'
export const MAX_EXTRA_TRUSTED_ORIGINS = 20

const absoluteOriginSchema = z
    .url()
    .max(255)
    .refine((value) => {
        const parsed = URL.parse(value)
        return parsed !== null && (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.hostname.length > 0
    }, 'http 또는 https 절대 URL 이어야 합니다.')
    .transform((value) => new URL(value).origin)

export const panelSettingUpdateSchema = z.object({
    extraTrustedOrigins: z.array(absoluteOriginSchema).max(MAX_EXTRA_TRUSTED_ORIGINS).default([]),
    publicOrigin: absoluteOriginSchema.nullable(),
})

export const panelSettingSchema = z.object({
    bootOrigin: z.string(),
    effectiveTrustedOrigins: z.array(z.string()),
    environmentTrustedOrigins: z.array(z.string()),
    extraTrustedOrigins: z.array(z.string()),
    nginxHostname: z.string().nullable(),
    publicOrigin: z.string().nullable(),
    restartRequired: z.boolean(),
    updatedAt: z.iso.datetime().nullable(),
})

export type PanelSetting = z.infer<typeof panelSettingSchema>
export type PanelSettingUpdate = z.infer<typeof panelSettingUpdateSchema>
