import { ASSIGNABLE_USER_ROLE_VALUES, USER_ROLE_VALUES } from '@containers/contracts/user-management'
import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

export { USER_ROLE, USER_ROLE_VALUES } from '@containers/contracts/user-management'

export const user = sqliteTable(
    'user',
    {
        id: text('id').primaryKey(),
        name: text('name').notNull(),
        email: text('email').notNull(),
        emailVerified: integer('email_verified', { mode: 'boolean' }).default(false).notNull(),
        image: text('image'),
        createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
        updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
    },
    (table) => [uniqueIndex('user_email_unique').on(table.email)],
)

export const session = sqliteTable(
    'session',
    {
        id: text('id').primaryKey(),
        expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
        token: text('token').notNull(),
        createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
        updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
        ipAddress: text('ip_address'),
        userAgent: text('user_agent'),
        userId: text('user_id')
            .notNull()
            .references(() => user.id, { onDelete: 'cascade' }),
    },
    (table) => [uniqueIndex('session_token_unique').on(table.token), index('session_user_id_idx').on(table.userId)],
)

export const account = sqliteTable(
    'account',
    {
        id: text('id').primaryKey(),
        accountId: text('account_id').notNull(),
        providerId: text('provider_id').notNull(),
        userId: text('user_id')
            .notNull()
            .references(() => user.id, { onDelete: 'cascade' }),
        accessToken: text('access_token'),
        refreshToken: text('refresh_token'),
        idToken: text('id_token'),
        accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp' }),
        refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp' }),
        scope: text('scope'),
        password: text('password'),
        createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
        updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
    },
    (table) => [index('account_user_id_idx').on(table.userId), uniqueIndex('account_provider_unique').on(table.providerId, table.accountId)],
)

export const verification = sqliteTable(
    'verification',
    {
        id: text('id').primaryKey(),
        identifier: text('identifier').notNull(),
        value: text('value').notNull(),
        expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
        createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
        updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
    },
    (table) => [index('verification_identifier_idx').on(table.identifier)],
)

export const userRole = sqliteTable('user_role', {
    userId: text('user_id')
        .primaryKey()
        .references(() => user.id, { onDelete: 'cascade' }),
    role: text('role', { enum: USER_ROLE_VALUES }).notNull(),
    disabledAt: integer('disabled_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

export const invitation = sqliteTable(
    'invitation',
    {
        id: text('id').primaryKey(),
        tokenHash: text('token_hash').notNull(),
        email: text('email').notNull(),
        role: text('role', { enum: ASSIGNABLE_USER_ROLE_VALUES }).notNull(),
        createdBy: text('created_by')
            .notNull()
            .references(() => user.id, { onDelete: 'cascade' }),
        expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
        acceptedAt: integer('accepted_at', { mode: 'timestamp' }),
        revokedAt: integer('revoked_at', { mode: 'timestamp' }),
        createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    },
    (table) => [uniqueIndex('invitation_token_hash_unique').on(table.tokenHash), index('invitation_email_idx').on(table.email)],
)

export const loginLockout = sqliteTable('login_lockout', {
    emailKey: text('email_key').primaryKey(),
    failedCount: integer('failed_count').notNull(),
    firstFailedAt: integer('first_failed_at', { mode: 'timestamp' }).notNull(),
    lockedUntil: integer('locked_until', { mode: 'timestamp' }),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

export const auditChainAnchor = sqliteTable('audit_chain_anchor', {
    id: text('id').primaryKey(),
    hash: text('hash').notNull(),
    sequence: integer('sequence').notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

export const auditLog = sqliteTable(
    'audit_log',
    {
        id: text('id').primaryKey(),
        actorId: text('actor_id').references(() => user.id, { onDelete: 'set null' }),
        authMethod: text('auth_method').notNull(),
        operation: text('operation').notNull(),
        targetType: text('target_type').notNull(),
        targetId: text('target_id'),
        requestId: text('request_id').notNull(),
        result: text('result').notNull(),
        sourceIp: text('source_ip'),
        detail: text('detail'),
        createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
        sequence: integer('sequence'),
        previousHash: text('previous_hash'),
        entryHash: text('entry_hash'),
    },
    (table) => [
        uniqueIndex('audit_sequence_unique').on(table.sequence),
        index('audit_created_at_idx').on(table.createdAt),
        index('audit_actor_id_idx').on(table.actorId),
        index('audit_operation_created_at_idx').on(table.operation, table.createdAt),
        index('audit_target_type_created_at_idx').on(table.targetType, table.createdAt),
        index('audit_target_id_idx').on(table.targetId),
        index('audit_result_created_at_idx').on(table.result, table.createdAt),
    ],
)

export const apiKey = sqliteTable(
    'api_key',
    {
        id: text('id').primaryKey(),
        name: text('name').notNull(),
        prefix: text('prefix').notNull(),
        tokenHash: text('token_hash').notNull(),
        scopes: text('scopes').notNull(),
        createdBy: text('created_by')
            .notNull()
            .references(() => user.id, { onDelete: 'cascade' }),
        expiresAt: integer('expires_at', { mode: 'timestamp' }),
        revokedAt: integer('revoked_at', { mode: 'timestamp' }),
        lastUsedAt: integer('last_used_at', { mode: 'timestamp' }),
        createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    },
    (table) => [
        uniqueIndex('api_key_token_hash_unique').on(table.tokenHash),
        index('api_key_created_by_idx').on(table.createdBy),
        index('api_key_prefix_idx').on(table.prefix),
    ],
)

export const artifact = sqliteTable(
    'artifact',
    {
        id: text('id').primaryKey(),
        fileName: text('file_name').notNull(),
        mediaType: text('media_type').notNull(),
        sha256: text('sha256').notNull(),
        sizeBytes: integer('size_bytes').notNull(),
        status: text('status').notNull(),
        storagePath: text('storage_path').notNull(),
        createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
        createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    },
    (table) => [uniqueIndex('artifact_sha256_unique').on(table.sha256), index('artifact_created_at_idx').on(table.createdAt)],
)

export const uploadSession = sqliteTable(
    'upload_session',
    {
        id: text('id').primaryKey(),
        idempotencyKey: text('idempotency_key').notNull(),
        fileName: text('file_name').notNull(),
        mediaType: text('media_type').notNull(),
        expectedSha256: text('expected_sha256').notNull(),
        expectedSizeBytes: integer('expected_size_bytes').notNull(),
        receivedBytes: integer('received_bytes').default(0).notNull(),
        status: text('status').notNull(),
        temporaryPath: text('temporary_path').notNull(),
        createdBy: text('created_by')
            .notNull()
            .references(() => user.id, { onDelete: 'cascade' }),
        expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
        createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
        updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
    },
    (table) => [
        uniqueIndex('upload_session_actor_idempotency_unique').on(table.createdBy, table.idempotencyKey),
        index('upload_session_created_by_idx').on(table.createdBy),
        index('upload_session_expires_at_idx').on(table.expiresAt),
    ],
)

export const uploadChunk = sqliteTable(
    'upload_chunk',
    {
        id: text('id').primaryKey(),
        sessionId: text('session_id')
            .notNull()
            .references(() => uploadSession.id, { onDelete: 'cascade' }),
        offsetBytes: integer('offset_bytes').notNull(),
        sizeBytes: integer('size_bytes').notNull(),
        sha256: text('sha256').notNull(),
        createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    },
    (table) => [uniqueIndex('upload_chunk_session_offset_unique').on(table.sessionId, table.offsetBytes)],
)

export const deployment = sqliteTable(
    'deployment',
    {
        id: text('id').primaryKey(),
        artifactId: text('artifact_id').references(() => artifact.id, { onDelete: 'set null' }),
        containerId: text('container_id'),
        status: text('status').notNull(),
        createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
        createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
        updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
    },
    (table) => [index('deployment_artifact_id_idx').on(table.artifactId), index('deployment_created_at_idx').on(table.createdAt)],
)

export const deploymentManifest = sqliteTable(
    'deployment_manifest',
    {
        id: text('id').primaryKey(),
        name: text('name').notNull(),
        version: text('version').notNull(),
        imageDigest: text('image_digest').notNull(),
        commandJson: text('command_json').notNull(),
        entrypointJson: text('entrypoint_json').notNull(),
        environmentKeysJson: text('environment_keys_json').notNull(),
        secretsJson: text('secrets_json').notNull(),
        volumesJson: text('volumes_json').notNull(),
        internalPort: integer('internal_port').notNull(),
        protocol: text('protocol', { enum: ['http', 'websocket'] }).notNull(),
        nanoCpus: integer('nano_cpus').notNull(),
        memoryBytes: integer('memory_bytes').notNull(),
        pidsLimit: integer('pids_limit').notNull(),
        restartPolicy: text('restart_policy', { enum: ['no', 'on-failure', 'unless-stopped'] }).notNull(),
        runtimeJson: text('runtime_json').notNull().default('{"capabilities":[],"profile":"hardened","writablePaths":[]}'),
        network: text('network').notNull(),
        healthcheckPath: text('healthcheck_path').notNull(),
        healthcheckIntervalSeconds: integer('healthcheck_interval_seconds').notNull(),
        healthcheckTimeoutSeconds: integer('healthcheck_timeout_seconds').notNull(),
        healthcheckRetries: integer('healthcheck_retries').notNull(),
        healthcheckStartPeriodSeconds: integer('healthcheck_start_period_seconds').notNull(),
        routeHostname: text('route_hostname'),
        routePath: text('route_path'),
        routeStripPrefix: integer('route_strip_prefix', { mode: 'boolean' }),
        rolloutObservationSeconds: integer('rollout_observation_seconds').notNull(),
        rolloutRollbackRetentionSeconds: integer('rollout_rollback_retention_seconds').notNull(),
        createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
        createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
        updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
    },
    (table) => [
        uniqueIndex('deployment_manifest_name_version_unique').on(table.name, table.version),
        index('deployment_manifest_image_digest_idx').on(table.imageDigest),
        index('deployment_manifest_created_at_idx').on(table.createdAt),
    ],
)

export const deploymentSecret = sqliteTable(
    'deployment_secret',
    {
        id: text('id').primaryKey(),
        reference: text('reference').notNull(),
        ciphertext: text('ciphertext').notNull(),
        initializationVector: text('initialization_vector').notNull(),
        authenticationTag: text('authentication_tag').notNull(),
        keyVersion: integer('key_version').default(1).notNull(),
        version: integer('version').default(1).notNull(),
        createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
        createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
        updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
    },
    (table) => [uniqueIndex('deployment_secret_reference_unique').on(table.reference), index('deployment_secret_updated_at_idx').on(table.updatedAt)],
)

export const deploymentRelease = sqliteTable(
    'deployment_release',
    {
        id: text('id').primaryKey(),
        manifestId: text('manifest_id')
            .notNull()
            .references(() => deploymentManifest.id, { onDelete: 'restrict' }),
        previousReleaseId: text('previous_release_id'),
        containerId: text('container_id'),
        containerName: text('container_name').notNull(),
        nginxRouteId: text('nginx_route_id'),
        nginxConfigSha256: text('nginx_config_sha256'),
        status: text('status', {
            enum: ['creating', 'probing', 'switching', 'observing', 'healthy', 'failed', 'rolling-back', 'rolled-back'],
        }).notNull(),
        failureCode: text('failure_code'),
        createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
        createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
        updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
        activatedAt: integer('activated_at', { mode: 'timestamp' }),
        finishedAt: integer('finished_at', { mode: 'timestamp' }),
    },
    (table) => [
        index('deployment_release_manifest_id_idx').on(table.manifestId),
        index('deployment_release_status_idx').on(table.status),
        index('deployment_release_created_at_idx').on(table.createdAt),
    ],
)

export const deploymentStack = sqliteTable(
    'deployment_stack',
    {
        id: text('id').primaryKey(),
        name: text('name').notNull(),
        version: text('version').notNull(),
        manifestIdsJson: text('manifest_ids_json').notNull(),
        serviceOrderJson: text('service_order_json').notNull(),
        createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
        createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
        updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
    },
    (table) => [
        uniqueIndex('deployment_stack_name_version_unique').on(table.name, table.version),
        index('deployment_stack_created_at_idx').on(table.createdAt),
    ],
)

export const deploymentStackRelease = sqliteTable(
    'deployment_stack_release',
    {
        id: text('id').primaryKey(),
        stackId: text('stack_id')
            .notNull()
            .references(() => deploymentStack.id, { onDelete: 'restrict' }),
        releaseIdsJson: text('release_ids_json').notNull(),
        status: text('status', { enum: ['releasing', 'healthy', 'failed', 'rolled-back'] }).notNull(),
        failureCode: text('failure_code'),
        createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
        createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
        updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
        finishedAt: integer('finished_at', { mode: 'timestamp' }),
    },
    (table) => [
        uniqueIndex('deployment_stack_release_active_unique')
            .on(table.stackId)
            .where(sql`${table.status} = 'releasing'`),
        index('deployment_stack_release_stack_id_idx').on(table.stackId),
        index('deployment_stack_release_created_at_idx').on(table.createdAt),
    ],
)

export const operationJob = sqliteTable(
    'operation_job',
    {
        id: text('id').primaryKey(),
        kind: text('kind', {
            enum: [
                'backup.create',
                'backup.restore',
                'deploy.load',
                'deploy.release',
                'deploy.rollback',
                'deploy.stack-release',
                'image.pull',
                'notification.deliver',
                'secret.rotate',
                'system.prune',
                'traffic.export',
                'upload.finalize',
            ],
        }).notNull(),
        status: text('status', { enum: ['queued', 'running', 'cancelling', 'succeeded', 'failed', 'cancelled'] }).notNull(),
        payload: text('payload').notNull(),
        result: text('result'),
        resourceKey: text('resource_key'),
        workerId: text('worker_id'),
        failureCode: text('failure_code'),
        attempt: integer('attempt').notNull(),
        maxAttempts: integer('max_attempts').notNull(),
        progressStep: text('progress_step'),
        createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
        scheduledAt: integer('scheduled_at', { mode: 'timestamp' }).notNull(),
        startedAt: integer('started_at', { mode: 'timestamp' }),
        heartbeatAt: integer('heartbeat_at', { mode: 'timestamp' }),
        cancelRequestedAt: integer('cancel_requested_at', { mode: 'timestamp' }),
        finishedAt: integer('finished_at', { mode: 'timestamp' }),
        createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
        updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
    },
    (table) => [
        index('operation_job_status_scheduled_at_idx').on(table.status, table.scheduledAt),
        index('operation_job_kind_idx').on(table.kind),
        index('operation_job_kind_resource_key_idx').on(table.kind, table.resourceKey),
        uniqueIndex('operation_job_active_resource_unique')
            .on(table.kind, table.resourceKey)
            .where(sql`${table.resourceKey} IS NOT NULL AND ${table.status} IN ('queued','running','cancelling')`),
        index('operation_job_created_at_idx').on(table.createdAt),
    ],
)

export const operationJobEvent = sqliteTable(
    'operation_job_event',
    {
        id: text('id').primaryKey(),
        jobId: text('job_id')
            .notNull()
            .references(() => operationJob.id, { onDelete: 'cascade' }),
        event: text('event').notNull(),
        detail: text('detail'),
        createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    },
    (table) => [index('operation_job_event_job_id_idx').on(table.jobId), index('operation_job_event_created_at_idx').on(table.createdAt)],
)

export const nginxRoute = sqliteTable(
    'nginx_route',
    {
        id: text('id').primaryKey(),
        hostname: text('hostname').notNull(),
        path: text('path').notNull(),
        pathMode: text('path_mode', { enum: ['exact', 'prefix'] }).notNull(),
        targetContainer: text('target_container').notNull(),
        targetPort: integer('target_port').notNull(),
        protocol: text('protocol', { enum: ['http', 'websocket'] }).notNull(),
        stripPrefix: integer('strip_prefix', { mode: 'boolean' }).notNull(),
        timeoutSeconds: integer('timeout_seconds').notNull(),
        bodySizeMegabytes: integer('body_size_megabytes').notNull(),
        enabled: integer('enabled', { mode: 'boolean' }).notNull(),
        managedBy: text('managed_by').references(() => deploymentManifest.id, { onDelete: 'set null' }),
        createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
        updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
    },
    (table) => [
        uniqueIndex('nginx_route_hostname_path_mode_unique').on(table.hostname, table.path, table.pathMode),
        index('nginx_route_hostname_idx').on(table.hostname),
    ],
)

export const trustedProxy = sqliteTable('trusted_proxy', {
    address: text('address').primaryKey(),
    hostname: text('hostname'),
    note: text('note'),
    approvedBy: text('approved_by').references(() => user.id, { onDelete: 'set null' }),
    approvedAt: integer('approved_at', { mode: 'timestamp' }).notNull(),
})

export const panelSetting = sqliteTable('panel_setting', {
    id: text('id').primaryKey(),
    publicOrigin: text('public_origin'),
    extraTrustedOrigins: text('extra_trusted_origins'),
    nginxHostname: text('nginx_hostname'),
    updatedBy: text('updated_by').references(() => user.id, { onDelete: 'set null' }),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

export const maintenanceState = sqliteTable('maintenance_state', {
    id: text('id').primaryKey(),
    enabled: integer('enabled', { mode: 'boolean' }).notNull(),
    reason: text('reason'),
    actorId: text('actor_id'),
    jobId: text('job_id'),
    startedAt: integer('started_at', { mode: 'timestamp' }),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

export const notificationDestination = sqliteTable(
    'notification_destination',
    {
        id: text('id').primaryKey(),
        name: text('name').notNull(),
        type: text('type', { enum: ['discord'] }).notNull(),
        ciphertext: text('ciphertext').notNull(),
        initializationVector: text('initialization_vector').notNull(),
        authenticationTag: text('authentication_tag').notNull(),
        enabled: integer('enabled', { mode: 'boolean' }).notNull(),
        eventTypes: text('event_types').notNull(),
        keyVersion: integer('key_version').default(1).notNull(),
        version: integer('version').default(1).notNull(),
        createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
        createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
        updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
    },
    (table) => [
        uniqueIndex('notification_destination_name_unique').on(table.name),
        index('notification_destination_updated_at_idx').on(table.updatedAt),
    ],
)

export const notificationDelivery = sqliteTable(
    'notification_delivery',
    {
        id: text('id').primaryKey(),
        destinationId: text('destination_id')
            .notNull()
            .references(() => notificationDestination.id, { onDelete: 'cascade' }),
        jobId: text('job_id').references(() => operationJob.id, { onDelete: 'set null' }),
        sourceJobId: text('source_job_id').notNull(),
        eventType: text('event_type', { enum: ['backup.failed', 'deploy.failed', 'job.failed', 'restore.failed', 'test'] }).notNull(),
        failureCode: text('failure_code'),
        status: text('status', { enum: ['queued', 'delivered', 'failed'] }).notNull(),
        createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
        updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
    },
    (table) => [
        uniqueIndex('notification_delivery_source_unique').on(table.destinationId, table.sourceJobId, table.eventType),
        index('notification_delivery_destination_id_idx').on(table.destinationId),
        index('notification_delivery_created_at_idx').on(table.createdAt),
    ],
)

export const schema = {
    account,
    apiKey,
    artifact,
    auditChainAnchor,
    auditLog,
    deployment,
    deploymentManifest,
    deploymentRelease,
    deploymentSecret,
    deploymentStack,
    deploymentStackRelease,
    invitation,
    loginLockout,
    maintenanceState,
    panelSetting,
    trustedProxy,
    nginxRoute,
    notificationDelivery,
    notificationDestination,
    operationJob,
    operationJobEvent,
    session,
    user,
    userRole,
    uploadChunk,
    uploadSession,
    verification,
}
