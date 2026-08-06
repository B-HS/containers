export type NavItem = {
    href: string
    icon: string
    key: string
    requiredPermission?: 'canManageApiKeys' | 'canManageSecrets' | 'canViewAudit' | 'isOwner'
}

export type NavSection = {
    items: NavItem[]
    key: string
}

export type PanelPermissions = {
    canManageApiKeys: boolean
    canManageSecrets: boolean
    canViewAudit: boolean
    isOwner: boolean
}

export const NAV_SECTIONS: NavSection[] = [
    {
        key: 'dashboard',
        items: [
            { href: '/', icon: 'LayoutDashboard', key: 'overview' },
            { href: '/traffic', icon: 'Activity', key: 'traffic' },
        ],
    },
    {
        key: 'containers',
        items: [{ href: '/containers', icon: 'Container', key: 'containers' }],
    },
    {
        key: 'images',
        items: [
            { href: '/images', icon: 'Image', key: 'images' },
            { href: '/artifacts', icon: 'Archive', key: 'artifacts' },
        ],
    },
    {
        key: 'deployments',
        items: [
            { href: '/deployments', icon: 'Rocket', key: 'deployments' },
            { href: '/deployments/stacks', icon: 'Layers', key: 'deploymentStacks' },
            { href: '/deployments/secrets', icon: 'KeyRound', key: 'deploymentSecrets', requiredPermission: 'canManageSecrets' },
            { href: '/registry', icon: 'Database', key: 'registry', requiredPermission: 'canManageApiKeys' },
        ],
    },
    {
        key: 'nginx',
        items: [
            { href: '/nginx', icon: 'FileCode', key: 'nginx' },
            { href: '/nginx/routes', icon: 'Route', key: 'nginxRoutes' },
        ],
    },
    {
        key: 'infrastructure',
        items: [{ href: '/infrastructure', icon: 'Network', key: 'infrastructure' }],
    },
    {
        key: 'operations',
        items: [
            { href: '/jobs', icon: 'ListTodo', key: 'jobs', requiredPermission: 'canManageApiKeys' },
            { href: '/control-plane', icon: 'ServerCog', key: 'controlPlane', requiredPermission: 'canManageApiKeys' },
            { href: '/backups', icon: 'DatabaseBackup', key: 'backups', requiredPermission: 'isOwner' },
            { href: '/notifications', icon: 'Bell', key: 'notifications', requiredPermission: 'canManageApiKeys' },
        ],
    },
    {
        key: 'administration',
        items: [
            { href: '/api-keys', icon: 'Key', key: 'apiKeys', requiredPermission: 'canManageApiKeys' },
            { href: '/invitations', icon: 'UserPlus', key: 'invitations' },
            { href: '/users', icon: 'Users', key: 'users', requiredPermission: 'isOwner' },
            { href: '/audit', icon: 'ScrollText', key: 'audit', requiredPermission: 'canViewAudit' },
            { href: '/panel-settings', icon: 'Globe', key: 'panelSettings', requiredPermission: 'isOwner' },
            { href: '/trusted-proxies', icon: 'ShieldCheck', key: 'trustedProxies', requiredPermission: 'isOwner' },
        ],
    },
]

export const getNavigationSections = (permissions: PanelPermissions): NavSection[] =>
    NAV_SECTIONS.map((section) => ({
        ...section,
        items: section.items.filter((item) => !item.requiredPermission || permissions[item.requiredPermission]),
    })).filter((section) => section.items.length > 0)
