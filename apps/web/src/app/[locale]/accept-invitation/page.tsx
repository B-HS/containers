import { getTranslations } from 'next-intl/server'
import { AcceptInvitationWidget } from '@widgets/auth/accept-invitation-widget'

type AcceptInvitationPageProps = {
    params: Promise<{ locale: string }>
    searchParams: Promise<{ token?: string }>
}

const AcceptInvitationPage = async ({ params, searchParams }: AcceptInvitationPageProps) => {
    const [{ locale }, { token = '' }, translations] = await Promise.all([params, searchParams, getTranslations('Invitation')])

    return (
        <AcceptInvitationWidget
            locale={locale}
            token={token}
            labels={{
                action: translations('accept'),
                description: translations('description'),
                failed: translations('failed'),
                name: translations('name'),
                password: translations('password'),
                pending: translations('pending'),
                title: translations('title'),
            }}
        />
    )
}

export default AcceptInvitationPage
