#!/usr/bin/env bash
set -u

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE_FILE="$REPO_ROOT/compose.yaml"
OVERRIDE_FILE="$REPO_ROOT/compose.override.yaml"

DEFAULT_PANEL_PORT=8080
DEFAULT_BACKUP_INTERVAL_HOURS=24
DEFAULT_BACKUP_RETENTION_COUNT=7
DEFAULT_TRAFFIC_RAW_RETENTION_DAYS=14
MIN_FREE_DISK_GB=10
EXPECTED_HEALTHY_SERVICES=5
CURL_TIMEOUT_SECONDS=5
MIN_COMPOSE_MAJOR=2
MIN_COMPOSE_MINOR=24

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

PANEL_PORT=$DEFAULT_PANEL_PORT
FAIL_COUNT=0
WARN_COUNT=0

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

printf '\n%s%sContainers 패널 macOS 셋업%s\n' "$BOLD" "$CYAN" "$RESET"
printf '%s대상: %s%s\n' "$DIM" "$REPO_ROOT" "$RESET"

section "1/4" "사용 환경 확인"

if [ "$(uname -s)" = "Darwin" ]; then
    ok "macOS $(sw_vers -productVersion 2>/dev/null || echo '?') ($(uname -m))"
else
    fail "macOS 가 아닙니다: $(uname -s). 이 스크립트는 macOS 전용입니다."
fi

if [ "$(uname -m)" != "arm64" ]; then
    warn "Apple Silicon(arm64) 이 아닙니다. 프로젝트는 arm64 Docker Desktop 기준으로 운영됩니다."
fi

if command -v docker >/dev/null 2>&1; then
    ok "docker CLI: $(docker --version | head -1)"
else
    fail "docker CLI 가 없습니다. Docker Desktop 을 설치하세요: https://www.docker.com/products/docker-desktop/"
fi

if docker info >/dev/null 2>&1; then
    ok "Docker daemon 실행 중"
else
    fail "Docker daemon 에 연결할 수 없습니다. Docker Desktop 을 실행한 뒤 다시 시도하세요."
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
    fail "docker compose plugin 이 없습니다. Docker Desktop 을 최신으로 업데이트하세요."
fi

if command -v curl >/dev/null 2>&1; then
    ok "curl 사용 가능"
else
    fail "curl 이 없습니다(스모크 테스트에 필요)."
fi

FREE_DISK_GB="$(df -g "$REPO_ROOT" | awk 'NR==2 { print $4 }')"
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

if [ -f "$OVERRIDE_FILE" ]; then
    warn "기존 compose.override.yaml 이 있습니다."
    if ask_yn "기존 override 를 유지할까요?" "y"; then
        EXISTING_PORT="$(sed -n 's/.*127\.0\.0\.1:\([0-9]*\):8080.*/\1/p' "$OVERRIDE_FILE" | head -1)"
        PANEL_PORT="${EXISTING_PORT:-$DEFAULT_PANEL_PORT}"
        ok "기존 override 유지 (패널 포트 $PANEL_PORT)"
    else
        mv "$OVERRIDE_FILE" "$OVERRIDE_FILE.bak"
        ok "기존 override 를 compose.override.yaml.bak 으로 백업 후 제외"
    fi
fi

if [ ! -f "$OVERRIDE_FILE" ] && ask_yn "기본값을 바꿔 compose.override.yaml 을 생성할까요? (아니면 기본값 그대로 진행)" "n"; then
    PANEL_PORT="$(ask "패널 포트 (127.0.0.1 바인딩)" "$DEFAULT_PANEL_PORT")"
    BACKUP_INTERVAL_HOURS="$(ask "백업 주기(시간, 1-168)" "$DEFAULT_BACKUP_INTERVAL_HOURS")"
    BACKUP_RETENTION_COUNT="$(ask "백업 보존 개수(2-90)" "$DEFAULT_BACKUP_RETENTION_COUNT")"
    TRAFFIC_RAW_RETENTION_DAYS="$(ask "트래픽 원본 로그 보존 일수" "$DEFAULT_TRAFFIC_RAW_RETENTION_DAYS")"
    cat >"$OVERRIDE_FILE" <<OVERRIDE
services:
    nginx:
        ports: !override
            - 127.0.0.1:$PANEL_PORT:8080
    api:
        environment:
            BACKUP_INTERVAL_HOURS: $BACKUP_INTERVAL_HOURS
            BACKUP_RETENTION_COUNT: $BACKUP_RETENTION_COUNT
    traffic-worker:
        environment:
            TRAFFIC_RAW_RETENTION_DAYS: $TRAFFIC_RAW_RETENTION_DAYS
OVERRIDE
    ok "compose.override.yaml 생성 완료"
fi

if lsof -nP -iTCP:"$PANEL_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    if docker compose -f "$COMPOSE_FILE" ps --status running 2>/dev/null | grep -q nginx; then
        info "포트 $PANEL_PORT 는 이 프로젝트의 nginx 가 이미 사용 중입니다(재기동 시 문제 없음)."
    else
        fail "포트 $PANEL_PORT 를 다른 프로세스가 사용 중입니다. 포트를 바꾸거나 해당 프로세스를 종료하세요."
        exit 1
    fi
else
    ok "포트 $PANEL_PORT 사용 가능"
fi

if ! docker compose -f "$COMPOSE_FILE" config --quiet 2>/dev/null; then
    fail "compose 설정 검증에 실패했습니다. docker compose config 출력을 확인하세요."
    exit 1
fi
ok "compose 설정 검증 통과"

section "3/4" "빌드·기동"

printf '  %s1%s) 이미지 빌드 후 기동 (docker compose build && up -d --wait)\n' "$BOLD" "$RESET"
printf '  %s2%s) 빌드 없이 기동 (docker compose up -d --wait)\n' "$BOLD" "$RESET"
printf '  %s3%s) 건너뛰기 (수동으로 실행)\n' "$BOLD" "$RESET"
UP_CHOICE="$(ask "선택" "1")"

cd "$REPO_ROOT" || exit 1
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

HEALTHY_COUNT="$(docker compose ps | grep -c '(healthy)' || true)"
if [ "$HEALTHY_COUNT" -eq "$EXPECTED_HEALTHY_SERVICES" ]; then
    ok "서비스 healthy $HEALTHY_COUNT/$EXPECTED_HEALTHY_SERVICES"
else
    fail "healthy 서비스 $HEALTHY_COUNT/$EXPECTED_HEALTHY_SERVICES — docker compose ps 로 상태를 확인하세요."
fi

API_HEALTH_BODY="$(curl -fsS --max-time "$CURL_TIMEOUT_SECONDS" "http://127.0.0.1:$PANEL_PORT/api/health" 2>/dev/null || true)"
if printf '%s' "$API_HEALTH_BODY" | grep -q '"success":true'; then
    ok "API health 응답 정상 (/api/health)"
else
    fail "API health 응답 비정상: ${API_HEALTH_BODY:-응답 없음}"
fi

WEB_STATUS="$(curl -fsS --max-time "$CURL_TIMEOUT_SECONDS" -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PANEL_PORT/ko" 2>/dev/null || echo 000)"
if [ "$WEB_STATUS" = "200" ]; then
    ok "Web 패널 응답 200 (/ko)"
else
    fail "Web 패널 응답 비정상 (HTTP $WEB_STATUS)"
fi

UNAUTH_STATUS="$(curl -s --max-time "$CURL_TIMEOUT_SECONDS" -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PANEL_PORT/api/control-plane/status" 2>/dev/null || echo 000)"
if [ "$UNAUTH_STATUS" = "401" ]; then
    ok "미인증 API 차단 확인 (401)"
else
    warn "미인증 control-plane 응답이 401 이 아닙니다 (HTTP $UNAUTH_STATUS)."
fi

printf '\n%s%s결과%s\n' "$BOLD" "$CYAN" "$RESET"
if [ "$FAIL_COUNT" -eq 0 ]; then
    printf '%s셋업 완료. 패널: http://127.0.0.1:%s (주의 %d건)%s\n\n' "$GREEN" "$PANEL_PORT" "$WARN_COUNT" "$RESET"
else
    printf '%s실패 %d건 / 주의 %d건 — 위 로그를 확인하세요.%s\n\n' "$RED" "$FAIL_COUNT" "$WARN_COUNT" "$RESET"
    exit 1
fi
