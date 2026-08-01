# 0017 — Docker 명령 완전성 1차 설계 결정

날짜: 2026-08-01 KST
상태: 구현 완료 (prune dry-run·관리 plane 보호는 Phase 13, image dependency impact 미구현)
근거: [HANDOFF-STATUS.md](../HANDOFF-STATUS.md) §8 P0-1, Docker Engine API v1.52 OpenAPI

## 결정

### 1. Container action 확장 — 기존 discriminated union 에 추가

- `kill`: signal 은 화이트리스트(`SIGHUP·SIGINT·SIGKILL·SIGQUIT·SIGTERM·SIGUSR1·SIGUSR2`)만 허용, 기본 `SIGKILL`. 임의 문자열 signal 금지.
- `update`: `memoryBytes`·`nanoCpus`·`pidsLimit` 3개 전부 필수(생성 계약과 동일 경계). `MemorySwap` 은 Docker create 기본과 같은 2×memory 로 전송한다.
- 권한: `kill` 은 operator 이상(다른 lifecycle action 과 동일), `update` 는 `remove` 와 같은 최근 15분 admin 인증.

### 2. wait·top·changes

- `POST /api/containers/:id/wait` (operator): Docker `condition=not-running`, timeout 1초~5분(기본 60초)으로 bound. 무한 대기 금지.
- `GET /api/containers/:id/top`·`GET /api/containers/:id/changes` (전 role): inspect·logs 와 같은 조회 등급. changes 의 `Kind` 0/1/2 는 `modified/added/deleted` 로 정규화하고 null 응답은 빈 배열로 처리한다.

### 3. Image pull — durable job

- `POST /api/images/pull` (최근 admin 인증, audit `image.pull`) 은 `image.pull` job 을 enqueue 하고 202 로 job 을 반환한다. 진행·결과는 jobs 패널·API 로 관측한다.
- Agent `POST /v1/images/pull` 은 `/images/create` progress line 을 소비해 error line 검출, 마지막 20개 status 만 반환한다. inactivity timeout 120초, API client timeout 30분.
- reference 는 `[A-Za-z0-9][A-Za-z0-9._:/@-]*` 512자 bound. registry 인증(`X-Registry-Auth`)은 후속 [0020](./0020-registry-authenticated-image-pull.md)에서 완료했다.

### 4. Image tag

- `POST /api/images/:imageId/tag` (최근 admin 인증, audit `image.tag`). repository·tag 는 각각 정규식 bound.

### 5. 확인된 제약 (E2E 중 발견)

- Agent 의 container remove·image remove 는 **정확한 ID(또는 ID prefix)** 로 대상을 찾는다. 이름/tag 만으로는 `CONFIRMATION_MISMATCH` 가 된다 — 클라이언트는 목록 조회로 ID 를 얻어 호출해야 한다.
- 같은 image 에 tag 가 2개 이상이면 ID 삭제는 `force` 가 필요하다(전체 tag 제거). tag 단위 untag 는 미지원 — 필요 시 후속.

## 실측 증거 (2026-08-01, agent HMAC E2E)

alpine:3.20 pull → `containers-e2e-fixture:phase12` tag → fixture 컨테이너 생성 → top(프로세스 1개)·changes(빈 배열)·update(256MiB/0.5cpu/64pids) → kill(SIGKILL) → wait `exitCode 137` → 컨테이너·fixture image 정확 ID 로 삭제, 사용자 이미지 무영향.

## 파일

- `packages/contracts/src/engine-control.ts`, `operation-job.ts`
- `apps/engine-agent`: docker client·query/control service·route
- `apps/api`: agent client·control service·control route·`create-job-handlers.ts`
