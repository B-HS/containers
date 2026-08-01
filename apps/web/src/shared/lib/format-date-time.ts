export const formatDateTime = (value: string | null) =>
    value === null
        ? null
        : new Date(value)
              .toISOString()
              .replace('T', ' ')
              .replace(/\.\d{3}Z$/, 'Z')
