export const CONTAINER_ACTIONS = ['start', 'stop', 'restart', 'pause', 'unpause'] as const

export type ContainerActionName = (typeof CONTAINER_ACTIONS)[number]

export const CONTAINER_ACTION_TIMEOUT_SECONDS = 10

export const CONTAINER_STOP_ACTIONS: readonly ContainerActionName[] = ['restart', 'stop']

const CONTAINER_STATE_VARIANT = {
    created: 'neutral',
    dead: 'danger',
    exited: 'neutral',
    paused: 'attention',
    removing: 'attention',
    restarting: 'attention',
    running: 'success',
} as const

export const getContainerStateVariant = (state: string) => CONTAINER_STATE_VARIANT[state as keyof typeof CONTAINER_STATE_VARIANT] ?? 'neutral'
