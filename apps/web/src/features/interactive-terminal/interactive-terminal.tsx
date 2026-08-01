'use client'

import type { FC } from 'react'
import { useEffect, useRef, useState } from 'react'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import { interactiveExecServerMessageSchema } from '@containers/contracts/engine-control'
import { parseApiError } from '@shared/lib/parse-api-error'
import { Button } from '@shared/ui/button'
import { Label } from '@shared/ui/label'
import { Textarea } from '@shared/ui/textarea'

type InteractiveTerminalProps = {
    containerId: string
    containerName: string
    labels: {
        close: string
        command: string
        connect: string
        disconnected: string
        failed: string
        terminal: string
    }
}

export const InteractiveTerminal: FC<InteractiveTerminalProps> = ({ containerId, containerName, labels }) => {
    const hostRef = useRef<HTMLDivElement>(null)
    const socketRef = useRef<WebSocket | null>(null)
    const [command, setCommand] = useState<string[]>()
    const [error, setError] = useState<string>()
    const [open, setOpen] = useState(false)

    useEffect(() => {
        if (!open || !command || !hostRef.current) {
            return
        }

        const terminal = new Terminal({
            convertEol: true,
            cursorBlink: true,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: 13,
            theme: { background: '#09090b', foreground: '#fafafa' },
        })
        const fitAddon = new FitAddon()
        terminal.loadAddon(fitAddon)
        terminal.open(hostRef.current)
        fitAddon.fit()
        terminal.focus()
        let disposed = false
        let exitReported = false
        let heartbeatTimer: ReturnType<typeof setInterval> | undefined

        const connect = async () => {
            try {
                const response = await fetch(`/api/containers/${encodeURIComponent(containerId)}/exec-tickets`, {
                    body: JSON.stringify({ columns: terminal.cols, command, environment: [], rows: terminal.rows }),
                    headers: { 'content-type': 'application/json' },
                    method: 'POST',
                })
                const body: unknown = await response.json()
                if (!response.ok) {
                    throw new Error(parseApiError(body, labels.failed))
                }
                const websocketPath =
                    body && typeof body === 'object' && 'data' in body && body.data && typeof body.data === 'object' && 'websocketPath' in body.data
                        ? String(body.data.websocketPath)
                        : ''
                if (!websocketPath) {
                    throw new Error(labels.failed)
                }
                const websocket = new WebSocket(`${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}${websocketPath}`)
                socketRef.current = websocket
                websocket.addEventListener('open', () => {
                    heartbeatTimer = setInterval(() => {
                        if (websocket.readyState === WebSocket.OPEN) {
                            websocket.send(JSON.stringify({ type: 'heartbeat' }))
                        }
                    }, 20_000)
                })
                websocket.addEventListener('message', (event) => {
                    const message = interactiveExecServerMessageSchema.safeParse(JSON.parse(String(event.data)))
                    if (!message.success) {
                        return
                    }
                    if (message.data.type === 'output') {
                        terminal.write(message.data.data)
                    } else if (message.data.type === 'error') {
                        terminal.writeln(`\r\n${message.data.message}`)
                    } else if (message.data.type === 'exit') {
                        exitReported = true
                        terminal.writeln(`\r\n${labels.disconnected} (${message.data.exitCode})`)
                    }
                })
                websocket.addEventListener('close', () => {
                    if (heartbeatTimer) {
                        clearInterval(heartbeatTimer)
                    }
                    if (!exitReported) {
                        terminal.writeln(`\r\n${labels.disconnected}`)
                    }
                })
            } catch (connectError) {
                if (!disposed) {
                    setError(connectError instanceof Error ? connectError.message : labels.failed)
                }
            }
        }

        const inputSubscription = terminal.onData((data) => {
            if (socketRef.current?.readyState === WebSocket.OPEN) {
                socketRef.current.send(JSON.stringify({ data, type: 'input' }))
            }
        })
        const resizeObserver = new ResizeObserver(() => {
            fitAddon.fit()
            if (socketRef.current?.readyState === WebSocket.OPEN) {
                socketRef.current.send(JSON.stringify({ columns: terminal.cols, rows: terminal.rows, type: 'resize' }))
            }
        })
        resizeObserver.observe(hostRef.current)
        void connect()

        return () => {
            disposed = true
            if (heartbeatTimer) {
                clearInterval(heartbeatTimer)
            }
            resizeObserver.disconnect()
            inputSubscription.dispose()
            if (socketRef.current?.readyState === WebSocket.OPEN) {
                socketRef.current.send(JSON.stringify({ type: 'detach' }))
            }
            socketRef.current?.close(1000, 'terminal closed')
            socketRef.current = null
            terminal.dispose()
        }
    }, [command, containerId, labels.disconnected, labels.failed, open])

    return (
        <>
            <form
                className="grid gap-2 border-t border-background pt-3"
                onSubmit={(event) => {
                    event.preventDefault()
                    const nextCommand = String(new FormData(event.currentTarget).get('terminalCommand') ?? '')
                        .split('\n')
                        .map((part) => part.trim())
                        .filter((part) => part.length > 0)
                    setError(undefined)
                    setCommand(nextCommand)
                    setOpen(true)
                }}
            >
                <Label htmlFor={`terminal-command-${containerId}`}>{labels.command}</Label>
                <Textarea id={`terminal-command-${containerId}`} name="terminalCommand" defaultValue="/bin/sh" required />
                <Button className="justify-self-start" type="submit">
                    {labels.connect}
                </Button>
                {error ? <p className="bg-red-950 p-3 text-sm text-red-100">{error}</p> : null}
            </form>
            {open ? (
                <div className="fixed inset-0 z-50 grid grid-rows-[auto_minmax(0,1fr)] bg-zinc-950 p-3 text-zinc-50" role="dialog" aria-modal="true">
                    <header className="flex items-center justify-between gap-3 pb-3">
                        <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">
                                {labels.terminal}: {containerName}
                            </p>
                            <p className="truncate font-mono text-xs text-zinc-400">{command?.join(' ')}</p>
                        </div>
                        <Button type="button" onClick={() => setOpen(false)}>
                            {labels.close}
                        </Button>
                    </header>
                    <div ref={hostRef} className="min-h-0 overflow-hidden" />
                </div>
            ) : null}
        </>
    )
}
