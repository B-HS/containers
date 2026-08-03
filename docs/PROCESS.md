# PROCESS — 현재 작업 상태

## 기준 문서

- 코딩 규칙: `/Users/gkn/.config/opencode/llm-rules/`
- 디자인·운영 레퍼런스: `/Users/gkn/flunti-otel`
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

## 작업: Phase 17 durable notification/Discord (2026-08-01 시작)

기준 문서: [acknowledge/0022](./acknowledge/0022-notification-destination-delivery.md), [OPEN-DECISIONS.md](./OPEN-DECISIONS.md) §14-2, [RESUME-CHECKLIST.md](./RESUME-CHECKLIST.md) Phase 17

- [x] a. destination metadata·webhook 암호화·delivery dedupe·retry/backoff·redaction 설계 결정을 0022에 기록
- [x] b. `notification.deliver` contract와 durable job handler — destination·delivery·job payload 스키마, db-schema 테이블·unique index, migration 0009
- [x] c. webhook URL은 AES-256-GCM으로만 저장하고 API·audit·job payload·events 어디에도 원문 미노출 (metadata-only 응답)
- [x] d. job 서비스 확장 — `retryAfterMs` 커스텀 재시도 지연, `terminal` 오류 즉시 실패, `onFinished` 옵저버
- [x] e. delivery 서비스 — `backup.create` terminal 실패 첫 producer, `(destination, source, event)` unique dedupe, restart reconcile, 2xx/429 Retry-After(1~3600s clamp)/5xx backoff/4xx terminal 분류, 비활성 대상 skip
- [x] f. owner/admin destination CRUD·enabled toggle·test delivery route + audit `notification-destination` targetType + server.ts/compose wiring (api `edge` 네트워크, `/data/notification-secret-key` 0600)
- [x] g. Web — notification 대상 패널(owner·admin): 등록·구독 event·활성 토글·테스트 전송·이름 확인 삭제·lastDelivery 요약, ko/en/ja catalog
- [x] h. 단위·통합 테스트 — job 확장 3건, destination 암호화 6건, delivery dedupe·분류·reconcile 9건 (139 pass 전체 통과)
- [x] i. 전체 gate(typecheck·lint·format·test·build 7 workspace)와 api·web Compose 재배포 — 5개 healthy, migration 0009 적용·unique index 실측, `/api/notification-destinations` 미인증 401
- [x] j. 외부 실전송은 사용자 webhook 제공 시에만 수행 (설계·단위 검증으로 대체, 0022 검증 항목에 명시)

실측 증거: Compose 5개 healthy, `/data/notification-secret-key` `0600` 64자 생성, `__drizzle_migrations` 최신 항목과 `notification_destination`·`notification_delivery` 테이블 + `notification_delivery_source_unique` 등 5개 index, 미인증 `GET /api/notification-destinations` 401. 결정 기록은 [0022](./acknowledge/0022-notification-destination-delivery.md)이다.

## 작업: Phase 18 control plane upgrade 준비 상태 검증 (2026-08-01 시작)

기준 문서: [acknowledge/0023](./acknowledge/0023-control-plane-upgrade-readiness.md), [RESUME-CHECKLIST.md](./RESUME-CHECKLIST.md) P0-B, [SECURITY.md](./SECURITY.md) §11

- [x] a. 범위 확정 — 자기 재배포 제외(API·Web 에 Docker socket mount 금지), 읽기 전용 준비 상태 검증 + runbook 으로 한정
- [x] b. `packages/contracts/src/control-plane.ts` — `CONTROL_PLANE_VERSION = '0.1.0'` 단일 원천, migration·status 스키마, export/build 등록
- [x] c. status service — migration 파일 sha256 vs `__drizzle_migrations.hash` applied/pending dry-run, `PRAGMA integrity_check`, active job count, 최신 backup, maintenance 종합
- [x] d. `GET /api/control-plane/status` route(owner·admin session) + create-app/server wiring
- [x] e. health service 하드코딩 version 을 `CONTROL_PLANE_VERSION` import 로 통일
- [x] f. Web — control-plane entity·widget(owner·admin): version, applied/pending, maintenance, active job, 최신 backup, DB integrity, ko/en/ja catalog
- [x] g. 단위·통합 테스트 — service 3건(pending sha256 판정·active/backup·version), route 통합(owner·admin 200 + 역할 인자 `['owner','admin']`, FORBIDDEN 403) — 143 pass 전체 통과
- [x] h. 전체 gate(typecheck·lint·format·test·build)와 api·web Compose 재배포 — 5개 healthy, 미인증 `/api/control-plane/status` 401 실측, `/api/health` version `0.1.0` 실측
- [x] i. `docs/CONTROL-PLANE-UPGRADE.md` runbook — 준비 상태 표, host `git pull`→`build`→`up -d --wait`, rollback(이전 commit rebuild), migration downgrade 미지원·backup 복원

실측 증거: Compose 5개 healthy, 미인증 `GET /api/control-plane/status` `AUTH_REQUIRED` 401, `GET /api/health` version `0.1.0`. 결정 기록은 [0023](./acknowledge/0023-control-plane-upgrade-readiness.md)이다.

## 작업: 0024 구현 감사와 수정 반영 (2026-08-02)

기준 문서: [acknowledge/0024](./acknowledge/0024-deploy-upload-durable-job.md)

- [x] a. 요구사항 대조 감사 — 0024 결정 1~9 전부 구현 확인, 문서-실동작 차이·컨벤션 위반 목록화
- [x] b. 백엔드·프론트 컨벤션 리뷰 — 인라인 주석, schema 3중 중복, polling effect 중복, 네이밍·상수화 편차 식별
- [x] c. upload finalize 동기 사전검증 — `uploadService.getOwnedSession` 추가, 미존재/타인 session 은 enqueue 없이 `UPLOAD_SESSION_INVALID`(410)
- [x] d. web 공통화 — `jobResponseSchema`·`ACTIVE_JOB_STATUSES` 를 `entities/job/job.api.ts` 로, polling 은 `entities/job/job.query.ts` 의 `useOperationJobPolling` 으로 통일(3개 호출부 교체), load 200 fast path 도 목록 갱신
- [x] e. 인라인 주석 제거, 0024 문서를 실제 구현(200/202 이중 응답·JOB_ACTOR_MISSING·content dedup)과 일치시킴
- [x] f. 테스트 보강 — enqueue uniqueResourceKey·신규 handler 4종·finalize 멱등·4개 route 통합(총 158 pass)
- [x] g. 전체 gate — typecheck·lint·format:check·test 통과 (build·Compose 재배포 실측은 미수행)
- [x] h. 의존 타입 Pick 축소 — create-app.ts(deployment·release·upload)와 route 2곳을 실사용 메서드로 좁히고, create-app.test.ts 의 dead stub 6개(loadArtifact·run·runRollback·cleanupExpiredContainers·reconcileInterrupted·finalizeSession) 제거

- [x] i. 전역 에러 팩토리 통일 — 백엔드 3앱(api·engine-agent·traffic-worker)의 `throw new Error(...)` 약 120건과 throw 아닌 에러 값 생성(reject·destroy 인자 등)을 전부 `createAppError(...)` 로 치환, traffic-worker 에 `src/lib/app-error.ts` 신규 생성. 잔존 grep 0건, 전 게이트(typecheck·lint·format:check·test 158 pass) 통과. web 의 `throw new Error` 는 프론트 영역이라 대상 아님.

미적용(별도 결정 대기): backup restore 응답 봉투 통일, `loadArtifact` 파라미터 순서, 기존 handler 의 terminal 미표시 오류 통일, resource lock 의 partial unique index 강화.

## 작업: macOS 셋업 스크립트 (2026-08-02)

- [x] a. `scripts/setup-macos.sh` 작성 — 4단계 대화식(TUI 스타일, 색상): 환경 확인(macOS·arm64·docker·compose 버전·curl·디스크) → 준비 파일 확인(compose.yaml·Dockerfile 5종, 포트 점유 구분, `docker compose config` 검증) → 빌드·기동 선택(빌드+기동/기동만/건너뛰기) → 스모크 테스트(healthy 5개, `/api/health`, `/ko` 200, 미인증 401)
- [x] b. 이 프로젝트는 `.env` 미사용(시크릿은 볼륨 내 자동 생성) — 커스터마이즈는 `compose.override.yaml` 대화식 생성으로 대체(패널 포트 `!override`, 백업 주기·보존, 트래픽 보존 일수). 기존 override 는 삭제 대신 `.bak` 백업
- [x] c. 검증 — `bash -n`·shellcheck 지적 수정, 비대화 dry-run(생성 안 함 + 기동 건너뛰기) exit 0, 스모크 테스트 4개 판정을 실행 중인 스택에 실측 대조(5 healthy·success:true·200·401 일치)

## 작업: docs 교차검증·정합화 (2026-08-02)

- [x] a. docs/ 전체와 코드·최근 처리사항(0024 durable job, createAppError 통일, 셋업 스크립트) 교차검증 — README·RESUME-CHECKLIST·HANDOFF-STATUS·UPLOAD-DEPLOYMENT·API-DATA-AUTH·IMPLEMENTATION-PLAN·TESTING 의 스테일 서술(테스트 수치, P0-B 미완료 표기, fire-and-forget·동기 finalize 서술, resource lock 향후 계획, acknowledge 최신 포인터) 갱신
- [x] b. 명백한 사실 오류 정정 — "Git 저장소가 아니다" 2곳, 0024 근거의 Phase 12 → Phase 5 오기, API-DATA-AUTH 의 "resource lock row" 를 실제 구현(`resource_key` 기반 active job 단일화)으로, README 에 `scripts/setup-macos.sh` 진입점 1줄
- [x] c. 보류(시점 고정 기록이라 미수정) — RESUME-CHECKLIST 중단점 블록의 2026-08-01 수치, quality-assurance 의 2026-08-01 감사·DOCUMENT-AUDIT, HANDOFF-STATUS §5 checkpoint 파일 목록, UPLOAD-DEPLOYMENT §8 설계 단계 경로 표기·§2 SSE 진행률(실구현은 polling)

## 작업: traffic-worker ENOENT crash loop 수정 (2026-08-02)

- [x] a. 재현 — access log 부재 상태에서 poll() 이 ENOENT 로 실패하는 테스트 작성, 실패 확인
- [x] b. 수정 — poll() 시작 시 access log 부재를 정상 상태로 처리(getIdentityIfPresent), start() 의 fire-and-forget poll 에 catch+로그 추가
- [x] c. 검증 — 신규 테스트 통과, 전체 gate(typecheck·lint·format·test 159 pass) 통과. 기록: [bug/2026-08-02-traffic-worker-enoent-crash-loop.md](./bug/2026-08-02-traffic-worker-enoent-crash-loop.md)

## 작업: 웹 패널 UI 감사·수정 (2026-08-03)

기준 문서: [acknowledge/0025](./acknowledge/0025-web-panel-sidebar-navigation.md), 사용자 지시 — "compose 로 실행시켜서 e2e 먼저하고 버그를 찾아 (사이드바 padding 제거, size-x, tailwind v4 spacing)"

- [x] a. docker compose 실행 + owner bootstrap 로그인 후 E2E — `/ko`·`/ko/containers`·`/ko/traffic`·모바일 390px 드로어, console error(favicon 404) 확인
- [x] b. 사이드바 padding 위반 확인 — 데스크톱 aside·모바일 드로어 `p-3`(12px), 사용자 지적과 일치. 마스터-디테일 목록 버튼이 li 폭을 채우지 않고 콘텐츠 크기로 수축(203/188/195px) — `width:100%` 실험으로 239px 균일 확인
- [x] c. 수정 — master-detail 버튼 `w-full`, aside·드로어 `p-3` 제거(+상단/하단 `px-2` 보정), 드로어 `w-72`→`w-64`, `src/app/icon.svg` 신규(favicon 404 해결), panel-shell `h-4 w-4`→`size-4` 3곳, arbitrary 3건(`min-h-[32rem]`→`min-h-128`, `min-w-[840px]`→`min-w-210`, `min-w-[760px]`→`min-w-190`)을 tailwind v4 spacing scale 로 변환
- [x] d. 검증 — typecheck 7/7·lint·test 159 pass·format:check 통과, `.playwright-mcp/` gitignore 추가·E2E 산출물 정리, compose web 재빌드 후 브라우저 실측: aside padding 0px·목록 버튼 239px 균일·favicon link 삽입·console error 0건·드로어 256px/padding 0
- [x] e. 문서 갱신 — acknowledge 0025 상태(구현 전 → 구현 완료 + 2026-08-03 수정 표)와 검증 기록 반영
- [x] f. E2E 확장 검증 — `/ko/infrastructure` 네트워크·볼륨 Tabs 전환, `/ko/containers` 제어 버튼·삭제 컨펌, `/ko/users` Owner disabled(역할 select·버튼), 모바일 390px 드로어(dialog) 열기·닫기·EngineInfo 포함, 전 페이지 console error 0건, 사이드바 EngineInfo 실데이터(CPU 2·메모리 3416 MiB·저장소 32548/96188 MiB) 표시 — M1 Max 하드코딩 제거 확인. EngineInfo 갱신 방식은 30초 단순 폴링(`/api/system/engine`, setInterval, 페이지 무관 전역 상시)으로 확인, SSE/long polling 아님

## 작업: EngineInfo 갱신 방식·사이드바 px·삭제 버튼·폴더 컨벤션 (2026-08-03)

기준: 사용자 지시 — "SSE에 꼽혀있지말고 안되면 그냥 새로고침 버튼하나 만들어두던가해", "Dockerengine과 시스템 status text의 padding x 는 따로 줘야지", "삭제 버튼 linbreak 생기잖아 ... 버튼과 input의 height가 제대로 잘 맞는지도 잘 검토해서 확인하고", "shadcn 을 제외하고 좀 자주쓰이거나 널리쓰이는것 들은 common", "container-control/ 과 container-create는 container/ 에 그냥 폴더를 나눌 필요없이 넣으면되는데"

- [x] a. SSE 고도화 시도 후 중단 — `/api/stream/events` 인프라(engine-agent events SSE + API proxy, heartbeat comment 는 onmessage 미트리거)와 EngineInfo 30초 폴링+SSE 구독 하이브리드 구현까지 완료했으나 브라우저 연결 불안정으로 원인 규명에 30분 이상 소요, 사용자 지시로 SSE 제거
- [x] b. EngineInfo 수동 새로고침 전환 — EventSource·visibilitychange 제거, 30초 fetch 폴링 유지, 헤딩 우측 RefreshCw 버튼(refreshing 시 animate-spin, `refreshingRef` 중복 클릭 가드), storage dd `truncate`, labels prop 에 `refresh` 추가(layout.tsx·panel-shell.tsx 타입·ko/en/ja `engineRefresh`)
- [x] c. 사이드바 하단 px 정리 — 하단 div `px-2` 제거, EngineInfo·sessionName/sessionRole 에만 `px-2` 복원(로그아웃 버튼 전체 폭), 데스크톱 aside·모바일 드로어 양쪽
- [x] d. 삭제 버튼 줄바꿈·높이 정합성 — `shared/ui/button.tsx` `whitespace-nowrap` 추가, `shared/ui/input.tsx` `h-10`→`h-9`(Button 과 통일), 브라우저 실측: 삭제 버튼 56×36 scrollH 36(줄바꿈 0)·input 36px 일치
- [x] e. 폴더 컨벤션 재구성 — `shared/ui/page-header.tsx`→`shared/common/`, `widgets/master-detail/`→`shared/common/master-detail/`(6곳 사용), `widgets/container-control|container-create|nginx-config|nginx-route-control` → `widgets/container/`·`widgets/nginx/` 통합, import 경로 잔존 0건
- [x] f. 기계 검증·재빌드·E2E — typecheck·lint·format:check·test 159 pass, web 재빌드 healthy, 실측: 삭제 버튼 56×36 scrollH 36·input 36px·EngineInfo dl x=8(px-2)·로그아웃 255=255 전체 폭·새로고침 버튼 존재/클릭 시 spin 50ms true→완료 후 false·값 갱신(3416 MiB/33027 MiB)·console error 0건(autocomplete 경고는 기존 secrets 페이지)

## 작업: infrastructure-control MasterDetail 전환 (2026-08-03)

기준: 사용자 지시 — "네트워크 볼륨의 각 대상들도 컨테이너 제어와 백업 등 같이 추가적인 사이드바로 하는건 불가능한거야? 왜저리 보기힘들게 구현한거야" + "전체 디자인좀 파악하고 다시 구현하던가 padding을 왜이리 많이쓰는거야 그리고 카드를 쓸곳 안쓸곳 제대로 잘파악해야지"

- [x] a. 전체 디자인 파악 — container/backup/image 등 MasterDetail 계열 위젯은 Card 미사용·`section(bg-card) > header(p-3) > error(mx-3 mb-3) > content(border-t 구분)` 구조이고, Card 는 features(auth-panel 등)·카드형 위젯(prune·job 등)만 사용. infrastructure-control 은 MasterDetail 계열이므로 Card 를 쓰지 않음이 일관적
- [x] b. 재구현 — Tabs(네트워크/볼륨) + 탭별 MasterDetail(목록 240px + 상세 패널), 생성 폼은 border-b 라인 구분(백업 위젯과 동일 패턴), 상세 패널에 선택 항목 정보(id·드라이버·컨테이너 수/크기)와 삭제 폼(확인문구·force 체크박스)만 표시. 패딩 3중(Tabs p-3 + TabsContent 래퍼 bg-card p-3 + 폼 bg-background p-3) 제거
- [x] c. 기계 검증 — typecheck·lint·format:check·test 159 pass
- [x] d. 재빌드·E2E 실측 — 데스크톱 main(모바일 main 은 hidden 이라 이전 테스트에서 탭 클릭이 빈 DOM 을 때린 것임을 확인) 기준: 네트워크 목록 9건·볼륨 29건 렌더, 선택 전환·상세 갱신 정상, 상세에 삭제 폼·force 체크박스, MasterDetail 240+703px, console error 0건

## 작업: widgets/features 도메인 폴더 정리·추상화 (2026-08-03)

기준: 사용자 지시 — "폴더 제대로 정리안되어있는데 ? container-{이름} 정리하라했다고 container만 정리해놨네 지금 당장 보이는것만 deployment도보이는데 그리고 {이름}-control 이 너무 많다 생각안해 ? 이런것들 다 체크해서 추상화 가능한건 추상화하고 전체적으로 리팩토링 및 코드 재활용 잘 고려해서 features/ widgets/ 폴더 정리해봐"

- [x] a. widgets 16개 폴더를 entities 도메인명과 일치하도록 git mv — api-key-control→api-key, artifact-control→artifact, audit-log→audit, backup-control→backup, control-plane-control→control-plane, deployment-control→deployment, deployment-secret-control→deployment-secret, image-control→image, infrastructure-control→infrastructure, invitation-control→invitation, job-control→job, notification-control→notification, prune-control→prune, registry-control→registry, traffic-analytics→traffic, user-management→user
- [x] b. 파일명·컴포넌트명 통일 — `{domain}-widget.tsx` + `{Domain}Widget` (ApiKeyControlWidget→ApiKeyWidget 등 16개, sed 일괄). container(container-control/container-create)·nginx(nginx-config/nginx-route-control) 는 도메인 내 다중 위젯이라 그대로 유지
- [x] c. features/traffic-export-control → features/traffic-export 리네임 + `TrafficExportControl`→`TrafficExport`
- [x] d. page.tsx 21곳 import 경로·컴포넌트명 수정 — `bun run typecheck` 통과
- [x] e. 공통 추상화 3개 신규 생성 — `shared/lib/format-bytes.ts`(formatBytes B/KiB/MiB), `shared/ui/inline-alert.tsx`(InlineAlert: tone error/notice/success/warning + role alert/status), `shared/common/widget-section.tsx`(WidgetSection: id/title/notice/badge/header — section(bg-card)>header(flex justify-between p-3) 래퍼, notice 는 exactOptionalPropertyTypes 위해 `string | undefined` 허용)
- [x] f. 위젯 19개에 추상화 적용 — 섹션 스켈레톤(section+header+h2+Badge) → WidgetSection, 에러/성공 배너(red 배너·bg-muted p) → InlineAlert, 바이트 표시 로컬 함수 → formatBytes. 유지: api-key createdToken div(다중 p)·artifact MiB 텍스트·registry notice p(border-t)·prune Card 내부 text-xs 에러(InlineAlert 미사용이라 import 제거)·Badge 는 카드 내 사용처(api-key/artifact/backup/deployment-secret/infrastructure)만 유지
- [x] g. 기계 검증 — typecheck·lint·format:check·test 159 pass (typecheck 1차에서 Badge 미import 3곳·traffic formatBytes 중복 선언·deployment notice `undefined` 전달 exactOptionalPropertyTypes 오류 수정)
- [x] h. deployment-secret 을 deployment/ 로 통합 — 사용자 지시("deployment/ 랑 deployment-secret이랑 왜 나누는건데 ... 둘 다 deployment/ 아래에 넣으면 뒤지는 병이라도 있는거야?")에 따라 `widgets/deployment-secret/deployment-secret-widget.tsx` → `widgets/deployment/`, `entities/deployment-secret/deployment-secret.api.ts` → `entities/deployment/` (git mv + 빈 폴더 제거), `/deployments/secrets/page.tsx` import 2곳 수정. container(control/create)·nginx(config/route-control) 와 동일한 다중 위젯 폴더 패턴. 잔존 참조 0건, 전체 gate 통과
- [x] i. 재빌드·E2E 실측 — web 재빌드 healthy, 브라우저로 19개 페이지(`/ko`·containers·containers/new·images·artifacts·backups·traffic·nginx·nginx/routes·infrastructure·infrastructure/prune·jobs·control-plane·notifications·api-keys·invitations·users·audit·registry + deployments·deployments/secrets) 전부 200 + console error 0건, deployment 위젯 WidgetSection 헤더·notice·badge 0 정상, secret 위젯 notice·badge 0 정상

## 작업: EngineInfo skeleton 처리 (2026-08-03)

기준: 사용자 지시 — "Engine 연결불가 가 나오는게아니라 이부분은 skeleton처리를해야지 아니면 메뉴 이동할때마다 layout shifting이일어나잖아"

- [x] a. 원인 — EngineInfo 가 데이터 로드 전/연결 불가 시 `unavailable` 텍스트 1줄을 렌더해 데이터 3줄(dl) 과 높이 차이 발생, 페이지 전환마다 사이드바 레이아웃 시프트
- [x] b. 수정 — `entities/engine/engine-info.tsx` 의 `unavailable` state·라벨 제거, 데이터 부재 시 dl 과 동일한 구조(`grid gap-1` + `h-4 animate-pulse rounded-sm bg-muted` 3줄)의 skeleton 렌더, fetch 실패 시 마지막 데이터 유지. panel-shell `engineInfoLabels`·layout.tsx 전달부·ko/en/ja `engineUnavailable` 키 제거
- [x] c. 검증 — typecheck·lint·format:check·test 159 pass, web 재빌드 healthy. 브라우저 실측: Engine API 차단 시 skeleton 3줄·높이 56px, 데이터 로드 dl 도 56px (줄 16px×3 + gap 4px×2) 로 일치, 차단/로드/페이지 전환(containers·traffic) 3개 상태 모두 EngineInfo 컨테이너 높이 76px 동일 — layout shifting 0

## 작업: Nginx 설정 GUI 고도화 (2026-08-03)

기준: 사용자 지시 — "nginx 설정도 구문분석해서 1. upstream 2. server block 3. 기타 nginx 설정 / 또한 server block에서는 사용할수있는 옵션등을 뺴먹지말고 넣고 / 또한 지금처럼 raw로 편집할수도있고아니면 gui로 체크 및 input으로 설정값 넣게 해서 더 빠르고 간편하게 할수있는등 이런식으로 더 고도화해봐"

- [x] a. 파서 — `shared/lib/nginx-config/parse-nginx-config.ts` 문(statement) 단위 스캔 + raw 보존 AST. 주석·빈 줄·멀티라인·따옴표 문자열 처리, 알 수 없는 구조는 text 노드로 보존해 편집 시 데이터 손실 없음
- [x] b. 직렬화 — `serialize-nginx-config.ts` 원본과 바이트 단위 왕복 동일 + 노드 생성 헬퍼(renderDirectiveRaw/createDirectiveNode/createBlockNode)
- [x] c. 카탈로그 — `nginx-directives.ts` 공식 문서 기준 server 컨텍스트 지시어 전수 정의(12개 그룹: 기본/경로/제한/응답 헤더/로깅/리라이트/프록시/SSL/접근 제어/압축/기타/HTTP2), valueType(boolean/text/number/size/duration/options/code)·multiple·placeholder
- [x] d. 편집 모델 — `nginx-editor-model.ts` 블록 children 조작(getChildIndent/upsertDirectiveNode/removeDirectiveNodes/replaceBlockChildrenInOrder/collectBlocks)
- [x] e. GUI 컴포넌트 4종 — nginx-directive-editor(체크/input/select + multiple 리스트), nginx-block-editor(server/location 공용 — 그룹 Accordion + 기타 지시어 raw + location 재귀), nginx-upstream-editor(주소 + weight/max_conns/max_fails/fail_timeout/backup/down/resolve), nginx-global-editor(main/http 직속 raw 편집)
- [x] f. 위젯 고도화 — raw/GUI Tabs 토글, GUI 내부 upstream/server block/기타 3섹션, server·upstream 추가/삭제, GUI 편집 결과를 rawConfig에 즉시 미러링해 GUI↔raw 전환 자유, 적용은 기존 `POST /api/nginx/config/apply`(SHA-256 충돌 + nginx -t) 파이프라인 재사용. 보호 계약(REQUIRED_CONFIG_TOKENS)은 서버 검증으로 그대로 방어
- [x] g. i18n — `nginxGui` 네임스페이스 ko/en/ja 전부 추가(모드 토글·섹션·그룹 12개·지시어 폼·placeholder)
- [x] h. 기계 검증 — typecheck·lint·format:check·next build·test 159 pass (noUncheckedIndexedAccess 에러 2건 수정, 미사용 indent prop 제거)
- [x] i. 왕복 정합성 — 실제 `infra/nginx/nginx.conf`(server 3·upstream 2) 파싱→직렬화 원본과 바이트 동일, server_name 변경/gzip·proxy_read_timeout 추가/add_header 삭제/location 추가/따옴표 문자열 토큰/주석·빈 줄 보존 시나리오 전부 확인 (임시 검증 스크립트 실행 후 삭제)
- [x] j. 합의 기록 — `docs/acknowledge/0026-nginx-gui-editor.md` 작성 (설계 결정·제약·파일 목록·검증)
- [x] k. E2E (compose 재빌드 후 owner 브라우저) — GUI 편집 탭 upstream 2개(containers_web/api) 구조화 폼·server block 12개 그룹 카탈로그(checkbox 190·input 110)·기타 설정(main/http) 렌더 확인, GUI keepalive_timeout 65→66 변경→raw 미러링 즉시 반영, GUI 변경 적용으로 실제 current.conf 반영(nginx -t 통과·revision 0→1·SHA 변경)·healthy 유지 후 65 원복(revision 2)
- [x] l. E2E 발견·수정 — i18n 키 불일치(카탈로그 labelKey `nginxGui.group.*` dot 경로 vs 메시지 `groupBasic` camelCase, placeholderKey 이중 접두사)로 GUI 탭에서 MISSING_MESSAGE 콘솔 에러 130건 → 카탈로그 키를 메시지 형식에 맞춰 수정(typecheck·lint·format·test 159 pass, web 재빌드) 후 에러 0건 재확인. 적용 시 오래된 세션은 `RECENT_AUTH_REQUIRED` 401 — 재로그인으로 해소(owner 비밀번호는 E2E용으로 재설정 후 사용자 전달)

## 작업: Nginx GUI 지시어 툴팁·server 탭 MasterDetail (2026-08-03)

기준: 사용자 지시 — "nginx 지시어 각 항목에 설명 툴팁 추가" + "server 탭의 location을 sidebar로 둬야 편집이 편하지않을까?"

- [x] a. 툴팁 기반 — `shared/ui/tooltip.tsx` 신규(radix-ui 통합 패키지 Tooltip 래퍼, named export 4종: TooltipProvider/Tooltip/TooltipTrigger/TooltipContent)
- [x] b. 지시어 설명 프래그먼트 — ko 156 directive + 8 upstreamOption 작성, en/ja는 백그라운드 에이전트 2개로 병렬 번역, 키 집합·순서 3개 언어 일치 검증
- [x] c. 메시지 병합 — ko/en/ja.json `nginxGui` 키 48개(기존 46 + directive + upstreamOption), JSON.parse 검증
- [x] d. 배선 — `nginx-directive-editor.tsx` 지시어 라벨 4브랜치(① multiple+추가 ② boolean ③ options ④ 기본 텍스트) 전부 DirectiveTooltip, `nginx-upstream-editor.tsx` 옵션 라벨 8개(serverAddress/weight/maxConns/maxFails/failTimeout/backup/down/resolve) UpstreamOptionTooltip. `t.has()` 가드로 누락 키는 툴팁만 미표시
- [x] e. server 탭 MasterDetail — `nginx-config-widget.tsx` server+location 계층 사이드바(serverTitle 요약 + flatMap 순서 유지) + useMasterDetailSelection(serverIndex/locationIndex), location 선택 시 헤더에 경로 Input(수정 즉시 head 재생성·사이드바 반영) + 삭제, server 헤더에 location 추가/삭제. `MasterDetailItem.indent?: boolean`(들여쓰기 pl-8)·`NginxBlockEditor.hideLocations?: boolean`(server 편집기에서 location 섹션 숨김) 추가 — 선택 필드라 기존 호출부 영향 없음
- [x] f. 기계 검증 — typecheck(noUncheckedIndexedAccess·exactOptionalPropertyTypes 대응: 선택 항목 const 로컬 내로잉, badge 조건부 스프레드)·lint·format:check·test 159 pass
- [x] g. 재빌드·E2E 실측 — compose web 재빌드 healthy, owner 브라우저: upstream `weight` hover 툴팁 "로드 밸런싱 가중치를 지정합니다...", server block 사이드바 server 3개+들여쓰기 location, location `/api/` 선택 시 편집기 전환·경로 Input·삭제 버튼, 경로 수정(`/api/v2/`) 사이드바 즉시 반영·새로고침 원복, `server_name` hover 툴팁 "이 server 블록이 응답할 도메인 이름을 지정합니다...", console error 0건. 기록: [acknowledge/0027](./acknowledge/0027-nginx-gui-tooltip-master-detail.md)

## 작업: 보안 감사 반복 하드닝 (2026-08-03, 12라운드)

기준: 사용자 지시 — "싹 다 수정해 개인 컴퓨터에서 돌아가는만큼 빈틈 없이 완벽한 보안을 가져야하거든" → 3헌터(표면/인증·데이터/런타임·공급망) 팀 12라운드 반복 감사, 발견 즉시 수정. 이후 사용자 `/goal clear`로 목표 해제, 최근 변경분 집중 검증 후 마무리.

- [x] a. 1차 대규모 하드닝 — createContainer 볼륨 whitelist(관리 볼륨 9종 차단), rate-limit 바이패스 차단(x-real-ip 신뢰·nginx X-Real-IP), exec/interactive-exec 관리-plane 라벨 가드(Id+Name), 비활성 사용자 API key 미폐기(innerJoin disabledAt + disable/role-change 시 revoke), nginx 보호계약 주석 제거, webhook SSRF private IP 차단, restore audit 보존, upload GC, HMAC secret 분리(traffic-credentials 볼륨), exec ticket path 방식, backup :id UUID
- [x] b. 라운드2~4 — 비활성/역할 강등 API key 일괄 revoke, restore FK COMMIT 전 검증+비밀·라우트·업로드 테이블 보존, 이미지 pull private DNS 검증(resolveHost all), registry IPv4 shorthand·IPv6-mapped 차단, nginx protected-contract placement 검증, 배포 실패 컨테이너 control 네트워크 분리, connect/disconnect 가드, ready/quarantine orphan GC, webhook DNS-rebinding 전 주소 검증, probeContainer 관리-plane 가드, getNginxContainer 위장 차단
- [x] c. 라운드5~8 — restore 인증·시크릿·라우트·업로드·작업 보존 균형, exec WS recent-auth 주기 재확인, READ 격리(query/stream/events 관리 컨테이너 차단), nginx contract api 블록+upstream+location 검증, 이미지 pull IPv6 hex-mapped, createNetwork/Volume protected, probe 네트워크 도입(배포 L2 격리), registry-credentials 볼륨 API 격리, 로그인 rate-limit 경로 정규화, nginx route protected target+suffix, traffic export filename regex
- [x] d. 라운드9~12 — 로그인 rate-limit Map prune+disabled 401, nginx contract nested-location 우회 차단, webhook IPv6 과차단 수정(공개 통과·private/6to4/Teredo 차단), restore preserved 재조정(nginx_route/deployment 복원 가능+보안 불변식 유지), nginx auth-location regex(trailing-slash 우회 차단), route path `;`/`$` 주입 차단
- [x] e. 검증 — 12라운드 누적 typecheck(7 workspace)·lint·format:check·test 160 pass, 모든 재빌드 healthy
- [x] f. 최근 변경분 집중 검증 — webhook IPv6 파서(공개 통과·private 차단 ALL PASS), nginx auth-location regex(panel+api 적용·nginx -t 통과·trailing-slash 404로 우회 불가), restore preserved(nginx_route/deployment 복원 가능) 확인, 브라우저 실측(로그인 유지·nginx GUI 렌더·console error 0)
- [x] g. 문서 정리 — PROCESS.md 체크 기록. (보안 감사 반복 루프는 사용자 `/goal clear`로 중단; 외부 무인증 공격자 기준 잔여 위험은 관리자 자격증명 탈취·DNS-rebinding TOCTOU(관리자 신뢰 경계 내)뿐)
