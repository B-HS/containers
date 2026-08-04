'use client'

import type { FC } from 'react'
import { useState } from 'react'
import { z } from 'zod'
import { nginxProxyRouteInputSchema } from '@containers/contracts/nginx'
import { Button } from '@shared/ui/button'
import { Input } from '@shared/ui/input'
import { Label } from '@shared/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/ui/select'
import { Switch } from '@shared/ui/switch'

const DEFAULT_TIMEOUT_SECONDS = 60
const DEFAULT_BODY_SIZE_MEGABYTES = 64

type NginxRouteInput = z.infer<typeof nginxProxyRouteInputSchema>

type NginxRouteCreateFormProps = {
    busy: boolean
    containers: string[]
    labels: {
        bodySize: string
        container: string
        create: string
        hostname: string
        invalidValue: string
        path: string
        port: string
        protocol: string
        routeCreate: string
        stripPrefix: string
        timeout: string
    }
    onCreate: (input: NginxRouteInput) => void
}

export const NginxRouteCreateForm: FC<NginxRouteCreateFormProps> = ({ busy, containers, labels, onCreate }) => {
    const [errors, setErrors] = useState<Record<string, string>>({})
    const [protocol, setProtocol] = useState<NginxRouteInput['protocol']>('http')
    const [stripPrefix, setStripPrefix] = useState(false)

    const submit = (form: FormData) => {
        const result = nginxProxyRouteInputSchema.safeParse({
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

        if (!result.success) {
            const nextErrors: Record<string, string> = {}
            for (const issue of result.error.issues) {
                const field = issue.path[0]
                if (typeof field === 'string') {
                    nextErrors[field] = labels.invalidValue
                }
            }
            setErrors(nextErrors)
            return
        }

        setErrors({})
        onCreate(result.data)
    }

    return (
        <form
            className="grid gap-5 bg-surface-3 p-5"
            onSubmit={(event) => {
                event.preventDefault()
                submit(new FormData(event.currentTarget))
            }}
        >
            <p className="text-sm font-medium text-text-strong">{labels.routeCreate}</p>
            <div className="grid gap-4 lg:grid-cols-4">
                <div className="grid min-w-0 gap-2 lg:col-span-2">
                    <Label htmlFor="route-hostname">{labels.hostname}</Label>
                    <Input
                        id="route-hostname"
                        name="hostname"
                        placeholder="app.example.com"
                        required
                        aria-invalid={errors.hostname !== undefined}
                        aria-describedby={errors.hostname === undefined ? undefined : 'route-hostname-error'}
                    />
                    {errors.hostname !== undefined && (
                        <p id="route-hostname-error" className="text-xs text-danger">
                            {errors.hostname}
                        </p>
                    )}
                </div>
                <div className="grid min-w-0 gap-2 lg:col-span-2">
                    <Label htmlFor="route-path">{labels.path}</Label>
                    <Input
                        id="route-path"
                        name="path"
                        defaultValue="/"
                        required
                        aria-invalid={errors.path !== undefined}
                        aria-describedby={errors.path === undefined ? undefined : 'route-path-error'}
                    />
                    {errors.path !== undefined && (
                        <p id="route-path-error" className="text-xs text-danger">
                            {errors.path}
                        </p>
                    )}
                </div>
                <div className="grid min-w-0 gap-2 lg:col-span-2">
                    <Label htmlFor="route-container">{labels.container}</Label>
                    <Input
                        id="route-container"
                        name="targetContainer"
                        list="route-container-options"
                        required
                        aria-invalid={errors.targetContainer !== undefined}
                        aria-describedby={errors.targetContainer === undefined ? undefined : 'route-container-error'}
                    />
                    <datalist id="route-container-options">
                        {containers.map((container) => (
                            <option key={container} value={container} />
                        ))}
                    </datalist>
                    {errors.targetContainer !== undefined && (
                        <p id="route-container-error" className="text-xs text-danger">
                            {errors.targetContainer}
                        </p>
                    )}
                </div>
                <div className="grid min-w-0 gap-2">
                    <Label htmlFor="route-port">{labels.port}</Label>
                    <Input
                        id="route-port"
                        name="targetPort"
                        type="number"
                        min="1"
                        max="65535"
                        required
                        aria-invalid={errors.targetPort !== undefined}
                        aria-describedby={errors.targetPort === undefined ? undefined : 'route-port-error'}
                    />
                    {errors.targetPort !== undefined && (
                        <p id="route-port-error" className="text-xs text-danger">
                            {errors.targetPort}
                        </p>
                    )}
                </div>
                <div className="grid min-w-0 gap-2">
                    <Label htmlFor="route-protocol">{labels.protocol}</Label>
                    <Select value={protocol} onValueChange={(value) => setProtocol(value === 'websocket' ? 'websocket' : 'http')}>
                        <SelectTrigger id="route-protocol" className="w-full">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="http">HTTP</SelectItem>
                            <SelectItem value="websocket">WebSocket</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="grid min-w-0 gap-2">
                    <Label htmlFor="route-timeout">{labels.timeout}</Label>
                    <Input
                        id="route-timeout"
                        name="timeoutSeconds"
                        type="number"
                        min="1"
                        max="3600"
                        defaultValue={DEFAULT_TIMEOUT_SECONDS}
                        required
                        aria-invalid={errors.timeoutSeconds !== undefined}
                    />
                </div>
                <div className="grid min-w-0 gap-2">
                    <Label htmlFor="route-body-size">{labels.bodySize}</Label>
                    <Input
                        id="route-body-size"
                        name="bodySizeMegabytes"
                        type="number"
                        min="1"
                        max="1024"
                        defaultValue={DEFAULT_BODY_SIZE_MEGABYTES}
                        required
                        aria-invalid={errors.bodySizeMegabytes !== undefined}
                    />
                </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-4">
                <Label htmlFor="route-strip-prefix" className="text-text-muted">
                    <Switch id="route-strip-prefix" checked={stripPrefix} onCheckedChange={setStripPrefix} />
                    {labels.stripPrefix}
                </Label>
                <Button type="submit" size="sm" disabled={busy}>
                    {labels.create}
                </Button>
            </div>
        </form>
    )
}
