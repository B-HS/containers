#!/bin/sh
set -eu

if [ ! -f /etc/nginx/managed/current.conf ]; then
    cp /opt/containers/default-nginx.conf /etc/nginx/managed/current.conf
    chmod 0640 /etc/nginx/managed/current.conf
    chown 1000:1000 /etc/nginx/managed/current.conf
fi

exec nginx -c /etc/nginx/managed/current.conf -g 'daemon off;'
