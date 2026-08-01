'use client'

import type { FC } from 'react'
import { useState } from 'react'
import type { z } from 'zod'
import { nginxConfigStateSchema } from '@containers/contracts/nginx'
import { formatDateTime } from '@shared/lib/format-date-time'
import { parseApiError } from '@shared/lib/parse-api-error'
import { Badge } from '@shared/ui/badge'
import { Button } from '@shared/ui/button'
import { Card } from '@shared/ui/card'
import { Label } from '@shared/ui/label'
import { Textarea } from '@shared/ui/textarea'

type NginxConfigState = z.infer<typeof nginxConfigStateSchema>

type NginxConfigWidgetProps = {
    labels: {
        apply: string
        applying: string
        failed: string
        history: string
        protectedNotice: string
        sha256: string
        success: string
        title: string
    }
    role: string
    state: NginxConfigState | undefined
}

export const NginxConfigWidget: FC<NginxConfigWidgetProps> = ({ labels, role, state }) => {
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string>()
    const [success, setSuccess] = useState(false)
    const canApply = ['owner', 'admin'].includes(role)

    const apply = async (config: string) => {
        if (!state) {
            return
        }
        setBusy(true)
        setError(undefined)
        setSuccess(false)
        try {
            const response = await fetch('/api/nginx/config/apply', {
                body: JSON.stringify({ config, expectedSha256: state.sha256 }),
                headers: { 'content-type': 'application/json' },
                method: 'POST',
            })
            if (!response.ok) {
                throw new Error(parseApiError(await response.json(), labels.failed))
            }
            setSuccess(true)
            window.location.reload()
        } catch (applyError) {
            setError(applyError instanceof Error ? applyError.message : labels.failed)
        } finally {
            setBusy(false)
        }
    }

    return (
        <section className="mt-px min-w-0 overflow-hidden bg-card" aria-labelledby="nginx-config-title">
            <header className="flex items-center justify-between p-3">
                <h2 id="nginx-config-title" className="text-sm font-semibold">
                    {labels.title}
                </h2>
                <Badge variant="muted">{state?.history.length ?? 0}</Badge>
            </header>
            {error ? (
                <p className="mx-3 mb-3 bg-red-950 p-3 text-sm text-red-100" role="alert">
                    {error}
                </p>
            ) : null}
            {success ? (
                <p className="mx-3 mb-3 bg-muted p-3 text-sm" role="status">
                    {labels.success}
                </p>
            ) : null}
            {state ? (
                <form
                    className="grid gap-3 border-t border-background p-3"
                    onSubmit={(event) => {
                        event.preventDefault()
                        void apply(String(new FormData(event.currentTarget).get('config') ?? ''))
                    }}
                >
                    <div>
                        <Label htmlFor="nginx-config-editor">nginx.conf</Label>
                        <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                            {labels.sha256}: {state.sha256}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">{labels.protectedNotice}</p>
                    </div>
                    <Textarea
                        id="nginx-config-editor"
                        name="config"
                        className="min-h-[32rem] whitespace-pre overflow-auto"
                        defaultValue={state.config}
                        readOnly={!canApply}
                        spellCheck={false}
                    />
                    {canApply ? (
                        <Button className="justify-self-start" type="submit" disabled={busy}>
                            {busy ? labels.applying : labels.apply}
                        </Button>
                    ) : null}
                </form>
            ) : (
                <p className="p-3 text-sm text-muted-foreground">{labels.failed}</p>
            )}
            {state?.history.length ? (
                <div className="border-t border-background p-3">
                    <h3 className="text-sm font-semibold">{labels.history}</h3>
                    <div className="mt-2 grid gap-px bg-background">
                        {state.history.map((revision) => (
                            <Card key={revision.sha256} className="min-w-0 gap-1 p-3">
                                <p className="truncate font-mono text-xs">{revision.sha256}</p>
                                <p className="text-xs text-muted-foreground">{formatDateTime(revision.createdAt)}</p>
                            </Card>
                        ))}
                    </div>
                </div>
            ) : null}
        </section>
    )
}
