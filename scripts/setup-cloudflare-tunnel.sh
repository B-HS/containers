#!/usr/bin/env bash
set -u

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE_FILE="$REPO_ROOT/compose.yaml"
OVERRIDE_FILE="$REPO_ROOT/compose.override.yaml"

CLOUDFLARED_DIR="${CLOUDFLARED_DIR:-$HOME/.cloudflared}"
CONFIG_FILE="$CLOUDFLARED_DIR/config.yml"
ORIGIN_CERT="$CLOUDFLARED_DIR/cert.pem"
LAUNCH_DAEMON_PLIST=/Library/LaunchDaemons/com.cloudflare.cloudflared.plist
TUNNEL_DOMAIN_SUFFIX=cfargotunnel.com
CURL_TIMEOUT_SECONDS=15
DNS_PROPAGATION_WAIT_SECONDS=5

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

step() { printf '\n%s==>%s %s%s%s\n' "$CYAN" "$RESET" "$BOLD" "$1" "$RESET"; }
info() { printf '  %s\n' "$1"; }
ok() { printf '  %s✓%s %s\n' "$GREEN" "$RESET" "$1"; }
warn() { printf '  %s!%s %s\n' "$YELLOW" "$RESET" "$1"; }
fail() {
    printf '  %s✗%s %s\n' "$RED" "$RESET" "$1" >&2
    exit 1
}

ask() {
    local prompt="$1" default="$2" answer
    printf '  %s?%s %s %s[%s]%s ' "$BOLD" "$RESET" "$prompt" "$DIM" "$default" "$RESET" >&2
    read -r answer || { answer="" && printf '\n' >&2; }
    printf '%s' "${answer:-$default}"
}

ask_required() {
    local prompt="$1" answer
    while true; do
        printf '  %s?%s %s ' "$BOLD" "$RESET" "$prompt" >&2
        read -r answer || { answer="" && printf '\n' >&2; }
        [ -n "$answer" ] && {
            printf '%s' "$answer"
            return
        }
        info "값이 필요합니다."
    done
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

read_compose_value() {
    local key="$1" default="$2" value=""
    if [ -f "$OVERRIDE_FILE" ]; then
        value="$(sed -n "s/^[[:space:]]*${key}:[[:space:]]*//p" "$OVERRIDE_FILE" | head -1)"
    fi
    printf '%s' "${value:-$default}"
}

detect_panel_origin() {
    local address port published
    published="$(sed -n 's/^[[:space:]]*- \${PANEL_BIND_ADDRESS:-\([^}]*\)}:\${PANEL_PORT:-\([^}]*\)}:.*/\1 \2/p' "$COMPOSE_FILE" | head -1)"
    address="${published% *}"
    port="${published#* }"
    [ -n "$address" ] && [ -n "$port" ] || fail "compose.yaml 에서 패널 publish 주소를 읽지 못했습니다."
    address="$(read_compose_value PANEL_BIND_ADDRESS "$address")"
    port="$(read_compose_value PANEL_PORT "$port")"
    printf 'http://%s:%s' "$address" "$port"
}

step '0/8 먼저 확인할 것'

info "대시보드로도 와일드카드를 넣을 수 있습니다. 이미 터널이 있다면 이 방법이 더 빠릅니다."
info "  Zero Trust > Networks > Tunnels > 터널 > Public Hostname > Add"
info "  Subdomain: *          (호스트명 전체가 아니라 서브도메인 칸에 * 하나만)"
info "  Domain:    드롭다운에서 선택"
info "  Type/URL:  HTTP / 127.0.0.1:<패널 포트>"
info ""
info "이 스크립트는 로컬 config.yml 로 관리하는 방식으로 구성합니다."
info "토큰이 명령줄에서 사라지고 ingress 규칙을 파일로 버전 관리할 수 있습니다."

ask_yn "계속할까요" y || exit 0

step '1/8 사전 확인'

command -v cloudflared >/dev/null 2>&1 || fail "cloudflared 가 없습니다. 'brew install cloudflared' 후 다시 실행하세요."
ok "cloudflared $(cloudflared --version 2>/dev/null | head -1)"

PANEL_ORIGIN="$(detect_panel_origin)"
ok "패널 로컬 주소: $PANEL_ORIGIN (compose 설정에서 유도)"

if ! curl -fsS -m "$CURL_TIMEOUT_SECONDS" -o /dev/null "$PANEL_ORIGIN/api/health"; then
    warn "$PANEL_ORIGIN 에서 응답이 없습니다. 스택이 떠 있지 않아도 설정은 계속할 수 있습니다."
fi

RUNNING_TOKEN_TUNNEL="$(pgrep -af 'cloudflared.*--token' 2>/dev/null | head -1 || true)"
if [ -n "$RUNNING_TOKEN_TUNNEL" ]; then
    warn "토큰(remote-managed) 방식 cloudflared 가 실행 중입니다."
    info "대시보드 Public Hostname 은 와일드카드를 지원하지 않아 이 스크립트는 로컬 config 방식으로 바꿉니다."
    ask_yn "기존 토큰 프로세스를 지금 종료할까요" y && {
        pkill -f 'cloudflared.*--token' 2>/dev/null || true
        sleep 1
        ok "토큰 프로세스를 종료했습니다."
    }
fi

step '2/8 Cloudflare 인증'

if [ -f "$ORIGIN_CERT" ]; then
    ok "origin 인증서가 이미 있습니다: $ORIGIN_CERT"
else
    info "브라우저가 열립니다. 사용할 도메인(zone)을 선택하세요."
    cloudflared tunnel login || fail "cloudflared tunnel login 실패"
    [ -f "$ORIGIN_CERT" ] || fail "$ORIGIN_CERT 가 만들어지지 않았습니다."
    ok "인증 완료"
fi

step '3/8 터널 선택'

info "현재 터널 목록:"
cloudflared tunnel list 2>/dev/null | sed 's/^/    /' || true

TUNNEL_NAME="$(ask '사용할 터널 이름' 'containers')"
TUNNEL_ID="$(cloudflared tunnel list --output json 2>/dev/null | python3 -c "
import json, sys
name = sys.argv[1]
try:
    tunnels = json.load(sys.stdin)
except Exception:
    tunnels = []
print(next((t['id'] for t in tunnels if t.get('name') == name and not t.get('deleted_at')), ''))
" "$TUNNEL_NAME")"

if [ -z "$TUNNEL_ID" ]; then
    info "'$TUNNEL_NAME' 터널이 없어 새로 만듭니다."
    cloudflared tunnel create "$TUNNEL_NAME" || fail "터널 생성 실패"
    TUNNEL_ID="$(cloudflared tunnel list --output json 2>/dev/null | python3 -c "
import json, sys
name = sys.argv[1]
print(next((t['id'] for t in json.load(sys.stdin) if t.get('name') == name and not t.get('deleted_at')), ''))
" "$TUNNEL_NAME")"
fi

[ -n "$TUNNEL_ID" ] || fail "터널 ID 를 확인하지 못했습니다."
ok "터널: $TUNNEL_NAME ($TUNNEL_ID)"

CREDENTIALS_FILE="$CLOUDFLARED_DIR/$TUNNEL_ID.json"
[ -f "$CREDENTIALS_FILE" ] || fail "자격증명 파일이 없습니다: $CREDENTIALS_FILE"

step '4/8 도메인과 ingress 규칙'

BASE_DOMAIN="$(ask_required '도메인 (예: example.com)')"
ORIGIN_SERVICE="$(ask '터널이 넘길 로컬 주소' "$PANEL_ORIGIN")"

info "와일드카드 규칙 하나로 모든 서브도메인이 패널 nginx 까지 도달합니다."
info "실제로 어떤 호스트를 열지는 패널의 라우트 목록이 결정하고, 등록되지 않은 host 는 nginx 가 444 로 끊습니다."

INCLUDE_APEX=1
ask_yn "apex($BASE_DOMAIN)도 같은 서비스로 보낼까요" y || INCLUDE_APEX=0

if [ -f "$CONFIG_FILE" ]; then
    BACKUP_FILE="$CONFIG_FILE.bak.$(date +%Y%m%d%H%M%S)"
    cp "$CONFIG_FILE" "$BACKUP_FILE"
    ok "기존 설정 백업: $BACKUP_FILE"
fi

{
    printf 'tunnel: %s\n' "$TUNNEL_ID"
    printf 'credentials-file: %s\n\n' "$CREDENTIALS_FILE"
    printf 'ingress:\n'
    printf '  - hostname: "*.%s"\n' "$BASE_DOMAIN"
    printf '    service: %s\n' "$ORIGIN_SERVICE"
    if [ "$INCLUDE_APEX" -eq 1 ]; then
        printf '  - hostname: "%s"\n' "$BASE_DOMAIN"
        printf '    service: %s\n' "$ORIGIN_SERVICE"
    fi
    printf '  - service: http_status:404\n'
} >"$CONFIG_FILE"

ok "설정 작성: $CONFIG_FILE"
sed 's/^/    /' "$CONFIG_FILE"

step '5/8 설정 검증'

cloudflared tunnel ingress validate || fail "ingress 검증 실패"
ok "ingress 규칙 유효"

for probe in "https://a.$BASE_DOMAIN" "https://$BASE_DOMAIN"; do
    printf '  %s\n' "$probe"
    cloudflared tunnel ingress rule "$probe" 2>/dev/null | sed 's/^/    /'
done

step '6/8 DNS 레코드'

info "와일드카드 CNAME 은 cloudflared tunnel route dns 로 만들 수 없습니다. 대시보드에서 직접 추가합니다."
info "  Type:   CNAME"
info "  Name:   *"
info "  Target: $TUNNEL_ID.$TUNNEL_DOMAIN_SUFFIX"
info "  Proxy:  Proxied (주황 구름)"

if [ "$INCLUDE_APEX" -eq 1 ]; then
    if ask_yn "apex($BASE_DOMAIN) 레코드는 cloudflared 로 만들까요" y; then
        cloudflared tunnel route dns "$TUNNEL_NAME" "$BASE_DOMAIN" 2>&1 | sed 's/^/    /' || warn "apex 레코드 생성 실패 — 대시보드에서 직접 만드세요."
    fi
fi

info ""
info "이미 다른 터널을 가리키는 * 레코드가 있으면 Target 을 위 값으로 바꿔야 합니다."
if command -v dig >/dev/null 2>&1; then
    CURRENT_TARGET="$(dig +short CNAME "probe-$$.$BASE_DOMAIN" 2>/dev/null | head -1)"
    [ -n "$CURRENT_TARGET" ] && info "현재 와일드카드 대상: $CURRENT_TARGET"
fi

step '7/8 실행'

info "포그라운드로 확인하려면: cloudflared tunnel --config $CONFIG_FILE run $TUNNEL_NAME"

info "연결 로그를 보려면: cloudflared tail $TUNNEL_ID"

if [ "$(uname -s)" = "Darwin" ] && ask_yn "부팅 시 자동 실행되도록 service 로 설치할까요" n; then
    sudo cloudflared service install || warn "service install 실패"
    if [ -f "$LAUNCH_DAEMON_PLIST" ] && ! grep -q '<string>run</string>' "$LAUNCH_DAEMON_PLIST"; then
        warn "생성된 LaunchDaemon 의 ProgramArguments 에 'tunnel run' 이 빠져 있습니다."
        info "$LAUNCH_DAEMON_PLIST 를 열어 아래처럼 고칩니다."
        printf '    <array>\n'
        printf '        <string>/usr/local/bin/cloudflared</string>\n'
        printf '        <string>tunnel</string>\n'
        printf '        <string>run</string>\n'
        printf '    </array>\n'
        info "고친 뒤 다시 읽힙니다."
        printf '    sudo launchctl bootout system %s\n' "$LAUNCH_DAEMON_PLIST"
        printf '    sudo launchctl bootstrap system %s\n' "$LAUNCH_DAEMON_PLIST"
    else
        ok "service 설치 완료"
    fi
fi

step '8/8 다음 단계'

info "1. 터널을 실행한 뒤 https://$BASE_DOMAIN 이 열리는지 확인합니다."
info "2. 패널 '신뢰 프록시' 화면에서 터널이 들어온 주소를 승인합니다."
info "3. 패널 '공개 주소' 화면에서 https://$BASE_DOMAIN 을 저장합니다."
info "4. 서브도메인은 패널 'Nginx 라우트'에서 추가합니다. 등록하지 않은 host 는 444 로 끊깁니다."
info ""
info "최초 owner 계정이 아직 없다면 $PANEL_ORIGIN 에서 먼저 만드세요. 공개 주소에서는 거부됩니다."

DNS_CHECK_HOST="a.$BASE_DOMAIN"
if command -v dig >/dev/null 2>&1; then
    sleep "$DNS_PROPAGATION_WAIT_SECONDS"
    if [ -n "$(dig +short "$DNS_CHECK_HOST" 2>/dev/null)" ]; then
        ok "$DNS_CHECK_HOST DNS 해석 확인"
    else
        warn "$DNS_CHECK_HOST 가 아직 해석되지 않습니다. 전파에 시간이 걸릴 수 있습니다."
    fi
fi
