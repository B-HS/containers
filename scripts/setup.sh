#!/usr/bin/env bash
set -u

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE_FILE="$REPO_ROOT/compose.yaml"
OVERRIDE_FILE="$REPO_ROOT/compose.override.yaml"

DEFAULT_PANEL_BIND_ADDRESS=127.0.0.1
DEFAULT_PANEL_PORT=18080
DEFAULT_BACKUP_INTERVAL_HOURS=24
DEFAULT_BACKUP_RETENTION_COUNT=7
DEFAULT_TRAFFIC_RAW_RETENTION_DAYS=14
DEFAULT_DOCKER_GID=0
DOCKER_SOCKET_PATH=/var/run/docker.sock
MIN_FREE_DISK_GB=10
EXPECTED_HEALTHY_SERVICES=5
CURL_TIMEOUT_SECONDS=5
MIN_COMPOSE_MAJOR=2
MIN_COMPOSE_MINOR=24
SMOKE_SIGN_IN_PATH=/api/auth/sign-in/email
SMOKE_SIGN_IN_EMAIL=setup-smoke-check@invalid.localhost
SMOKE_SIGN_IN_PASSWORD=setup-smoke-check-invalid

if [ -t 1 ]; then
    BOLD="$(tput bold)"
    RED="$(tput setaf 1)"
    GREEN="$(tput setaf 2)"
    YELLOW="$(tput setaf 3)"
    CYAN="$(tput setaf 6)"
    DIM="$(tput dim)"
    RESET="$(tput sgr0)"
else
    BOLD="" RED="" GREEN="" YELLOW="" CYAN="" DIM="" RESET=""
fi

OS_NAME="$(uname -s)"
PANEL_BIND_ADDRESS="${PANEL_BIND_ADDRESS:-$DEFAULT_PANEL_BIND_ADDRESS}"
PANEL_PORT="${PANEL_PORT:-$DEFAULT_PANEL_PORT}"
PANEL_PUBLIC_ORIGIN="${PANEL_PUBLIC_ORIGIN:-}"
EXTRA_TRUSTED_ORIGINS="${EXTRA_TRUSTED_ORIGINS:-}"
BACKUP_INTERVAL_HOURS="${BACKUP_INTERVAL_HOURS:-$DEFAULT_BACKUP_INTERVAL_HOURS}"
BACKUP_RETENTION_COUNT="${BACKUP_RETENTION_COUNT:-$DEFAULT_BACKUP_RETENTION_COUNT}"
TRAFFIC_RAW_RETENTION_DAYS="${TRAFFIC_RAW_RETENTION_DAYS:-$DEFAULT_TRAFFIC_RAW_RETENTION_DAYS}"
DOCKER_GID="${DOCKER_GID:-$DEFAULT_DOCKER_GID}"
DOCKER_GID_FROM_ENV=0
[ -n "${DOCKER_GID:-}" ] && [ "$DOCKER_GID" != "$DEFAULT_DOCKER_GID" ] && DOCKER_GID_FROM_ENV=1
NON_INTERACTIVE=0
[ -t 0 ] || NON_INTERACTIVE=1
WRITE_OVERRIDE_REQUESTED=0
REPLACE_OVERRIDE=0
START_MODE=build
FAIL_COUNT=0
WARN_COUNT=0

usage() {
    cat <<'USAGE'
사용법: scripts/setup.sh [옵션]

옵션
  --non-interactive               질문 없이 기본값·플래그·환경변수로만 진행한다(stdin 이 TTY 가 아니면 자동 적용).
  --write-override                compose.override.yaml 을 생성한다.
  --replace-override              기존 override 를 .bak 으로 옮기고 새로 만든다(--write-override 포함).
  --start-mode <build|up|skip>    빌드·기동 방식. 기본 build.
  --bind-address <addr>           패널 바인딩 주소. 기본 127.0.0.1
  --port <port>                   패널 포트. 기본 18080
  --public-origin <origin>        패널 공개 origin(인증 origin 검사 기준).
  --trusted-origins <list>        추가 신뢰 origin(쉼표 구분).
  --backup-interval-hours <n>     백업 주기(시간).
  --backup-retention-count <n>    백업 보존 개수.
  --traffic-retention-days <n>    트래픽 원본 로그 보존 일수.
  --docker-gid <gid>              engine-agent 에 부여할 docker 소켓 그룹 GID(Linux).
  -h, --help                      이 도움말.

같은 이름의 환경변수(PANEL_BIND_ADDRESS·PANEL_PORT·PANEL_PUBLIC_ORIGIN·EXTRA_TRUSTED_ORIGINS·
BACKUP_INTERVAL_HOURS·BACKUP_RETENTION_COUNT·TRAFFIC_RAW_RETENTION_DAYS·DOCKER_GID)로도 값을 줄 수 있고,
플래그가 환경변수보다 우선한다.
USAGE
}

require_value() {
    if [ "$#" -lt 2 ] || [ -z "$2" ]; then
        printf '%s 옵션에 값이 필요합니다.\n' "$1" >&2
        exit 2
    fi
}

while [ "$#" -gt 0 ]; do
    case "$1" in
        --non-interactive) NON_INTERACTIVE=1 ;;
        --write-override) WRITE_OVERRIDE_REQUESTED=1 ;;
        --replace-override)
            WRITE_OVERRIDE_REQUESTED=1
            REPLACE_OVERRIDE=1
            ;;
        --start-mode)
            require_value "$1" "${2:-}"
            START_MODE="$2"
            shift
            ;;
        --bind-address)
            require_value "$1" "${2:-}"
            PANEL_BIND_ADDRESS="$2"
            shift
            ;;
        --port)
            require_value "$1" "${2:-}"
            PANEL_PORT="$2"
            shift
            ;;
        --public-origin)
            require_value "$1" "${2:-}"
            PANEL_PUBLIC_ORIGIN="$2"
            shift
            ;;
        --trusted-origins)
            require_value "$1" "${2:-}"
            EXTRA_TRUSTED_ORIGINS="$2"
            shift
            ;;
        --backup-interval-hours)
            require_value "$1" "${2:-}"
            BACKUP_INTERVAL_HOURS="$2"
            shift
            ;;
        --backup-retention-count)
            require_value "$1" "${2:-}"
            BACKUP_RETENTION_COUNT="$2"
            shift
            ;;
        --traffic-retention-days)
            require_value "$1" "${2:-}"
            TRAFFIC_RAW_RETENTION_DAYS="$2"
            shift
            ;;
        --docker-gid)
            require_value "$1" "${2:-}"
            DOCKER_GID="$2"
            DOCKER_GID_FROM_ENV=1
            shift
            ;;
        -h | --help)
            usage
            exit 0
            ;;
        *)
            printf '알 수 없는 옵션입니다: %s\n\n' "$1" >&2
            usage >&2
            exit 2
            ;;
    esac
    shift
done

case "$START_MODE" in
    build | up | skip) ;;
    *)
        printf '%s\n' "--start-mode 는 build|up|skip 중 하나여야 합니다: $START_MODE" >&2
        exit 2
        ;;
esac

section() {
    printf '\n%s%s[%s]%s %s%s%s\n' "$BOLD" "$CYAN" "$1" "$RESET" "$BOLD" "$2" "$RESET"
    printf '%s%s%s\n' "$DIM" "--------------------------------------------------------------" "$RESET"
}

ok() { printf '  %s[통과]%s %s\n' "$GREEN" "$RESET" "$1"; }
warn() {
    printf '  %s[주의]%s %s\n' "$YELLOW" "$RESET" "$1"
    WARN_COUNT=$((WARN_COUNT + 1))
}
fail() {
    printf '  %s[실패]%s %s\n' "$RED" "$RESET" "$1"
    FAIL_COUNT=$((FAIL_COUNT + 1))
}
info() { printf '  %s.%s %s\n' "$DIM" "$RESET" "$1"; }

ask() {
    local prompt="$1" default="$2" answer
    if [ "$NON_INTERACTIVE" -eq 1 ]; then
        printf '%s' "$default"
        return
    fi
    printf '  %s?%s %s %s[%s]%s ' "$BOLD" "$RESET" "$prompt" "$DIM" "$default" "$RESET" >&2
    read -r answer || { answer="" && printf '\n' >&2; }
    printf '%s' "${answer:-$default}"
}

ask_yn() {
    local prompt="$1" default="$2" answer
    while true; do
        answer="$(ask "$prompt (y/n)" "$default")"
        case "$answer" in
            y | Y) return 0 ;;
            n | N) return 1 ;;
            *) info "y 또는 n 으로 답해 주세요." ;;
        esac
    done
}

# 0.0.0.0 / :: 로 바인딩해도 로컬 스모크 테스트는 루프백으로 호출한다.
smoke_host() {
    case "$PANEL_BIND_ADDRESS" in
        0.0.0.0 | '') printf '127.0.0.1' ;;
        '::' | '[::]') printf '[::1]' ;;
        *) printf '%s' "$PANEL_BIND_ADDRESS" ;;
    esac
}

detect_docker_gid() {
    if [ "$OS_NAME" != "Linux" ]; then
        printf '%s' "$DEFAULT_DOCKER_GID"
        return
    fi
    local gid
    gid="$(stat -c '%g' "$DOCKER_SOCKET_PATH" 2>/dev/null || true)"
    printf '%s' "${gid:-$DEFAULT_DOCKER_GID}"
}

port_in_use() {
    local port="$1"
    if command -v lsof >/dev/null 2>&1; then
        lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
        return $?
    fi
    if command -v ss >/dev/null 2>&1; then
        ss -ltnH 2>/dev/null | awk '{ print $4 }' | grep -qE "[:.]${port}\$"
        return $?
    fi
    return 1
}

printf '\n%s%sContainers 패널 셋업%s\n' "$BOLD" "$CYAN" "$RESET"
printf '%s대상: %s%s\n' "$DIM" "$REPO_ROOT" "$RESET"
if [ "$NON_INTERACTIVE" -eq 1 ]; then
    printf '%s비대화식 모드: 질문 없이 기본값·플래그·환경변수로 진행합니다 (기동 방식 %s).%s\n' "$DIM" "$START_MODE" "$RESET"
fi

section "1/4" "사용 환경 확인"

case "$OS_NAME" in
    Darwin)
        ok "macOS $(sw_vers -productVersion 2>/dev/null || echo '?') ($(uname -m))"
        if [ "$(uname -m)" != "arm64" ]; then
            warn "Apple Silicon(arm64) 이 아닙니다. 프로젝트는 arm64 Docker Desktop 기준으로 운영됩니다."
        fi
        ;;
    Linux)
        ok "Linux ($(uname -m))"
        [ "$DOCKER_GID_FROM_ENV" -eq 1 ] || DOCKER_GID="$(detect_docker_gid)"
        if [ -S "$DOCKER_SOCKET_PATH" ] && [ "$DOCKER_GID" != "$DEFAULT_DOCKER_GID" ]; then
            ok "docker 소켓 그룹 GID $DOCKER_GID 탐지 ($DOCKER_SOCKET_PATH)"
        elif [ -S "$DOCKER_SOCKET_PATH" ]; then
            warn "docker 소켓 그룹이 root(0) 입니다. engine-agent 가 소켓에 접근하려면 root 권한이 필요합니다."
        else
            fail "$DOCKER_SOCKET_PATH 소켓이 없습니다. rootful Docker Engine 이 필요합니다(rootless 는 소켓 경로가 다릅니다)."
        fi
        ;;
    *)
        fail "지원하지 않는 OS 입니다: $OS_NAME. macOS(Docker Desktop) 또는 Linux(Docker Engine) 를 사용하세요."
        ;;
esac

if command -v docker >/dev/null 2>&1; then
    ok "docker CLI: $(docker --version | head -1)"
else
    fail "docker CLI 가 없습니다. macOS 는 Docker Desktop, Linux 는 Docker Engine 을 설치하세요."
fi

if docker info >/dev/null 2>&1; then
    ok "Docker daemon 실행 중"
else
    fail "Docker daemon 에 연결할 수 없습니다. Docker 를 실행한 뒤 다시 시도하세요."
fi

if docker compose version >/dev/null 2>&1; then
    COMPOSE_VERSION_RAW="$(docker compose version --short 2>/dev/null || echo 0.0.0)"
    COMPOSE_MAJOR="$(printf '%s' "$COMPOSE_VERSION_RAW" | sed 's/^v//' | cut -d. -f1)"
    COMPOSE_MINOR="$(printf '%s' "$COMPOSE_VERSION_RAW" | sed 's/^v//' | cut -d. -f2)"
    if [ "${COMPOSE_MAJOR:-0}" -gt "$MIN_COMPOSE_MAJOR" ] 2>/dev/null ||
        { [ "${COMPOSE_MAJOR:-0}" -eq "$MIN_COMPOSE_MAJOR" ] && [ "${COMPOSE_MINOR:-0}" -ge "$MIN_COMPOSE_MINOR" ]; } 2>/dev/null; then
        ok "docker compose v$COMPOSE_VERSION_RAW"
    else
        warn "docker compose v$COMPOSE_VERSION_RAW — v$MIN_COMPOSE_MAJOR.$MIN_COMPOSE_MINOR 이상을 권장합니다(override 병합 문법)."
    fi
else
    fail "docker compose plugin 이 없습니다. Compose v$MIN_COMPOSE_MAJOR.$MIN_COMPOSE_MINOR 이상을 설치하세요."
fi

if command -v curl >/dev/null 2>&1; then
    ok "curl 사용 가능"
else
    fail "curl 이 없습니다(스모크 테스트에 필요)."
fi

FREE_DISK_GB="$(df -Pk "$REPO_ROOT" 2>/dev/null | awk 'NR==2 { print int($4 / 1048576) }')"
if [ "${FREE_DISK_GB:-0}" -ge "$MIN_FREE_DISK_GB" ] 2>/dev/null; then
    ok "여유 디스크 ${FREE_DISK_GB}GB (최소 ${MIN_FREE_DISK_GB}GB)"
else
    warn "여유 디스크 ${FREE_DISK_GB:-?}GB — 이미지 빌드·업로드 볼륨에 ${MIN_FREE_DISK_GB}GB 이상을 권장합니다."
fi

if [ "$FAIL_COUNT" -gt 0 ]; then
    printf '\n%s환경 확인 실패 %d건 — 위 항목을 해결한 뒤 다시 실행하세요.%s\n' "$RED" "$FAIL_COUNT" "$RESET"
    exit 1
fi

section "2/4" "준비 파일 확인"

if [ -f "$COMPOSE_FILE" ]; then
    ok "compose.yaml 존재"
else
    fail "compose.yaml 이 없습니다: $COMPOSE_FILE"
    exit 1
fi

for dockerfile in apps/api/Dockerfile apps/web/Dockerfile apps/engine-agent/Dockerfile apps/traffic-worker/Dockerfile infra/nginx/Dockerfile; do
    if [ -f "$REPO_ROOT/$dockerfile" ]; then
        ok "$dockerfile 존재"
    else
        fail "$dockerfile 이 없습니다."
    fi
done

info "이 프로젝트는 .env 를 사용하지 않습니다. 시크릿(auth·agent·notification 키)은 첫 부팅 시 Docker 볼륨 안에서 자동 생성됩니다."
info "커스터마이즈는 compose.override.yaml 로 합니다."

WRITE_OVERRIDE=1

if [ -f "$OVERRIDE_FILE" ]; then
    warn "기존 compose.override.yaml 이 있습니다."
    if ask_yn "기존 override 를 유지할까요?" "$([ "$REPLACE_OVERRIDE" -eq 1 ] && printf n || printf y)"; then
        WRITE_OVERRIDE=0
        EXISTING_PORTS_LINE="$(sed -n 's/^[[:space:]]*-[[:space:]]*\([^:]*\):\([0-9][0-9]*\):8080[[:space:]]*$/\1 \2/p' "$OVERRIDE_FILE" | head -1)"
        if [ -n "$EXISTING_PORTS_LINE" ]; then
            PANEL_BIND_ADDRESS="$(printf '%s' "$EXISTING_PORTS_LINE" | awk '{ print $1 }')"
            PANEL_PORT="$(printf '%s' "$EXISTING_PORTS_LINE" | awk '{ print $2 }')"
        fi
        EXISTING_ORIGIN="$(sed -n 's/^[[:space:]]*PANEL_PUBLIC_URL:[[:space:]]*//p' "$OVERRIDE_FILE" | head -1)"
        PANEL_PUBLIC_ORIGIN="${EXISTING_ORIGIN:-http://$PANEL_BIND_ADDRESS:$PANEL_PORT}"
        ok "기존 override 유지 (바인딩 $PANEL_BIND_ADDRESS:$PANEL_PORT, 공개 origin $PANEL_PUBLIC_ORIGIN)"
    else
        mv "$OVERRIDE_FILE" "$OVERRIDE_FILE.bak"
        ok "기존 override 를 compose.override.yaml.bak 으로 백업 후 제외"
    fi
fi

if [ "$WRITE_OVERRIDE" -eq 1 ] && ask_yn "기본값을 바꿔 compose.override.yaml 을 생성할까요? (아니면 기본값 그대로 진행)" "$([ "$WRITE_OVERRIDE_REQUESTED" -eq 1 ] && printf y || printf n)"; then
    PANEL_BIND_ADDRESS="$(ask "패널 바인딩 주소 (외부 공개 시 0.0.0.0)" "$PANEL_BIND_ADDRESS")"
    PANEL_PORT="$(ask "패널 포트" "$PANEL_PORT")"
    PANEL_PUBLIC_ORIGIN="$(ask "패널 공개 origin (브라우저 주소창 기준, 인증 origin 검사에 사용)" "${PANEL_PUBLIC_ORIGIN:-http://$(smoke_host):$PANEL_PORT}")"
    EXTRA_TRUSTED_ORIGINS="$(ask "추가 신뢰 origin (쉼표 구분, 없으면 비워 두기)" "$EXTRA_TRUSTED_ORIGINS")"
    BACKUP_INTERVAL_HOURS="$(ask "백업 주기(시간, 1-168)" "$BACKUP_INTERVAL_HOURS")"
    BACKUP_RETENTION_COUNT="$(ask "백업 보존 개수(2-90)" "$BACKUP_RETENTION_COUNT")"
    TRAFFIC_RAW_RETENTION_DAYS="$(ask "트래픽 원본 로그 보존 일수" "$TRAFFIC_RAW_RETENTION_DAYS")"

    TRUSTED_ORIGINS="$PANEL_PUBLIC_ORIGIN"
    if [ -n "$EXTRA_TRUSTED_ORIGINS" ]; then
        TRUSTED_ORIGINS="$TRUSTED_ORIGINS,$EXTRA_TRUSTED_ORIGINS"
    fi

    cat >"$OVERRIDE_FILE" <<OVERRIDE
services:
    nginx:
        ports: !override
            - $PANEL_BIND_ADDRESS:$PANEL_PORT:8080
    api:
        environment:
            AUTH_BASE_URL: $PANEL_PUBLIC_ORIGIN
            AUTH_TRUSTED_ORIGINS: $TRUSTED_ORIGINS
            PANEL_PUBLIC_URL: $PANEL_PUBLIC_ORIGIN
            BACKUP_INTERVAL_HOURS: $BACKUP_INTERVAL_HOURS
            BACKUP_RETENTION_COUNT: $BACKUP_RETENTION_COUNT
    engine-agent:
        group_add: !override
            - '$DOCKER_GID'
    traffic-worker:
        environment:
            TRAFFIC_RAW_RETENTION_DAYS: $TRAFFIC_RAW_RETENTION_DAYS
OVERRIDE
    ok "compose.override.yaml 생성 완료 (공개 origin $PANEL_PUBLIC_ORIGIN, docker GID $DOCKER_GID)"
fi

if [ -z "$PANEL_PUBLIC_ORIGIN" ]; then
    PANEL_PUBLIC_ORIGIN="http://$(smoke_host):$PANEL_PORT"
fi

if port_in_use "$PANEL_PORT"; then
    if docker compose -f "$COMPOSE_FILE" ps --status running 2>/dev/null | grep -q nginx; then
        info "포트 $PANEL_PORT 는 이 프로젝트의 nginx 가 이미 사용 중입니다(재기동 시 문제 없음)."
    else
        fail "포트 $PANEL_PORT 를 다른 프로세스가 사용 중입니다. 포트를 바꾸거나 해당 프로세스를 종료하세요."
        exit 1
    fi
else
    ok "포트 $PANEL_PORT 사용 가능"
fi

cd "$REPO_ROOT" || exit 1

if ! docker compose config --quiet 2>/dev/null; then
    fail "compose 설정 검증에 실패했습니다. docker compose config 출력을 확인하세요."
    exit 1
fi
ok "compose 설정 검증 통과"

section "3/4" "빌드·기동"

case "$START_MODE" in
    build) START_CHOICE_DEFAULT=1 ;;
    up) START_CHOICE_DEFAULT=2 ;;
    *) START_CHOICE_DEFAULT=3 ;;
esac

printf '  %s1%s) 이미지 빌드 후 기동 (docker compose build && up -d --wait)\n' "$BOLD" "$RESET"
printf '  %s2%s) 빌드 없이 기동 (docker compose up -d --wait)\n' "$BOLD" "$RESET"
printf '  %s3%s) 건너뛰기 (수동으로 실행)\n' "$BOLD" "$RESET"
UP_CHOICE="$(ask "선택" "$START_CHOICE_DEFAULT")"

case "$UP_CHOICE" in
    1)
        printf '\n'
        if ! docker compose build; then
            fail "이미지 빌드 실패 — 로그를 확인하세요."
            exit 1
        fi
        if ! docker compose up -d --wait; then
            fail "기동 실패 — docker compose logs 로 원인을 확인하세요."
            exit 1
        fi
        ok "빌드·기동 완료"
        ;;
    2)
        printf '\n'
        if ! docker compose up -d --wait; then
            fail "기동 실패 — docker compose logs 로 원인을 확인하세요."
            exit 1
        fi
        ok "기동 완료"
        ;;
    *)
        info "기동을 건너뜁니다. 수동 실행: docker compose build && docker compose up -d --wait"
        printf '\n%s셋업을 종료합니다(스모크 테스트 생략).%s\n' "$DIM" "$RESET"
        exit 0
        ;;
esac

section "4/4" "스모크 테스트"

SMOKE_BASE_URL="http://$(smoke_host):$PANEL_PORT"

HEALTHY_COUNT="$(docker compose ps | grep -c '(healthy)' || true)"
if [ "$HEALTHY_COUNT" -eq "$EXPECTED_HEALTHY_SERVICES" ]; then
    ok "서비스 healthy $HEALTHY_COUNT/$EXPECTED_HEALTHY_SERVICES"
else
    fail "healthy 서비스 $HEALTHY_COUNT/$EXPECTED_HEALTHY_SERVICES — docker compose ps 로 상태를 확인하세요."
fi

API_HEALTH_BODY="$(curl -fsS --max-time "$CURL_TIMEOUT_SECONDS" "$SMOKE_BASE_URL/api/health" 2>/dev/null || true)"
if printf '%s' "$API_HEALTH_BODY" | grep -q '"success":true'; then
    ok "API health 응답 정상 (/api/health)"
else
    fail "API health 응답 비정상: ${API_HEALTH_BODY:-응답 없음}"
fi

WEB_STATUS="$(curl -fsS --max-time "$CURL_TIMEOUT_SECONDS" -o /dev/null -w '%{http_code}' "$SMOKE_BASE_URL/ko" 2>/dev/null || echo 000)"
if [ "$WEB_STATUS" = "200" ]; then
    ok "Web 패널 응답 200 (/ko)"
else
    fail "Web 패널 응답 비정상 (HTTP $WEB_STATUS)"
fi

UNAUTH_STATUS="$(curl -s --max-time "$CURL_TIMEOUT_SECONDS" -o /dev/null -w '%{http_code}' "$SMOKE_BASE_URL/api/control-plane/status" 2>/dev/null || echo 000)"
if [ "$UNAUTH_STATUS" = "401" ]; then
    ok "미인증 API 차단 확인 (401)"
else
    warn "미인증 control-plane 응답이 401 이 아닙니다 (HTTP $UNAUTH_STATUS)."
fi

# 공개 origin 이 신뢰 목록에 없으면 여기서 403 INVALID_ORIGIN 으로 드러난다.
SIGN_IN_STATUS="$(curl -s --max-time "$CURL_TIMEOUT_SECONDS" -o /dev/null -w '%{http_code}' \
    -X POST -H 'Content-Type: application/json' -H "Origin: $PANEL_PUBLIC_ORIGIN" \
    -d "{\"email\":\"$SMOKE_SIGN_IN_EMAIL\",\"password\":\"$SMOKE_SIGN_IN_PASSWORD\"}" \
    "$SMOKE_BASE_URL$SMOKE_SIGN_IN_PATH" 2>/dev/null || echo 000)"
case "$SIGN_IN_STATUS" in
    401 | 400 | 422)
        ok "인증 origin 검사 통과 ($PANEL_PUBLIC_ORIGIN → HTTP $SIGN_IN_STATUS)"
        ;;
    403)
        fail "공개 origin 이 신뢰 목록에 없습니다 (403 INVALID_ORIGIN). compose.override.yaml 의 AUTH_TRUSTED_ORIGINS 에 $PANEL_PUBLIC_ORIGIN 을 추가하세요."
        ;;
    429)
        warn "sign-in rate limit 에 걸려 origin 검사를 확인하지 못했습니다 (429). 1분 뒤 다시 시도하세요."
        ;;
    *)
        fail "sign-in 응답이 예상 밖입니다 (HTTP $SIGN_IN_STATUS)."
        ;;
esac

printf '\n%s%s결과%s\n' "$BOLD" "$CYAN" "$RESET"
if [ "$FAIL_COUNT" -eq 0 ]; then
    printf '%s셋업 완료. 패널: %s (주의 %d건)%s\n\n' "$GREEN" "$PANEL_PUBLIC_ORIGIN" "$WARN_COUNT" "$RESET"
else
    printf '%s실패 %d건 / 주의 %d건 — 위 로그를 확인하세요.%s\n\n' "$RED" "$FAIL_COUNT" "$WARN_COUNT" "$RESET"
    exit 1
fi
