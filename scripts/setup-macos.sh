#!/usr/bin/env bash
# 하위호환 래퍼. 실제 셋업은 macOS·Linux 를 모두 지원하는 scripts/setup.sh 가 수행한다.
set -u

printf 'scripts/setup-macos.sh 는 scripts/setup.sh 로 대체되었습니다. setup.sh 를 실행합니다.\n\n' >&2

exec "$(cd "$(dirname "$0")" && pwd)/setup.sh" "$@"
