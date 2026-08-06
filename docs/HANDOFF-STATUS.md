# 구현 Handoff — 구현 범위·한계 (최종 갱신 2026-08-06)

**이 문서는 구현 범위와 한계를 소유한다. 현재 상태·검증 수치·다음 작업은 [HANDOFF.md](./HANDOFF.md) 가 단독으로 소유한다.** 새 세션은 HANDOFF.md 를 먼저 읽고, [RESUME-CHECKLIST.md](./RESUME-CHECKLIST.md) 의 절차를 실행한 뒤 이 문서에서 구현 범위와 한계를 확인한다. 세부 설계와 충돌하면 실제 runtime·코드·테스트를 가장 강한 증거로 사용한다.

## 1. 현재 결론

프로젝트는 단순 scaffold가 아니라 실제 Docker Compose에서 동작하는 중간 완성 control plane이다. 현재 안정된 중단점은 다음과 같다.

- Nginx, Next.js SSR web, Hono API, Engine Agent, Traffic Worker 5개 서비스가 모두 healthy다.
- macOS Docker Desktop의 Docker socket은 Engine Agent만 mount한다.
- 로그인·다중 운영자·role·초대·API key, Docker 제어, Nginx 설정·route, traffic 분석, artifact upload·image load, immutable blue-green 배포·자동/수동 rollback, encrypted deployment secret, 로컬 DB backup·restore가 실제 런타임까지 동작한다.
- durable operation job queue(상태 machine·재시도·취소·timeline·boot reconciliation)가 구현됐고 자동 backup 이 첫 소비자다. [acknowledge/0014](./acknowledge/0014-durable-operation-job-queue.md)
- Docker events·logs·stats 실시간 SSE 가 Agent 정규화 → API 인증 proxy → 패널 실시간 로그 UI 까지 구현됐다. [acknowledge/0015](./acknowledge/0015-docker-stream-sse.md)
- 전체 typecheck, ESLint, Prettier가 통과한다.
- 전체 테스트 수치는 [HANDOFF.md](./HANDOFF.md) §1 이 소유한다. 이 문서에는 적지 않는다.
- `bun audit` 취약점 0건이다. 제품 코드에 `any`·`eslint-disable`·`as never` 가 없다. (2026-08-05)
- container kill·update·rename·wait·top·changes 와 image pull(durable job)·tag 가 agent E2E 로 실측 검증됐다. [acknowledge/0017](./acknowledge/0017-docker-command-completeness.md)
- Compose project label 기반 관리 plane container·image·network·volume 보호, 자체 prune dry-run preview, image 삭제 dependency impact와 force owner 제한이 구현됐다. [acknowledge/0018](./acknowledge/0018-prune-preview-management-protection.md)
- owner 최근 인증·preview SHA 재검증·volume opt-in·후보별 보호·취소 지점·단일 attempt를 적용한 `system.prune` durable job과 패널이 구현됐다. [acknowledge/0019](./acknowledge/0019-durable-system-prune.md)
- registry credential을 Agent 전용 volume에 AES-256-GCM으로 저장하고 host-bound `X-Registry-Auth`로만 사용하는 인증 image pull과 관리 패널이 구현됐다. [acknowledge/0020](./acknowledge/0020-registry-authenticated-image-pull.md)
- inode checkpoint·rotation 복구, masked live SSE, 24시간 제한 CSV/NDJSON durable export가 구현됐다. [acknowledge/0021](./acknowledge/0021-traffic-checkpoint-live-export.md)
- maintenance mode 가 mutation 을 503 으로 차단·drain 하며, backup restore 는 maintenance 오케스트레이션이 포함된 `backup.restore` durable job 으로 실행된다. [acknowledge/0016](./acknowledge/0016-maintenance-restore-job.md)
- control plane upgrade 준비 상태 검증이 구현됐다: `GET /api/control-plane/status`(owner·admin)가 버전, migration applied/pending(파일 sha256 dry-run), maintenance, active job, 최신 backup, DB integrity 를 종합 보고하고, upgrade·rollback runbook 은 [CONTROL-PLANE-UPGRADE.md](./CONTROL-PLANE-UPGRADE.md)로 문서화했다. 자기 재배포는 SECURITY.md §11 에 따라 제외한다. [acknowledge/0023](./acknowledge/0023-control-plane-upgrade-readiness.md)
- artifact load·upload finalize·release run·rollback 이 durable job(`deploy.load`·`upload.finalize`·`deploy.release`·`deploy.rollback`)으로 전환됐다. `operation_job.resource_key`(migration 0010)와 `enqueue({ uniqueResourceKey })` 로 리소스 단위 잠금을, upload finalize 는 sha256 내용 기반 멱등을 적용한다. [acknowledge/0024](./acknowledge/0024-deploy-upload-durable-job.md)
- 패널 작업 큐 위젯과 `GET /api/jobs/backup-schedule` 로 자동 backup 의 last success/failure·next run 이 관측된다.
- live control SQLite는 `integrity_check=ok`, `foreign_key_check=[]`다.
- 마지막 실제 restore drill, Docker 명령·stream·traffic browser E2E가 성공했다.

최종 제품은 아니다. scanner, R2, Cloudflare 설치 runbook, fresh install E2E, 접근성·반응형 전수검증이 남아 있다.

## 2. 새 세션 시작 순서

1. **[HANDOFF.md](./HANDOFF.md) 를 먼저 읽는다.** 세션 인수인계 단일 진입점이고 현재 상태·다음 작업을 소유한다.
2. 읽는 순서의 정본은 [RESUME-CHECKLIST.md](./RESUME-CHECKLIST.md) §2 다. 이 문서는 그 순서를 중복 정의하지 않는다.
3. 작업 영역은 `/Users/gkn/containers`다.
4. 디자인·컴포넌트 패턴은 `/Users/gkn/flunti-otel`을 읽고 따른다.
5. `docs/SHADCN-COMPONENTS.md`를 확인하고 기존 `apps/web/src/shared/ui` primitive를 우선 사용한다.
6. 이 디렉터리는 Git 저장소다(원격 `origin`, 브랜치 `dev`). 변경 범위는 Git 명령으로 판단한다.
7. 기존 Docker image·container·network·volume에는 사용자 소유 리소스가 섞여 있다. 이름이 명백한 이번 테스트 fixture가 아니면 삭제하지 않는다.
8. `.env`를 생성하거나 수정하지 않는다. 현재 구성은 compose environment와 secret file을 사용한다.

핵심 코드 규칙은 arrow function, `any` 금지, enum 금지, boundary Zod parse, Hono Route→Service 구조, React FSD, React Compiler를 따르며 불필요한 `useMemo`·`useCallback`과 일반 코드 주석을 추가하지 않는 것이다.

## 3. 런타임 구조

```text
Cloudflare Tunnel
  -> 127.0.0.1:18080
  -> Nginx
     -> panel.containers.local -> Next.js SSR web
     -> api.containers.local   -> Hono API
     -> workload host/path     -> containers_edge workload

Hono API -> internal HMAC -> Engine Agent -> /var/run/docker.sock
Hono API -> internal HMAC -> Traffic Worker -> traffic.sqlite
Nginx access.jsonl -> Traffic Worker
API + Traffic Worker -> containers_backups named volume
```

Compose 서비스와 권한 경계:

| Service          | Network                | Writable state                     | 특권 경계                  |
| ---------------- | ---------------------- | ---------------------------------- | -------------------------- |
| `nginx`          | ingress, control, edge | managed config·logs named volume   | 외부 localhost ingress     |
| `web`            | ingress                | tmpfs                              | Docker 접근 없음           |
| `api`            | ingress, control       | control, artifacts, backups volume | Agent·Worker 조정          |
| `engine-agent`   | control                | credentials, managed config        | 유일한 Docker socket mount |
| `traffic-worker` | control                | traffic, backups volume            | access log read-only       |

모든 서비스는 read-only root filesystem과 `no-new-privileges`를 사용한다. Nginx 외 host 공개 port는 없다.

## 4. 구현 완료 범위

### 인증·운영자·API key

- Better Auth email/password와 첫 Owner bootstrap
- 공개 signup 영구 차단
- 단회·만료·회수 초대 링크와 owner/admin/operator/viewer/auditor role
- 사용자 disable·role 변경
- API key 원문 단회 노출, SHA-256 hash 저장, expiry·revoke·last-used
- API key scope 13종(`packages/contracts/src/api-key.ts` 가 정본): artifact read/upload, image:load, deployment read/write, secret read/write, backup read/write, control-plane:read, engine:read, job read/write
- API key별 minute rate limit
- 중요 mutation의 최근 15분 인증

배포에는 seed 계정이 없다. 최초 1회 로컬 이름(`http://127.0.0.1:18080`)에서 bootstrap 으로 owner 를 만들고, 이후 사용자는 초대로 늘린다. 공개 주소에서는 bootstrap 이 403 이다.

개발 스택에서는 `bun scripts/seed-e2e.ts` 로 계정을 만들 수 있고, 공개 주소가 저장된 스택에서는 스스로 거부한다(`--allow-configured` 로만 우회). 비밀번호는 stdout 에 한 번만 나오며 저장소·문서에 기록하지 않는다.

### Docker 제어

- Engine ping/version/info/disk와 container/image/network/volume 목록
- container inspect에서 env 값은 제거하고 key만 노출
- create, start, stop, restart, pause, unpause, remove
- network·volume create/remove, container network connect/disconnect
- image remove·Docker archive load
- public·private registry image pull durable job, Agent 전용 암호화 credential 생성·회전·삭제와 registry host binding
- non-TTY exec stdout/stderr/exit code
- one-time TTY WebSocket ticket, stdin·resize·detach·idle/max timeout·concurrency limit
- destructive confirmation과 자원 상한. 런타임 제약은 2026-08-05 부터 프로필(standard 기본 / hardened 옵트인)이며 기본값은 표준 이미지가 그대로 뜨도록 열려 있다 → [acknowledge/0037](./acknowledge/0037-container-runtime-profile.md)

실제 prune은 owner 최근 인증과 정확한 확인 문구를 요구하는 `system.prune` durable job으로 노출한다. enqueue 전·worker 실행 직전 preview SHA를 재검증하고, volume은 별도 opt-in이며, Agent가 후보별 관리 plane 보호를 다시 적용한다. job은 부분 삭제 자동 재시도를 막기 위해 단일 attempt다.

### Nginx·traffic

- 전체 `nginx.conf` 조회, revision, optimistic SHA apply
- 실제 `nginx -t`, candidate, atomic rename, HUP, probe, 실패 rollback
- 관리 API·panel·status·access log·rate/header 보호 계약
- 구조화 hostname/path/container route와 deterministic renderer
- 관리 hostname 충돌 거부, prefix strip, HTTP/WebSocket, timeout/body limit
- 라우트 수정(`PUT /api/nginx/routes/:id`), `enabled` 토글, `pathMode`(exact·prefix) 선택
- 대상 컨테이너 존재·네트워크 도달 검증(0038), 배포 소유권 표시 `managedBy`(migration 0021)
- JSONL traffic ingestion, raw SQLite 14일 retention
- device·inode·offset durable checkpoint, rename rotation old-inode drain, DB 실패 replay
- request/status/bytes/latency p50·p95·p99, top path, recent event, masked IP SSR UI
- bounded masked live SSE와 Web 25행 pause/resume tail
- owner/admin 24시간 제한 CSV/NDJSON durable export·감사·14일 파일 retention
- Cloudflare client IP 우선 logging
- login/general API Nginx limit과 application login/API key limit
- CSP·COOP·Permissions-Policy·HSTS·nosniff·frame deny

실행 중 managed Nginx 설정의 SHA 는 고정값이 아니다. `GET /api/nginx/config` 로 확인한다. (2026-08-06 초기화로 `nginx-config` 볼륨이 비워지고 이미지 기본값이 다시 복사됐다)

### Upload·deployment·secret

- 64 MiB 순차 chunk, offset·chunk digest·전체 SHA-256, idempotency
- 사용자별 active session 제한, 10 GiB 계약, 300 GiB 총 quota 기본값
- Docker Desktop 실제 disk available 기반 32 GiB soft·16 GiB hard watermark 기본값
- Docker save·OCI archive 구조·digest·path traversal·symlink 검사
- Docker image load와 상태 기록
- immutable deployment manifest와 image digest 고정
- control network health probe, edge 전환, Nginx route switch, observation
- health/Nginx/public probe 실패 자동 rollback
- 이전 healthy release 수동 rollback
- API 재시작 interrupted release reconciliation과 retention cleanup
- deployment secret AES-256-GCM 저장, version rotation, metadata-only API, 실행 시점 resolve

compose 스택은 구현됐다 — 계약·변환기(`packages/contracts/src/deployment-stack.ts`, `apps/api/src/lib/compose-stack.ts`), 저장(migration 0020), 순차 릴리스와 역순 되돌리기(job kind `deploy.stack-release`), `/deployments/stacks` 화면. compose 원문은 아카이브가 아니라 API 본문으로 받는다.

아직 OCI importer 변형, rootfs, Dockerfile build context, malware·secret·SBOM·vulnerability scanner는 없다.

### 로컬 backup·restore

- control·traffic native SQLite snapshot과 manifest
- UUID-only directory, byte 수·SHA-256, SQLite integrity·FK·schema 검증
- 기본 7개 retention, 기본 24시간 interval scheduler
- Owner SSR panel과 `backup:read`, `backup:write` API key scope
- restore 전 recovery backup과 두 DB 보상 복구
- corrupt backup restore 차단·확인 후 삭제
- 실제 Docker named volume restore drill 성공

상세 운영 계약과 한계는 [BACKUP-RESTORE.md](./BACKUP-RESTORE.md)를 따른다.

### Docker events·logs·stats SSE (2026-08-01 추가)

- 계약: `@containers/contracts/engine-stream` — 정규화 event(`Actor.Attributes` 는 name 만)·log chunk(multiplex frame 1MiB truncate)·stats sample(공식 CPU/메모리 계산식, 첫 sample cpu null)
- Agent: `/v1/streams/events`·`/v1/streams/containers/:id/logs?tail=`·`/v1/streams/containers/:id/stats` (HMAC, SSE, heartbeat 15초, 동시 20개, 최대 30분)
- API: `/api/stream/events`·`/api/stream/containers/:id/logs`·`/api/stream/containers/:id/stats` (전 role session 조회, 15초 세션 재검사, 양방향 abort)
- nginx 런타임 config 변경 없음 — heartbeat 가 `proxy_read_timeout` 60초를 통과하고 `proxy_buffering off` 는 기존 설정
- Web: 컨테이너 카드에 EventSource 실시간 로그 follow (버퍼 200k chars bound)
- 실수신 검증: api 컨테이너 내부 HMAC 호출로 3종 200 `text/event-stream` + 정규화 데이터 확인 (2026-08-01)
- owner 브라우저에서 API 컨테이너 live log 연결·실수신·중지와 console error 0건을 확인했다. traffic live tail은 pause 12초 고정과 resume 신규 행 수신, CSV·NDJSON export는 durable job 성공·download·audit·민감정보 비노출까지 확인했다. 잔여 UI는 events/stats 전용 화면이다.

### Durable operation job queue (2026-08-01 추가)

- control DB `operation_job`·`operation_job_event` (migration 0008), 계약은 `@containers/contracts/operation-job`
- 상태: queued→running→succeeded / failed / cancelled, 협조 취소는 running→cancelling→cancelled
- 60초×attempt backoff 재시도(기본 3회), boot `reconcileInterrupted()` 재큐/실패 확정, 14일 종결 job GC
- API in-process worker 1초 poll, 실행 중 30초 heartbeat
- `GET /api/jobs`·`GET /api/jobs/:id`·`GET /api/jobs/:id/events`·`POST /api/jobs/:id/cancel` (owner·admin session 또는 `job:read`/`job:write` API key, 취소는 최근 15분 인증 + audit)
- 자동 backup 이 첫 소비자: 1분 due-check(최신 backup 시각 + interval 로 next-run 유도, 재시작 안전), unique enqueue 로 중복 방지
- `GET /api/jobs/backup-schedule` 와 패널 작업 큐 위젯(owner·admin)이 job 목록·취소·interval·last success/failure·next run 을 노출한다
- 외부 enqueue endpoint 없음. api·engine-agent·traffic-worker 세 앱 모두 `lib/error.ts` 의 `createAppError` 로 오류를 던진다.
- 추가 소비자: `backup.restore`, `image.pull`, `system.prune`, `traffic.export`, `deploy.load`, `deploy.release`, `deploy.rollback`, `deploy.stack-release`, `secret.rotate`, `upload.finalize`. 잔여는 live 24시간 주기 실행 증거(g-2)다.

## 5. 최근 checkpoint의 주요 파일

2026-08-01 job·stream·maintenance·Docker 명령·prune·registry 인증·traffic durability (Phase 8~16):

- `packages/contracts/src/operation-job.ts`, `engine-stream.ts`, `maintenance.ts`, `engine-control.ts`
- `packages/db-schema/drizzle/0008_easy_marvex.sql` (operation_job·operation_job_event)
- `apps/api/src/service/domain/job/` — operation-job·backup-schedule·job-handlers
- `apps/api/src/service/domain/maintenance/create-maintenance-service.ts`
- `apps/api/src/route/job/`, `route/maintenance/`, `route/stream/`, `route/backup/`(restore job 전환), `route/control/`(kill·update·wait·top·changes·pull·tag)
- `apps/api/src/compose/create-app.ts` (mutation gate), `apps/api/src/lib/error.ts`
- `apps/engine-agent/src/service/domain/create-engine-stream-service.ts`, `create-stream-parsers.ts`, `route/create-engine-stream-route.ts`
- `apps/engine-agent/src/service/shared/create-docker-engine-client.ts` (stream 헬퍼·kill/update·wait/top/changes·pull/tag)
- `apps/web/src/widgets/job/`, `features/live-log-stream/`, `entities/job/`, `entities/maintenance/`
- `apps/web/src/widgets/prune/`, `apps/web/src/entities/infrastructure/infrastructure.api.ts`
- `apps/engine-agent/src/service/domain/create-registry-credential-service.ts`, `apps/web/src/widgets/registry/registry-widget.tsx`
- `packages/contracts/src/registry-credential.ts`
- `packages/contracts/src/traffic.ts`, `apps/traffic-worker/src/service/domain/create-traffic-ingestion-service.ts`, `create-traffic-export-service.ts`
- `apps/api/src/route/traffic/create-traffic-route.ts`, `apps/web/src/features/traffic-live-tail/`, `traffic-export/`
- `docs/acknowledge/0014` ~ `0021`

보안 경계:

- `infra/nginx/nginx.conf`
- `apps/engine-agent/src/service/domain/create-nginx-config-service.ts`
- `apps/api/src/compose/create-app.ts`
- `apps/api/src/service/domain/api-key/create-api-key-service.ts`
- `docs/acknowledge/0012-edge-security-rate-limit.md`

백업:

- `packages/contracts/src/backup.ts`
- `apps/api/src/service/domain/backup/create-backup-service.ts`
- `apps/api/src/route/backup/create-backup-route.ts`
- `apps/api/src/service/shared/traffic-worker-client/create-traffic-worker-client.ts`
- `apps/traffic-worker/src/service/domain/create-traffic-backup-service.ts`
- `apps/traffic-worker/src/route/create-backup-route.ts`
- `apps/web/src/entities/backup/backup.api.ts`
- `apps/web/src/widgets/backup/backup-widget.tsx`
- `docs/BACKUP-RESTORE.md`
- `docs/acknowledge/0013-local-backup-restore-runtime.md`

배포·secret 이전 checkpoint:

- `apps/api/src/service/domain/deployment/create-deployment-release-service.ts`
- `apps/api/src/service/domain/deployment/create-deployment-secret-service.ts`
- `apps/web/src/widgets/deployment/deployment-widget.tsx`
- `apps/web/src/widgets/deployment/deployment-secret-widget.tsx`
- `docs/acknowledge/0009-blue-green-deployment-runtime.md`부터 `0011-secret-storage-disk-watermark.md`

## 6. 확정 검증 증거

2026-08-01 KST 기준:

- `bun run typecheck`: 7 workspace 모두 성공
- `bun run lint`: 성공
- `bun run format:check`: 성공
- `bun test`: 158 pass, 0 fail, 530 assertions, 34 files
- Phase 12 agent E2E: pull→tag→create→top→changes→update→kill→wait(exit 137)→정확 ID 정리, fixture 무잔재, 신규 API 5종 미인증 401
- Phase 13: 관리 plane 보호·prune preview·image dependency impact 4개 신규 테스트, 실제 Compose resource label 확인, `/api/system/prune-preview` 미인증 401
- Phase 14: owner route의 최근 인증·stale SHA·single-attempt enqueue, worker의 재검증·실행 순서·취소, Agent build-cache filter를 단위·통합 검증. owner 브라우저에서 초기 859개→최종 836개 build cache 후보·20개 보호 리소스·volume opt-in·확인 문구 UI 확인
- Phase 14 최종 웹 재배포 후 UTC ISO 날짜 렌더로 hydration text mismatch를 제거하고 새 브라우저 탭 console error 0건 확인
- Phase 15: Agent AES-GCM credential persistence·host mismatch·회전·삭제, API secret 비노출·credential-ID-only job payload, Engine auth 전달 테스트. live key 0600, 미인증 API 401, owner 패널과 console error 0건 확인
- Phase 16: checkpoint·rotation·DB replay·live mask/filter·export 취소/retention/민감정보 비노출 테스트. checkpoint 0600, 실제 요청 3건→DB 3건, live/export 미인증 401, owner live pause/resume·CSV/NDJSON job/download·audit, console error 0, 5개 서비스 healthy 확인
- Phase 9 e-2: owner 브라우저에서 `containers-api-1` 실시간 로그의 `Started development server: http://localhost:3001` 수신과 연결 중지, console error 0건 확인
- `/api/maintenance` 미인증 401, maintenance off 상태에서 mutation 경로 정상 통과 확인
- api 이미지 재빌드·재기동 후 live control DB 에 `operation_job`·`operation_job_event` 존재, `/api/jobs` 미인증 401
- Agent 3종 stream(logs·stats·events) 실수신 200 `text/event-stream` + 정규화 데이터, `/api/stream/*` 미인증 401
- Next.js 16.2.12 production build: 성공 (2026-08-05 에 16.3.0 으로 상향, 재빌드 성공 — [acknowledge/0031](./acknowledge/0031-dependency-and-type-hardening.md))
- Phase 14 Next.js webpack production build와 Compose image 내부 Turbopack build: 성공. host root의 기본 Turbopack build는 compile 단계에 장시간 정지해 중단했으며 환경 차이로 기록한다.
- API·Agent·Traffic Worker Bun production bundle: 성공
- Compose 5개 서비스: healthy
- live control DB integrity: `ok`
- live control DB FK violations: 0
- Nginx 후보 actual syntax test·atomic apply: 성공
- panel/API security header 실제 응답 확인
- 무효 로그인 12회 중 앞 6회 인증 응답, 뒤 6회 429
- Chromium SSR dashboard·client interaction·backup widget 확인
- 실제 blue-green v1→v2→manual rollback, secret injection, graceful stop timeout 검증
- 실제 control+traffic backup create→pre-restore snapshot→restore 성공
- Phase 18: migration 파일 sha256 vs `__drizzle_migrations.hash` applied/pending 판정, integrity `ok`, active job count, 최신 backup, 버전 노출 단위 검증. `/api/control-plane/status` 미인증 401 실측, owner·admin 200·역할 인자 `['owner','admin']`·FORBIDDEN 403 통합 검증. `GET /api/health` version `0.1.0` 실측

최종 검증 명령:

```sh
bun run typecheck
bun run lint
bun run format:check
bun test --silent
docker compose ps
```

Docker Compose 명령은 desktop sandbox에서 권한 승인이 필요할 수 있다.

## 7. 현재 보존 상태

**2026-08-06 전체 초기화 이후 상태다.** 이전 checkpoint 의 backup ID·artifact·fixture 기록은 [history/](./history/) 와 `acknowledge/` 의 시점 기록으로만 유효하다.

- 남은 volume 은 자격증명 3종뿐이다: `containers_agent-credentials`, `containers_traffic-credentials`, `containers_registry-credentials`. 내부 HMAC 비밀과 secret 키가 여기 있다.
- 지운 volume: `control-data`(계정·API 키·감사·배포·라우트·패널 설정), `traffic-data`, `artifacts`, `backups`, `nginx-config`, `nginx-logs`.
- 초기화 직후에는 owner 계정이 없었다. **6.1·6.2 실측을 위해 `bun scripts/seed-e2e.ts` 로 owner(`stack-check@containers.local`)를 만들었다.** 실운영 계정은 로컬 주소 bootstrap 으로 따로 만든다.
- 6.1·6.2 실측이 남긴 자산: artifact 2건, manifest 4건, 스택 1건, 스택 배포 2건, job 여러 건. 배포 컨테이너와 라우트는 정리했다. artifact·manifest·스택은 삭제 경로가 없어 남아 있다 → [bug](./bug/2026-08-06-loaded-artifacts-cannot-be-deleted.md)
- 배포 테스트 컨테이너·이미지(`demo-*`·`fail-demo-*`)는 정확한 이름으로 삭제했다. 사용자 소유 리소스(`poc1c`·`poc1d`·`poc1-debug2`·`api-proxy2`)와 `containers-dr-*` 이미지는 건드리지 않았다.

앞으로도 volume 삭제와 `down -v` 는 사용자 명시 지시가 있을 때만 한다.

## 8. 반드시 고려할 현재 한계

### P0 — 완전 원격 운영을 막는 항목

1. Docker 명령의 owner durable prune과 registry 인증 pull은 0019·0020으로 완료됐다. 일부 catalog/UI 완전성이 남았다.
2. durable job queue·jobs 패널·backup(자동/restore)·image pull 소비자는 완료됐다. deploy·upload 의 job 전환과 resource lock, idempotency key 도 0024 로 완료됐다.
3. maintenance mode(수동 toggle·restore 자동 적용)는 구현됐다. control plane upgrade 준비 상태 검증(`/api/control-plane/status`)과 runbook([CONTROL-PLANE-UPGRADE.md](./CONTROL-PLANE-UPGRADE.md))은 0023으로 완료됐다. 실제 재배포는 host 명령으로 수행하며 API 가 컨테이너를 조작하지 않는다(SECURITY.md §11).
4. Cloudflare Tunnel·Access의 실제 설치·도메인 mapping·token rotation runbook이 없다. 터널 자체는 2026-08-06 에 `https://hyuns.uk` 로 동작 중이며 패널 공개 주소도 복구했다. **패널 앞단 인증 게이트(Access)는 없다** — 지금은 누구나 로그인 화면까지 도달한다.
5. fresh machine 설치 E2E가 없다. 재해복구 드릴 기록([quality-assurance/2026-08-05-disaster-recovery-drill.md](./quality-assurance/2026-08-05-disaster-recovery-drill.md))은 있으나 **다른 머신에서 처음부터 세우는 절차는 해본 적이 없다.**

### P1 — 데이터·복구·보안

1. backup이 DB 크기만큼 메모리를 사용할 수 있다.
2. restore는 두 DB에 대한 보상 복구이며 분산 원자 transaction이 아니다. (2026-08-01부터 maintenance drain 하에 durable job 으로 실행되어 mutation interleave 는 차단된다)
3. (해소 2026-08-01) backup scheduler 성공·실패·다음 실행 시각이 `GET /api/jobs/backup-schedule` 와 패널 작업 큐 위젯에 노출된다. backup 실패 alert는 0022의 durable notification job 으로 연동 완료다.
4. schema migration 간 restore가 지원되지 않는다.
5. **오프박스 백업이 없다(잔여 위험 1위).** 백업은 원본과 같은 호스트의 `containers_backups` 볼륨에만 있어 디스크 고장·볼륨 삭제면 데이터와 함께 사라진다. R2 client-side 암호화 backup 도 미구현이다. 2026-08-06 사용자 판단으로 보류(둘 곳이 없음) — 저장 위치가 생기면 백업 job 성공 뒤 사본을 하나 더 만드는 작은 작업이다.
6. internal credential 무중단 rotation이 없다. **API key 는 2026-08-06 부터 만료가 필수(1~365일)** 라 영구 자격증명은 만들 수 없지만, 교체는 여전히 수동이다.
7. (해소 2026-08-06) audit hash chain 이 `audit_log.sequence`·`previous_hash`·`entry_hash` 로 구현됐고 `GET /api/audit/integrity` 와 감사 화면이 검증 결과를 보여 준다. 외부 checkpoint 는 하루 1회 `system.report` 알림이 head 해시를 호스트 밖으로 내보내 대신한다 — **알림 대상을 등록하고 구독해야 실제로 동작한다.** server-side filter 는 있고 export 는 여전히 없다.
8. scanner, SBOM, vulnerability policy와 owner exception이 없다. 배포하는 이미지의 CVE 는 제품 밖 습관(베이스 이미지 재pull·재빌드)에 달려 있다.
9. direct localhost process의 `CF-Connecting-IP` spoofing은 origin-local trust 한계다.
10. (부분 해소 2026-08-06) 패널 `script-src` 는 nginx 가 요청마다 발급하는 `$request_id` nonce 를 쓰고 `'unsafe-inline'` 을 뺐다. `style-src` 는 Next.js 인라인 스타일 때문에 여전히 `'unsafe-inline'` 이다.

### P2 — UI/관측·품질

1. dashboard가 한 페이지에 길게 누적돼 정보 구조와 navigation을 재설계해야 한다.
2. mobile/tablet, dark/light, keyboard, focus, screen reader, contrast 전수검증이 없다.
3. traffic live SSE·export·log rotation inode recovery와 owner browser 실측은 0021로 완료됐다. minute/hour rollup, saved view, 시계열·errors·slow 화면이 남았다.
4. 목표 규모 load test, SQLite query plan, disk-full·daemon restart chaos가 없다.
5. ko/en/ja는 있으나 외부 language pack registry 계약 검증이 없다.

## 9. 권장 다음 구현 순서

2026-08-01 세션에서 durable job queue(0014), Docker SSE stream(0015), jobs 패널·backup schedule, maintenance mode·restore job(0016), container·image 명령 완전성 1차(0017)가 완료됐다. 상세 이력은 [history/2026-08-01-durable-jobs-streams-commands.md](./history/2026-08-01-durable-jobs-streams-commands.md). 같은 세션 후반에 durable notification/Discord(0022)도 완료됐다.

다음 세션은 범위를 넓게 동시에 건드리지 말고 아래 순서로 진행한다.

1. 잔여 실측 증거 2건을 owner 로그인으로 확보한다: live `backup.create` job(g-2, 24시간 경과 시 자동), restore job E2E(i-2). 실시간 로그·jobs 패널 브라우저(e-2)는 완료됐다.
2. traffic live/export owner E2E는 완료됐다. Discord adapter 비동기 notification job(backup 실패 alert, 0022)도 완료됐다. 다음 기본 구현은 R2 encrypted replication adapter다.
3. (완료) [RESUME-CHECKLIST.md](./RESUME-CHECKLIST.md)의 Phase 17 체크리스트 — secret reference·retry·dedupe·redaction 결정(0022)과 구현·단위 검증 완료. 남은 것은 승인된 webhook으로 실전송 확인뿐이다.
4. R2는 로컬 backup 성공과 분리된 optional encrypted replication adapter로 추가한다.
5. control plane upgrade/rollback runbook·UI, Cloudflare 설치 runbook과 fresh M1 Max restore E2E를 수행한다.
6. 마지막에 dashboard navigation·responsive·accessibility를 전수 개선한다.

durable job 기반이 완성됐으므로 이후 prune, export, scanner, notification, upgrade는 모두 같은 진행률·재시도·감사·취소 기반을 공유한다.

## 10. 다음 세션의 첫 안전 점검

상세하고 최신인 절차는 [RESUME-CHECKLIST.md](./RESUME-CHECKLIST.md)를 따른다. 아래는 최소 점검이다.

```sh
pwd
rg --files docs | sort
bun run typecheck
bun run lint
bun test --silent
docker compose ps
```

그 다음 코드 탐색은 `rg`를 사용한다. 예:

```sh
rg -n "durable|job|events|stats|logs|backup" apps packages docs
```

현재 서비스 재빌드가 필요하면 변경 서비스만 대상으로 한다.

```sh
docker compose build api web traffic-worker engine-agent nginx
docker compose up -d --wait
```

무조건 전체를 다시 빌드할 필요는 없다. Nginx managed config는 named volume에 남으므로 `infra/nginx/nginx.conf` 변경만으로 runtime current가 자동 교체되지 않는다. 반드시 authenticated `/api/nginx/config/apply` 경로와 current SHA를 사용한다.

## 11. 안전 불변식

- `/var/run/docker.sock` mount를 API나 web에 추가하지 않는다.
- Docker CLI·host shell 문자열 실행 endpoint를 만들지 않는다.
- host bind mount, privileged, host namespace, device, Docker socket workload 재마운트를 기본 허용하지 않는다.
- secret 값, cookie, API key 원문, full env, terminal stdin/output을 audit·log·API inspect에 넣지 않는다.
- raw Nginx 설정 보호 token을 약화하지 않는다.
- 외부 workload route에서 control network에 접근시키지 않는다.
- artifact를 검사 전에 load·extract·execute하지 않는다.
- 파괴 작업은 대상명 또는 UUID confirmation과 최근 인증·audit를 유지한다.
- 테스트 fixture는 고유 prefix를 쓰고 생성한 정확한 대상만 정리한다.
- 사용자 Docker resource와 named volume을 추정으로 삭제하지 않는다.

## 12. 문서 유지 규칙

기능을 구현할 때 다음을 함께 갱신한다.

1. `docs/IMPLEMENTATION-PLAN.md` 체크 상태
2. `docs/PROCESS.md` 구현 작업 목록
3. `docs/quality-assurance/ACCEPTANCE.md` 실제 증거가 있는 항목만 체크
4. 해당 도메인 운영 문서
5. 중요한 결정은 다음 번호의 `docs/acknowledge/` 문서
6. 이 handoff의 완료 범위·검증 수치·다음 우선순위

체크박스는 코드가 존재한다는 이유만으로 체크하지 않는다. 실제 단위/통합/브라우저/Docker 증거 중 위험에 비례한 검증이 완료됐을 때만 체크한다.

## 13. 2026-08-04 웹 UI/UX 전면 개편과 백엔드 결함 수정

브랜치 `feat/web-ui-refresh`. 스펙은 [acknowledge/0029](./acknowledge/0029-monotone-design-system.md), 감사 원본은 [quality-assurance/2026-08-04-ui-backend-audit.md](./quality-assurance/2026-08-04-ui-backend-audit.md)다.

### 디자인 시스템

- `globals.css`를 모노톤 토큰 체계로 재작성했다 — surface 3단, overlay 4단, 텍스트 3단 opacity 스케일 + shadcn 표준 토큰. cascade layer 밖에서 모든 `rounded-*`를 무력화하던 전역 `* { border-radius: 0 }` 우회를 제거하고 `--radius: 0rem` 매핑으로 대체했다.
- `shared/ui` primitive 6종을 공식 new-york 구조로 교체(그동안 **키보드 focus-visible 표시가 전무**했다)하고 14종을 신규 도입했다. border·shadow는 surface elevation으로, 하드코딩 팔레트는 의미색 토큰으로 치환한다. 설치 방식은 [SHADCN-COMPONENTS.md](./SHADCN-COMPONENTS.md) §6을 따른다(CLI 금지).

### 구조·UX

- **`panel-shell`이 `children`을 모바일·데스크톱 `main`에 각각 렌더해 모든 위젯이 2회 마운트되던 결함**을 shadcn Sidebar 도입으로 해소했다(SSE 2중 연결·폴링 2배·DOM id 중복).
- `window.location.reload` 12~14곳을 제거하고 위젯이 엔티티 쿼리를 구독하도록 바꿨다. 리터럴 쿼리 키를 없애 `invalidateQueries` 접두사 매칭이 실제로 성립한다.
- 파괴적 작업은 AlertDialog(확인 문구 일치 시에만 활성)로, 일시 피드백은 toast, 지속 상태는 Alert로 통일했다. 목록은 Table, 로딩은 Skeleton, 빈 상태는 Empty다.
- 대시보드는 요약 전용으로 축소하고 트래픽 상세는 `/traffic`으로 옮겼다(두 페이지가 동일 위젯을 통째로 중복 렌더했다).

### 백엔드

[SECURITY.md](./SECURITY.md) §15와 [acknowledge/0029](./acknowledge/0029-monotone-design-system.md) §7 참조. traffic-worker 수집 영구 정지, api 에러 매핑 붕괴(모든 agent 실패가 500), engine-agent `tagImage` 보호 부재와 참조 해석 fail-open, API key scope 권한 상승, durable job stall 미회수 등 10건을 테스트와 함께 고쳤다.

### 검증

(2026-08-04 시점 증거) typecheck, lint 0, test 199 pass, format:check, build. Compose 5개 healthy, 미인증 401, 전 패널 라우트 200. 브라우저 실측(라이트·다크, 1440·390) console error 0건 — 실측 중 hydration 불일치 2건(모듈 싱글턴 QueryClient, layout↔page 동일 키 이중 프리페치)을 발견해 근본 수정했다.

### 주의

- (시점 기록, 2026-08-04) E2E용으로 owner 비밀번호를 재설정한 적이 있다. **2026-08-06 초기화로 계정 자체가 사라졌으므로 지금은 해당 없다** — 로컬 bootstrap 으로 새로 만든다.
- 남은 보류 4건은 acknowledge 0029 §8에 있다.
