'use client'

import type { FC } from 'react'
import { useState } from 'react'
import type { NginxProxyRoute } from '@containers/contracts/nginx'
import { useCreateNginxRoute, useRemoveNginxRoute } from '@entities/nginx/nginx.query'
import { Badge } from '@shared/ui/badge'
import { Button } from '@shared/ui/button'
import { Card } from '@shared/ui/card'
import { Checkbox } from '@shared/ui/checkbox'
import { InlineAlert } from '@shared/ui/inline-alert'
import { Input } from '@shared/ui/input'
import { Label } from '@shared/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/ui/select'
import { WidgetSection } from '@shared/common/widget-section'

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
    const [protocol, setProtocol] = useState('http')
    const [stripPrefix, setStripPrefix] = useState(false)
    const canManage = ['owner', 'admin'].includes(role)
    const createRoute = useCreateNginxRoute()
    const removeRoute = useRemoveNginxRoute()

    const create = async (form: FormData) => {
        setBusy('create')
        setError(undefined)
        try {
            await createRoute.mutateAsync({
                bodySizeMegabytes: Number(form.get('bodySizeMegabytes')),
                enabled: true,
                hostname: String(form.get('hostname') ?? ''),
                path: String(form.get('path') ?? '/'),
                pathMode: 'prefix',
                protocol,
                stripPrefix,
                targetContainer: String(form.get('targetContainer') ?? ''),
                targetPort: Number(form.get('targetPort')),
                timeoutSeconds: Number(form.get('timeoutSeconds')),
            })
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
            await removeRoute.mutateAsync({ routeId: route.id, confirmation })
            window.location.reload()
        } catch (removeError) {
            setError(removeError instanceof Error ? removeError.message : labels.failed)
        } finally {
            setBusy(undefined)
        }
    }

    return (
        <WidgetSection id="nginx-routes-title" title={labels.title} badge={routes.length}>
            {error ? (
                <InlineAlert role="alert" tone="error">
                    {error}
                </InlineAlert>
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
                        <Select value={protocol} onValueChange={setProtocol}>
                            <SelectTrigger id="route-protocol" className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="http">HTTP</SelectItem>
                                <SelectItem value="websocket">WebSocket</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid gap-1">
                        <Label htmlFor="route-timeout">{labels.timeout}</Label>
                        <Input id="route-timeout" name="timeoutSeconds" type="number" min="1" max="3600" defaultValue="60" required />
                    </div>
                    <div className="grid gap-1">
                        <Label htmlFor="route-body-size">{labels.bodySize}</Label>
                        <Input id="route-body-size" name="bodySizeMegabytes" type="number" min="1" max="1024" defaultValue="64" required />
                    </div>
                    <div className="flex items-center gap-2 self-end text-xs">
                        <Checkbox id="route-strip-prefix" checked={stripPrefix} onCheckedChange={(checked) => setStripPrefix(checked === true)} />
                        <Label htmlFor="route-strip-prefix">{labels.stripPrefix}</Label>
                    </div>
                    <Button type="submit" variant="default" disabled={busy === 'create'}>
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
                                    <Button type="submit" variant="default" disabled={busy === route.id}>
                                        {labels.remove}
                                    </Button>
                                </div>
                            </form>
                        ) : null}
                    </Card>
                ))}
            </div>
        </WidgetSection>
    )
}
