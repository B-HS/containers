# PROCESS — 현재 작업 상태

## 기준 문서

- 코딩 규칙: `/Users/hyunseokbyun/development/llm-rules/docs/convention/`
- 디자인·운영 레퍼런스: `/Users/hyunseokbyun/development/flunti-otel`
- 공식 문서 근거: [references/OFFICIAL-SOURCES.md](./references/OFFICIAL-SOURCES.md)
- 현재 단계: 승인된 구현 계획에 따라 단계별 구현과 검증을 수행한다.
- 안전 재개 단일 진입점: [RESUME-CHECKLIST.md](./RESUME-CHECKLIST.md)

## 작업: 구현 전 지시서 완성

- [x] 사용자 요구사항을 기능·비기능·보안 요구로 분해
- [x] `llm-rules`의 AI 작업, TypeScript, 주석, 보안, 프론트엔드, FSD, TanStack Query, Hono·Drizzle 규칙 확인
- [x] `flunti-otel`의 모노레포, Hono RPC, shadcn, 3단 셸, 디자인 토큰, UI 검증 문서 확인
- [x] Next.js, Hono, Docker Engine, Nginx, Cloudflare Tunnel, Drizzle, Better Auth, Bun, shadcn 공식 문서 확인
- [x] 제품 요구사항과 완료 조건 작성
- [x] 전체 아키텍처와 신뢰 경계 작성
- [x] 기술 스택과 런타임 선택 기준 작성
- [x] Docker 제어, Nginx 설정, 트래픽 분석, 업로드·배포 지시서 작성
- [x] Hono RPC, DB, 로그인, API 키 지시서 작성
- [x] UI/UX와 shadcn 전체 컴포넌트 사용 계획 작성
- [x] 테스트 전략, 구현 순서, 인수 체크리스트 작성
- [x] 모호점과 고도화 선택지를 한 묶음으로 작성
- [x] 요구사항 추적표와 문서 자체 감사 완료
- [x] 사용자 결정 수신 후 `docs/acknowledge/`에 최종 합의 기록
- [x] 사용자 승인 후 구현 단계 체크리스트를 활성화

## 작업: 2026-07-31 구현 결정 반영

- [x] 22개 구현 결정과 production 운영 정보 수신
- [x] 결정 원문과 파생 제약을 `docs/acknowledge/0002-product-decisions.md`에 기록
- [x] macOS Apple Silicon·Docker Desktop 전용 배치와 격리 경계를 문서화
- [x] Cloudflare Free, Access 적용 패널, API-key-only 외부 API 경계를 문서화
- [x] 모든 artifact, raw IP, 3개 언어, Discord webhook, 선택적 R2 정책을 반영
- [x] 전체 `nginx.conf` 편집의 검증·관찰·자동 복구 계약을 반영
- [x] 384GB Docker Desktop disk의 동적 관측·보호 기준을 반영
- [x] 테스트·인수·요구사항 추적성과 문서 링크를 재검증

## 문서 단계 종료 조건

- 요구사항 1~12와 원격 완전 조작 요구가 각각 설계·테스트 항목에 연결되어야 한다.
- Docker 소켓, 임의 명령, 파일 업로드, 인증, Nginx 리로드의 실패·공격 경로가 문서화되어야 한다.
- 모든 화면이 SSR 또는 클라이언트 상호작용 중 어느 경로를 쓰는지 정해져야 한다.
- shadcn 공식 컴포넌트 전체 목록이 누락 없이 분류되어야 한다.
- 구현자가 별도 추측 없이 페이즈 순서, API 범위, 데이터 모델, 테스트 기준을 따라갈 수 있어야 한다.
- 확정 결정은 ADR, 설계, 구현 Phase와 인수 항목에 연결되어야 한다.

## 작업: Phase 0·1 구현 시작

- [x] 사용자 구현 시작 승인 수신
- [x] 로컬 Bun·Docker Desktop 상태 확인 — Bun 1.3.14, Docker daemon 미실행
- [x] 최신 안정 의존성을 exact version과 `bun.lock`으로 고정
- [x] Bun workspace, TypeScript strict, formatter·lint·test·build 기반 생성
- [x] Hono API·Engine Agent·Traffic Worker의 health 경계 구현
- [x] Next.js App Router와 `ko/en/ja` locale 기반 구현
- [x] 공유 contract·환경 검증 package 구현
- [x] Docker Compose 다중 서비스와 Nginx 기본 ingress 구성
- [x] typecheck, format·lint, unit test, build 검증
- [x] Docker Desktop 실행 환경에서 Compose·Engine 초기 smoke 검증
- [x] 실제 브라우저에서 desktop·mobile 레이아웃 수치와 콘솔 오류 검증

## 작업: Phase 3·4 인증과 Engine 조회

- [x] Better Auth·Drizzle Bun SQLite·Docker Engine API 최신 공식 계약 확인
- [x] 공개 API prefix를 `/api/*`로 통일
- [x] Drizzle control DB schema와 migration 생성
- [x] Better Auth email/password·session과 공개 가입 차단 구성
- [x] owner bootstrap, role, 단회 invitation 기반 구현
- [x] owner 전용 운영자 목록·역할 변경·비활성화와 세션 즉시 폐기 구현
- [x] 비활성 계정 sign-in 403 선차단과 owner 불변식 구현
- [x] Agent version·info·system df·container list typed operation 구현
- [x] API의 internal Agent client와 Hono RPC route 구현
- [x] SSR dashboard를 실제 Engine·disk·container 상태에 연결
- [x] 단위·계약·Docker·브라우저 검증과 ADR 갱신

## 작업: Phase 5 Docker 제어와 감사

- [x] capability별 role 권한표를 코드 계약으로 고정
- [x] Agent container start·stop·restart·pause·unpause·rename·remove 구현
- [x] Agent image list·remove 구현
- [x] 비대화형 exec create·multiplex stream·exit code 계약 구현
- [x] API route·입력 검증·step-up confirmation 구현
- [x] 모든 변경 명령의 append-only audit log 기록
- [x] 컨테이너 목록·작업 UI 구현
- [x] 단위·계약·Docker·브라우저 검증과 ADR 갱신
- [x] container inspect·bounded log 정규화와 민감 환경·label 값 제거
- [x] interactive WebSocket exec ticket과 xterm 양방향 terminal 구현
- [x] heartbeat·detach·idle/max-duration·동시 session·backpressure hardening 구현
- [x] exec 종료 code와 연결 중 session revoke 재검증 구현
- [x] image 목록·확인문구 삭제 전용 UI 구현
- [x] network·volume 목록·생성·확인문구 삭제와 민감 label·option 값 제거
- [x] 보안 기본값과 resource limit를 적용한 container 생성 API·패널 구현
- [x] 역할 기반 감사 로그 조회·필터 패널과 IP masking 구현
- [x] owner/admin 단회 초대 생성·수락 패널과 3개 언어 경로 구현
- [x] 초대 생성·수락과 사용자 변경 audit 구현

## 작업: Phase 6 Nginx·트래픽 관측

- [x] Nginx JSONL access log Zod 검증과 offset tail 구현
- [x] Traffic SQLite raw event 영속화와 14일 retention 구현
- [x] 요청률·4xx·5xx·평균 응답시간 집계 API 구현
- [x] Traffic Worker HMAC 인증과 replay 방지 구현
- [x] 내부 전용 Nginx stub_status와 typed API 구현
- [x] SSR overview의 Nginx·traffic placeholder 제거
- [x] 실제 로그 491건 invalid 0건·브라우저·Docker 검증
- [x] 전체 Nginx config 조회·revision·`nginx -t`·atomic swap·HUP·probe·rollback 구현
- [x] 보호 route·status·access log 계약 제거 차단과 optimistic SHA 충돌 검사
- [x] 최근 60분 정확한 p50·p95·p99, status·path filter, top path, 최근 요청 API·SSR UI 구현
- [x] 원본 IP raw 저장·일반 API/UI masking과 4xx 필터 E2E 검증
- [x] 구조화 hostname·path·container proxy route, 충돌·관리 hostname 차단, deterministic renderer 구현
- [x] 구조화 route 생성·실제 workload proxy·삭제와 패널 overflow E2E 검증

## 작업: Phase 7 Artifact 업로드·배포

- [x] artifact·upload session·chunk·deployment schema와 migration 생성
- [x] 64MiB chunk offset·개별 digest·전체 SHA-256 검증 구현
- [x] quarantine·ready 원자적 상태 전환과 사용자별 동시 upload 제한 구현
- [x] Docker Desktop 동적 disk watermark·총 upload byte quota 구현
- [x] Docker image archive load Agent operation 구현
- [ ] OCI·압축 변형·rootfs·Compose bundle·build context importer 구현
- [x] Docker·OCI archive 검사, 업로드·image load panel과 API key 경로 구현
- [x] immutable deployment manifest·digest·route identity·secret reference 계약 구현
- [x] AES-256-GCM secret 저장·rotation·release resolver 구현
- [x] control network health→edge 전환→Nginx route→observation과 자동 rollback 구현
- [x] 중단 release 시작 시 reconciliation·수동 rollback·retention cleanup 구현
- [x] 단계 중간 재개가 가능한 durable job queue 구현 (Phase 8 섹션 참조)
- [x] Nginx·로그인·API key rate limit과 panel/API security header 구현
- [x] control·traffic SQLite 로컬 backup·retention·복구 API와 Owner SSR panel 구현
- [x] 실제 양 DB restore drill, 사전 recovery snapshot, FK·integrity·digest 검증 완료
- [ ] 보안 검사 adapter·Discord·backup 확장점 구현

## 작업: Phase 8 Durable operation job queue (2026-08-01 시작)

기준 문서: [acknowledge/0014-durable-operation-job-queue.md](./acknowledge/0014-durable-operation-job-queue.md), [HANDOFF-STATUS.md](./HANDOFF-STATUS.md) §9

- [x] a. `@containers/contracts` 에 operation job 계약(종류·상태·엔티티·이벤트·목록 쿼리) 정의
- [x] b. control DB 에 `operation_job`·`operation_job_event` schema 와 migration 0008 생성
- [x] c. `createOperationJobService` — enqueue(unique)·claim·heartbeat·progress·retry(backoff)·cancel·reconcile·finished GC·worker loop 구현
- [x] d. 첫 소비자: 자동 backup 을 durable job 으로 이전 (interval enqueue + boot catch-up, 기존 수동 backup API 유지)
- [x] e. `/api/jobs` 조회·상세·이벤트 timeline·cancel route 와 create-app 조립
- [x] f. 단위 테스트 — 상태 machine 전이·재시도·취소·중단 복구·unique·GC (7건, 실제 SQLite·migration 기반)
- [x] g. 기계 검증(typecheck→lint→format→test 84건→build)과 Compose api 재빌드·재기동 — migration 적용, `/api/jobs` 401 인증 강제, catch-up 은 최신 backup 이 interval 미경과라 정상적으로 미발동
- [ ] g-2. 실제 24시간 주기 또는 interval 경과 재시작에서 live `backup.create` job 성공 이력 확인
- [x] h. 문서 갱신 — IMPLEMENTATION-PLAN·ACCEPTANCE·BACKUP-RESTORE·HANDOFF-STATUS·acknowledge 0014

## 작업: Phase 9 Docker events·logs·stats SSE (2026-08-01 시작)

기준 문서: [acknowledge/0015-docker-stream-sse.md](./acknowledge/0015-docker-stream-sse.md), [HANDOFF-STATUS.md](./HANDOFF-STATUS.md) §9-2

- [x] a. Docker Engine API v1.52 OpenAPI 로 events NDJSON·logs multiplex frame·stats 계산식 계약 확인
- [x] b. `@containers/contracts` 에 stream 이벤트 계약(`engine-stream.ts`) 정의
- [x] c. Agent — chunked stream 헬퍼·incremental multiplex parser·events/logs/stats 정규화 SSE route (heartbeat 15초·동시 20개·최대 30분, Actor attribute 는 name 만)
- [x] d. API — Agent stream client 와 `/api/stream/*` SSE proxy (role 인증·15초 세션 재검사·양방향 abort 전파)
- [x] e. Web — 컨테이너 실시간 로그 follow UI (EventSource, ko/en/ja label)
- [x] e-2. owner 브라우저에서 API 컨테이너 실시간 로그 연결·수신·중지와 console error 0건 확인
- [x] f. 단위 테스트 — multiplex incremental parser(경계·truncate)·stats/event 정규화·동시 상한·SSE 방출·proxy 인증 (8건)
- [x] g. 기계 검증(typecheck→lint→format→test 92건→build)과 Compose 재빌드 — api 컨테이너 내부에서 Agent 3종 stream 실수신(200 text/event-stream, 정규화 log/stats/event data), `/api/stream/*` 미인증 401
- [x] h. 문서 갱신 — IMPLEMENTATION-PLAN·ACCEPTANCE·OFFICIAL-SOURCES·HANDOFF-STATUS·acknowledge 0015

## 작업: Phase 10 Jobs 패널·backup schedule 관측 (2026-08-01 시작)

기준 문서: [acknowledge/0014-durable-operation-job-queue.md](./acknowledge/0014-durable-operation-job-queue.md), [HANDOFF-STATUS.md](./HANDOFF-STATUS.md) §9-3

- [x] a. 자동 backup scheduler 를 고정 interval 에서 1분 due-check 로 개선 (next-run 을 최신 backup 시각에서 유도, 재시작 안전)
- [x] b. backup schedule 서비스 — interval·last success/failure·next run 계산과 due enqueue (`create-backup-schedule-service.ts`)
- [x] c. `GET /api/jobs/backup-schedule` route (owner·admin, `/jobs/:id` 보다 먼저 등록)
- [x] d. Web — jobs SSR 패널 (owner·admin, job 목록·상태·attempt·취소·schedule 카드, ko/en/ja)
- [x] e. 단위·통합 테스트 — schedule 계산·due enqueue·route 통합 (94 pass 전체 통과)
- [x] f. 기계 검증(typecheck→lint→format→test→build)과 api·web 재빌드 — `/api/jobs/backup-schedule` 미인증 401, boot due-check 는 최신 backup 미경과로 정상 미발동
- [x] g. 문서 갱신 — BACKUP-RESTORE·HANDOFF-STATUS·acknowledge 0014 추가 결정

## 작업: Phase 11 Maintenance mode·restore durable job (2026-08-01 시작)

기준 문서: [acknowledge/0016-maintenance-restore-job.md](./acknowledge/0016-maintenance-restore-job.md), [HANDOFF-STATUS.md](./HANDOFF-STATUS.md) §9-4

- [x] a. contracts — maintenance 상태·변경 계약, `backup.restore` job kind·payload 계약 (kind enum 은 TS 수준, migration 불필요 확인)
- [x] b. maintenance 서비스 — enable/disable·in-flight mutation 추적·drain(50ms poll, timeout 시 `MAINTENANCE_DRAIN_TIMEOUT`)
- [x] c. create-app mutation gate middleware — maintenance 중 POST/PUT/PATCH/DELETE 503 + retry-after 30, `/api/maintenance` 예외
- [x] d. `GET /api/maintenance`(전 role)·`POST /api/maintenance`(owner, 최근 인증, audit targetType `maintenance`) route
- [x] e. `create-job-handlers.ts` factory 와 `backup.restore` handler — enable→drain→restore→job 이 켠 경우에만 disable, maxAttempts 1
- [x] f. restore route 를 job enqueue 로 전환 — confirmation 검증 유지, unique, 다른 backup 대상 활성 시 `BACKUP_RESTORE_IN_PROGRESS`
- [x] g. Web — 복구 시작 문구(3개 언어), 작업 큐 위젯 maintenance badge, `entities/maintenance` SSR 조회
- [x] h. 단위·통합 테스트 — maintenance 서비스 drain·timeout, handler 순서·수동 모드 존중·payload 검증, gate 차단·예외·조회 허용 (100 pass)
- [x] i. 기계 검증(typecheck→lint→format→test→build)과 api·web 재빌드 — `/api/maintenance` 401, mutation 경로 정상(503 아님) 확인
- [ ] i-2. owner 인증으로 실제 restore job E2E (enqueue→maintenance→drain→restore→job 결과) 확인
- [x] j. 문서 갱신 — BACKUP-RESTORE·HANDOFF-STATUS·ACCEPTANCE·acknowledge 0016

## 작업: Phase 12 Docker 명령 완전성 1차 (2026-08-01 시작)

기준 문서: [acknowledge/0017-docker-command-completeness.md](./acknowledge/0017-docker-command-completeness.md), [HANDOFF-STATUS.md](./HANDOFF-STATUS.md) §8 P0-1

- [x] a. contracts — container kill(signal 화이트리스트)·update(resource) action, wait·top·changes, image pull·tag 계약
- [x] b. Agent docker client — kill/update action, wait(condition=not-running, bound)·top·changes(null→[]), pull(progress line 소비·error 검출·마지막 20 status), tag
- [x] c. Agent service·route 노출 (query: wait·top·changes, control: pull·tag) — control service 의 기존 `throw new Error` 도 `createAppError` 로 전환
- [x] d. API agent client·control service·route — kill=operator, update/tag/pull=최근 admin + audit, top/changes=전 role
- [x] e. `image.pull` durable job kind·handler (agent client timeout 30분, 202 + job 반환)
- [x] f. 단위·통합 테스트 — handler pull 검증·stub 확장 (101 pass)
- [x] g. 기계 검증·재빌드·실측 E2E — alpine:3.20 fixture 로 pull→tag→create→top→changes→update→kill→wait(137)→정확 ID 정리, 신규 API 5종 미인증 401
- [x] h. 문서 갱신 — IMPLEMENTATION-PLAN·ACCEPTANCE·HANDOFF-STATUS·acknowledge 0017

prune dry-run·관리 plane 보호는 Phase 13 으로 분리한다.

## 작업: Phase 13 prune preview·관리 plane 자기 보호 (2026-08-01 시작)

기준 문서: [DOCKER-CONTROL.md](./DOCKER-CONTROL.md) §7, [SECURITY.md](./SECURITY.md) §3, [HANDOFF-STATUS.md](./HANDOFF-STATUS.md) §9

- [x] a. 이전 handoff·코딩 규칙·실제 코드 상태를 대조하고 기존 101개 테스트 기준선을 확인
- [x] b. Compose project label과 실행 중 관리 컨테이너 참조를 기준으로 container·image·network·volume 보호 정책 구현
- [x] c. Docker가 제공하지 않는 dry-run을 list·disk usage 기반 자체 prune preview 계약과 Agent·API 조회 경로로 구현
- [x] d. image 삭제 dependency impact 조회와 force 권한 강화를 구현하고 단위·통합 테스트 추가
- [x] e. typecheck→lint→format→105 tests→backend build·Next webpack production build, API·Agent 재빌드와 Compose healthy·실제 label·미인증 401 검증
- [x] f. IMPLEMENTATION-PLAN·ACCEPTANCE·HANDOFF-STATUS·acknowledge 0018 설계 기록 갱신

## 작업: Phase 14 owner 전용 durable prune 실행 (2026-08-01 시작)

기준 문서: [acknowledge/0018](./acknowledge/0018-prune-preview-management-protection.md), [DOCKER-CONTROL.md](./DOCKER-CONTROL.md) §3.4·§7, [SECURITY.md](./SECURITY.md) §3

- [x] a. durable job·Agent 보호 경계와 Docker Engine v1.52 prune filter 계약 재확인
- [x] b. 정렬된 후보 ID 기반 preview SHA와 system.prune job payload·결과 계약 구현
- [x] c. Owner 최근 인증·이중 확인·단일 attempt enqueue API·panel과 audit 구현
- [x] d. 실행 직전 preview SHA 재검증, 후보별 Agent 보호 재검증, 취소 지점·build cache prune 구현
- [x] e. stale preview·관리 plane·취소·권한·실행 순서 테스트와 전체 품질 게이트 수행
- [x] f. 변경 서비스 재빌드·Compose 실측, owner read-only UI 검증 후 문서와 handoff 갱신

## 작업: Phase 15 registry 인증 image pull (2026-08-01 시작)

기준 문서: [acknowledge/0017](./acknowledge/0017-docker-command-completeness.md), [HANDOFF-STATUS.md](./HANDOFF-STATUS.md) §8 P0, Docker Engine API v1.52 `POST /images/create`

- [x] a. Docker `X-Registry-Auth` base64url AuthConfig 계약과 현재 image.pull durable job·Agent credential volume 경계 확인
- [x] b. metadata-only registry credential 계약과 Agent 암호화 저장소·host 정규화 정책 구현
- [x] c. owner 최근 인증 credential 생성·회전·삭제 API, owner·admin 목록과 audit 구현
- [x] d. image.pull payload에 선택 credential ID를 연결하고 Agent에서만 secret 해석·X-Registry-Auth 생성
- [x] e. image pull·credential 관리 패널과 ko/en/ja catalog 구현
- [x] f. secret 비노출·registry host mismatch·암호화 persistence·authenticated pull 테스트와 전체 품질 게이트
- [x] g. 변경 서비스 재빌드·Compose 실측 후 설계 결정·handoff 갱신

## 작업: Phase 16 traffic rotation·live SSE·export (2026-08-01 시작)

기준 문서: [NGINX-TRAFFIC.md](./NGINX-TRAFFIC.md) §6·§8·§10, [API-DATA-AUTH.md](./API-DATA-AUTH.md) §6, [ACCEPTANCE.md](./quality-assurance/ACCEPTANCE.md) §7

- [x] a. inode·device·offset·partial line checkpoint를 traffic-data에 원자 저장하고 재시작 복구 구현
- [x] b. rename rotation 시 old inode EOF drain→new active inode 전환, DB 실패 시 offset 미진행 구현
- [x] c. rotation·partial line·restart·DB failure에서 duplicate 0·missing 0 테스트
- [x] d. Traffic Worker bounded live subscriber와 masked event SSE, API 인증 proxy·session 재검사 구현
- [x] e. Web live traffic tail pause/resume·bounded buffer와 ko/en/ja UI 구현
- [x] f. time-bounded CSV/NDJSON traffic.export durable job, 원본 IP·user agent 제외와 owner/admin download 구현
- [x] g. export 취소·retention·권한·민감정보 비노출 테스트와 전체 품질 게이트
- [x] h. Worker·API·Web 재빌드·rotation/live/export 실측 후 설계 결정·handoff 갱신

실측 증거: Compose 5개 healthy, checkpoint `0600`, 실제 요청 3건→DB 3건, owner live pause 12초 고정·resume 신규 행, CSV/NDJSON durable job 성공·download audit·파일 `0600`·민감 필드 비노출, browser console error 0건. 결정 기록은 [0021](./acknowledge/0021-traffic-checkpoint-live-export.md)이다.

## 작업: 안전 중단·문서 정합성 고도화 (2026-08-01)

- [x] 5개 서비스 health, active job 0, 두 DB integrity `ok` 확인
- [x] 단일 [RESUME-CHECKLIST.md](./RESUME-CHECKLIST.md)에 읽기 순서·점검 명령·승인 경계·중단 절차 작성
- [x] HANDOFF test 수치, architecture durable job source, README 최신 acknowledge 정정
- [x] Phase 16 owner browser E2E와 CSV·NDJSON runtime 증거 반영
- [x] historical acknowledge/history와 current-state 문서의 역할 분리
- [x] Markdown 상대 링크 45개 문서·Prettier·7 workspace typecheck·ESLint·121 tests/401 assertions/31 files 최종 재검증
