import type { ReactNode } from 'react'
import { hasLocale, NextIntlClientProvider } from 'next-intl'
import { setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { TanstackQueryProvider } from '@shared/lib/query-provider'
import { Toaster } from '@shared/ui/sonner'
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
                <TanstackQueryProvider>
                    <NextIntlClientProvider>
                        {children}
                        <Toaster />
                    </NextIntlClientProvider>
                </TanstackQueryProvider>
            </body>
        </html>
    )
}

export default LocaleLayout
