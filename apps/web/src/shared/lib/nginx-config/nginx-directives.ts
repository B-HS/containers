export type DirectiveValueType = 'boolean' | 'text' | 'number' | 'size' | 'duration' | 'options' | 'code'

export type DirectiveGroupId =
    'basic' | 'paths' | 'limits' | 'headers' | 'logging' | 'rewrite' | 'proxy' | 'ssl' | 'security' | 'compression' | 'misc' | 'http2'

export type DirectiveEntry = {
    name: string
    group: DirectiveGroupId
    valueType: DirectiveValueType
    options?: string[]
    multiple?: boolean
    placeholderKey?: string
}

export const DIRECTIVE_GROUPS: { id: DirectiveGroupId; labelKey: string }[] = [
    { id: 'basic', labelKey: 'nginxGui.groupBasic' },
    { id: 'paths', labelKey: 'nginxGui.groupPaths' },
    { id: 'limits', labelKey: 'nginxGui.groupLimits' },
    { id: 'headers', labelKey: 'nginxGui.groupHeaders' },
    { id: 'logging', labelKey: 'nginxGui.groupLogging' },
    { id: 'rewrite', labelKey: 'nginxGui.groupRewrite' },
    { id: 'proxy', labelKey: 'nginxGui.groupProxy' },
    { id: 'ssl', labelKey: 'nginxGui.groupSsl' },
    { id: 'security', labelKey: 'nginxGui.groupSecurity' },
    { id: 'compression', labelKey: 'nginxGui.groupCompression' },
    { id: 'misc', labelKey: 'nginxGui.groupMisc' },
    { id: 'http2', labelKey: 'nginxGui.groupHttp2' },
]

const BASIC_DIRECTIVES: DirectiveEntry[] = [
    { name: 'listen', group: 'basic', valueType: 'text', multiple: true },
    { name: 'server_name', group: 'basic', valueType: 'text', placeholderKey: 'serverName' },
    { name: 'server_tokens', group: 'basic', valueType: 'options', options: ['on', 'off'] },
    { name: 'absolute_redirect', group: 'basic', valueType: 'options', options: ['on', 'off'] },
    { name: 'server_name_in_redirect', group: 'basic', valueType: 'options', options: ['on', 'off'] },
    { name: 'port_in_redirect', group: 'basic', valueType: 'options', options: ['on', 'off'] },
    { name: 'sendfile', group: 'basic', valueType: 'options', options: ['on', 'off'] },
    { name: 'sendfile_max_chunk', group: 'basic', valueType: 'size' },
    { name: 'tcp_nopush', group: 'basic', valueType: 'options', options: ['on', 'off'] },
    { name: 'tcp_nodelay', group: 'basic', valueType: 'options', options: ['on', 'off'] },
    { name: 'keepalive_timeout', group: 'basic', valueType: 'duration' },
    { name: 'keepalive_requests', group: 'basic', valueType: 'number' },
    { name: 'keepalive_time', group: 'basic', valueType: 'duration' },
    { name: 'reset_timedout_connection', group: 'basic', valueType: 'options', options: ['on', 'off'] },
    { name: 'lingering_close', group: 'basic', valueType: 'options', options: ['off', 'on', 'always'] },
    { name: 'lingering_time', group: 'basic', valueType: 'duration' },
    { name: 'lingering_timeout', group: 'basic', valueType: 'duration' },
    { name: 'client_header_timeout', group: 'basic', valueType: 'duration' },
    { name: 'client_body_timeout', group: 'basic', valueType: 'duration' },
    { name: 'send_timeout', group: 'basic', valueType: 'duration' },
]

const PATHS_DIRECTIVES: DirectiveEntry[] = [
    { name: 'root', group: 'paths', valueType: 'text', placeholderKey: 'path' },
    { name: 'index', group: 'paths', valueType: 'text', multiple: true },
    { name: 'error_page', group: 'paths', valueType: 'text', multiple: true },
    { name: 'try_files', group: 'paths', valueType: 'text', multiple: true },
    { name: 'default_type', group: 'paths', valueType: 'text', placeholderKey: 'mimeType' },
]

const LIMITS_DIRECTIVES: DirectiveEntry[] = [
    { name: 'client_max_body_size', group: 'limits', valueType: 'size' },
    { name: 'client_body_buffer_size', group: 'limits', valueType: 'size' },
    { name: 'client_body_in_file_only', group: 'limits', valueType: 'options', options: ['off', 'on', 'clean'] },
    { name: 'client_body_in_single_buffer', group: 'limits', valueType: 'options', options: ['on', 'off'] },
    { name: 'client_header_buffer_size', group: 'limits', valueType: 'size' },
    { name: 'large_client_header_buffers', group: 'limits', valueType: 'text' },
    { name: 'limit_rate', group: 'limits', valueType: 'size' },
    { name: 'limit_rate_after', group: 'limits', valueType: 'size' },
    { name: 'limit_conn', group: 'limits', valueType: 'text' },
    { name: 'limit_conn_dry_run', group: 'limits', valueType: 'options', options: ['on', 'off'] },
    { name: 'limit_conn_log_level', group: 'limits', valueType: 'options', options: ['info', 'notice', 'warn', 'error'] },
    { name: 'limit_conn_status', group: 'limits', valueType: 'code' },
    { name: 'limit_req', group: 'limits', valueType: 'text' },
    { name: 'limit_req_dry_run', group: 'limits', valueType: 'options', options: ['on', 'off'] },
    { name: 'limit_req_log_level', group: 'limits', valueType: 'options', options: ['info', 'notice', 'warn', 'error'] },
    { name: 'limit_req_status', group: 'limits', valueType: 'code' },
    { name: 'max_ranges', group: 'limits', valueType: 'number' },
]

const HEADERS_DIRECTIVES: DirectiveEntry[] = [
    { name: 'add_header', group: 'headers', valueType: 'text', multiple: true },
    { name: 'add_trailer', group: 'headers', valueType: 'text', multiple: true },
]

const LOGGING_DIRECTIVES: DirectiveEntry[] = [
    { name: 'access_log', group: 'logging', valueType: 'text', multiple: true },
    { name: 'error_log', group: 'logging', valueType: 'text', multiple: true },
    { name: 'log_not_found', group: 'logging', valueType: 'options', options: ['on', 'off'] },
    { name: 'log_subrequest', group: 'logging', valueType: 'options', options: ['on', 'off'] },
    { name: 'rewrite_log', group: 'logging', valueType: 'options', options: ['on', 'off'] },
]

const REWRITE_DIRECTIVES: DirectiveEntry[] = [
    { name: 'return', group: 'rewrite', valueType: 'code', multiple: true },
    { name: 'rewrite', group: 'rewrite', valueType: 'text', multiple: true },
    { name: 'set', group: 'rewrite', valueType: 'text', multiple: true },
    { name: 'break', group: 'rewrite', valueType: 'boolean' },
    { name: 'uninitialized_variable_warn', group: 'rewrite', valueType: 'options', options: ['on', 'off'] },
]

const PROXY_DIRECTIVES: DirectiveEntry[] = [
    { name: 'proxy_pass', group: 'proxy', valueType: 'text', placeholderKey: 'upstreamUrl' },
    { name: 'proxy_http_version', group: 'proxy', valueType: 'options', options: ['1.0', '1.1'] },
    { name: 'proxy_set_header', group: 'proxy', valueType: 'text', multiple: true },
    { name: 'proxy_set_body', group: 'proxy', valueType: 'text' },
    { name: 'proxy_redirect', group: 'proxy', valueType: 'text', multiple: true },
    { name: 'proxy_hide_header', group: 'proxy', valueType: 'text', multiple: true },
    { name: 'proxy_pass_header', group: 'proxy', valueType: 'text', multiple: true },
    { name: 'proxy_buffering', group: 'proxy', valueType: 'options', options: ['on', 'off'] },
    { name: 'proxy_buffers', group: 'proxy', valueType: 'text' },
    { name: 'proxy_buffer_size', group: 'proxy', valueType: 'size' },
    { name: 'proxy_busy_buffers_size', group: 'proxy', valueType: 'size' },
    { name: 'proxy_max_temp_file_size', group: 'proxy', valueType: 'size' },
    { name: 'proxy_temp_path', group: 'proxy', valueType: 'text' },
    { name: 'proxy_connect_timeout', group: 'proxy', valueType: 'duration' },
    { name: 'proxy_send_timeout', group: 'proxy', valueType: 'duration' },
    { name: 'proxy_read_timeout', group: 'proxy', valueType: 'duration' },
    { name: 'proxy_next_upstream', group: 'proxy', valueType: 'text' },
    { name: 'proxy_next_upstream_tries', group: 'proxy', valueType: 'number' },
    { name: 'proxy_next_upstream_timeout', group: 'proxy', valueType: 'duration' },
    { name: 'proxy_cache', group: 'proxy', valueType: 'text' },
    { name: 'proxy_cache_key', group: 'proxy', valueType: 'text' },
    { name: 'proxy_cache_valid', group: 'proxy', valueType: 'text', multiple: true },
    { name: 'proxy_cache_bypass', group: 'proxy', valueType: 'text', multiple: true },
    { name: 'proxy_no_cache', group: 'proxy', valueType: 'text', multiple: true },
]

const SSL_DIRECTIVES: DirectiveEntry[] = [
    { name: 'ssl_certificate', group: 'ssl', valueType: 'text', placeholderKey: 'filePath' },
    { name: 'ssl_certificate_key', group: 'ssl', valueType: 'text', placeholderKey: 'filePath' },
    { name: 'ssl_password_file', group: 'ssl', valueType: 'text', placeholderKey: 'filePath' },
    { name: 'ssl_protocols', group: 'ssl', valueType: 'text', placeholderKey: 'sslProtocols' },
    { name: 'ssl_ciphers', group: 'ssl', valueType: 'text', placeholderKey: 'sslCiphers' },
    { name: 'ssl_prefer_server_ciphers', group: 'ssl', valueType: 'options', options: ['on', 'off'] },
    { name: 'ssl_session_cache', group: 'ssl', valueType: 'text', placeholderKey: 'sslSessionCache' },
    { name: 'ssl_session_timeout', group: 'ssl', valueType: 'duration' },
    { name: 'ssl_session_tickets', group: 'ssl', valueType: 'options', options: ['on', 'off'] },
    { name: 'ssl_session_ticket_key', group: 'ssl', valueType: 'text', multiple: true },
    { name: 'ssl_buffer_size', group: 'ssl', valueType: 'size' },
    { name: 'ssl_verify_client', group: 'ssl', valueType: 'options', options: ['off', 'on', 'optional', 'optional_no_ca'] },
    { name: 'ssl_verify_depth', group: 'ssl', valueType: 'number' },
    { name: 'ssl_client_certificate', group: 'ssl', valueType: 'text', placeholderKey: 'filePath' },
    { name: 'ssl_crl', group: 'ssl', valueType: 'text', placeholderKey: 'filePath' },
    { name: 'ssl_trusted_certificate', group: 'ssl', valueType: 'text', placeholderKey: 'filePath' },
    { name: 'ssl_dhparam', group: 'ssl', valueType: 'text', placeholderKey: 'filePath' },
    { name: 'ssl_ecdh_curve', group: 'ssl', valueType: 'text' },
    { name: 'ssl_reject_handshake', group: 'ssl', valueType: 'options', options: ['on', 'off'] },
    { name: 'ssl_early_data', group: 'ssl', valueType: 'options', options: ['on', 'off'] },
    { name: 'ssl_stapling', group: 'ssl', valueType: 'options', options: ['on', 'off'] },
    { name: 'ssl_stapling_file', group: 'ssl', valueType: 'text', placeholderKey: 'filePath' },
    { name: 'ssl_stapling_responder', group: 'ssl', valueType: 'text', placeholderKey: 'url' },
    { name: 'ssl_stapling_verify', group: 'ssl', valueType: 'options', options: ['on', 'off'] },
    { name: 'ssl_conf_command', group: 'ssl', valueType: 'text', multiple: true },
]

const SECURITY_DIRECTIVES: DirectiveEntry[] = [
    { name: 'allow', group: 'security', valueType: 'text', multiple: true },
    { name: 'deny', group: 'security', valueType: 'text', multiple: true },
    { name: 'auth_basic', group: 'security', valueType: 'text' },
    { name: 'auth_basic_user_file', group: 'security', valueType: 'text', placeholderKey: 'filePath' },
    { name: 'auth_request', group: 'security', valueType: 'text', placeholderKey: 'uri' },
    { name: 'auth_request_set', group: 'security', valueType: 'text', multiple: true },
    { name: 'satisfy', group: 'security', valueType: 'options', options: ['all', 'any'] },
    { name: 'set_real_ip_from', group: 'security', valueType: 'text', multiple: true },
    { name: 'real_ip_header', group: 'security', valueType: 'text' },
    { name: 'real_ip_recursive', group: 'security', valueType: 'options', options: ['on', 'off'] },
]

const COMPRESSION_DIRECTIVES: DirectiveEntry[] = [
    { name: 'gzip', group: 'compression', valueType: 'options', options: ['on', 'off'] },
    { name: 'gzip_types', group: 'compression', valueType: 'text', multiple: true },
    { name: 'gzip_min_length', group: 'compression', valueType: 'size' },
    { name: 'gzip_comp_level', group: 'compression', valueType: 'number' },
    { name: 'gzip_buffers', group: 'compression', valueType: 'text' },
    { name: 'gzip_http_version', group: 'compression', valueType: 'options', options: ['1.0', '1.1'] },
    { name: 'gzip_proxied', group: 'compression', valueType: 'text', multiple: true },
    { name: 'gzip_disable', group: 'compression', valueType: 'text', multiple: true },
    { name: 'gzip_vary', group: 'compression', valueType: 'options', options: ['on', 'off'] },
    { name: 'gzip_static', group: 'compression', valueType: 'options', options: ['on', 'off'] },
]

const MISC_DIRECTIVES: DirectiveEntry[] = [
    { name: 'charset', group: 'misc', valueType: 'text' },
    { name: 'charset_types', group: 'misc', valueType: 'text', multiple: true },
    { name: 'source_charset', group: 'misc', valueType: 'text' },
    { name: 'override_charset', group: 'misc', valueType: 'options', options: ['off', 'on', 'charset'] },
    { name: 'etag', group: 'misc', valueType: 'options', options: ['on', 'off'] },
    { name: 'expires', group: 'misc', valueType: 'text', multiple: true },
    { name: 'disable_symlinks', group: 'misc', valueType: 'text' },
    { name: 'directio', group: 'misc', valueType: 'size' },
    { name: 'directio_alignment', group: 'misc', valueType: 'size' },
    { name: 'output_buffers', group: 'misc', valueType: 'text' },
    { name: 'postpone_output', group: 'misc', valueType: 'size' },
    { name: 'request_id', group: 'misc', valueType: 'options', options: ['on', 'off'] },
    { name: 'ignore_invalid_headers', group: 'misc', valueType: 'options', options: ['on', 'off'] },
    { name: 'merge_slashes', group: 'misc', valueType: 'options', options: ['on', 'off'] },
    { name: 'msie_padding', group: 'misc', valueType: 'options', options: ['on', 'off'] },
    { name: 'msie_refresh', group: 'misc', valueType: 'options', options: ['on', 'off'] },
    { name: 'open_file_cache', group: 'misc', valueType: 'text' },
    { name: 'open_file_cache_errors', group: 'misc', valueType: 'options', options: ['on', 'off'] },
    { name: 'open_file_cache_min_uses', group: 'misc', valueType: 'number' },
    { name: 'open_file_cache_valid', group: 'misc', valueType: 'duration' },
    { name: 'read_ahead', group: 'misc', valueType: 'size' },
    { name: 'recursive_error_pages', group: 'misc', valueType: 'options', options: ['on', 'off'] },
    { name: 'resolver', group: 'misc', valueType: 'text', multiple: true },
    { name: 'resolver_timeout', group: 'misc', valueType: 'duration' },
    { name: 'random_index', group: 'misc', valueType: 'options', options: ['on', 'off'] },
    { name: 'mirror', group: 'misc', valueType: 'text', multiple: true },
    { name: 'mirror_request_body', group: 'misc', valueType: 'options', options: ['on', 'off'] },
    { name: 'sub_filter', group: 'misc', valueType: 'text', multiple: true },
    { name: 'sub_filter_once', group: 'misc', valueType: 'options', options: ['on', 'off'] },
    { name: 'sub_filter_types', group: 'misc', valueType: 'text', multiple: true },
]

const HTTP2_DIRECTIVES: DirectiveEntry[] = [
    { name: 'http2_chunk_size', group: 'http2', valueType: 'size' },
    { name: 'http2_max_concurrent_streams', group: 'http2', valueType: 'number' },
    { name: 'http2_push_preload', group: 'http2', valueType: 'options', options: ['on', 'off'] },
]

export const SERVER_DIRECTIVES: DirectiveEntry[] = [
    ...BASIC_DIRECTIVES,
    ...PATHS_DIRECTIVES,
    ...LIMITS_DIRECTIVES,
    ...HEADERS_DIRECTIVES,
    ...LOGGING_DIRECTIVES,
    ...REWRITE_DIRECTIVES,
    ...PROXY_DIRECTIVES,
    ...SSL_DIRECTIVES,
    ...SECURITY_DIRECTIVES,
    ...COMPRESSION_DIRECTIVES,
    ...MISC_DIRECTIVES,
    ...HTTP2_DIRECTIVES,
]

export const SERVER_DIRECTIVE_NAMES = new Set(SERVER_DIRECTIVES.map((entry) => entry.name))
