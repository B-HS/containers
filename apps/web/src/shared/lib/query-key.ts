export const QUERY_KEY = {
    API_KEY: {
        ALL: ['api-key'] as const,
        LIST: ['api-key', 'list'] as const,
    },
    ARTIFACT: {
        ALL: ['artifact'] as const,
        LIST: ['artifact', 'list'] as const,
    },
    AUDIT: {
        ALL: ['audit'] as const,
        LIST: (params: Record<string, string>) => ['audit', 'list', params] as const,
    },
    AUTH: {
        ALL: ['auth'] as const,
        SESSION: ['auth', 'session'] as const,
    },
    BACKUP: {
        ALL: ['backup'] as const,
        LIST: ['backup', 'list'] as const,
    },
    CONTROL_PLANE: {
        ALL: ['control-plane'] as const,
        STATUS: ['control-plane', 'status'] as const,
    },
    DEPLOYMENT: {
        ALL: ['deployment'] as const,
        MANIFEST: {
            ALL: ['deployment', 'manifest'] as const,
            LIST: ['deployment', 'manifest', 'list'] as const,
        },
        RELEASE: {
            ALL: ['deployment', 'release'] as const,
            LIST: ['deployment', 'release', 'list'] as const,
        },
        SECRET: {
            ALL: ['deployment', 'secret'] as const,
            LIST: ['deployment', 'secret', 'list'] as const,
        },
    },
    ENGINE: {
        ALL: ['engine'] as const,
        OVERVIEW: ['engine', 'overview'] as const,
        CONTAINER: {
            ALL: ['engine', 'container'] as const,
            LIST: ['engine', 'container', 'list'] as const,
            DETAIL: (containerId: string) => ['engine', 'container', 'detail', containerId] as const,
            LOG: (containerId: string) => ['engine', 'container', 'log', containerId] as const,
        },
    },
    HEALTH: {
        ALL: ['health'] as const,
        API: ['health', 'api'] as const,
    },
    IMAGE: {
        ALL: ['image'] as const,
        LIST: ['image', 'list'] as const,
    },
    INFRASTRUCTURE: {
        ALL: ['infrastructure'] as const,
        OVERVIEW: ['infrastructure', 'overview'] as const,
        NETWORK: {
            ALL: ['infrastructure', 'network'] as const,
            LIST: ['infrastructure', 'network', 'list'] as const,
        },
        VOLUME: {
            ALL: ['infrastructure', 'volume'] as const,
            LIST: ['infrastructure', 'volume', 'list'] as const,
        },
        PRUNE_PREVIEW: {
            ALL: ['infrastructure', 'prune-preview'] as const,
            DETAIL: (includeVolumes: boolean) => ['infrastructure', 'prune-preview', includeVolumes] as const,
        },
    },
    INVITATION: {
        ALL: ['invitation'] as const,
        LIST: ['invitation', 'list'] as const,
    },
    JOB: {
        ALL: ['job'] as const,
        LIST: ['job', 'list'] as const,
        BACKUP_SCHEDULE: ['job', 'backup-schedule'] as const,
        DETAIL: (jobId: string) => ['job', 'detail', jobId] as const,
        EVENTS: (jobId: string) => ['job', 'events', jobId] as const,
        LIST_BY_KIND: (kind: string) => ['job', 'list', kind] as const,
    },
    TRUSTED_PROXY: {
        ALL: ['trusted-proxy'] as const,
        STATE: ['trusted-proxy', 'state'] as const,
    },
    PANEL_SETTING: {
        ALL: ['panel-setting'] as const,
        DETAIL: ['panel-setting', 'detail'] as const,
    },
    MAINTENANCE: {
        ALL: ['maintenance'] as const,
        STATUS: ['maintenance', 'status'] as const,
    },
    NGINX: {
        ALL: ['nginx'] as const,
        STATUS: ['nginx', 'status'] as const,
        CONFIG: ['nginx', 'config'] as const,
        ROUTE: {
            ALL: ['nginx', 'route'] as const,
            LIST: ['nginx', 'route', 'list'] as const,
        },
    },
    NOTIFICATION: {
        ALL: ['notification'] as const,
        LIST: ['notification', 'list'] as const,
    },
    REGISTRY: {
        ALL: ['registry'] as const,
        LIST: ['registry', 'list'] as const,
    },
    TRAFFIC: {
        ALL: ['traffic'] as const,
        SUMMARY: ['traffic', 'summary'] as const,
        ANALYTICS: ['traffic', 'analytics'] as const,
        HEALTH: ['traffic', 'health'] as const,
    },
    USER: {
        ALL: ['user'] as const,
        LIST: ['user', 'list'] as const,
    },
} as const
