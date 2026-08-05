#!/usr/bin/env bash
set -u

# 호스트에서 돌던 cloudflared 를 compose 프로필로 옮긴다.
#
# 이걸 하면 두 가지가 동시에 해결된다.
#  1. rate limit 공유: 호스트 cloudflared 는 요청을 edge 게이트웨이 IP 로 넣어서
#     nginx real_ip 가 CF-Connecting-IP 를 무시한다. compose 프로필은 nginx 의
#     set_real_ip_from 이 신뢰하는 고정 IP 를 받으므로 클라이언트별 rate limit 이 동작한다.
#  2. 토큰 노출: 호스트 실행은 `cloudflared tunnel run --token <TOKEN>` 이라 ps 출력에
#     토큰이 그대로 보인다. compose 는 TUNNEL_TOKEN 환경변수로만 전달한다.
#
# 토큰은 인자로 받지 않는다(인자는 ps 에 남는다). CLOUDFLARE_TUNNEL_TOKEN 환경변수만 쓴다.

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CURL_TIMEOUT_SECONDS=20
ACCESS_LOG_PATH=/var/log/nginx/access.jsonl
MANAGED_CONFIG_PATH=/etc/nginx/managed/current.conf
INGRESS_SERVICE_URL=http://nginx:8080

PUBLIC_URL=""
STOP_HOST_TUNNEL=0
ASSUME_YES=0

if [ -t 1 ]; then
    BOLD="$(tput bold)"
    RED="$(tput setaf 1)"
    GREEN="$(tput setaf 2)"
    YELLOW="$(tput setaf 3)"
    RESET="$(tput sgr0)"
else
    BOLD=""
    RED=""
    GREEN=""
    YELLOW=""
    RESET=""
fi

info() { printf '%s\n' "$1"; }
step() { printf '%s\n' "${BOLD}$1${RESET}"; }
ok() { printf '%s\n' "${GREEN}  ok${RESET} $1"; }
warn() { printf '%s\n' "${YELLOW}  주의${RESET} $1"; }
fail() {
    printf '%s\n' "${RED}  실패${RESET} $1" >&2
    exit 1
}

usage() {
    cat <<'USAGE'
사용법: CLOUDFLARE_TUNNEL_TOKEN=<토큰> ./scripts/migrate-tunnel-to-compose.sh [옵션]

옵션
  --public-url <url>     검증에 쓸 외부 주소 (예: https://panel.example.com)
  --stop-host-tunnel     호스트에서 돌고 있는 cloudflared 프로세스를 종료한다
  --yes                  확인 프롬프트를 건너뛴다
  --help                 이 도움말

토큰은 인자로 넘기지 않는다. 인자는 ps 출력에 남는다.
셸 히스토리에도 남기지 않으려면 다음처럼 입력한다.

  read -rs CLOUDFLARE_TUNNEL_TOKEN && export CLOUDFLARE_TUNNEL_TOKEN
  ./scripts/migrate-tunnel-to-compose.sh --public-url https://panel.example.com --stop-host-tunnel
USAGE
}

while [ $# -gt 0 ]; do
    case "$1" in
        --public-url)
            PUBLIC_URL="${2:-}"
            shift 2
            ;;
        --stop-host-tunnel)
            STOP_HOST_TUNNEL=1
            shift
            ;;
        --yes)
            ASSUME_YES=1
            shift
            ;;
        --help)
            usage
            exit 0
            ;;
        *)
            usage >&2
            exit 1
            ;;
    esac
done

confirm() {
    [ "$ASSUME_YES" -eq 1 ] && return 0
    [ -t 0 ] || fail "확인이 필요합니다. 비대화식으로 실행하려면 --yes 를 붙이세요."
    printf '%s [y/N] ' "$1"
    read -r answer
    case "$answer" in
        y | Y) return 0 ;;
        *) fail "중단했습니다." ;;
    esac
}

step '1. 사전 확인'

command -v docker > /dev/null 2>&1 || fail 'docker 를 찾을 수 없습니다.'
docker compose version > /dev/null 2>&1 || fail 'docker compose v2 가 필요합니다.'
[ -n "${CLOUDFLARE_TUNNEL_TOKEN:-}" ] || fail 'CLOUDFLARE_TUNNEL_TOKEN 환경변수가 비어 있습니다. --help 를 보세요.'

cd "$REPO_ROOT" || fail "저장소 경로로 이동하지 못했습니다: $REPO_ROOT"
docker compose ps --status running --quiet nginx | grep -q . || fail 'nginx 컨테이너가 실행 중이 아닙니다. 먼저 docker compose up -d 를 실행하세요.'
ok 'docker compose 와 실행 중인 스택을 확인했습니다.'

step '2. 호스트 cloudflared 확인'

HOST_TUNNEL_PIDS="$(pgrep -f 'cloudflared.*tunnel' 2> /dev/null || true)"
if [ -n "$HOST_TUNNEL_PIDS" ]; then
    info "  호스트에서 실행 중인 cloudflared: $(printf '%s' "$HOST_TUNNEL_PIDS" | tr '\n' ' ')"
    if pgrep -af 'cloudflared.*--token' > /dev/null 2>&1; then
        warn 'ps 출력에 토큰이 노출된 상태입니다. 이 마이그레이션이 그 노출을 없앱니다.'
    fi
    if [ "$STOP_HOST_TUNNEL" -eq 1 ]; then
        confirm '  호스트 cloudflared 를 종료할까요?'
        # shellcheck disable=SC2086
        kill $HOST_TUNNEL_PIDS 2> /dev/null || true
        sleep 2
        pgrep -f 'cloudflared.*tunnel' > /dev/null 2>&1 && warn '아직 살아 있는 프로세스가 있습니다. 수동으로 확인하세요.'
        ok '호스트 cloudflared 를 종료했습니다.'
    else
        warn '종료하지 않았습니다. 두 개가 동시에 붙으면 라우팅이 오락가락합니다. --stop-host-tunnel 을 쓰거나 직접 종료하세요.'
    fi
else
    ok '호스트에서 실행 중인 cloudflared 가 없습니다.'
fi

step '3. Cloudflare 대시보드 설정 확인'

info "  터널의 public hostname service 를 ${BOLD}${INGRESS_SERVICE_URL}${RESET} 로 바꿔야 합니다."
info '  compose 안의 cloudflared 는 edge 네트워크에 있어 호스트의 127.0.0.1 에 도달할 수 없습니다.'
info '  원본 Host 헤더는 그대로 전달해야 합니다. Host 를 덮어쓰면 nginx catch-all 이 444 로 끊습니다.'
confirm '  대시보드에서 위 값으로 바꿨습니까?'

step '4. compose 프로필로 기동'

docker compose --profile cloudflared up -d --wait cloudflared || fail 'cloudflared 컨테이너 기동에 실패했습니다.'

CLOUDFLARED_CONTAINER="$(docker compose --profile cloudflared ps --quiet cloudflared)"
[ -n "$CLOUDFLARED_CONTAINER" ] || fail 'cloudflared 컨테이너를 찾을 수 없습니다.'

ACTUAL_ADDRESS="$(docker inspect "$CLOUDFLARED_CONTAINER" --format '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}' | tr ' ' '\n' | grep -v '^$' | head -1)"
[ -n "$ACTUAL_ADDRESS" ] || fail 'cloudflared 컨테이너의 IP 를 읽지 못했습니다.'

TRUSTED_ADDRESSES="$(docker compose exec -T nginx sh -c "sed -n 's/^[[:space:]]*set_real_ip_from[[:space:]]\{1,\}\([^;]*\);.*/\1/p' $MANAGED_CONFIG_PATH" 2> /dev/null | tr -d '\r')"
[ -n "$TRUSTED_ADDRESSES" ] || fail "nginx 설정에서 set_real_ip_from 을 찾지 못했습니다: $MANAGED_CONFIG_PATH"

if printf '%s\n' "$TRUSTED_ADDRESSES" | grep -qx "${ACTUAL_ADDRESS}/32"; then
    ok "cloudflared 주소($ACTUAL_ADDRESS)를 nginx real_ip 가 신뢰합니다."
else
    fail "nginx real_ip 신뢰 목록($(printf '%s' "$TRUSTED_ADDRESSES" | tr '\n' ' '))에 cloudflared 주소 ${ACTUAL_ADDRESS}/32 가 없습니다. compose 의 CLOUDFLARED_ADDRESS 와 nginx set_real_ip_from 을 맞추세요."
fi

if docker inspect "$CLOUDFLARED_CONTAINER" --format '{{json .Config.Cmd}}' | grep -q -- '--token'; then
    fail 'cloudflared command 에 토큰이 들어 있습니다. compose.yaml 의 TUNNEL_TOKEN 환경변수 경로를 쓰세요.'
fi
ok '토큰이 프로세스 인자가 아니라 환경변수로 전달됩니다.'

step '5. 실측 검증'

if [ -z "$PUBLIC_URL" ]; then
    warn '--public-url 이 없어 외부 경로 검증을 건너뜁니다. real_ip 가 실제로 붙는지 확인하려면 다시 실행하세요.'
    exit 0
fi

PROBE_PATH="/api/readyz?tunnel-probe=$(date +%s)"
HTTP_CODE="$(curl -s -o /dev/null -w '%{http_code}' -m "$CURL_TIMEOUT_SECONDS" "${PUBLIC_URL%/}${PROBE_PATH}" || true)"
if [ "$HTTP_CODE" = "200" ]; then
    ok "외부 경로 응답 $HTTP_CODE"
elif [ "$HTTP_CODE" = "502" ] || [ "$HTTP_CODE" = "000" ]; then
    fail "외부 경로 응답 $HTTP_CODE. 대시보드 service 가 $INGRESS_SERVICE_URL 인지, Host 헤더를 덮어쓰지 않는지 확인하세요."
else
    warn "외부 경로 응답 $HTTP_CODE. 계속 진행합니다."
fi

sleep 2
PROBE_CLIENT_IP="$(docker compose exec -T nginx sh -c "grep -a 'tunnel-probe' $ACCESS_LOG_PATH | tail -1" 2> /dev/null |
    sed -n 's/.*"client_ip":"\([^"]*\)".*/\1/p')"

if [ -z "$PROBE_CLIENT_IP" ]; then
    warn 'access log 에서 프로브 요청을 찾지 못했습니다. 수동으로 확인하세요.'
    exit 0
fi

EDGE_NETWORK="$(docker inspect "$CLOUDFLARED_CONTAINER" --format '{{range $name, $_ := .NetworkSettings.Networks}}{{$name}} {{end}}' | tr ' ' '\n' | grep -v '^$' | head -1)"
EDGE_GATEWAY_ADDRESS="$(docker network inspect "$EDGE_NETWORK" --format '{{range .IPAM.Config}}{{.Gateway}}{{end}}' 2> /dev/null)"

if [ -n "$EDGE_GATEWAY_ADDRESS" ] && [ "$PROBE_CLIENT_IP" = "$EDGE_GATEWAY_ADDRESS" ]; then
    fail "client_ip 가 여전히 게이트웨이($EDGE_GATEWAY_ADDRESS)입니다. 호스트 cloudflared 가 아직 붙어 있거나 real_ip 가 적용되지 않았습니다."
fi

if [ "$PROBE_CLIENT_IP" = "$ACTUAL_ADDRESS" ]; then
    fail "client_ip 가 cloudflared 주소($ACTUAL_ADDRESS)입니다. CF-Connecting-IP 헤더가 오지 않았습니다."
fi

ok "client_ip 가 실제 클라이언트 주소로 기록됩니다: $PROBE_CLIENT_IP"
info ''
info "${GREEN}${BOLD}완료${RESET} rate limit 이 클라이언트별로 동작하고, 토큰이 ps 에 노출되지 않습니다."
info '  로컬 접속(127.0.0.1)은 그대로 유지됩니다. 공개 노출 시 Cloudflare Access 를 앞에 두는 것을 권장합니다.'
