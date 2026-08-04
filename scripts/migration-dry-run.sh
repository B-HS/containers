#!/usr/bin/env bash
# Compares the migration files of the checked-out code with the migrations already
# applied to the live control DB, and lists what a `docker compose up -d` would apply.
# Read-only: it never writes to the database.
set -u

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MIGRATIONS_DIR="$REPO_ROOT/packages/db-schema/drizzle"
JOURNAL_FILE="$MIGRATIONS_DIR/meta/_journal.json"
API_SERVICE=api
DESTRUCTIVE_PATTERN='DROP TABLE|DROP COLUMN|DROP INDEX|ALTER TABLE|DELETE FROM|TRUNCATE'

if [ -t 1 ]; then
    BOLD="$(tput bold)"
    RED="$(tput setaf 1)"
    GREEN="$(tput setaf 2)"
    YELLOW="$(tput setaf 3)"
    DIM="$(tput dim)"
    RESET="$(tput sgr0)"
else
    BOLD="" RED="" GREEN="" YELLOW="" DIM="" RESET=""
fi

fail() {
    printf '%s\n' "${RED}${BOLD}실패:${RESET} $1" >&2
    exit 1
}

[ -f "$JOURNAL_FILE" ] || fail "migration journal 을 찾을 수 없습니다: $JOURNAL_FILE"

if command -v sha256sum >/dev/null 2>&1; then
    hash_file() { sha256sum "$1" | awk '{ print $1 }'; }
elif command -v shasum >/dev/null 2>&1; then
    hash_file() { shasum -a 256 "$1" | awk '{ print $1 }'; }
else
    fail 'sha256sum 또는 shasum 이 필요합니다.'
fi

command -v docker >/dev/null 2>&1 || fail 'docker 명령을 찾을 수 없습니다.'

# 실행 중 api 컨테이너에서 적용 완료 migration hash 를 읽는다 (읽기 전용).
READ_APPLIED_SCRIPT='const { Database } = require("bun:sqlite");
try {
    const db = new Database(process.env.CONTROL_DB_PATH ?? "/data/control.sqlite", { readonly: true });
    for (const row of db.query("SELECT hash FROM __drizzle_migrations").all()) console.log(row.hash);
} catch (error) {
    console.error(String(error));
    process.exit(3);
}'

cd "$REPO_ROOT" || fail "repo 루트로 이동할 수 없습니다: $REPO_ROOT"

ERROR_LOG="$(mktemp)"
APPLIED_HASHES="$(docker compose exec -T "$API_SERVICE" bun -e "$READ_APPLIED_SCRIPT" 2>"$ERROR_LOG")"
EXEC_STATUS=$?
if [ $EXEC_STATUS -ne 0 ]; then
    printf '%s\n' "${YELLOW}적용 이력 조회 실패${RESET} (exit=$EXEC_STATUS)" >&2
    sed 's/^/    /' "$ERROR_LOG" >&2
    rm -f "$ERROR_LOG"
    fail "api 컨테이너가 실행 중인지 확인하세요: docker compose ps $API_SERVICE"
fi
rm -f "$ERROR_LOG"

APPLIED_COUNT=0
[ -n "$APPLIED_HASHES" ] && APPLIED_COUNT=$(printf '%s\n' "$APPLIED_HASHES" | grep -c .)

TAGS="$(grep '"tag"' "$JOURNAL_FILE" | sed 's/.*"tag"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')"
[ -n "$TAGS" ] || fail "journal 에서 migration tag 를 읽지 못했습니다: $JOURNAL_FILE"

printf '%s\n' "${BOLD}control DB migration dry-run${RESET}"
printf '%s\n' "${DIM}코드: $MIGRATIONS_DIR${RESET}"
printf '%s\n' "${DIM}적용 완료: ${APPLIED_COUNT}건${RESET}"
printf '\n'

PENDING_TAGS=""
PENDING_COUNT=0
DESTRUCTIVE_COUNT=0

for TAG in $TAGS; do
    SQL_FILE="$MIGRATIONS_DIR/$TAG.sql"
    [ -f "$SQL_FILE" ] || fail "migration 파일이 없습니다: $SQL_FILE"
    FILE_HASH="$(hash_file "$SQL_FILE")"
    if printf '%s\n' "$APPLIED_HASHES" | grep -qx "$FILE_HASH"; then
        printf '%s\n' "  ${GREEN}applied${RESET}  $TAG"
        continue
    fi
    PENDING_COUNT=$((PENDING_COUNT + 1))
    PENDING_TAGS="$PENDING_TAGS $TAG"
    DESTRUCTIVE="$(grep -inE "$DESTRUCTIVE_PATTERN" "$SQL_FILE")"
    if [ -n "$DESTRUCTIVE" ]; then
        DESTRUCTIVE_COUNT=$((DESTRUCTIVE_COUNT + 1))
        printf '%s\n' "  ${RED}pending${RESET}  $TAG ${RED}(파괴적 변경 포함)${RESET}"
        printf '%s\n' "$DESTRUCTIVE" | sed "s/^/        ${DIM}/;s/$/${RESET}/"
    else
        printf '%s\n' "  ${YELLOW}pending${RESET}  $TAG"
    fi
done

printf '\n'
if [ $PENDING_COUNT -eq 0 ]; then
    printf '%s\n' "${GREEN}적용 예정 migration 이 없습니다. 이 릴리스는 schema 를 바꾸지 않습니다.${RESET}"
    exit 0
fi

printf '%s\n' "${BOLD}적용 예정 ${PENDING_COUNT}건:${RESET}${PENDING_TAGS}"
printf '%s\n' "이 migration 들은 다음 'docker compose up -d' 시 api 부팅에서 자동 적용됩니다."
if [ $DESTRUCTIVE_COUNT -gt 0 ]; then
    printf '%s\n' "${RED}${BOLD}경고:${RESET} ${DESTRUCTIVE_COUNT}건이 DROP/ALTER/DELETE 를 포함합니다. 되돌릴 수 없습니다."
fi
printf '%s\n' "upgrade 전에 docs/CONTROL-PLANE-UPGRADE.md 의 볼륨 스냅샷 절차를 먼저 수행하세요."
exit 0
