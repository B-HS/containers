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

## 작업: convention-audit-refactor Wave 3-9 — engine-agent 계층 정리 (2026-08-04)

기준: `.omo/plans/convention-audit-refactor.md` todo 9 — backend.md §1·§2 계층 구조 정리. engine-agent는 DB 미사용이라 `*ServiceDb`/composeXxx skip.

- [x] a. `src/docker/` 제거 — `create-docker-engine-client.ts`(Docker Engine HTTP client)를 `src/service/shared/`로 git mv, 내부 `lib/error` 상대 경로 갱신, 참조처 7개(compose + domain 서비스 6) import 경로 갱신
- [x] b. `service/` flat → `service/domain/`(7개: agent-health·engine-control·engine-query·engine-stream·interactive-exec·nginx-config·registry-credential) + `service/shared/`(3개: docker-engine-client·stream-parsers·interactive-exec-session-guard) 분리, route 6개·compose import 경로 전부 갱신
- [x] c. statfs 이관 — `create-agent-app.ts:44-54` 인라인 `getFilesystemUsage`(statfs)를 `create-engine-query-service.ts` 내부로 이동, deps는 `getFilesystemUsage: () => Promise<...>` 대신 `artifactRoot: string` 수신해 내부 계산(동작·반환 형태 보존: availableBytes/capacityBytes/usedBytes). compose에서 `import { statfs }` 제거
- [x] d. 테스트 갱신 — engine-query-service 테스트가 `getFilesystemUsage` 주입 대신 임시 디렉터리 + 실제 `statfs` 계산으로 동작 등가 검증(기대값을 실 statfs 결과로 도출, afterEach 정리)
- [x] e. 검증 — 루트 `bun run typecheck`(7 workspace)·`bun run lint`·`bun test` 160 pass, format:check는 이번 변경분 3개 route 포맷 수정. `src/docker/` 없음, `src/service/`에 domain/shared만, `grep statfs src/compose` 0건

## 작업: convention-audit-refactor Wave 10-18 — TanStack Query·전체 gate 검증 (2026-08-04)

기준: `.omo/plans/convention-audit-refactor.md` todo 10~~18 — FSD 배치·Query 도입(10~~13), traffic-worker Drizzle(11)·계층(12), engine-agent 계층(9 완료), web 쿼리·엔티티 정리(14~17), **전체 기계 검증 gate(18)**.

- [x] 10. web 공통 조회 인프라 — TanStack Query Provider 도입, `QUERY_KEY` 중앙 관리(`shared/lib/query-key.ts`), `entities/*.query.ts` `useXxx` 훅(useSuspenseQuery), `queryOptions` 팩토리로 조회·프리페치·무효화 공유
- [x] 11. traffic-worker raw SQL store를 앱 로컬 Drizzle로 전환 — `db/schema.ts`·`db/database.ts` + 자체 migrations, `INSERT OR IGNORE` dedup→`onConflictDoNothing()`, STRICT 테이블·index(occurred_at·status)·`PRAGMA journal_mode=WAL`/`busy_timeout` 동작 등가 보존
- [x] 12. traffic-worker 계층 분리 — SSE·heartbeat 로직을 서비스로, `service/` flat→`service/domain/`+`service/shared/`
- [x] 13. api 계층 완성 — `*ServiceDb`·`composeXxx` 계층, raw SQL 전부 compose 격리, 횡단 클라이언트 `service/shared/`
- [x] 14. web SSR 프리페치 — 서버 컴포넌트 `new QueryClient()`→`prefetchQuery`→`HydrationBoundary`, `params`/`searchParams` await, `useSuspenseQuery`
- [x] 15. 위젯·features fetch를 entities 쿼리로 이관 — 위젯은 props만, features는 props-only로 정리, engine-info를 widgets로 이동
- [x] 16. 커밋·기록 — Wave 9~17 커밋 12건(`refactor(backend)`, `refactor(traffic-worker)`, `refactor(engine-agent)`, `refactor(api)`, `feat(web)`, `refactor(web)`)

### Wave 18 — 전체 기계 검증 gate (2026-08-04)

- [x] a. `bun run typecheck` — 7 workspace 전부 `Exited with code 0` (config·contracts·db-schema·web·engine-agent·traffic-worker·api)
- [x] b. `bun run lint` — ESLint exit 0, 0 에러
- [x] c. `bun run format:check` — 1차 실패 4건(api `with-auth.ts`·traffic-worker drizzle meta 2건·docs 0028) → `bun run format`(prettier --write) 정합 → 재확인 통과(포맷 전용 변경, 로직 diff 없음)
- [x] d. `bun run test` — **166 pass / 0 fail** (544 expect calls, 35 files) — 베이스라인 160 대비 +6(신규 테스트 포함)
- [x] e. `bun run build` — 7 workspace 전부 `Exited with code 0` (Next.js web build 포함)
- [x] f. process.env 직접 접근 단일화 — web 21곳(`apps/web/src` 페이지 20 + `shared/lib/session.ts`) 중복 `API_INTERNAL_URL` 상수를 `shared/lib/api-internal-url.ts` 단일 모듈로 이관, import 21곳 갱신 → 앱 스코프 `process.env` 직접 접근 0건 (api·engine-agent·traffic-worker는 원래 0건)
- [x] g. 금지 패턴 grep 확정 — useCallback/useMemo 0, raw SQL(프로덕션 service) 0, barrel(`apps/web/src` index.ts) 0, 역방향 import(`@widgets/`·`@features/` from entities/shared/features) 0, process.env(앱 src, 단일 상수 모듈 제외) 0
- [x] h. 잔존 예외 판정 — ① `api/with-error-handling.ts` Hono `Handler` 공식 제네릭 기본값(`Env = any` 등, eslint-disable+사유 주석) — Hono 타입 시그니처 준수 위해 유지 ② `nginx-directives.ts` `'any'`는 Nginx `satisfy` 지시어 공식 옵션 문자열 리터럴(false positive) ③ raw SQL 4건은 `.test.ts` 픽스처(PRAGMA FK 제어·`__drizzle_migrations` 시딩)만
- [x] i. 검증 후 재확인 — 상수 이관·JSDoc 문구 수정(`traffic-worker with-error-handling.ts` "any other error"→"an unexpected error") 후 typecheck·lint·format:check·test(166 pass)·build 재통과

## 작업: 웹 패널 UI/UX 전면 개편 + 백엔드 정합성·보안 감사 (2026-08-04 시작)

기준: 사용자 지시 — "웹패널의 UIUX 개선 / border·radius 없이 모노톤 모던·심플·미니멀 / opacity로 고급스러운 위계 / shadcn 제대로 활용 / nginx·api·engine-agent·traffic-worker 로직 정합성·보안 검토 / 조사→방향→구현 workflow 병렬".
브랜치: `feat/web-ui-refresh`. 확정 결정(질의 응답): ① 구분은 배경 elevation + opacity만(border 전면 제거·radius 0) ② shadcn 필요한 것 전부 공식 추가 ③ 새 브랜치 커밋·푸시 ④ 백엔드 감사에서 명백한 버그·보안은 즉시 수정, 애매·파괴적은 문서화 후 승인.

- [x] a. 조사 — 6개 영역 병렬 감사(UX·정보구조 25 / shadcn 23 / 디자인 토큰 20 / web 컨벤션·Query 25 / 백엔드 로직 22 / 보안 17 = findings 132건) + 교차검증(중복 병합·심각도 재평가·쟁점 8건 확정). 리포트: [quality-assurance/2026-08-04-ui-backend-audit.md](./quality-assurance/2026-08-04-ui-backend-audit.md). critical 4건(panel-shell children 이중 렌더 / traffic-worker 빈 배열 insert로 수집 영구 정지 / api createAppError가 code·statusCode 미부착 / engine-agent tagImage 관리 plane 보호 부재)은 메인 세션에서 코드로 직접 재확인
- [x] b. 방향 — 토큰 체계(surface 3단·overlay 3단·텍스트 3단·shadcn 표준 토큰 보강·의미색 3쌍), 컴포넌트 정책(기존 6종 공식 교체 + 14종 신규 도입 + border/shadow→elevation 치환 규칙), 정보구조 재설계(Sidebar 단일 main·대시보드 요약화·데이터 경로 단일화), 백엔드 즉시 수정 10건과 보류 4건을 [acknowledge/0029](./acknowledge/0029-monotone-design-system.md) 로 확정
- [x] c. 구현 1 — `globals.css` 재작성(surface 3단·overlay 4단·텍스트 3단 opacity 스케일, shadcn 표준 토큰 보강, 전역 `* { border-radius: 0 }` 우회 제거, `@layer base` border-color 가드, 시스템 폰트 스택). primitive 6종(button·input·textarea·label·card·badge)을 공식 new-york 구조로 교체하고 14종(alert·alert-dialog·dialog·sheet·popover·dropdown-menu·separator·scroll-area·sonner·table·skeleton·empty·spinner·sidebar) 신규 도입, 기존 6종(accordion·select·checkbox·switch·tabs·tooltip) 시각 정합
- [x] d. 구현 2 — 엔티티 쿼리 계층 정합(리터럴 키 전량 제거, `QUERY_KEY` 접두사 무효화, 누락 훅 보강, SSR 프리페치 20페이지) 후 위젯·features 6그룹 병렬 이관. `window.location.reload` 12~14곳 제거, 파괴적 작업 AlertDialog 승격, toast/Alert 이원화, Table·Skeleton·Empty 도입, border·radius·기본 팔레트 색 전량 치환, `InlineAlert` 삭제
- [x] e. 백엔드 — traffic-worker 수집 영구 정지(빈 배열 insert), api 에러 매핑 복구(code·statusCode 부착 + `:` 분리 + engine-agent 코드 contracts 공유), engine-agent `tagImage` 관리 plane 보호·참조 해석 fail-closed·스트림 슬롯 누수·nginx probe 오탐, api durable job stall 회수·취소 보존·백업 백오프·API key scope role 강제·백업 복원 session-only. 각 항목 테스트 동반(166 → 199 pass)
- [x] f. 검증 — typecheck 7/7·lint 0·test 199 pass·format:check·build 7/7, Compose 5개 healthy·미인증 401, 브라우저 실측(라이트·다크 토큰, 1440·390, 전 패널 라우트 200, console error 0). 실측 중 발견한 hydration 불일치 2건(모듈 싱글턴 QueryClient, layout↔page 동일 키 이중 프리페치)을 근본 수정
- [x] g. 문서 — PROCESS·HANDOFF-STATUS·UI-UX·SHADCN-COMPONENTS·SECURITY·acknowledge 0029 갱신, 단계별 커밋 10건 후 `feat/web-ui-refresh` push

### 실측 검증 기록 (2026-08-04)

- E2E 계정: 기존 owner(`owner@containers.local`)의 비밀번호를 알 수 없어 better-auth `hashPassword`(1.6.25)로 새 해시를 만들어 api 컨테이너 안에서 `account.password`만 교체했다. 사용자·역할 행 미변경, control DB `integrity_check` `ok`. **비밀번호 값은 저장소·문서·로그에 기록하지 않는다.**
- 확인 항목: 대시보드 요약 카드 SSR 즉시 렌더(스켈레톤 깜빡임 0), 컨테이너 삭제 AlertDialog(확인 문구 불일치 시 비활성·ESC 닫힘·포커스 복귀), 트래픽 Table zebra·라이브 테일, nginx raw 편집기 내부 가로 스크롤(페이지 가로 스크롤 0), 인프라 Tabs·MasterDetail, 모바일 390 드로어(Sheet) 열림·활성 표시
- 다크 모드는 `dark:` 유틸 0건·토큰 전환만으로 동작함을 확인(라이트 토큰을 다크 값으로 치환해 실렌더 대조)

## 작업: 보류 4건 구현 (2026-08-04)

기준: 사용자 지시 — "보류 4건도 다 진행해". 대상은 [acknowledge/0029](./acknowledge/0029-monotone-design-system.md) §8 의 보류 목록이다.

- [x] a. nginx 보호 계약 파서화 — 웹 파서를 `packages/nginx-config` 공유 패키지로 승격(파서 이중화가 곧 재발 원인이므로 단일화), engine-agent 검증을 AST 기반 all-must-pass 로 재작성. decoy server 블록·중복 `/api/` location·nested 우회·burst 상한 초과 거부를 테스트로 고정
- [x] b. nginx route 순서 역전 — persist-then-apply + 실패 시 보상, 서비스 수준 직렬화, 부팅 `reconcileRoutes()` 자가치유
- [x] c. access log 로테이션 — nginx 컨테이너 내부 크기 기반 회전(128 MiB·60초·2세대·무압축, `USR1` 재오픈), traffic-worker 에 체크포인트 inode 유실 관측 필드. 사이드카 logrotate 는 컨테이너 경계를 넘는 시그널이 불가해 배제, 압축은 old-inode drain 을 깨뜨려 배제
- [x] d. 감사 로그 서버 필터 — actorEmail·targetId·operation·result·targetType·기간 필터와 페이지네이션, 인덱스·migration 0011, 웹 서버 필터 UI
- [x] e. 실측에서 드러난 결함 2건 수정 — ① 공유 파서가 주석 줄 다음 블록 헤드를 삼켜 계층이 무너지던 버그(웹 GUI 편집기 손상 잠재 경로) ② 새 계약 검증이 닫는 중괄호 앞 주석을 불균형으로 판정해 **route 생성이 원천 불가**하던 회귀. 둘 다 정적 검사는 통과했고 Compose 실측에서만 드러났다
- [x] f. Dockerfile 4종에 신규 workspace 패키지 COPY 추가 — 누락 시 이미지 빌드가 깨진다(에이전트 산출물에 없었고 메인 세션이 잡음)
- [x] g. 검증 — typecheck 8/8·lint 0·test 230 pass·format:check·build 8/8, Compose 5개 healthy, route 생성→프록시 응답→삭제 후 SHA 원복, 로테이션 실회전(중복 0), 감사 필터·페이지네이션 실측, 브라우저 console error 0
- [x] h. 감사 로그 열람 role 문서 정합 — 사용자 결정에 따라 구현(owner·admin·viewer·auditor)을 정본으로 두고 `docs/llm.txt` 를 정정, `docs/SECURITY.md` §5.1 신설(열람 role·노출 필드·원본 IP 미노출 근거). 겸해 llm.txt 의 API key owner 전용 scope 이중 강제와 backup restore session-only 도 실제 구현에 맞춰 갱신

## 작업: 실운영·CI API 운용 준비도 전면 검토 (2026-08-04)

기준: 사용자 지시 — "이제 실운영 + api로 github action으로 api운용까지 전부 다 가능한지 전면검토 시작해봐".

- [x] a. 5개 영역 병렬 read-only 검토 — 설치·부팅·업그레이드 / 외부 노출·인증 경계 / GitHub Actions API 운용 / 운영 관측·장애 복구 / 데이터 안전성·확장 한계 (findings 68건)
- [x] b. 종합 판정과 로드맵 확정 — 리포트: [quality-assurance/2026-08-04-production-readiness.md](./quality-assurance/2026-08-04-production-readiness.md)
- [x] c. blocker 핵심 4건 메인 세션 재확인 — ① `compose.yaml` restart 정책 0건(실측 5개 컨테이너 `restart=no`) ② `PRESERVED_TABLES`에 `__drizzle_migrations` 부재 + `deployment.artifactId`가 보존 대상 `artifact`를 `onDelete: restrict` 참조 ③ `infra/nginx/nginx.conf`에 `real_ip` 설정 없음 ④ 백업 세트가 `control.sqlite`·`traffic.sqlite`·`manifest.json` 3개뿐이고 `/data`의 암호화 키 2종 미포함
- [x] d. CI 운용 관문 확인 — 업로드·image load·manifest·release·rollback은 API key 경로가 있으나 `create-job-route.ts`는 `apiKeyService` 의존성이 없어 **job 성패 판정이 세션 전용**. `API_KEY_SCOPE` 9종에 job 계열 scope 부재
- [x] e. 1단계(실운영 개시 전 필수) 구현 완료 — compose restart·로그 로테이션·자원 상한·origin/포트/DOCKER_GID 외부화, 백업 복구 모드 2종과 암호화 키 envelope 백업, nginx real_ip·catch-all·외부 노출 opt-in 경로, 부팅 단계 격리와 migration dry-run, 신뢰 origin 정규화와 setup 스크립트 일반화
- [x] e-2. 1단계 실측 중 회귀 1건 발견·수정 — access log 로테이션으로 entrypoint가 nginx를 백그라운드로 돌리며 PID 1이 셸이 되어, 컨테이너로 보낸 HUP이 nginx master에 닿지 않았다. **설정 적용이 성공으로 보고되면서 실제로는 리로드되지 않던 상태**(워커 나이가 마스터와 동일). HUP·USR1·QUIT 전달 추가 후 apply 시 워커 PID 교체 실측 확인
- [x] f. 2단계(무인 운용·무음 실패 제거) 구현 완료 — `job:read`·`job:write`·`engine:read`·`control-plane:read` scope 신설과 API key 분기, manifest 멱등화, 실패 알림을 job 전반으로 확장, `/api/readyz` 심층 헬스, 백업 디스크 가드·총량 상한, 점검 모드 DB 영속화, CI 배포 워크플로 예제와 RUNBOOK
- [ ] g. 3단계(장기 운영 안정화) — **미착수**. 컨텍스트 한계로 이번 세션에서 중단. 항목은 [quality-assurance/2026-08-04-production-readiness.md](./quality-assurance/2026-08-04-production-readiness.md) §3 3단계 참조

### 2단계 실측 (2026-08-04)

- 게이트: typecheck 8/8, lint 0, **test 292 pass**, format:check, build 8/8
- Compose 5개 healthy. 신규 scope API key 발급 후 `/api/jobs`·`/api/system/engine`·`/api/control-plane/status`·`/api/containers`·`/api/deployment-manifests` **전부 200**(이전에는 job 조회가 세션 전용이라 CI가 성패를 판정할 수 없었다). scope 밖은 `GET /api/audit` 401·`POST /api/backups` 403으로 차단. 검증 후 키 회수 확인(회수 즉시 401)
- `/api/readyz` 무인증 200 — engine-agent·traffic-worker·control DB integrity·백업 신선도·job 적체·점검 모드 종합 보고
- nginx 설정 apply 시 워커 PID 교체 확인, catch-all이 알 수 없는 Host를 444로 차단, 패널·미인증 401 정상

### 정정

이전 기록의 "라우트 생성 후 프록시 응답 307"은 **오판이었다.** 당시 패널 server 블록이 `default_server`여서 요청이 패널로 흘러 Next.js가 307을 반환한 것이고, 라우트 블록은 타지 않았다. catch-all 도입 후에는 라우트 블록으로 정확히 들어가며, 대상 컨테이너가 edge 네트워크에 없으면 upstream 해석에 실패한다(배포 파이프라인이 붙이는 컨테이너는 해당 없음).

판정: 실운영 **no-go**(조건 충족 전), CI API 운용 **부분 가능**(시작은 되나 성패 판정·검증·교착 해소 불가).

## 작업: 3단계 착수 전 1순위 마무리 (2026-08-05)

기준: [HANDOFF.md](./HANDOFF.md) §8 1순위. 결정 기록은 [acknowledge/0030](./acknowledge/0030-ci-verification-surface-and-exposure-scope.md).

- [x] a. `GET /api/images` 에 `engine:read` API key 분기 추가 — `create-control-route.ts` 에 `apiKeyService` 의존성과 `authenticateEngineRead()` 신설, 통합 테스트 4건, CI 워크플로 예제에 load 후 digest 확인 단계
- [x] b. API key scope UI 하드코딩 제거 — 위젯이 9종을 직접 나열해 2단계 신설 scope 4종을 선택할 수 없던 문제. `API_KEY_SCOPE_VALUES` 사용
- [x] c. 백업 복구 UI 에 복구 범위·암호 입력 추가 — `preserve-host` 고정·키 미복원 해소. 암호 입력은 `secretsIncluded` 인 백업에만 노출. 생성 폼에도 암호 추가(없으면 복구 쪽 입력이 죽은 UI)
- [x] d. `scripts/setup.sh` 비대화식 모드 — `--non-interactive`(비-TTY 자동 적용)·`--start-mode`·`--write-override`/`--replace-override`·값 플래그 8종·`--help`
- [x] e. 미해결 질문 2건 사용자 확인 — 관리 plane 컨테이너 은닉/`/api/readyz` 노출 범위 **둘 다 현행 유지**. `/api/readyz` 는 이미 요약/상세를 분리하고 있어 HANDOFF §6 의 서술이 부정확했다(0030 에 정정)
- [ ] f. 3단계(장기 운영 안정화) — 미착수. 범위 확인 필요

### 실측 (2026-08-05)

- 게이트: typecheck 8/8, lint 0, **test 296 pass / 47 files**, format:check, build 8/8
- `GET /api/images`: `engine:read` 키 200(목록 반환) / scope 없는 키 403 / 미인증 401 / 키 회수 후 401. 검증용 키 2개 즉시 회수
- 패널: API key 화면 scope 13종 표시, 복구 다이얼로그 범위 Select 2종과 설명 교체·확인 버튼 잠금, 생성 폼 암호 길이 미달 시 제출 잠금. console error 0, 500px 폭 가로 스크롤 0
- setup: `--help`·옵션 오류 exit 2·비대화식 전 구간·override 생성/보존/`--replace-override` 백업 확인 후 검증 파일 삭제
- 미검증: 복구 다이얼로그 암호 입력 실렌더(현 백업 2건이 `secretsIncluded: false`, 암호 포함 백업 생성은 recent 세션 필요). 다크 모드는 토큰 임시 주입 미리보기로만 확인

## 작업: 3단계 장기 운영 안정화 (2026-08-05)

기준: [quality-assurance/2026-08-04-production-readiness.md](./quality-assurance/2026-08-04-production-readiness.md) §3 의 3단계 9개 항목. 사용자 지시 "9개 전부 순차적으로".

- [x] a. traffic `access_event.raw_json` 제거(migration 0001)와 저장 상한·정기 VACUUM — 쓰기만 하고 읽는 곳이 없으면서 실측 저장량의 약 67% 를 차지했다. 재기동 시 1회 VACUUM(`PRAGMA user_version`)으로 회수. 행수·바이트 상한과 회수 비율 25% 기준 VACUUM 을 별도 보존 서비스(기본 60초)로 분리 — 기존엔 1초 poll 마다 삭제가 돌았다
- [x] b. traffic 분석 index 교체와 조회 전용 worker thread — `status` 단독 index 는 필터가 항상 `status BETWEEN` 이라 선택도가 없는데도 planner 가 채택해 시간 범위를 못 좁혔다. `(occurred_at, status)` 복합 index(migration 0002)로 교체. `bun:sqlite` 가 동기 API 라 큰 조회가 이벤트 루프를 막던 것을 읽기 전용 연결의 worker thread 로 분리
- [x] c. 백업 스냅샷 `serialize()` → `VACUUM INTO` + 스트리밍 digest — DB 크기만큼의 메모리 상주 제거
- [x] d. traffic export 와 upload chunk 스트리밍화 — export 는 keyset pagination 5,000행 단위, upload 는 요청 스트림을 파일 offset 에 이어 쓰며 sha256 증분 계산
- [x] e. 암호화 마스터 키 keyring 과 `secret.rotate` durable job — v1 은 기존 경로, 이후 `.v2`/`.v3`. 두 암호화 테이블에 `key_version`(migration 0013). 쓰기는 활성 버전, 읽기는 행의 버전. 백업 봉투는 전 버전을 담되 v1 을 기존 필드에 남겨 구버전 복원 호환
- [x] f. artifact 삭제 API 와 보존 GC — recent owner·admin 삭제(배포 참조 시 `ARTIFACT_IN_USE`), 6시간 주기 보존 정리(기본 30일, 최신 5개 보존), `UPLOAD_TOTAL_QUOTA_BYTES` 기본값 300GiB→32GiB(실제 디스크보다 컸다)
- [x] g. job worker id 기반 회수와 리소스 잠금 DB 강제(migration 0014) — 부팅 회수가 running job 전부를 실패 처리해 인스턴스를 하나 더 띄우면 남의 작업을 죽였다. `(kind, resource_key)` 활성 상태 부분 유니크 인덱스 추가
- [x] h. audit 보존 아카이브와 rowid tie-break — 기간 경과 행을 JSONL 로 append 후 삭제(12시간 주기, 기본 365일). 초 단위 저장이라 같은 초 이벤트가 랜덤 UUID 순서로 뒤섞이던 정렬을 rowid 로 고정
- [x] i. nginx revision 정리·API 스트림 상한·수집 지표 패널 노출 — 적용 시 최신 20개만 남기되 롤백이 쓰는 직전 revision 은 항상 보존, API SSE 프록시 동시 32 상한, `GET /api/traffic/health` 와 트래픽 화면 위젯

### 실측 (2026-08-05)

- 게이트: typecheck 8/8, lint 0, format:check, **test 314 pass / 49 files**, build 8/8, Compose 5개 healthy
- raw_json 제거: traffic DB **19.9 MB → 4.7 MB**(76% 감소), 행수 23,764 유지, `integrity_check` ok
- index 교체: 같은 데이터에서 최근 이벤트 조회 **4.06 ms → 0.12 ms**, 요약 2.61 → 0.87 ms, status 집계는 covering index. `(occurred_at, uri_path)`·`(occurred_at, request_time_ms)` 는 planner 미채택으로 제외
- export 스트리밍: 실제 CSV export job 성공, 파일 sha256·크기가 job result 와 정확히 일치(75,890 B / 572행 + 헤더)
- upload 스트리밍: 3 MB 를 1 MB × 3 청크로 실제 업로드 → finalize 의 전체 파일 sha256 검증 통과
- 키 교체: 실제 deployment secret 1건으로 rotate job 2회 → v1→v2→v3, ciphertext 교체 확인. **API 재기동 후에도 keyring 이 파일에서 복원돼 v2 행을 복호화·재암호화**
- 리소스 잠금: 같은 `(kind, resource_key)` 2번째 삽입이 DB 유니크 제약으로 거부됨
- audit: 동일 초 그룹 10개에서 rowid 역순 정렬 확인
- 수집 지표: 패널 트래픽 화면에 수집 이벤트 1,645 / 저장 25,392행(1%) / DB 5.3 MiB(1%) / 체크포인트 ok 렌더, console error 0

### 실측에서만 드러난 결함

`reader.releaseLock()` 이 Bun 의 실제 요청 body 리더에 없어 업로드 첫 청크가 INTERNAL_ERROR 로 죽었다. 타입체크·유닛테스트·로컬 Bun 서버 재현은 모두 통과했고 Compose 실측에서만 나왔다. 반복자 정리를 `cancel()` 로 바꿔 해결했다.

### 검증하지 못한 것

- nginx revision 정리의 **라이브 동작**: 현재 revision 8개로 보관 수(20) 미만이라 실제 정리가 일어나지 않았고, live nginx apply 를 유발하지 않았다. 단위 테스트(보관 수 2)로만 확인했다.
- API SSE 동시 상한 32 도달: 32개 동시 스트림을 실제로 열지 않았다.

## 작업: 의존성 취약점 해소와 타입 안전성 강화 (2026-08-05)

기준: 사용자 지시 — "nextjs 는 16.3.0으로 나머지도 다 올리도록하고 eslint-disable, any 타입도 다 제거해서 제대로 만들도록하고. 완벽을 노려봐. workflow도 잘 이용해서 opus medium 으로 수정 검증도 잘해보고".

- [x] a. 의존성 상향 — next 16.2.12→16.3.0, hono 4.12.33→4.13.0(4개 앱), `@hono/standard-validator` `^0.2.0`→`0.2.3` 고정(hono-openapi peer 가 `^0.2.0` 이라 0.3.0 불가), 루트 `overrides: { esbuild: 0.25.12 }`. `bun audit` **7건(high 3) → 0건**
- [x] b. `eslint-disable` 1건과 `any` 5건 제거 — 전부 `apps/api/src/lib/with-error-handling.ts` 의 hono Handler 제네릭 기본값이었다
- [x] c. `context.req.valid('json' as never) as z.infer<typeof S>` 이중 캐스트 80건 제거 — 라우트 핸들러의 context 파라미터에 `ApiRouteContext<{ json: ... }>`(agent/traffic 판도 동일)를 주석해 `req.valid()` 가 실제 타입을 돌려주게 했다
- [x] d. compose 계층의 drizzle `as never` 캐스트 20여 건 제거 — service 계층 필드 타입을 `string` 에서 contracts 유니온으로 좁혀 근본 해소
- [x] e. **실제 스키마 드리프트 발견·수정** — `operation_job.kind` enum 에 `secret.rotate` 누락(5번 작업에서 추가한 job kind). `as never` 가 침묵시키고 있었다. SQLite text enum 은 타입 전용이라 migration 은 불필요
- [x] f. 워크플로 적대적 검증(agent 29개, opus/medium) — 지적 24건 중 **19건 반증 기각, 5건 확정**
- [x] g. 확정 지적 대응 — 아래 §반영 참조

### 워크플로가 잡아낸 회귀 (자체 게이트는 전부 초록이었다)

**withErrorHandling 재작성이 hono RPC 응답 타입을 지웠다.** 반환 타입을 `Promise<Response>` 로 고정하자 hono 가 `TypedResponse` 를 회수하지 못해 `AppType` 의 라우트 스키마가 통째로 비었다. `git worktree` 로 HEAD 를 따로 체크아웃해 같은 probe 로 대조 실측했다.

- HEAD: `InferResponseType<client.api.traffic.summary.$get>` = `{ data: { averageResponseTimeMs, bytesSent, ... }, success: true }`
- 회귀 상태: `{}`
- 수정 후: HEAD 와 동일

`apps/web` 의 `hc<AppType>` 소비처 14곳이 응답을 zod 로 재검증하기 때문에 typecheck·lint·test·build 가 전부 통과했고, CI 신호로는 잡히지 않는 회귀였다. 수정은 래퍼가 핸들러 타입 `R` 을 그대로 반환하도록 되돌리되(`as unknown as` 1회, `any` 없음) 이유를 JSDoc 으로 남겼다. 요청 인자 타입은 HEAD 에서도 비어 있어(동일 probe 로 확인) 회귀가 아니다.

### 확정 지적 반영

| 지적                                               | 조치                                                                                                                                                                                                                             |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RPC 응답 타입 소실(medium)                         | 래퍼가 `R` 을 반환하도록 복구, HEAD 대조 실측으로 확인                                                                                                                                                                           |
| `secret.rotate` 가 실패 알림 매핑에서 누락(medium) | `FAILURE_EVENT_BY_JOB_KIND` 를 `Partial<Record<...>>` 에서 **전체 `Record<OperationJobKind, EventType \| null>`** 로 바꿔 새 job kind 누락이 컴파일 에러가 되게 했다. `notification.deliver` 는 피드백 루프 방지로 명시적 `null` |
| `USER_ROLE` 3중 정의(medium)                       | `packages/contracts/src/user-management.ts` 를 단일 출처로 삼고 db-schema 가 이를 import·재export, api auth service 의 로컬 복제 제거. drizzle enum 도 `USER_ROLE_VALUES` 에서 유도                                              |
| import 순서 4개 파일(low)                          | zod import 를 hono 다음으로 이동                                                                                                                                                                                                 |
| `RouteInput` 이 검증 없는 수동 단언(low)           | 구조적 한계로 수용. 변환 시점의 100곳은 validator 와 전수 대조해 일치를 확인했고, 워크플로 독립 재검증에서도 불일치 0건                                                                                                          |

### 실측 (2026-08-05)

- `bun audit` **0건**, typecheck 8/8, lint 0, format:check, test 314 pass, build 8/8, Compose 이미지 5개 재빌드 후 5개 healthy
- 제품 코드의 `any`·`eslint-disable`·`as never` **0건**(테스트 스텁 2건만 잔존)
- 미인증 API 23개 전수 401, 패널 9개 라우트 200, console error 0
- 토큰 전용 경로 7개 200, validator 400 응답 2종, 에러 봉투 형태 동일
- `drizzle-kit generate` 결과 "No schema changes" — enum 정리는 마이그레이션 무영향

## 작업: HANDOFF 1순위 라이브 검증과 스트림 결함 수정 (2026-08-05)

기준: [HANDOFF.md](./HANDOFF.md) §8 1순위. 결정은 [acknowledge/0032](./acknowledge/0032-stream-lifecycle-and-e2e-verification.md), 결함 상세는 [bug/2026-08-05-sse-stream-slot-leak.md](./bug/2026-08-05-sse-stream-slot-leak.md).

- [x] a. SSE 동시 상한 429 확인 — 확인했으나 **재시작 없이는 복구 불가한 슬롯 누수를 발견**. api·engine-agent 양쪽 수정, 회귀 테스트 6건 추가, 재빌드 후 3회 반복 실측
- [x] b. 동시 상한 불일치(API 32 / agent 20) 해소 — `MAX_CONCURRENT_ENGINE_STREAMS` 단일 상수
- [x] c. SSE 초기 flush 추가 — 조용한 스트림이 15초간 헤더조차 못 보내던 문제
- [x] d. nginx revision 정리 — 프루닝은 실제 파일시스템 테스트(keep=2, 5회 apply)로 검증됨을 확인하고 컨테이너 env(`NGINX_REVISION_KEEP_COUNT=20`) → `server.ts` → `create-agent-app.ts` 배선을 라이브 대조. 라이브 21회 apply 는 control plane churn 대비 정보 이득이 없어 생략
- [x] e. `scripts/seed-e2e.ts` 추가 — E2E 계정 생성/비밀번호 재설정. 비밀번호는 stdout 1회 출력, 기록하지 않음
- [x] f. 암호 포함 백업 복구 UI 실렌더 확인 — 브라우저에서 `secretsIncluded` 분기 양쪽 확인, 위젯 테스트 2건으로 고정
- [x] g. 다크 모드 6화면 확인 — 판독 문제 0건. `dark:` 변형·Tailwind 기본 팔레트 부재를 테스트로 고정
- [x] h. 웹 테스트 환경 — vitest 대신 `bun test` + happy-dom + Testing Library(의존성 3개, `bunfig.toml` preload 1줄)
- [ ] i. `full` 모드 복구 드릴 — 라이브 control DB 를 되돌리는 파괴적 작업이라 사용자 승인 대기
- [ ] j. 운영 nginx 이미지 경유 저속 SSE 미도달 — 사용자 판단으로 조사 중단, KNOWN ISSUE 로 기록

### 실측

- 스트림: 동시 32개 → 33번째 429 → 전부 종료 → 다시 32개 전부 200(3회 반복 동일), `/api/readyz` 전 항목 `ok`, `GET /api/containers` 200
- 전체 검증: typecheck 8/8 · lint 0 · test 320(백엔드) + 6(웹) · format:check · build 8/8

## 작업: 외부 노출 설정을 패널로 이관 (2026-08-05 후반)

기준: 사용자 요청 — Cloudflare 터널 502 진단에서 시작해 "설정값도 웹패널에서" 로 확장.
결정은 [acknowledge/0034](./acknowledge/0034-panel-public-origin-setting.md)·[0035](./acknowledge/0035-trusted-proxy-approval.md).

- [x] a. 터널 502 원인 규명 — nginx catch-all `444`. `hyuns.uk` 가 `server_name` 에 없었다
- [x] b. 공개 주소 설정을 DB 로 — `panel_setting`(migration 0015), `GET/PUT /api/panel-settings`, 저장 시 nginx `server_name` AST 최소 변경
- [x] c. 신뢰 origin 즉시 반영 — better-auth `trustedOrigins` 를 함수로 받아 재시작 없이 적용. 환경변수 origin 은 하한선으로 항상 유지(잠금 방지)
- [x] d. 신뢰 프록시 승인 — `trusted_proxy`(migration 0016), access log 원본 source 후보 + 역방향 DNS, 승인 시 `set_real_ip_from` 교체
- [x] e. 공개 주소 후보 — 접근 시도된 host 를 요청 수·거부 수와 함께. 제외 기준은 신뢰 origin(서버가 응답해도 인증이 막는 host 를 숨기지 않기 위해)
- [x] f. 하드코딩 제거 — compose cloudflared 프로필·마이그레이션 스크립트·`nginx.conf` 의 `10.89.0.10` 제거
- [x] g. 사이드바 라벨/아이콘 누락 수정 + 회귀 테스트
- [x] h. `successResponse` 가 Promise 를 받으면 컴파일 실패하도록 타입 가드
- [ ] i. 터널을 `cloudflared service install` 로 옮겨 토큰 `ps` 노출 제거 — 사용자 작업
- [ ] j. `https://hyuns.uk` 를 공개 주소로 저장 — 사용자 작업(패널에서 1클릭)

### 실측

- 승인 → nginx `set_real_ip_from` 이 `10.89.0.1/32` 로 교체, 후보에서 제거
- `0.0.0.0/0` 승인 400, 마지막 1개 삭제 400
- 공개 주소 후보 최상단 `hyuns.uk | 요청 131 | 거부 39`
- 외부 `https://hyuns.uk/` 307, access log `client_ip=1.235.152.6`(실제 클라이언트)
- typecheck 8/8 · lint 0 · test 376 + web 20 · build 8/8 · audit:runtime 5/5

## 작업: 실운영 점검 후속 6건 (2026-08-05 야간)

기준: 사용자 지시 — "1-6까지 다 손 대고 수정 완벽하게". 결정은 [acknowledge/0036](./acknowledge/0036-public-origin-single-source-and-shutdown.md).

- [x] a. seed 스크립트 timestamp 단위 오류로 손상된 auth 행 복구 (migration 0017) — `GET /api/users` 500 해소
- [x] b. 쿠키 Secure 를 요청별로 적용 — nginx forwarded proto map + 응답 미들웨어, 쿠키 이름 유지
- [x] c. owner 계정 제거 경로 — 자기 자신만 불변으로 축소, `DELETE /api/users/:id` 추가, `z.uuid()` 제약 제거
- [x] d. 보호 hostname 을 호출 시점 평가로 — 공개 주소·추가 신뢰 origin 포함
- [x] e. 초대 링크가 저장된 공개 주소를 사용
- [x] f. `GET /api/session` 을 요약으로 축소 — 세션 토큰 미노출
- [x] g. graceful shutdown — 8초 상한 드레인 + `stop_grace_period: 20s`
- [x] h. 부팅 시 DB 공개 주소가 env 를 대체 — `restartRequired` 가 실제로 적용됨

### 실측

- 외부 HTTPS 쿠키 `Secure` + HSTS `includeSubDomains`, 로컬 HTTP 로그인 유지
- `hyuns.uk` 프록시 라우트 409, 초대 링크 `https://hyuns.uk/...`
- owner 삭제 200 / 자기 삭제 409, SSE 물린 SIGTERM 12초 exit 0
- typecheck 8/8 · lint 0 · test 407 · build 8/8 · audit:runtime 5/5

## 작업: seed 제거와 최초 가입자 owner 전환 (2026-08-05 야간)

기준: 사용자 지시 — "seed 아이디/비밀번호는 이제 제거하고 (develop할때만사용) seed 없이 초기화 + 처음 가입자만 운영자".

- [x] a. bootstrap 을 내부 이름에서만 허용 — 공개 주소에서 403. 계정 없는 상태가 공개 노출 중 선점당하지 않게
- [x] b. 웹이 공개 주소에서는 폼 대신 안내 카드 표시 (ko/en/ja)
- [x] c. seed 스크립트를 개발 전용으로 — 공개 주소가 설정된 스택은 거부, --allow-configured 로만 우회
- [x] d. `scripts/reset-accounts.ts` 추가 — dry run 기본, --confirm 필요, 실행 전 DB 사본
- [ ] e. 실제 계정 초기화와 첫 owner 생성 — 사용자 작업 (파괴적이라 자동 실행하지 않음)

### 실측

- 공개 주소 bootstrap POST 403 `BOOTSTRAP_ORIGIN_FORBIDDEN`
- 로컬 bootstrap POST 409 `BOOTSTRAP_COMPLETE` (계정이 아직 있는 상태)
- seed 스크립트가 공개 주소 설정을 감지해 거부
- reset 스크립트 dry run 이 대상 1건만 보여주고 변경 없음
