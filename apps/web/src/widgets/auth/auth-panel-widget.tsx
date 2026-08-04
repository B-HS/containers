'use client'

import type { FC } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { useBootstrapOwner, useSignInEmail } from '@entities/auth/auth.query'
import { AuthPanel } from '@features/auth-panel/auth-panel'
import type { AuthPanelLabels } from '@features/auth-panel/auth-panel'

type AuthPanelWidgetProps = {
    labels: AuthPanelLabels
    mode: 'bootstrap' | 'login'
}

export const AuthPanelWidget: FC<AuthPanelWidgetProps> = ({ labels, mode }) => {
    const t = useTranslations('Auth')
    const router = useRouter()
    const signInEmail = useSignInEmail()
    const bootstrapOwner = useBootstrapOwner()

    const authenticate = async (input: { email: string; mode: 'bootstrap' | 'login'; name?: string | undefined; password: string }) => {
        if (input.mode === 'bootstrap') {
            await bootstrapOwner.mutateAsync({ email: input.email, name: input.name ?? '', password: input.password })
        } else {
            await signInEmail.mutateAsync({ email: input.email, password: input.password })
        }
        toast.success(t('signedIn'))
        router.refresh()
    }

    return <AuthPanel labels={labels} mode={mode} onAuthenticate={authenticate} />
}
