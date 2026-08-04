'use client'

import type { FC } from 'react'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@shared/ui/button'
import { Spinner } from '@shared/ui/spinner'

type LogoutButtonProps = {
    label: string
    onSignOut: () => Promise<void>
}

export const LogoutButton: FC<LogoutButtonProps> = ({ label, onSignOut }) => {
    const router = useRouter()
    const [pending, setPending] = useState(false)

    const logout = async () => {
        setPending(true)

        try {
            await onSignOut()
            router.refresh()
        } finally {
            setPending(false)
        }
    }

    return (
        <Button className="w-full" type="button" variant="outline" size="sm" disabled={pending} onClick={logout}>
            {pending ? <Spinner /> : null}
            {label}
        </Button>
    )
}
