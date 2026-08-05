import { afterEach, describe, expect, mock, test } from 'bun:test'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { FC, PropsWithChildren } from 'react'

const BASE_BACKUP = {
    controlBytes: 1_024,
    controlSha256: 'a'.repeat(64),
    createdAt: '2026-08-05T00:00:00.000Z',
    label: 'nightly',
    nginxBytes: 512,
    nginxSha256: 'b'.repeat(64),
    schemaVersion: 2,
    secretsBytes: 0,
    secretsIncluded: false,
    secretsSha256: null,
    trafficBytes: 256,
    trafficSha256: 'c'.repeat(64),
}

const backups = [
    { ...BASE_BACKUP, id: 'backup-plain' },
    { ...BASE_BACKUP, id: 'backup-secrets', label: 'with-secrets', secretsBytes: 128, secretsIncluded: true, secretsSha256: 'd'.repeat(64) },
]

mock.module('next-intl', () => ({ useTranslations: () => (key: string) => key }))
mock.module('sonner', () => ({ toast: { error: () => undefined, success: () => undefined } }))
mock.module('@entities/backup/backup.query', () => ({
    backupQueryOptions: () => ({ queryFn: async () => backups, queryKey: ['backup'] }),
    useCreateBackup: () => ({ isPending: false, mutate: () => undefined }),
    useGetBackups: () => ({ data: backups, isPending: false }),
    useRemoveBackup: () => ({ isPending: false, mutate: () => undefined }),
    useRestoreBackup: () => ({ isPending: false, mutate: () => undefined }),
}))

const { BackupWidget } = await import('./backup-widget')

const Wrapper: FC<PropsWithChildren> = ({ children }) => (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
)

const openRestoreDialog = async (label: string) => {
    render(<BackupWidget canManage />, { wrapper: Wrapper })
    const row = (await screen.findByText(label)).closest('tr')
    const restoreButton = Array.from(row?.querySelectorAll('button') ?? []).find((button) => button.textContent?.includes('backupRestore'))
    if (restoreButton) fireEvent.click(restoreButton)
    await screen.findByText('backupRestoreTitle')
}

afterEach(cleanup)

describe('BackupWidget 복구 다이얼로그', () => {
    test('시크릿을 포함한 백업이면 암호 입력을 보여준다', async () => {
        await openRestoreDialog('with-secrets')

        expect(document.querySelector('input[id^="backup-restore-passphrase-"]')).not.toBeNull()
    })

    test('시크릿이 없는 백업이면 암호 입력을 보여주지 않는다', async () => {
        await openRestoreDialog('nightly')

        expect(document.querySelector('input[id^="backup-restore-passphrase-"]')).toBeNull()
    })
})
