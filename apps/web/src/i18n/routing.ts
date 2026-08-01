import { defineRouting } from 'next-intl/routing'

export const routing = defineRouting({
    defaultLocale: 'ko',
    locales: ['ko', 'en', 'ja'],
})
