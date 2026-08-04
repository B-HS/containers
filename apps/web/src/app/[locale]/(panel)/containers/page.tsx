import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'
import { getTranslations } from 'next-intl/server'
import { getEngineDashboard } from '@entities/engine/engine.api'
import { getSession } from '@shared/lib/session'
import { PageHeader } from '@shared/common/page-header'
import { ContainerControlWidget } from '@widgets/container/container-control-widget'

const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:3001'

const ContainersPage = async () => {
    const [translations, navTranslations, session] = await Promise.all([getTranslations('Dashboard'), getTranslations('Nav'), getSession()])

    if (session.mode !== 'authenticated') {
        return null
    }

    const engineDashboard = await getEngineDashboard(API_INTERNAL_URL, session.cookie).catch(() => undefined)
    const queryClient = new QueryClient()
    if (engineDashboard) {
        queryClient.setQueryData(['engine', 'container', 'list'], engineDashboard.containers)
    }

    return (
        <HydrationBoundary state={dehydrate(queryClient)}>
            <div className="grid gap-px">
                <PageHeader description={navTranslations('subtitles.containers')} title={navTranslations('items.containers')} />
                <ContainerControlWidget
                    containers={engineDashboard?.containers ?? []}
                    role={session.session.role}
                    labels={{
                        actionFailed: translations('actionFailed'),
                        command: translations('command'),
                        close: translations('close'),
                        container: translations('container'),
                        empty: translations('empty'),
                        exec: translations('exec'),
                        force: translations('force'),
                        image: translations('image'),
                        inspect: translations('inspectAndLogs'),
                        inspectFailed: translations('inspectFailed'),
                        liveLogs: translations('liveLogs'),
                        liveLogsFailed: translations('liveLogsFailed'),
                        liveLogsStart: translations('liveLogsStart'),
                        liveLogsStop: translations('liveLogsStop'),
                        pause: translations('pause'),
                        remove: translations('remove'),
                        removeConfirmation: translations('removeConfirmation'),
                        restart: translations('restart'),
                        running: translations('commandHelp'),
                        start: translations('start'),
                        state: translations('state'),
                        stop: translations('stop'),
                        terminal: translations('terminal'),
                        terminalConnect: translations('terminalConnect'),
                        terminalDisconnected: translations('terminalDisconnected'),
                        terminalFailed: translations('terminalFailed'),
                        title: translations('containerControl'),
                        unpause: translations('unpause'),
                    }}
                />
            </div>
        </HydrationBoundary>
    )
}

export default ContainersPage
