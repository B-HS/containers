'use client'

import type { FC } from 'react'
import { useTranslations } from 'next-intl'
import { FileSearch } from 'lucide-react'
import type { ContainerSummary } from '@containers/contracts/engine'
import { InteractiveTerminal } from '@features/interactive-terminal/interactive-terminal'
import { LiveLogStream } from '@features/live-log-stream/live-log-stream'
import { Badge } from '@shared/ui/badge'
import { Button } from '@shared/ui/button'
import { Label } from '@shared/ui/label'
import { Spinner } from '@shared/ui/spinner'
import { Textarea } from '@shared/ui/textarea'
import { CONTAINER_ACTIONS, type ContainerActionName, getContainerStateVariant } from './container-actions'
import { ContainerRemoveDialog } from './container-remove-dialog'

type ContainerDetailCardProps = {
    canExec: boolean
    canOperate: boolean
    canRemove: boolean
    container: ContainerSummary
    createExecTicket: (input: { columns: number; command: string[]; containerId: string; environment: string[]; rows: number }) => Promise<{
        websocketPath: string
    }>
    createLogStream: (containerId: string) => EventSource
    createSocket: (websocketPath: string) => WebSocket
    execOutput: string | undefined
    inspectOutput: string | undefined
    isExecuting: boolean
    isInspecting: boolean
    isRemoving: boolean
    onExecute: (commandText: string) => void
    onInspect: () => void
    onPerformAction: (action: ContainerActionName) => void
    onRemove: (input: { confirmation: string; force: boolean }) => void
    pendingAction: ContainerActionName | undefined
}

export const ContainerDetailCard: FC<ContainerDetailCardProps> = ({
    canExec,
    canOperate,
    canRemove,
    container,
    createExecTicket,
    createLogStream,
    createSocket,
    execOutput,
    inspectOutput,
    isExecuting,
    isInspecting,
    isRemoving,
    onExecute,
    onInspect,
    onPerformAction,
    onRemove,
    pendingAction,
}) => {
    const name = container.names[0] ?? container.id.slice(0, 12)
    const t = useTranslations('Dashboard')

    return (
        <div className="grid min-w-0 gap-px bg-background">
            <div className="grid gap-4 bg-surface-1 p-6 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-base font-semibold text-text-strong">{name}</h3>
                        <Badge variant={getContainerStateVariant(container.state)}>{container.state}</Badge>
                    </div>
                    <dl className="mt-4 grid min-w-0 gap-3 text-xs sm:grid-cols-3">
                        <div className="min-w-0">
                            <dt className="text-text-subtle">{t('container')}</dt>
                            <dd className="mt-1 truncate font-mono text-text-strong tabular-nums">{container.id.slice(0, 12)}</dd>
                        </div>
                        <div className="min-w-0">
                            <dt className="text-text-subtle">{t('image')}</dt>
                            <dd className="mt-1 truncate text-text-strong">{container.image}</dd>
                        </div>
                        <div className="min-w-0">
                            <dt className="text-text-subtle">{t('state')}</dt>
                            <dd className="mt-1 truncate text-text-strong">{container.status}</dd>
                        </div>
                    </dl>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {canOperate
                        ? CONTAINER_ACTIONS.map((action) => (
                              <Button
                                  key={action}
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={pendingAction !== undefined}
                                  onClick={() => onPerformAction(action)}
                              >
                                  {pendingAction === action ? <Spinner /> : null}
                                  {t(action)}
                              </Button>
                          ))
                        : null}
                    <Button type="button" size="sm" variant="ghost" disabled={isInspecting} onClick={onInspect}>
                        {isInspecting ? <Spinner /> : <FileSearch aria-hidden="true" />}
                        {t('inspectAndLogs')}
                    </Button>
                    {canRemove ? (
                        <ContainerRemoveDialog containerId={container.id} containerName={name} isRemoving={isRemoving} onConfirm={onRemove} />
                    ) : null}
                </div>
            </div>
            {inspectOutput ? <pre className="max-h-96 overflow-auto bg-surface-3 p-4 text-xs">{inspectOutput}</pre> : null}
            <div className="bg-surface-1 p-4">
                <LiveLogStream containerId={container.id} createLogStream={createLogStream} />
            </div>
            {canExec ? (
                <div className="grid gap-px bg-background">
                    <form
                        className="grid gap-2 bg-surface-1 p-4"
                        onSubmit={(event) => {
                            event.preventDefault()
                            onExecute(String(new FormData(event.currentTarget).get('command') ?? ''))
                        }}
                    >
                        <Label htmlFor={`command-${container.id}`}>{t('command')}</Label>
                        <p className="text-xs text-text-subtle">{t('commandHelp')}</p>
                        <Textarea id={`command-${container.id}`} name="command" placeholder={'printf\nhello'} required />
                        <Button className="justify-self-start" size="sm" type="submit" variant="outline" disabled={isExecuting}>
                            {isExecuting ? <Spinner /> : null}
                            {t('exec')}
                        </Button>
                        {execOutput ? <pre className="max-h-64 overflow-auto bg-surface-3 p-3 text-xs">{execOutput}</pre> : null}
                    </form>
                    <div className="bg-surface-1 p-4">
                        <InteractiveTerminal
                            containerId={container.id}
                            containerName={name}
                            createExecTicket={createExecTicket}
                            createSocket={createSocket}
                        />
                    </div>
                </div>
            ) : null}
        </div>
    )
}
