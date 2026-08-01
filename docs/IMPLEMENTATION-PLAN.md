# 단계별 구현 계획

## 운영 규칙

- [acknowledge/0002-product-decisions.md](./acknowledge/0002-product-decisions.md)의 결정은 확정됐지만 사용자의 명시적 구현 시작 승인 전에는 프로젝트 초기화나 spike를 실행하지 않는다.
- 각 Phase를 시작하기 전에 `PROCESS.md`에 세부 체크리스트를 활성화한다.
- 각 Phase는 코드, 테스트, 문서, 실행 검증이 함께 끝나야 완료다.
- 다음 Phase의 편의를 위한 범위 밖 추상화를 미리 만들지 않는다.
- 모든 의존성은 도입 직전 최신 안정 버전과 공식 문서를 다시 확인한다.

## Phase 0 — 결정과 위험 spike

- [x] 사용자 결정 묶음을 `docs/acknowledge/0002-product-decisions.md`에 기록
- [x] target OS·Docker Engine·Cloudflare·domain·retention·resource 목표 확정
- [ ] Next.js Bun runtime과 Node runtime 비교 spike
- [ ] Docker client 후보의 Bun Unix socket·exec hijack·load stream spike
- [ ] Nginx JSON log와 rotation tail spike
- [ ] SQLite ingest 목표 부하 spike
- [ ] architecture·threat model ADR 확정
- [ ] 최신 안정 호환 버전 matrix와 production image digest 확정
- [ ] M1 Max `linux/arm64`와 `linux/amd64` emulation matrix

완료 조건: 런타임과 Docker client 선택, 성능 목표, 지원 artifact 형식, break-glass 정책이 문서로 확정된다.

## Phase 1 — 모노레포와 품질 기반

- [x] Bun workspace root와 단일 lockfile
- [x] `apps/web`, `apps/api`, `apps/engine-agent`, `apps/traffic-worker`, `packages/*`
- [ ] TypeScript strict, project references, path alias, React Compiler
- [x] formatter·lint·typecheck·test·build script
- [ ] FSD dependency 검사와 backend layer 검사
- [ ] `.env.example`, Zod `getEnv`, secret mount contract
- [x] Dockerfiles, Compose development skeleton, healthcheck
- [ ] CI의 isolated Docker test daemon

완료 조건: 빈 service가 모두 build·health check되고 root quality gate가 한 명령으로 실행된다.

## Phase 2 — shadcn과 패널 셸을 먼저 구축

- [x] [SHADCN-COMPONENTS.md](./SHADCN-COMPONENTS.md) 목록 재확인
- [x] shadcn 설정과 첫 Card·Badge primitive 설치
- [x] light·dark token, radius 0, shadow, spacing 적용
- [x] 3단 Sidebar·main·context shell
- [ ] responsive Sheet·Drawer 전환
- [ ] loading·empty·alert·error boundary 공통 상태
- [ ] command palette, breadcrumb, job center shell
- [x] 좌표·computed style 실제 브라우저 smoke test

완료 조건: 실제 데이터 없이도 모든 공통 상태와 responsive shell이 디자인 기준을 만족한다. 도메인 page 구현 전에 끝낸다.

## Phase 3 — control DB, 인증, API 기반

- [x] Drizzle SQLite schema와 migration
- [x] Better Auth Drizzle adapter와 session
- [x] owner bootstrap, 단회 invite, role
- [x] disabled user와 owner 전용 사용자 관리
- [x] API key scope, expiry, revoke
- [x] error response helper와 request ID
- [x] Hono Route → Service → ServiceDb factory 구조
- [x] Hono RPC AppType과 web client
- [x] append-only audit log와 upload idempotency 기반
- [ ] auth·capability·CSRF·CORS contract test
- [ ] 패널 Access+session과 외부 API-key-only hostname profile
- [x] `ko`, `en`, `ja` locale registry·catalog 기반

완료 조건: SSR 로그인, role별 화면, scope별 API가 동일한 server authorization을 사용한다.

## Phase 4 — Engine Agent 조회 plane

- [x] Agent internal authentication과 replay 방어
- [x] Docker version negotiation, ping, info
- [x] container·image·network·volume list·inspect
- [ ] events subscriber와 reconciliation
- [x] normalized DTO와 error mapping
- [x] API query route와 SSR fetch client
- [x] overview·resource list·detail SSR 화면
- [ ] Engine offline·stale 상태

완료 조건: DB snapshot이 아닌 실제 Engine 상태가 패널과 API에 일치하고 socket은 Agent에만 있다.

## Phase 5 — Docker 변경, stream, 자기 보호

- [x] container lifecycle과 create policy
- [x] image pull(durable job)·tag·registry 인증 — Agent 전용 AES-GCM credential store·host binding·metadata-only API/UI (0017, 0020)
- [x] image remove, network·volume create·remove
- [x] destructive confirmation
- [x] durable job queue — 상태 machine·재시도·취소·timeline·boot reconciliation (첫 소비자: 자동 backup)
- [ ] resource lock, idempotency key
- [x] logs follow, stats stream, Docker events SSE (실시간 로그 UI 포함 — 0015)
- [x] bounded non-TTY exec
- [x] TTY WebSocket terminal
- [x] management-plane protection과 prune dry-run preview — Compose project label 보호·image dependency impact 포함 (0018)
- [x] owner 전용 durable system prune — preview SHA 재검증·volume opt-in·후보별 보호·협조 취소·단일 attempt (0019)
- [x] container inspect·bounded log와 위험 작업 UX

완료 조건: 정의된 operation 카탈로그를 패널과 API 양쪽에서 수행하고 모든 변경이 audit에 남는다.

## Phase 6 — Nginx config control

- [x] 관리·API 기본 config와 hostname 분리
- [x] route DTO, collision validation, deterministic renderer
- [x] revision file·apply 이력
- [x] `nginx -t`, atomic swap, HUP reload, probe
- [x] 전체 config editor와 보호 계약 검사
- [ ] shadow Nginx 기동 probe
- [ ] 독립 watchdog과 last-known-good 자동 복구
- [x] apply 실패 rollback
- [ ] recovery-required 처리
- [x] Nginx status·structured routes·revision 화면
- [ ] diff·error log 화면
- [x] concurrent SHA conflict와 invalid config integration test

완료 조건: invalid·runtime 실패가 기존 route를 중단하지 않고 이전 revision으로 복구된다.

## Phase 7 — 트래픽 ingest와 대시보드

- [x] versioned JSON log format과 request ID propagation
- [x] JSONL offset tail과 partial line
- [x] inode checkpoint·rotation 복구
- [x] traffic SQLite raw schema와 retention
- [ ] minute·hour rollup schema와 migration
- [x] 원본 IP 저장·일반 UI mask·retention
- [ ] 원본 IP 제한 상세 열람·감사
- [x] raw window의 정확한 percentile 계산
- [ ] histogram rollup과 exemplar
- [ ] saved view (export job·live SSE는 0021에서 완료)
- [x] overview, percentile, top path, status, recent request 화면
- [ ] time-series chart, errors, slow, live 화면
- [x] rotation·restart·DB failure 정확성 test

완료 조건: 고정 fixture의 요청 수·상태·percentile과 DB 결과가 일치하고 재시작·rotation에서 중복·누락이 없다.

## Phase 8 — 업로드와 배포

- [x] upload session·chunk·digest·동시 upload 제한
- [x] disk watermark·총 byte quota
- [x] quarantine과 Docker·OCI archive policy 검사
- [ ] scanner sidecar와 policy result
- [x] Docker image load
- [ ] OCI 변환·load, rootfs import, Compose bundle, 격리 build
- [x] deployment manifest와 secret reference
- [x] encrypted secret 저장·rotation·release resolver
- [x] blue-green rollout, route apply, observe, 자동 rollback
- [x] 이전 release retention cleanup과 cleanup warning 재시도
- [x] 수동 rollback과 중단 release container cleanup
- [ ] 일반 orphan sweep
- [x] upload·deployment 화면
- [ ] 상세 job timeline
- [ ] traversal·bomb·scanner·health failure test

완료 조건: session과 API key 양쪽에서 artifact를 안전하게 배포하고 실패 시 기존 서비스로 복구된다.

## Phase 9 — 운영 기능 완결

- [x] 단회 invitation·API key 관리 화면
- [x] user·role·disabled user 관리 화면
- [x] audit 목록·클라이언트 filter·IP masking
- [ ] audit detail·server filter UI·export
- [x] 로컬 control·traffic DB backup·restore·retention과 Docker Desktop disk watermark
- [ ] client-side 암호화 선택적 R2 backup·restore
- [ ] system health와 self metrics
- [x] maintenance mode
- [ ] control plane upgrade runbook
- [ ] Discord webhook 알림과 test delivery
- [x] 한국어·영어·일본어 catalog
- [ ] 별도 language pack 확장 검증

완료 조건: 일상 운영과 복구 절차가 호스트 터미널 없이 가능하다.

## Phase 10 — 보안 hardening

- [ ] 위험 option과 break-glass 최종 통제
- [x] 신규 container capability drop, read-only FS, network isolation 기본값
- [ ] API key·internal credential rotation
- [x] Nginx·application 이중 rate limit, secret redaction, CSP·security headers
- [ ] image SBOM·vulnerability scan
- [ ] audit hash chain과 외부 checkpoint 선택 기능
- [ ] threat model test suite와 보안 review

완료 조건: [SECURITY.md](./SECURITY.md)의 불변식과 공격 test가 모두 통과한다.

## Phase 11 — 성능·복구·UI 전수검증

- [ ] 목표 규모 load test와 profile
- [ ] SQLite query plan·index 검증
- [ ] logs·stats·events·upload backpressure
- [ ] crash·disk full·rotation·daemon restart chaos
- [ ] light·dark, desktop·tablet·mobile 전 route 실렌더
- [ ] keyboard·screen reader·contrast·focus
- [ ] 운영 runbook과 restore drill

완료 조건: 정한 SLO를 만족하고 실패 시 기존 workload가 지속되며 복구 절차가 재현된다.

## Phase 12 — release

- [ ] pinned image digest와 reproducible build
- [ ] migration dry-run과 upgrade·rollback matrix
- [ ] fresh install, upgrade, restore E2E
- [ ] Cloudflare Tunnel·Access 설치 문서
- [ ] 관리자·외부 API 문서
- [ ] known limitation과 지원 범위
- [ ] [quality-assurance/ACCEPTANCE.md](./quality-assurance/ACCEPTANCE.md) 전 항목 증거 연결

완료 조건: 새 호스트에 문서만으로 설치하고 웹·API만으로 인수 시나리오를 완료한다.
