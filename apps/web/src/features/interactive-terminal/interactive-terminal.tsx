'use client'

import type { FC } from 'react'
import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import { interactiveExecServerMessageSchema } from '@containers/contracts/engine-control'
import { Button } from '@shared/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@shared/ui/dialog'
import { Label } from '@shared/ui/label'
import { Textarea } from '@shared/ui/textarea'

const HEARTBEAT_INTERVAL_MS = 20_000

const TERMINAL_SURFACE_DARK = { background: '#1c1c1c', cursor: '#fafafa', foreground: '#fafafa' }
const TERMINAL_SURFACE_LIGHT = { background: '#f1f1f1', cursor: '#171717', foreground: '#171717' }

type InteractiveTerminalProps = {
    containerId: string
    containerName: string
    createExecTicket: (input: { columns: number; command: string[]; containerId: string; environment: string[]; rows: number }) => Promise<{
        websocketPath: string
    }>
    createSocket: (websocketPath: string) => WebSocket
}

export const InteractiveTerminal: FC<InteractiveTerminalProps> = ({ containerId, containerName, createExecTicket, createSocket }) => {
    const hostRef = useRef<HTMLDivElement>(null)
    const socketRef = useRef<WebSocket | null>(null)
    const [command, setCommand] = useState<string[]>()
    const [open, setOpen] = useState(false)
    const t = useTranslations('Dashboard')
    const disconnectedLabel = t('terminalDisconnected')
    const failedLabel = t('terminalFailed')

    useEffect(() => {
        const host = hostRef.current
        if (!open || !command || !host) {
            return
        }

        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
        const terminal = new Terminal({
            convertEol: true,
            cursorBlink: true,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: 13,
            theme: prefersDark ? TERMINAL_SURFACE_DARK : TERMINAL_SURFACE_LIGHT,
        })
        const fitAddon = new FitAddon()
        terminal.loadAddon(fitAddon)
        terminal.open(host)
        fitAddon.fit()
        terminal.focus()
        let disposed = false
        let exitReported = false
        let heartbeatTimer: ReturnType<typeof setInterval> | undefined

        const connect = async () => {
            try {
                const { websocketPath } = await createExecTicket({
                    columns: terminal.cols,
                    command,
                    containerId,
                    environment: [],
                    rows: terminal.rows,
                })
                const websocket = createSocket(websocketPath)
                socketRef.current = websocket
                websocket.addEventListener('open', () => {
                    heartbeatTimer = setInterval(() => {
                        if (websocket.readyState === WebSocket.OPEN) {
                            websocket.send(JSON.stringify({ type: 'heartbeat' }))
                        }
                    }, HEARTBEAT_INTERVAL_MS)
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
                        terminal.writeln(`\r\n${disconnectedLabel} (${message.data.exitCode})`)
                    }
                })
                websocket.addEventListener('close', () => {
                    if (heartbeatTimer) {
                        clearInterval(heartbeatTimer)
                    }
                    if (!exitReported) {
                        terminal.writeln(`\r\n${disconnectedLabel}`)
                    }
                })
            } catch (connectError) {
                if (!disposed) {
                    toast.error(connectError instanceof Error ? connectError.message : failedLabel)
                    setOpen(false)
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
        resizeObserver.observe(host)
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
    }, [command, containerId, createExecTicket, createSocket, disconnectedLabel, failedLabel, open])

    return (
        <>
            <form
                className="grid gap-2 bg-overlay-subtle p-4"
                onSubmit={(event) => {
                    event.preventDefault()
                    const nextCommand = String(new FormData(event.currentTarget).get('terminalCommand') ?? '')
                        .split('\n')
                        .map((part) => part.trim())
                        .filter((part) => part.length > 0)
                    setCommand(nextCommand)
                    setOpen(true)
                }}
            >
                <Label htmlFor={`terminal-command-${containerId}`}>{t('terminal')}</Label>
                <p className="text-xs text-text-subtle">{t('commandHelp')}</p>
                <Textarea id={`terminal-command-${containerId}`} name="terminalCommand" defaultValue="/bin/sh" required />
                <Button className="justify-self-start" size="sm" type="submit" variant="outline">
                    {t('terminalConnect')}
                </Button>
            </form>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="grid h-svh max-w-none grid-rows-[auto_minmax(0,1fr)] gap-4 p-4 sm:max-w-none">
                    <DialogHeader className="pr-10">
                        <DialogTitle className="truncate text-sm">
                            {t('terminal')}: {containerName}
                        </DialogTitle>
                        <DialogDescription className="truncate font-mono text-xs">{command?.join(' ')}</DialogDescription>
                    </DialogHeader>
                    <div ref={hostRef} className="min-h-0 overflow-hidden bg-surface-3 p-2" />
                </DialogContent>
            </Dialog>
        </>
    )
}
