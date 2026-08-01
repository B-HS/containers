'use client'

import type { FC } from 'react'
import { useState } from 'react'
import type { NginxProxyRoute } from '@containers/contracts/nginx'
import { parseApiError } from '@shared/lib/parse-api-error'
import { Badge } from '@shared/ui/badge'
import { Button } from '@shared/ui/button'
import { Card } from '@shared/ui/card'
import { Input } from '@shared/ui/input'
import { Label } from '@shared/ui/label'

type NginxRouteControlWidgetProps = {
    containers: string[]
    labels: {
        bodySize: string
        confirmation: string
        container: string
        create: string
        empty: string
        failed: string
        hostname: string
        path: string
        port: string
        protocol: string
        remove: string
        stripPrefix: string
        timeout: string
        title: string
    }
    role: string
    routes: NginxProxyRoute[]
}

export const NginxRouteControlWidget: FC<NginxRouteControlWidgetProps> = ({ containers, labels, role, routes }) => {
    const [busy, setBusy] = useState<string>()
    const [error, setError] = useState<string>()
    const canManage = ['owner', 'admin'].includes(role)

    const create = async (form: FormData) => {
        setBusy('create')
        setError(undefined)
        try {
            const response = await fetch('/api/nginx/routes', {
                body: JSON.stringify({
                    bodySizeMegabytes: Number(form.get('bodySizeMegabytes')),
                    enabled: true,
                    hostname: String(form.get('hostname') ?? ''),
                    path: String(form.get('path') ?? '/'),
                    pathMode: 'prefix',
                    protocol: String(form.get('protocol') ?? 'http'),
                    stripPrefix: form.get('stripPrefix') === 'on',
                    targetContainer: String(form.get('targetContainer') ?? ''),
                    targetPort: Number(form.get('targetPort')),
                    timeoutSeconds: Number(form.get('timeoutSeconds')),
                }),
                headers: { 'content-type': 'application/json' },
                method: 'POST',
            })
            if (!response.ok) {
                throw new Error(parseApiError(await response.json(), labels.failed))
            }
            window.location.reload()
        } catch (createError) {
            setError(createError instanceof Error ? createError.message : labels.failed)
        } finally {
            setBusy(undefined)
        }
    }

    const remove = async (route: NginxProxyRoute, confirmation: string) => {
        setBusy(route.id)
        setError(undefined)
        try {
            const response = await fetch(`/api/nginx/routes/${route.id}`, {
                body: JSON.stringify({ confirmation }),
                headers: { 'content-type': 'application/json' },
                method: 'DELETE',
            })
            if (!response.ok) {
                throw new Error(parseApiError(await response.json(), labels.failed))
            }
            window.location.reload()
        } catch (removeError) {
            setError(removeError instanceof Error ? removeError.message : labels.failed)
        } finally {
            setBusy(undefined)
        }
    }

    return (
        <section className="mt-px min-w-0 overflow-hidden bg-card" aria-labelledby="nginx-routes-title">
            <header className="flex items-center justify-between p-3">
                <h2 id="nginx-routes-title" className="text-sm font-semibold">
                    {labels.title}
                </h2>
                <Badge variant="muted">{routes.length}</Badge>
            </header>
            {error ? (
                <p className="mx-3 mb-3 bg-red-950 p-3 text-sm text-red-100" role="alert">
                    {error}
                </p>
            ) : null}
            {canManage ? (
                <form
                    className="grid gap-2 border-t border-background p-3 lg:grid-cols-4"
                    onSubmit={(event) => {
                        event.preventDefault()
                        void create(new FormData(event.currentTarget))
                    }}
                >
                    <div className="grid gap-1 lg:col-span-2">
                        <Label htmlFor="route-hostname">{labels.hostname}</Label>
                        <Input id="route-hostname" name="hostname" placeholder="app.example.com" required />
                    </div>
                    <div className="grid gap-1 lg:col-span-2">
                        <Label htmlFor="route-path">{labels.path}</Label>
                        <Input id="route-path" name="path" defaultValue="/" required />
                    </div>
                    <div className="grid gap-1 lg:col-span-2">
                        <Label htmlFor="route-container">{labels.container}</Label>
                        <Input id="route-container" name="targetContainer" list="route-container-options" required />
                        <datalist id="route-container-options">
                            {containers.map((container) => (
                                <option key={container} value={container} />
                            ))}
                        </datalist>
                    </div>
                    <div className="grid gap-1">
                        <Label htmlFor="route-port">{labels.port}</Label>
                        <Input id="route-port" name="targetPort" type="number" min="1" max="65535" required />
                    </div>
                    <div className="grid gap-1">
                        <Label htmlFor="route-protocol">{labels.protocol}</Label>
                        <select id="route-protocol" name="protocol" className="h-9 bg-input px-3 text-sm">
                            <option value="http">HTTP</option>
                            <option value="websocket">WebSocket</option>
                        </select>
                    </div>
                    <div className="grid gap-1">
                        <Label htmlFor="route-timeout">{labels.timeout}</Label>
                        <Input id="route-timeout" name="timeoutSeconds" type="number" min="1" max="3600" defaultValue="60" required />
                    </div>
                    <div className="grid gap-1">
                        <Label htmlFor="route-body-size">{labels.bodySize}</Label>
                        <Input id="route-body-size" name="bodySizeMegabytes" type="number" min="1" max="1024" defaultValue="64" required />
                    </div>
                    <label className="flex items-center gap-2 self-end text-xs">
                        <input name="stripPrefix" type="checkbox" /> {labels.stripPrefix}
                    </label>
                    <Button type="submit" disabled={busy === 'create'}>
                        {labels.create}
                    </Button>
                </form>
            ) : null}
            {routes.length === 0 ? <p className="border-t border-background p-3 text-sm text-muted-foreground">{labels.empty}</p> : null}
            <div className="grid gap-px bg-background lg:grid-cols-2">
                {routes.map((route) => (
                    <Card key={route.id} className="min-w-0 gap-3 p-3">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <p className="truncate text-sm font-semibold">
                                    {route.hostname}
                                    {route.path}
                                </p>
                                <p className="truncate font-mono text-xs text-muted-foreground">
                                    {route.targetContainer}:{route.targetPort}
                                </p>
                            </div>
                            <Badge variant="muted">{route.protocol}</Badge>
                        </div>
                        {canManage ? (
                            <form
                                className="grid gap-2"
                                onSubmit={(event) => {
                                    event.preventDefault()
                                    void remove(route, String(new FormData(event.currentTarget).get('confirmation') ?? ''))
                                }}
                            >
                                <Label htmlFor={`route-confirm-${route.id}`}>
                                    {labels.confirmation}: {route.hostname}
                                    {route.path}
                                </Label>
                                <div className="flex min-w-0 gap-px">
                                    <Input id={`route-confirm-${route.id}`} name="confirmation" className="min-w-0" />
                                    <Button type="submit" disabled={busy === route.id}>
                                        {labels.remove}
                                    </Button>
                                </div>
                            </form>
                        ) : null}
                    </Card>
                ))}
            </div>
        </section>
    )
}
