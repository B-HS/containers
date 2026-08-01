'use client'

import type { FC } from 'react'
import { useState } from 'react'
import { z } from 'zod'
import { containerDetailSchema, containerLogResultSchema, type ContainerSummary } from '@containers/contracts/engine'
import { InteractiveTerminal } from '@features/interactive-terminal/interactive-terminal'
import { LiveLogStream } from '@features/live-log-stream/live-log-stream'
import { parseApiError } from '@shared/lib/parse-api-error'
import { Badge } from '@shared/ui/badge'
import { Button } from '@shared/ui/button'
import { Card } from '@shared/ui/card'
import { Input } from '@shared/ui/input'
import { Label } from '@shared/ui/label'
import { Textarea } from '@shared/ui/textarea'

type ContainerControlWidgetProps = {
    containers: ContainerSummary[]
    labels: {
        actionFailed: string
        command: string
        close: string
        container: string
        empty: string
        exec: string
        force: string
        image: string
        inspect: string
        inspectFailed: string
        liveLogs: string
        liveLogsFailed: string
        liveLogsStart: string
        liveLogsStop: string
        pause: string
        remove: string
        removeConfirmation: string
        restart: string
        running: string
        start: string
        state: string
        stop: string
        terminal: string
        terminalConnect: string
        terminalDisconnected: string
        terminalFailed: string
        title: string
        unpause: string
    }
    role: string
}

type ActionName = 'pause' | 'restart' | 'start' | 'stop' | 'unpause'

export const ContainerControlWidget: FC<ContainerControlWidgetProps> = ({ containers, labels, role }) => {
    const [busyTarget, setBusyTarget] = useState<string>()
    const [error, setError] = useState<string>()
    const [execOutput, setExecOutput] = useState<Record<string, string>>({})
    const [inspectionOutput, setInspectionOutput] = useState<Record<string, string>>({})
    const canOperate = ['owner', 'admin', 'operator'].includes(role)
    const canRemove = ['owner', 'admin'].includes(role)
    const canExec = role === 'owner'

    const request = async (containerId: string, path: string, body: unknown) => {
        setBusyTarget(containerId)
        setError(undefined)

        try {
            const response = await fetch(path, {
                body: JSON.stringify(body),
                headers: { 'content-type': 'application/json' },
                method: 'POST',
            })

            if (!response.ok) {
                setError(parseApiError(await response.json(), labels.actionFailed))
                return undefined
            }

            return response.json()
        } catch {
            setError(labels.actionFailed)
            return undefined
        } finally {
            setBusyTarget(undefined)
        }
    }

    const performAction = async (containerId: string, action: ActionName) => {
        const result = await request(containerId, `/api/containers/${encodeURIComponent(containerId)}/actions`, {
            action,
            ...(['restart', 'stop'].includes(action) ? { timeoutSeconds: 10 } : {}),
        })

        if (result) {
            window.location.reload()
        }
    }

    const execute = async (container: ContainerSummary, commandText: string) => {
        const command = commandText
            .split('\n')
            .map((part) => part.trim())
            .filter((part) => part.length > 0)
        const result = await request(container.id, `/api/containers/${encodeURIComponent(container.id)}/exec`, { command })

        if (result && typeof result === 'object' && 'data' in result) {
            const data = result.data
            if (data && typeof data === 'object' && 'stdout' in data && 'stderr' in data) {
                setExecOutput((current) => ({ ...current, [container.id]: `${String(data.stdout)}${String(data.stderr)}` }))
            }
        }
    }

    const remove = async (container: ContainerSummary, confirmation: string, force: boolean) => {
        const result = await request(container.id, `/api/containers/${encodeURIComponent(container.id)}/actions`, {
            action: 'remove',
            confirmation,
            force,
            removeVolumes: false,
        })

        if (result) {
            window.location.reload()
        }
    }

    const inspect = async (containerId: string) => {
        setBusyTarget(containerId)
        setError(undefined)
        try {
            const [detailResponse, logsResponse] = await Promise.all([
                fetch(`/api/containers/${encodeURIComponent(containerId)}`),
                fetch(`/api/containers/${encodeURIComponent(containerId)}/logs?tail=200`),
            ])
            const [detailBody, logsBody] = await Promise.all([detailResponse.json(), logsResponse.json()])
            if (!detailResponse.ok || !logsResponse.ok) {
                throw new Error(labels.inspectFailed)
            }
            const detail = z.object({ data: containerDetailSchema }).parse(detailBody).data
            const logs = z.object({ data: containerLogResultSchema }).parse(logsBody).data
            setInspectionOutput((current) => ({
                ...current,
                [containerId]: `${JSON.stringify(detail, null, 2)}\n\n[stdout]\n${logs.stdout}\n[stderr]\n${logs.stderr}`,
            }))
        } catch {
            setError(labels.inspectFailed)
        } finally {
            setBusyTarget(undefined)
        }
    }

    return (
        <section className="mt-px min-w-0 overflow-hidden bg-card" aria-labelledby="container-control-title">
            <header className="flex items-center justify-between p-3">
                <h2 id="container-control-title" className="text-sm font-semibold">
                    {labels.title}
                </h2>
                <Badge variant="muted">{containers.length}</Badge>
            </header>
            {error ? (
                <p className="mx-3 mb-3 bg-red-950 p-3 text-sm text-red-100" role="alert">
                    {error}
                </p>
            ) : null}
            {containers.length === 0 ? <p className="p-3 text-sm text-muted-foreground">{labels.empty}</p> : null}
            <div className="grid gap-px bg-background">
                {containers.map((container) => {
                    const name = container.names[0] ?? container.id.slice(0, 12)
                    const isBusy = busyTarget === container.id

                    return (
                        <Card key={container.id} className="min-w-0 gap-4 p-3">
                            <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <h3 className="truncate text-sm font-semibold">{name}</h3>
                                        <Badge variant="muted">{container.state}</Badge>
                                    </div>
                                    <dl className="mt-3 grid min-w-0 gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                                        <div className="min-w-0">
                                            <dt>{labels.container}</dt>
                                            <dd className="mt-1 truncate font-mono text-foreground">{container.id.slice(0, 12)}</dd>
                                        </div>
                                        <div className="min-w-0">
                                            <dt>{labels.image}</dt>
                                            <dd className="mt-1 truncate text-foreground">{container.image}</dd>
                                        </div>
                                        <div className="min-w-0">
                                            <dt>{labels.state}</dt>
                                            <dd className="mt-1 truncate text-foreground">{container.status}</dd>
                                        </div>
                                    </dl>
                                </div>
                                <div className="flex flex-wrap gap-px">
                                    {canOperate ? (
                                        <>
                                            <Button type="button" disabled={isBusy} onClick={() => performAction(container.id, 'start')}>
                                                {labels.start}
                                            </Button>
                                            <Button type="button" disabled={isBusy} onClick={() => performAction(container.id, 'stop')}>
                                                {labels.stop}
                                            </Button>
                                            <Button type="button" disabled={isBusy} onClick={() => performAction(container.id, 'restart')}>
                                                {labels.restart}
                                            </Button>
                                            <Button type="button" disabled={isBusy} onClick={() => performAction(container.id, 'pause')}>
                                                {labels.pause}
                                            </Button>
                                            <Button type="button" disabled={isBusy} onClick={() => performAction(container.id, 'unpause')}>
                                                {labels.unpause}
                                            </Button>
                                        </>
                                    ) : null}
                                    <Button type="button" disabled={isBusy} onClick={() => void inspect(container.id)}>
                                        {labels.inspect}
                                    </Button>
                                </div>
                            </div>
                            {inspectionOutput[container.id] !== undefined ? (
                                <pre className="max-h-96 overflow-auto bg-background p-3 text-xs">{inspectionOutput[container.id]}</pre>
                            ) : null}
                            <LiveLogStream
                                containerId={container.id}
                                labels={{
                                    failed: labels.liveLogsFailed,
                                    start: labels.liveLogsStart,
                                    stop: labels.liveLogsStop,
                                    title: labels.liveLogs,
                                }}
                            />
                            {canExec ? (
                                <>
                                    <form
                                        className="grid gap-2 border-t border-background pt-3"
                                        onSubmit={(event) => {
                                            event.preventDefault()
                                            const command = String(new FormData(event.currentTarget).get('command') ?? '')
                                            void execute(container, command)
                                        }}
                                    >
                                        <Label htmlFor={`command-${container.id}`}>{labels.command}</Label>
                                        <p className="text-xs text-muted-foreground">{labels.running}</p>
                                        <Textarea id={`command-${container.id}`} name="command" placeholder={'printf\nhello'} required />
                                        <Button className="justify-self-start" type="submit" disabled={isBusy}>
                                            {labels.exec}
                                        </Button>
                                        {execOutput[container.id] !== undefined ? (
                                            <pre className="max-h-64 overflow-auto bg-background p-3 text-xs">{execOutput[container.id]}</pre>
                                        ) : null}
                                    </form>
                                    <InteractiveTerminal
                                        containerId={container.id}
                                        containerName={name}
                                        labels={{
                                            close: labels.close,
                                            command: labels.command,
                                            connect: labels.terminalConnect,
                                            disconnected: labels.terminalDisconnected,
                                            failed: labels.terminalFailed,
                                            terminal: labels.terminal,
                                        }}
                                    />
                                </>
                            ) : null}
                            {canRemove ? (
                                <form
                                    className="grid gap-2 border-t border-background pt-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end"
                                    onSubmit={(event) => {
                                        event.preventDefault()
                                        const formData = new FormData(event.currentTarget)
                                        void remove(container, String(formData.get('confirmation') ?? ''), formData.get('force') === 'on')
                                    }}
                                >
                                    <div className="grid gap-2">
                                        <Label htmlFor={`confirmation-${container.id}`}>
                                            {labels.removeConfirmation}: {name}
                                        </Label>
                                        <Input id={`confirmation-${container.id}`} name="confirmation" autoComplete="off" required />
                                    </div>
                                    <Label className="flex h-10 items-center gap-2 px-3">
                                        <input name="force" type="checkbox" /> {labels.force}
                                    </Label>
                                    <Button className="bg-red-700 text-white" type="submit" disabled={isBusy}>
                                        {labels.remove}
                                    </Button>
                                </form>
                            ) : null}
                        </Card>
                    )
                })}
            </div>
        </section>
    )
}
