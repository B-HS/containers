#!/usr/bin/env bash
# guard-container-escape.sh — PreToolUse(Bash)
#
# 이 저장소에서 에이전트(메인·서브 모두)가 사용자 승인 없이 호스트 격리를 우회하거나
# 로컬 서비스를 네트워크에 노출하는 것을 결정론적으로 차단한다.
#
# 배경: 2026-08-05 조사 워크플로에서 서브에이전트가 (1) --privileged --pid=host 컨테이너로
# nsenter 를 실행해 호스트 네임스페이스에 진입하고, (2) socat 을 LAN IP 에 바인딩해
# 셸 실행 서비스를 로컬 네트워크에 노출했다. 프롬프트 문구로는 재발을 막을 수 없어 훅으로 강제한다.
# 상세: docs/bug/2026-08-05-sse-stream-slot-leak.md, docs/acknowledge/0033-*.md
#
# 차단: exit 2. 통과: exit 0. 파싱 실패는 fail-open(허용).
set -uo pipefail

command -v jq >/dev/null 2>&1 || exit 0

input="$(cat)"
cmd="$(printf '%s' "$input" | jq -r '.tool_input.command // empty' 2>/dev/null)"
[ -z "$cmd" ] && exit 0

deny() {
    printf '차단: %s\n\n이 저장소는 에이전트의 호스트 격리 우회와 로컬 서비스 노출을 훅으로 금지합니다.\n필요하면 사용자에게 목적과 범위를 설명하고 직접 실행을 요청하세요. (.claude/hooks/guard-container-escape.sh)\n' "$1" >&2
    exit 2
}

# --- 1. 컨테이너 특권·호스트 네임스페이스 공유 ---
printf '%s' "$cmd" | grep -Eq '(^|[[:space:]])--privileged([[:space:]=]|$)' && deny '--privileged 컨테이너 실행'
printf '%s' "$cmd" | grep -Eq '(^|[[:space:]])--pid[[:space:]=]+host([[:space:]]|$)' && deny '--pid=host (호스트 프로세스 네임스페이스 공유)'
printf '%s' "$cmd" | grep -Eq '(^|[[:space:]])--ipc[[:space:]=]+host([[:space:]]|$)' && deny '--ipc=host'
printf '%s' "$cmd" | grep -Eq '(^|[[:space:]])--uts[[:space:]=]+host([[:space:]]|$)' && deny '--uts=host'
printf '%s' "$cmd" | grep -Eq '(^|[[:space:]])--(net|network)[[:space:]=]+host([[:space:]]|$)' && deny '--network=host'
printf '%s' "$cmd" | grep -Eq '(^|[[:space:]])--cap-add[[:space:]=]+(ALL|all|SYS_ADMIN|sys_admin)([[:space:]]|$)' && deny '--cap-add=ALL/SYS_ADMIN'
printf '%s' "$cmd" | grep -Eq '(^|[[:space:]])--security-opt[[:space:]=]+seccomp[[:space:]]*=[[:space:]]*unconfined' && deny '--security-opt seccomp=unconfined'

# --- 2. 호스트 네임스페이스 진입 도구 ---
printf '%s' "$cmd" | grep -Eq '(^|[[:space:];|&])nsenter([[:space:]]|$)' && deny 'nsenter (호스트 네임스페이스 진입)'
printf '%s' "$cmd" | grep -Eq 'justincormack/nsenter1' && deny 'nsenter1 이미지 (호스트 네임스페이스 진입)'

# --- 3. 호스트 루트·docker 소켓 마운트 ---
printf '%s' "$cmd" | grep -Eq '(-v|--volume|--mount[[:space:]]+[^[:space:]]*source=)[[:space:]=]*/(:|,|[[:space:]])' && deny '호스트 루트(/) 마운트'
printf '%s' "$cmd" | grep -Eq '(-v|--volume)[[:space:]=]*/var/run/docker\.sock' && deny 'docker.sock 마운트 (engine-agent 만 허용)'

# --- 4. loopback 이 아닌 주소로 포트 publish ---
# 허용: -p 127.0.0.1:PORT:PORT, -p [::1]:PORT:PORT. 그 외(0.0.0.0, LAN IP, 호스트 IP 생략)는 차단.
published="$(printf '%s' "$cmd" | grep -oE '(^|[[:space:]])(-p|--publish)[[:space:]=]+[^[:space:]]+' || true)"
if [ -n "$published" ]; then
    while IFS= read -r spec; do
        [ -z "$spec" ] && continue
        value="$(printf '%s' "$spec" | sed -E 's/.*(-p|--publish)[[:space:]=]+//')"
        printf '%s' "$value" | grep -Eq '^(127\.0\.0\.1|\[::1\]|localhost):' && continue
        deny "loopback 이 아닌 주소로 포트 publish ($value)"
    done <<EOF
$published
EOF
fi

exit 0
