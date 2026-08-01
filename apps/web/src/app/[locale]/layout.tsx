import type { ReactNode } from 'react'
import { hasLocale, NextIntlClientProvider } from 'next-intl'
import { setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { routing } from '../../i18n/routing'
import '../globals.css'

type LocaleLayoutProps = {
    children: ReactNode
    params: Promise<{ locale: string }>
}

export const generateStaticParams = () => routing.locales.map((locale) => ({ locale }))

const LocaleLayout = async ({ children, params }: LocaleLayoutProps) => {
    const { locale } = await params

    if (!hasLocale(routing.locales, locale)) {
        notFound()
    }

    setRequestLocale(locale)

    return (
        <html lang={locale}>
            <body>
                <NextIntlClientProvider>{children}</NextIntlClientProvider>
            </body>
        </html>
    )
}

export default LocaleLayout
