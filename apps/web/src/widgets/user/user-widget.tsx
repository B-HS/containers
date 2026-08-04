'use client'

import type { FC } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { useGetUsers, useUpdateUser } from '@entities/user/user.query'
import { UserCard } from '@features/user-card/user-card'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@shared/ui/empty'
import { Skeleton } from '@shared/ui/skeleton'
import { WidgetSection } from '@shared/common/widget-section'

type UserWidgetProps = {
    currentUserId: string
}

export const UserWidget: FC<UserWidgetProps> = ({ currentUserId }) => {
    const t = useTranslations('Dashboard')
    const usersQuery = useGetUsers()
    const users = usersQuery.data ?? []
    const updateUser = useUpdateUser()

    const update = (userId: string, input: { disabled?: boolean; role?: string }) => {
        updateUser.mutate(
            { userId, ...input },
            {
                onError: (error) => toast.error(error instanceof Error ? error.message : t('userManagementFailed')),
                onSuccess: () => toast.success(t('userUpdated')),
            },
        )
    }

    return (
        <WidgetSection id="user-management-title" title={t('userManagement')} badge={users.length}>
            {usersQuery.isPending ? (
                <div className="grid gap-2 p-4">
                    <Skeleton className="h-24 w-full" />
                    <Skeleton className="h-24 w-full" />
                </div>
            ) : null}
            {!usersQuery.isPending && users.length === 0 ? (
                <Empty>
                    <EmptyHeader>
                        <EmptyTitle>{t('userEmpty')}</EmptyTitle>
                        <EmptyDescription>{t('userEmptyDescription')}</EmptyDescription>
                    </EmptyHeader>
                </Empty>
            ) : null}
            <div className="grid gap-px bg-background lg:grid-cols-2">
                {users.map((user) => (
                    <UserCard key={user.id} currentUserId={currentUserId} onUpdate={update} pending={updateUser.isPending} user={user} />
                ))}
            </div>
        </WidgetSection>
    )
}
