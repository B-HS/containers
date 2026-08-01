'use client'

import type { FC } from 'react'
import { useState } from 'react'
import { Button } from '@shared/ui/button'

type LogoutButtonProps = {
    label: string
}

export const LogoutButton: FC<LogoutButtonProps> = ({ label }) => {
    const [pending, setPending] = useState(false)

    const logout = async () => {
        setPending(true)

        try {
            await fetch('/api/auth/sign-out', { method: 'POST' })
            window.location.reload()
        } finally {
            setPending(false)
        }
    }

    return (
        <Button className="mt-4 w-full" type="button" disabled={pending} onClick={logout}>
            {label}
        </Button>
    )
}
