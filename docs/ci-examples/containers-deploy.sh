#!/usr/bin/env bash
# Containers control plane — API key 만으로 배포를 완주하는 공용 스크립트.
#
# GitHub Actions · Gitea Actions · GitLab CI 예시가 전부 이 스크립트를 호출한다.
# CI 별 문법 차이는 각 워크플로 파일이 흡수하고, 호출 순서와 성공 판정은 여기 한 곳에만 둔다.
#
# 필요한 것: bash, curl, jq, (deploy 명령은) docker
#
# 환경변수
#   API_BASE              필수. 예: https://api.example.com  (터널 경유는 반드시 HTTPS)
#   CONTAINERS_API_KEY    필수. ctk_ 로 시작하는 API key. 로그에 남기지 않는다
#   CONTAINERS_API_HOST   선택. API_BASE 의 host 가 nginx server_name 과 다를 때 Host 헤더를 지정
#   DEPLOY_NAME           필수. 이미지·아티팩트 이름 접두사
#   DEPLOY_VERSION        필수. manifest version (커밋 SHA 앞 12자 권장)
#   MANIFEST_FILE         deploy 명령에 필수. deploymentManifestInputSchema 를 따르는 JSON.
#                         imageDigest 와 version 은 이 스크립트가 주입한다
#   IMAGE_CONTEXT         선택. docker build 컨텍스트 (기본 .)
#   IMAGE_ARCHIVE         선택. 이미 만들어 둔 tar 경로. 없으면 docker build + docker save 를 한다
#   COMPOSE_FILE          stack 명령에 필수. compose 원문
#   STACK_NAME            stack 명령에 필수
#   WORK_DIR              선택. 임시 파일 위치 (기본 mktemp -d)
#
# 명령
#   deploy                    빌드 → 업로드 → load → manifest → release → healthy 확인
#   stack                     compose 미리보기 → 스택 등록 → 스택 배포 → healthy 확인
#   rollback <releaseId>      지정한 release 를 이전 상태로 되돌린다
#
# idempotency-key 는 이름·버전·아카이브 해시를 합친 값이다. 같은 배포를 다시 돌리면 같은 세션을
# 이어받고, 버전이 바뀌면 새 세션이 열린다. 아카이브 내용이 이미 ready artifact 로 있으면 업로드
# 자체를 건너뛰고 그 artifact 를 재사용한다(GET /api/artifacts, artifact:read scope 가 필요하다).
#
# 성공 판정은 전부 durable job 이다. job status 는 queued|running|cancelling|succeeded|failed|cancelled
# 이며 succeeded 만 성공이다. release job 은 자동 재시도가 없고, 실패하면 서버가 이전 라우트로 돌린다.
set -euo pipefail

API_BASE="${API_BASE:?API_BASE is required}"
CONTAINERS_API_KEY="${CONTAINERS_API_KEY:?CONTAINERS_API_KEY is required}"
DEPLOY_NAME="${DEPLOY_NAME:?DEPLOY_NAME is required}"
DEPLOY_VERSION="${DEPLOY_VERSION:?DEPLOY_VERSION is required}"

CHUNK_BYTES=33554432
POLL_INTERVAL_SECONDS=5
JOB_TIMEOUT_SECONDS=1800
MEDIA_TYPE='application/vnd.docker.image.rootfs.diff.tar'

WORK_DIR="${WORK_DIR:-$(mktemp -d)}"
mkdir -p "$WORK_DIR"

log() {
    printf '%s\n' "$*" >&2
}

sha256_of() {
    if command -v sha256sum > /dev/null 2>&1; then
        sha256sum "$1" | cut -d' ' -f1
    else
        shasum -a 256 "$1" | cut -d' ' -f1
    fi
}

api_curl() {
    local method="$1" path="$2"
    shift 2
    local args=(--fail-with-body -sS -X "$method" "${API_BASE}${path}" -H "authorization: Bearer ${CONTAINERS_API_KEY}")
    if [ -n "${CONTAINERS_API_HOST:-}" ]; then
        args+=(-H "host: ${CONTAINERS_API_HOST}")
    fi
    curl "${args[@]}" "$@"
}

api_json() {
    local method="$1" path="$2" body="$3"
    shift 3
    if [ -n "$body" ]; then
        api_curl "$method" "$path" -H 'content-type: application/json' --data-binary "$body" "$@"
    else
        api_curl "$method" "$path" "$@"
    fi
}

dump_job() {
    local job_id="$1"
    log "--- job ${job_id}"
    api_curl GET "/api/jobs/${job_id}" | jq . >&2 || true
    log "--- job ${job_id} events"
    api_curl GET "/api/jobs/${job_id}/events" | jq . >&2 || true
}

poll_job() {
    local job_id="$1"
    local deadline=$(($(date +%s) + JOB_TIMEOUT_SECONDS))
    local response status
    while :; do
        response="$(api_curl GET "/api/jobs/${job_id}")"
        status="$(jq -r '.data.status' <<< "$response")"
        case "$status" in
            succeeded)
                printf '%s' "$response"
                return 0
                ;;
            failed | cancelled)
                log "job ${job_id} ${status}: $(jq -r '.data.failureCode // "unknown"' <<< "$response")"
                dump_job "$job_id"
                return 1
                ;;
        esac
        if [ "$(date +%s)" -ge "$deadline" ]; then
            log "job ${job_id} timed out in status ${status}"
            dump_job "$job_id"
            return 1
        fi
        sleep "$POLL_INTERVAL_SECONDS"
    done
}

build_archive() {
    if [ -n "${IMAGE_ARCHIVE:-}" ]; then
        printf '%s' "$IMAGE_ARCHIVE"
        return 0
    fi
    local tag="${DEPLOY_NAME}:${DEPLOY_VERSION}"
    docker build -t "$tag" "${IMAGE_CONTEXT:-.}" >&2
    local archive="${WORK_DIR}/image.tar"
    docker save "$tag" --output "$archive" >&2
    printf '%s' "$archive"
}

image_digest_of() {
    local archive="$1"
    if [ -n "${IMAGE_DIGEST:-}" ]; then
        printf '%s' "$IMAGE_DIGEST"
        return 0
    fi
    docker image inspect --format '{{.Id}}' "${DEPLOY_NAME}:${DEPLOY_VERSION}" 2> /dev/null && return 0
    log "IMAGE_DIGEST 를 알 수 없다. docker 없이 tar 만 올릴 때는 IMAGE_DIGEST 를 넘긴다: ${archive}"
    return 1
}

upload_artifact() {
    local archive="$1"
    local sha size existing session session_id session_status received offset skip chunk chunk_dir chunk_size digest finalize job_id result
    sha="$(sha256_of "$archive")"
    size="$(wc -c < "$archive" | tr -d ' ')"

    existing="$(api_curl GET /api/artifacts | jq -r --arg sha "$sha" '.data[] | select(.sha256 == $sha and .status == "ready") | .id' | head -n 1)"
    if [ -n "$existing" ]; then
        log "같은 내용의 artifact 가 이미 있다: ${existing}"
        printf '%s' "$existing"
        return 0
    fi

    session="$(api_json POST /api/uploads/sessions "$(jq -nc \
        --arg sha "$sha" \
        --argjson size "$size" \
        --arg name "${DEPLOY_NAME}-${DEPLOY_VERSION}.tar" \
        --arg mediaType "$MEDIA_TYPE" \
        '{expectedSha256: $sha, expectedSizeBytes: $size, fileName: $name, mediaType: $mediaType}')" \
        -H "idempotency-key: ${DEPLOY_NAME}-${DEPLOY_VERSION}-${sha}")"
    session_id="$(jq -r '.data.id' <<< "$session")"
    session_status="$(jq -r '.data.status' <<< "$session")"
    received="$(jq -r '.data.receivedBytes' <<< "$session")"
    log "upload session ${session_id} (${session_status}) resumes at ${received} bytes"

    if [ "$session_status" = 'ready' ]; then
        log 'artifact 는 이미 올라가 있다'
        printf '%s' "$(jq -r '.data.artifactId // empty' <<< "$session")"
        return 0
    fi
    if [ "$session_status" != 'uploading' ]; then
        log "세션이 ${session_status} 라 이어 올릴 수 없다. 아카이브를 다시 만들어 새 sha 로 올린다."
        return 1
    fi
    if [ $((received % CHUNK_BYTES)) -ne 0 ]; then
        log "resume offset ${received} 이 청크 경계가 아니다. 아카이브를 다시 만들어 새 sha 로 올린다."
        return 1
    fi

    chunk_dir="${WORK_DIR}/chunks"
    rm -rf "$chunk_dir"
    mkdir -p "$chunk_dir"
    split -b "$CHUNK_BYTES" "$archive" "${chunk_dir}/chunk-"

    offset="$received"
    skip=$((received / CHUNK_BYTES))
    for chunk in $(find "$chunk_dir" -type f -name 'chunk-*' | sort | tail -n +$((skip + 1))); do
        chunk_size="$(wc -c < "$chunk" | tr -d ' ')"
        digest="$(sha256_of "$chunk")"
        api_curl PUT "/api/uploads/sessions/${session_id}/chunks?offset=${offset}" \
            -H 'content-type: application/octet-stream' \
            -H "x-chunk-sha256: ${digest}" \
            --data-binary "@${chunk}" > /dev/null
        offset=$((offset + chunk_size))
    done

    finalize="$(api_json POST "/api/uploads/sessions/${session_id}/finalize" '')"
    job_id="$(jq -r '.data.job.id' <<< "$finalize")"
    result="$(poll_job "$job_id")"
    printf '%s' "$(jq -r '.data.result.artifactId' <<< "$result")"
}

load_image() {
    local artifact_id="$1" response job_id
    response="$(api_json POST "/api/artifacts/${artifact_id}/load" '')"
    job_id="$(jq -r '.data.job.id // empty' <<< "$response")"
    if [ -n "$job_id" ]; then
        poll_job "$job_id" > /dev/null
    else
        log "이미 load 된 아티팩트: $(jq -r '.data.deployment.id' <<< "$response")"
    fi
}

assert_image_present() {
    local digest="$1"
    if ! api_curl GET /api/images | jq -e --arg id "$digest" '.data | any(.id == $id)' > /dev/null; then
        log "load 한 이미지 ${digest} 가 /api/images 에 없다"
        return 1
    fi
}

command_deploy() {
    local manifest_file="${MANIFEST_FILE:?MANIFEST_FILE is required}"
    local archive digest artifact_id payload manifest manifest_id response release_id job_id status
    archive="$(build_archive)"
    digest="$(image_digest_of "$archive")"
    log "archive=${archive} digest=${digest}"

    artifact_id="$(upload_artifact "$archive")"
    log "artifact=${artifact_id}"
    load_image "$artifact_id"
    assert_image_present "$digest"

    payload="$(jq -c --arg digest "$digest" --arg version "$DEPLOY_VERSION" '.imageDigest = $digest | .version = $version' "$manifest_file")"
    manifest="$(api_json POST /api/deployment-manifests "$payload")"
    manifest_id="$(jq -r '.data.id' <<< "$manifest")"
    log "manifest=${manifest_id}"

    response="$(api_json POST "/api/deployment-manifests/${manifest_id}/releases" '')"
    release_id="$(jq -r '.data.release.id' <<< "$response")"
    job_id="$(jq -r '.data.job.id' <<< "$response")"
    log "release=${release_id} job=${job_id}"
    poll_job "$job_id" > /dev/null

    status="$(api_curl GET "/api/deployment-releases/${release_id}" | jq -r '.data.status')"
    log "release status: ${status}"
    [ "$status" = 'healthy' ]
    printf '%s\n' "$release_id"
}

command_stack() {
    local compose_file="${COMPOSE_FILE:?COMPOSE_FILE is required}"
    local stack_name="${STACK_NAME:?STACK_NAME is required}"
    local payload preview stack stack_id response job_id stack_release_id status
    payload="$(jq -nc --arg compose "$(cat "$compose_file")" --arg name "$stack_name" --arg version "$DEPLOY_VERSION" \
        '{compose: $compose, name: $name, version: $version}')"

    preview="$(api_json POST /api/deployment-stacks/preview "$payload")"
    log "preview order: $(jq -c '.data.order' <<< "$preview")"
    log "ignored keys: $(jq -c '.data.ignored' <<< "$preview")"

    stack="$(api_json POST /api/deployment-stacks "$payload")"
    stack_id="$(jq -r '.data.id' <<< "$stack")"
    log "stack=${stack_id}"

    response="$(api_json POST "/api/deployment-stacks/${stack_id}/releases" '')"
    stack_release_id="$(jq -r '.data.stackRelease.id' <<< "$response")"
    job_id="$(jq -r '.data.job.id' <<< "$response")"
    log "stack release=${stack_release_id} job=${job_id}"
    poll_job "$job_id" > /dev/null

    status="$(api_curl GET "/api/deployment-stack-releases/${stack_release_id}" | jq -r '.data.status')"
    log "stack release status: ${status}"
    [ "$status" = 'healthy' ]
    printf '%s\n' "$stack_release_id"
}

command_rollback() {
    local release_id="${1:?rollback <releaseId>}"
    local response
    response="$(api_json POST "/api/deployment-releases/${release_id}/rollback" '')"
    poll_job "$(jq -r '.data.job.id' <<< "$response")" > /dev/null
    log "rolled back ${release_id}"
}

main() {
    local command="${1:-deploy}"
    shift || true
    case "$command" in
        deploy) command_deploy "$@" ;;
        stack) command_stack "$@" ;;
        rollback) command_rollback "$@" ;;
        *)
            log "알 수 없는 명령: ${command} (deploy | stack | rollback)"
            return 2
            ;;
    esac
}

main "$@"
