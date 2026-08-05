# 업로드와 배포 지시서

## 1. artifact 유형

"tar 등 여러 타입"을 같은 처리로 뭉치지 않고 의미에 따라 구분한다.

| 유형                 | 예시                                                                            | 처리                                                                        |
| -------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Docker image archive | `docker save` 결과 `.tar`, `.tar.gz`, `.tgz`, `.tar.bz2`, `.tar.xz`, `.tar.zst` | Docker image load                                                           |
| OCI image archive    | OCI layout tar                                                                  | manifest·blob digest 검증 후 Engine이 받는 형식으로 안전하게 변환 또는 load |
| rootfs archive       | filesystem tar                                                                  | Docker image import, 전문가 권한과 metadata 필수                            |
| Compose bundle       | manifest + compose + image archives                                             | 제품 전용 schema 검증 후 복수 리소스 배포                                   |
| build context        | Dockerfile이 포함된 tar                                                         | 격리 BuildKit build, network·secret·cache 정책 제한                         |

단순 `.zip`을 image archive로 받지 않는다. 압축 형식과 archive semantic을 별도 필드와 server-side sniffing으로 일치시킨다.

## 2. 업로드 계약

- 패널은 multipart 또는 resumable upload session을 사용한다.
- API 클라이언트는 upload 생성, chunk 전송, 완료 순서로 진행한다.
- 모든 업로드는 `Idempotency-Key`와 예상 byte, 예상 SHA-256, artifact type을 받는다.
- server는 chunk별 digest와 최종 digest를 검증한다.
- 기본 upload session 한도는 10GiB, chunk는 64MiB, 동시 upload는 2개다. 관리자는 전체·사용자 quota를 변경할 수 있다.
- Cloudflare Free의 단일 request body 제한보다 chunk를 충분히 작게 유지한다. 단일 10GiB HTTP request는 지원하지 않는다.
- proxy buffering 때문에 disk를 이중 사용하는지 측정하고 대용량 upload route는 명시적으로 tuning한다.
- 진행률은 SSE job event로 제공하고 재접속 시 마지막 event 이후를 재생한다.

## 3. 상태 기계

```mermaid
stateDiagram-v2
    [*] --> Uploading
    Uploading --> Uploaded
    Uploaded --> Inspecting
    Inspecting --> Rejected: 형식 또는 정책 실패
    Inspecting --> Scanning
    Scanning --> Rejected: scanner 실패
    Scanning --> Ready
    Ready --> Loading
    Loading --> Loaded
    Loading --> Failed
    Loaded --> Deploying
    Deploying --> Healthy
    Deploying --> RollingBack
    RollingBack --> RolledBack
```

각 전이는 job event와 audit log를 남긴다. 취소는 Uploading, Uploaded, Inspecting, Scanning, Ready에서 안전하게 가능하다. Loading 이후에는 Engine 결과 reconciliation 후 정리한다.

## 4. quarantine 검사

1. 서버 생성 ID 경로로 스트리밍 저장한다.
2. 선언 크기와 실제 크기, SHA-256을 비교한다.
3. magic bytes와 압축 형식을 식별한다.
4. archive header를 streaming scan한다.
5. 파일 수, 총 uncompressed byte, compression ratio, depth를 제한한다.
6. absolute path, `..`, NUL, device node, FIFO, escaping symlink·hardlink를 거부한다.
7. Docker 또는 OCI manifest와 referenced layer 존재·digest를 검증한다.
8. scanner container로 악성 파일과 image 취약점·secret을 검사한다.
9. policy 결과와 예외 승인자를 저장한다.
10. 성공 artifact만 immutable ready 영역으로 이동한다.

검사 실패 artifact는 제한 시간 후 삭제하고 이유를 사용자에게 보여준다. 원본 파일명을 filesystem 경로에 사용하지 않는다.

critical vulnerability는 기본 차단한다. owner 예외에는 finding, 사유, 승인자, 만료, 적용 deployment를 기록하고 예외 만료 후 재배포를 막는다. `linux/arm64`를 기본 platform으로 검증하고 `linux/amd64`는 Docker Desktop emulation 가용성 검사 후 허용한다.

## 5. 배포 manifest

- deployment name과 version
- image digest
- container name 정책
- command, entrypoint, environment key 목록
- secret reference 목록
- internal port와 protocol
- CPU, memory, pids 제한
- restart policy
- healthcheck
- managed named volume
- managed network
- Nginx hostname·path route
- rollout strategy
- rollback 대상

환경변수 값과 secret 값은 manifest DB row나 audit에 평문 저장하지 않는다. secret 값은 별도 `deployment_secret` 저장소에서 AES-256-GCM으로 암호화하고 manifest는 reference만 사용한다.

## 6. rollout

### 6.1 권장 blue-green

1. artifact를 load하고 digest를 고정한다.
2. 새 version container를 고유 이름으로 생성한다.
3. 관리 network에만 연결하고 외부 route는 아직 연결하지 않는다.
4. healthcheck와 smoke request를 통과시킨다.
5. 새 Nginx revision을 생성·검증한다.
6. route를 새 upstream으로 graceful reload한다.
7. 관찰 window 동안 오류율·health를 확인한다.
8. 성공하면 이전 container를 stop하고 rollback window 동안 보존한다.
9. window 종료 후 정책에 따라 이전 container·image를 정리한다.

### 6.2 실패 처리

- create 이전 실패: artifact 상태만 실패로 기록한다.
- health 실패: 신규 container log·inspect를 보존하고 route를 바꾸지 않는다. 보존 형태는 durable job event `detail`(`step: 'failure-diagnostics'`)이며 exit code·container error·리댁션한 로그 20줄을 담는다. 패널은 배포 화면의 실패 릴리스에서 이를 펼쳐 볼 수 있고, 조회 권한은 job event 와 같다(세션 owner·admin, API key `job:read`).
- Nginx 적용 실패: 기존 route가 유지되어야 한다.
- 적용 후 관찰 실패: 이전 Nginx revision을 복원하고 신규 container를 격리한다.
- cleanup 실패: 배포 성공과 cleanup warning을 구분하고 재시도 job을 만든다.

## 7. 패널 흐름

- upload dropzone과 파일 선택
- artifact type, expected platform, checksum 표시
- 단계별 진행과 scanner 결과
- image metadata와 배포 form
- route와 resource 영향 미리보기
- 배포 job timeline
- health·logs·events 연결
- rollback 버튼과 대상 version 비교

업로드 페이지를 벗어나도 job은 계속되고 전역 job center에서 다시 열 수 있어야 한다.

## 8. API 흐름

- `POST /api/uploads` — upload session 생성
- `PUT /api/uploads/:id/chunks/:index` — bounded chunk
- `POST /api/uploads/:id/complete` — digest 확인과 검사 job 시작
- `GET /api/uploads/:id` — 상태·검사 결과
- `GET|POST /api/deployment-manifests` — 불변 manifest 목록·생성
- `POST /api/deployment-manifests/:id/releases` — blue-green release 시작
- `GET /api/deployment-releases/:id` — release 상태 조회
- `GET /api/jobs/:id/events` — SSE progress
- `POST /api/deployment-releases/:id/rollback` — 이전 정상 version으로 전환
- `DELETE /api/uploads/:id` — 안전 상태 artifact 폐기

Hono RPC는 JSON control endpoint 타입을 제공한다. 대용량 binary chunk와 SSE·WebSocket은 별도 typed wrapper를 사용하되 같은 Zod DTO와 인증 정책을 공유한다.

## 9. 정리와 quota

- 사용자·전체 upload byte quota
- ready artifact 보존 기간
- 실패 artifact 짧은 보존
- deployment에서 참조 중인 artifact·image 삭제 금지
- disk soft watermark에서 새 upload 경고
- hard watermark에서 새 upload·build 차단
- orphan chunk와 interrupted upload 주기 정리
- cleanup도 audit와 metrics 대상
- 384GB 설정값, volume available bytes, Engine reclaimable bytes와 예약 job bytes를 함께 표시

## 10. 현재 구현 기준선

- immutable `deployment_manifest`는 name/version, 고정 image digest, resource, health, route, rollout, volume, environment key와 secret reference만 저장한다.
- secret 값과 일반 환경변수 값은 manifest와 audit에 저장하지 않는다. secret은 `/data`의 별도 master key로 AES-256-GCM 암호화하며 metadata·reference·version만 API와 SSR에 노출한다.
- 같은 reference를 다시 저장하면 rotation version이 증가한다. release 시작과 실행 직전에 최신 reference를 확인하며, 참조 중인 secret 삭제를 거부한다.
- 일반 `environmentKeys`는 값 저장 정책이 없으므로 release를 계속 거부하고, secret binding만 Docker environment로 전달한다. container inspect는 값 없이 key만 반환한다.
- release는 `creating → probing → switching → observing → healthy` 상태를 저장하며 실패 시 `failed` 또는 `rolled-back`으로 종료한다.
- 신규 container는 `containers_control`에서 먼저 health probe를 통과하고 목표 network에 연결한 뒤 control network에서 분리한다.
- 구조화 Nginx route는 apply 성공 뒤에만 DB target을 갱신한다. reload 직후 이전 worker 응답은 health retry 정책으로 흡수한다.
- route observation 실패는 이전 healthy release로 route를 복원한다. 이전 release가 없으면 새 route를 제거하고 신규 container를 중지한다.
- API는 release 생성과 수동 rollback 시작에 `202 { release, job }`을 반환하고 상태 조회를 제공한다. 진행 상태는 SQLite에 기록하며 API 재시작 시 중단된 create·probe·route switch·observation·rollback을 안전한 종료 상태로 수렴시킨다.
- 수동 rollback은 이전 container를 control network에서 재기동·검증하고 Nginx route probe 성공 뒤 현재 container를 중지한다. 실패하면 현재 정상 route를 복원한다.
- 이전 container는 새 manifest의 rollback retention 동안 보존하며, 만료 cleanup은 시작 시와 1시간 주기로 재시도하고 named volume은 삭제하지 않는다.
- Next.js SSR dashboard는 manifest·release 초기 상태, 생성 form, release polling, rollback action을 한국어·영어·일본어로 제공한다.
- upload session은 ready artifact와 활성 예약량의 합계를 총 quota와 비교한다. Docker Desktop 실제 available bytes에서 아직 전송되지 않은 예약량까지 빼고 soft watermark는 UI 경고, hard watermark는 HTTP 507로 차단하며 각 chunk 직전 다시 확인한다.
- 기본값은 총 300GiB, soft available 32GiB, hard available 16GiB이며 세 값 모두 환경변수로 조정한다.
- artifact load, upload finalize, release 실행, 수동 rollback은 `operation_job` durable queue로 실행한다. job kind는 `deploy.load`, `upload.finalize`, `deploy.release`, `deploy.rollback`이며 실행 상태와 실패 코드는 job timeline에 남는다.
- 각 job은 `resource_key`(artifactId·sessionId·releaseId)로 잠근다. 같은 리소스의 active job이 있으면 새 job을 만들지 않고 기존 job을 반환한다.
- `POST /api/artifacts/:artifactId/load`는 이미 `loaded` 상태 deployment 행이 있으면 job 없이 `200 { deployment }`를, 없으면 `202 { job }`을 반환한다. `POST /api/uploads/sessions/:sessionId/finalize`는 session 존재와 actor 소유를 동기 검증한 뒤 `202 { job }`을 반환하고, 같은 내용(sha256)의 artifact가 이미 있으면 그 artifact를 멱등 반환한다.
- release·rollback job은 재시도하지 않는다(`maxAttempts` 1). 상태 머신이 시도를 이미 소비했으므로 중단된 실행 정리는 release reconcile이 담당한다.
- 단계 중간부터 이어 실행하는 세분화된 재개는 후속 범위다.

## 배포 manifest 의 런타임 (2026-08-05)

manifest 에 `runtime` 블록이 있다(`profile`·`capabilities`·`writablePaths`). 기본 `standard` 는 Docker 기본 capability 집합과 쓰기 가능한 루트라 **순정 이미지가 그대로 뜬다.** 이전에는 읽기 전용 루트와 `CapDrop: ALL` 이 하드코딩돼 공식 이미지 대부분이 기동조차 못 했다.

이미 저장된 manifest 는 migration `0018_manifest_runtime` 의 기본값 `hardened` 로 남아 동작이 바뀌지 않는다. 상세는 [acknowledge/0037](./acknowledge/0037-container-runtime-profile.md).

**아티팩트는 이미지 아카이브만 받는다.** 정적 파일을 올려 호스트 경로로 마운트하는 방식은 열지 않는다 — 호스트 bind mount 는 컨테이너 탈출 경로이기 때문이다. 정적 파일은 이미지에 구워 올린다.
