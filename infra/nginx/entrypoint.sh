#!/bin/sh
set -eu

ACCESS_LOG_PATH=/var/log/nginx/access.jsonl
ACCESS_LOG_MAX_BYTES=${ACCESS_LOG_MAX_BYTES:-134217728}
ACCESS_LOG_ROTATE_INTERVAL_SECONDS=${ACCESS_LOG_ROTATE_INTERVAL_SECONDS:-60}
ACCESS_LOG_KEEP=${ACCESS_LOG_KEEP:-2}

if [ ! -f /etc/nginx/managed/current.conf ]; then
    cp /opt/containers/default-nginx.conf /etc/nginx/managed/current.conf
    chmod 0640 /etc/nginx/managed/current.conf
    chown 1000:1000 /etc/nginx/managed/current.conf
fi

rotate_access_log() {
    if [ ! -f "$ACCESS_LOG_PATH" ]; then
        return 0
    fi

    access_log_size=$(wc -c <"$ACCESS_LOG_PATH")
    if [ "$access_log_size" -le "$ACCESS_LOG_MAX_BYTES" ]; then
        return 0
    fi

    if [ "$ACCESS_LOG_KEEP" -lt 1 ]; then
        rm -f "$ACCESS_LOG_PATH"
        kill -USR1 "$nginx_pid" 2>/dev/null || true
        return 0
    fi

    rm -f "$ACCESS_LOG_PATH.$ACCESS_LOG_KEEP"
    generation=$ACCESS_LOG_KEEP
    while [ "$generation" -gt 1 ]; do
        previous=$((generation - 1))
        if [ -f "$ACCESS_LOG_PATH.$previous" ]; then
            mv "$ACCESS_LOG_PATH.$previous" "$ACCESS_LOG_PATH.$generation"
        fi
        generation=$previous
    done

    mv "$ACCESS_LOG_PATH" "$ACCESS_LOG_PATH.1"
    kill -USR1 "$nginx_pid" 2>/dev/null || true
}

nginx -c /etc/nginx/managed/current.conf -g 'daemon off;' &
nginx_pid=$!

forward_signal() {
    kill -TERM "$nginx_pid" 2>/dev/null || true
}
trap forward_signal INT TERM

(
    while true; do
        sleep "$ACCESS_LOG_ROTATE_INTERVAL_SECONDS"
        rotate_access_log || true
    done
) &
rotation_pid=$!

exit_code=0
while kill -0 "$nginx_pid" 2>/dev/null; do
    wait "$nginx_pid" || exit_code=$?
done

kill -TERM "$rotation_pid" 2>/dev/null || true
exit "$exit_code"
