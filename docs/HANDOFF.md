# HANDOFF — 2026-08-05 세션 스냅샷

- 대응 커밋: `221cd04` (`dev`, **origin/dev 대비 5커밋 미푸시**)
- 최종 갱신일: 2026-08-05
- 검증 상태: typecheck 8/8 · lint 0 · **test 314 pass / 49 files** · format:check · build 8/8 · Compose 5개 healthy · `bun audit` 0건
- 이 문서가 **세션 인수인계 단일 진입점**이다. 다른 문서보다 먼저 읽는다.

## 1. 프로젝트 한 줄 정의

단일 Docker 호스트를 웹 패널로 관리하는 self-hosted control plane. 컨테이너 제어·이미지·배포(blue-green)·Nginx 설정 GUI·트래픽 분석·백업/복구를 role 기반 권한과 durable job queue 위에서 제공한다. Portainer 대안이지만 "작은 프로덕션 control plane" 수준의 보안·복구 요구를 스스로에게 적용한다.

## 2. 현재 목표

- **최종 목표**: 실운영 가능한 상태 + GitHub Actions가 API key만으로 배포를 완주할 수 있는 상태.
- **현재 마일스톤**: 실운영 준비도 로드맵 **1·2·3단계 전 항목 완료** + 의존성·타입 하드닝 완료.
- **직전 작업(2026-08-05 후반)**: Next.js 16.3.0 상향과 취약 의존성 정리(`bun audit` 7건 → 0건), 제품 코드 `eslint-disable`·`any`·`as never` 전면 제거, Workflow(opus/medium, 에이전트 29개)로 그 결과를 적대적 검증. 결정 기록은 [acknowledge/0031](./acknowledge/0031-dependency-and-type-hardening.md).

판정 근거는 [quality-assurance/2026-08-04-production-readiness.md](./quality-assurance/2026-08-04-production-readiness.md). 판정 당시 실운영 `no-go` / CI API `partially-possible`였고, 1·2단계로 blocker 9건 중 코드로 해결 가능한 것은 전부 해소했다. **남은 no-go 사유는 "외부 환경에서의 실검증 미수행"이지 코드 결함이 아니다**(§7·§8 3순위 참조).

### 실운영 가능성에 대한 직답 (사용자 질문 2026-08-05)

질문은 "지금 구현 상태에서 기능이 완전히 작동하고, 보안 문제·취약점 없이 제대로 돌릴 수 있느냐"였다. 실측 결과:

- **동작**: 로컬 스택에서 API key 토큰만으로 manifest 등록 → 업로드 → 이미지 load → 배포 판정까지 완주한다.
- **보안**: 미인증 엔드포인트 23개 전부 401, 로그인 rate limit 이 burst 후 429, 알 수 없는 Host 는 444, Docker 소켓은 engine-agent 에만, 퍼블리시 포트는 nginx `127.0.0.1:18080` 하나, 전 컨테이너 `read_only` + `no-new-privileges`, 앱 컨테이너는 non-root(`bun`), 시크릿 파일 전부 `0600 bun:bun`. `bun audit` 0건.
- **한계 (정직하게)**: GitHub 호스팅 러너는 `127.0.0.1:18080` 에 도달할 수 없다 — 외부 노출 경로(터널/TLS)를 붙이기 전까지 실제 GitHub Actions 실행은 불가능하다. 또한 **토큰만으로 blue-green release 를 끝까지 실행하는 경로는 라이브 실측을 하지 않았다**(release 메커니즘 자체는 이전 세션에 검증됨 — [HANDOFF-STATUS.md](./HANDOFF-STATUS.md) "실제 blue-green v1→v2→manual rollback, secret injection, graceful stop timeout 검증").

## 3. 완료 / 진행 중 / 미착수

### 완료 (이번 세션, 커밋 35건)

**웹 UI/UX 전면 개편** — 스펙: [acknowledge/0029](./acknowledge/0029-monotone-design-system.md)

- `apps/web/src/app/globals.css` — 모노톤 토큰 재작성(surface 3단·overlay 4단·텍스트 3단 opacity, shadcn 표준 토큰, `@layer base` border 가드). cascade layer 밖에서 `rounded-*`를 무력화하던 전역 `* { border-radius: 0 }` 제거.
- `apps/web/src/shared/ui/**` — primitive 6종을 공식 new-york 구조로 교체(cva variant·size·asChild·focus-visible ring·aria-invalid), 14종 신규(alert·alert-dialog·dialog·sheet·popover·dropdown-menu·separator·scroll-area·sonner·table·skeleton·empty·spinner·sidebar), `inline-alert.tsx` 삭제.
- `apps/web/src/widgets/panel-shell/**` — shadcn Sidebar로 재구성. **`children`이 모바일·데스크톱 `main`에 각각 렌더돼 모든 위젯이 2회 마운트되던 버그** 해소(SSE 2중 연결·폴링 2배·DOM id 중복).
- 위젯·features 전면 이관 — `window.location.reload` 12~14곳 제거, 파괴적 작업 AlertDialog 승격, toast/Alert 이원화, Table·Skeleton·Empty.
- `apps/web/src/shared/lib/query-provider.tsx` — **모듈 싱글턴 QueryClient**(서버에서 전 요청이 캐시 공유)를 요청별 생성으로 교체.
- `apps/web/src/app/[locale]/(panel)/layout.tsx` — 엔진 상태를 셸이 단독 소유하도록 프리페치 이관(layout↔page 이중 프리페치로 인한 hydration 불일치 해소).

**백엔드 결함 수정 14건** — 근거: [quality-assurance/2026-08-04-ui-backend-audit.md](./quality-assurance/2026-08-04-ui-backend-audit.md)

- `apps/traffic-worker/src/db/database.ts` — 유효 이벤트 0건 청크에서 빈 배열 insert로 예외 → 체크포인트 미전진 → **수집 영구 정지**.
- `apps/api/src/lib/error.ts` — `createAppError`가 `code`/`statusCode` 미부착이라 `isAppError`가 항상 false. engine-agent 코드를 `packages/contracts/src/engine-error.ts`로 공유.
- `apps/engine-agent/src/service/domain/create-engine-control-service.ts` — `tagImage` 관리 plane 보호 부재(제어 plane 이미지 하이재킹), 참조 해석 `endsWith` 제거·fail-closed.
- `apps/api/src/service/domain/job/create-operation-job-service.ts` — heartbeat stall 미회수, 취소 job이 succeeded로 덮어써짐, 백업 실패 무한 재큐잉.
- `apps/api/src/route/api-key/`·`route/backup/` — owner 전용 scope 이중 강제, 백업 복원 session-only.
- `packages/nginx-config/` **신규 패키지** — 웹 GUI 파서를 승격해 engine-agent 보호 계약 검증을 AST all-must-pass로 재작성(decoy server 블록 우회 차단). 이 과정에서 **파서가 주석 줄 다음 블록 헤드를 삼키던 버그**도 수정(웹 GUI 편집기 손상 잠재 경로였음).
- `apps/api/src/service/domain/nginx/create-nginx-proxy-route-service.ts` — apply-then-persist → persist-then-apply + 보상 + 직렬화 + 부팅 자가치유.
- `infra/nginx/entrypoint.sh` — access log 크기 기반 로테이션(128 MiB·60초·2세대·무압축).
- 감사 로그 서버 필터·페이지네이션(`packages/contracts/src/audit.ts`, migration 0011).

**실운영 1단계**

- `compose.yaml` — `restart: unless-stopped` 5개 서비스, json-file 로그 로테이션(10m×3), 메모리 상한, `PANEL_BIND_ADDRESS`/`PANEL_PORT`/`PANEL_PUBLIC_ORIGIN`/`AUTH_TRUSTED_ORIGINS`/`DOCKER_GID` 외부화.
- `apps/api/src/compose/compose-backup.ts`·`service/domain/backup/**` — 복구 모드 2종(`preserve-host`/`full`), `__drizzle_migrations` 보존(역행 시 crash loop 차단), **보존 대상 artifact를 참조하는 deployment FK 때문에 새 호스트 복구가 코드상 불가능하던 문제 해소**, 암호화 키 2종을 passphrase envelope으로 백업 포함.
- `infra/nginx/nginx.conf` — `real_ip`(프록시 뒤 IP 수렴으로 rate limit이 전체 공유되던 자기 DoS 차단), catch-all default server(444), 보호 계약에 real_ip·catch-all·전체대역 신뢰 금지 추가.
- `infra/nginx/nginx-tls.conf.example`·`compose.tls.example.yaml`·cloudflared 프로필 — 외부 노출 opt-in 경로. 기본 스택은 로컬 전용 유지.
- `apps/api/src/boot/run-startup-tasks.ts` — 치명(env·migration·secret) fail-fast / 복구·정리 단계만 격리. restart 정책이 붙어 crash loop 위험이 생겼기 때문.
- `packages/config/src/origin.ts`·`scripts/setup.sh` — 신뢰 origin 정규화(포트만 바꾼 설치가 첫 로그인에서 403으로 죽던 회귀 차단), Linux docker GID 탐지.
- `infra/nginx/entrypoint.sh` — **HUP·USR1·QUIT를 nginx master로 전달.** 로테이션 때문에 PID 1이 셸이 되면서 설정 적용이 "성공"으로 보고되고도 실제 리로드가 되지 않던 회귀.

**실운영 2단계**

- `packages/contracts/src/api-key.ts` — `job:read`·`job:write`·`engine:read`·`control-plane:read` scope 신설(총 13종). **CI가 배포 성패를 판정할 수 있게 된 핵심 변경.**
- `apps/api/src/route/{job,engine,control-plane}/**` — API key 분기 추가. 쓰기 계열은 열지 않음.
- `apps/api/src/service/domain/deployment/create-deployment-manifest-service.ts` — 동일 payload면 기존 manifest 반환(200), 내용 다르면 409. 워크플로 재실행이 죽지 않음.
- `apps/api/src/service/domain/notification/create-notification-delivery-service.ts` — 실패 알림을 job 전반으로 확장(backup 1종 → deploy/restore/job). 알림 실패가 알림을 만드는 루프는 차단.
- `apps/api/src/route/health/create-readiness-route.ts` — `/api/readyz`(engine-agent·traffic-worker·DB integrity·백업 신선도·job 적체·점검 모드).
- 백업 디스크 가드·총량 상한, 점검 모드 DB 영속화(migration 0012).
- `docs/ci-examples/github-actions-deploy.yml`, `docs/RUNBOOK.md`.

**3단계 착수 전 1순위 (커밋 4건)** — 상세: [acknowledge/0030](./acknowledge/0030-ci-verification-surface-and-exposure-scope.md)

- `apps/api/src/route/control/create-control-route.ts` — `GET /api/images` 에 `engine:read` 분기(+`apiKeyService` 의존성, 통합 테스트 4건). CI 가 image load 결과를 확인할 수 있게 됐고 워크플로 예제에 digest 확인 단계를 넣었다.
- `apps/web/src/widgets/api-key/api-key-widget.tsx` — scope 9종 하드코딩 → `API_KEY_SCOPE_VALUES`. 2단계 신설 scope 4종이 패널에서 선택 가능해졌다.
- `apps/web/src/widgets/backup/**`·`features/backup-confirm-dialog` — 복구 범위(`preserve-host`/`full`) 선택과 암호 입력(백업이 `secretsIncluded` 일 때만), 생성 폼 암호 입력.
- `scripts/setup.sh` — `--non-interactive`(비-TTY 자동 적용)·`--start-mode`·override 처리 플래그·`--help`.

**실운영 3단계 (커밋 9건)** — 9개 항목 전부. 상세와 실측은 [PROCESS.md](./PROCESS.md) 의 "3단계 장기 운영 안정화" 절.

- `apps/traffic-worker/**` — `access_event.raw_json` 제거(migration 0001, 실측 저장량의 약 67%)와 행수·바이트 상한·정기 VACUUM, 보존 정리를 1초 poll 에서 60초 전용 서비스로 분리.
- `apps/traffic-worker/src/db/**` — `(occurred_at, status)` 복합 index(migration 0002)로 교체하고 읽기 전용 연결의 **worker thread** 로 분석·export 조회를 분리(`bun:sqlite` 동기 API 가 이벤트 루프를 막던 문제). 신규 파일: `read-queries.ts`·`create-query-worker.ts`·`query-worker-entry.ts`·`create-traffic-retention-service.ts`.
- `apps/api/src/service/domain/backup/**`·`apps/traffic-worker` — 스냅샷을 `VACUUM INTO` + 스트리밍 digest 로 전환(메모리 상주 제거).
- `apps/api/src/route/upload/**`·`service/domain/upload/**` — chunk 본문 스트리밍 쓰기, export 는 keyset pagination 스트리밍.
- `packages/config/src/keyring.ts`·`service/domain/deployment/create-secret-rotation-service.ts` — 암호화 키 keyring 과 `secret.rotate` durable job(migration 0013).
- `service/domain/upload/**` — artifact 삭제 API 와 보존 GC, 업로드 총량 기본 상한 조정.
- `service/domain/job/**` — worker id 기반 회수와 `(kind, resource_key)` 활성 상태 부분 유니크 인덱스(migration 0014).
- `service/domain/audit/**` — 보존 아카이브(JSONL)와 rowid tie-break 정렬.
- `apps/engine-agent/**`·`apps/web/src/widgets/traffic/traffic-health-widget.tsx` — nginx revision 정리, API SSE 동시 상한, `GET /api/traffic/health` 와 수집·보존 지표 위젯.

**의존성 상향과 타입 하드닝 (커밋 5건, 전부 미푸시)** — 상세: [acknowledge/0031](./acknowledge/0031-dependency-and-type-hardening.md)

- `e286923` — next 16.2.12→16.3.0, hono 4.12.33→4.13.0(4개 앱), `@hono/standard-validator` `0.2.3` 고정(hono-openapi peer 제약), 루트 `overrides: { esbuild: 0.25.12 }`. **`bun audit` 7건(high 3) → 0건.**
- `0424177` — `apps/api/src/lib/with-error-handling.ts`(+engine-agent·traffic-worker 판) 재작성. `ApiRouteContext<{ json: ... }>` 제네릭을 도입해 라우트 80곳의 `context.req.valid('json' as never) as z.infer<...>` 이중 캐스트를 제거했다. `eslint-disable` 0개.
- `0e9cec2` — compose 계층 drizzle `as never` 20여 건 제거(서비스 필드 타입을 contracts 유니온으로 좁혀 근본 해소). 이 과정에서 **실제 스키마 드리프트 1건 발견**: `packages/db-schema/src/schema.ts` 의 `operation_job.kind` enum 에 `'secret.rotate'` 누락. `USER_ROLE` 단일 출처를 `packages/contracts/src/user-management.ts` 로 이관.
- `fec4eab`·`221cd04` — 문서 기록, next 16.3.0 이 생성한 `next-env.d.ts`.

### 진행 중

없음. 다만 **`dev` 브랜치가 `origin/dev` 대비 5커밋 앞서 있고 아직 push 하지 않았다**(`e286923`·`0424177`·`0e9cec2`·`fec4eab`·`221cd04`). 사용자 지시가 있으면 push 한다.

### 미착수

로드맵 3단계까지 전 항목이 끝났다. 남은 것은 §8 2·3순위(라이브 실측 미수행 항목과 외부 자원이 있어야 가능한 검증)와 §6 의 미해결 항목이다.

## 4. 의사결정 요약

상세는 [acknowledge/](./acknowledge/) (최신 0031)와 [SECURITY.md](./SECURITY.md) §15·§15.1.

| 결정                                                          | 이유                                                                                                                    | 기각한 대안                                                                       |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `withErrorHandling` 이 핸들러 반환 타입 `R` 을 유지하고 단언  | 정직한 `Promise<Response>` 반환은 hono 가 라우트 RPC 응답 스키마 추론을 포기하게 만들어 `apps/web` 전체가 타입을 잃는다 | 반환 타입을 `Promise<Response>` 로 명시 — **RPC 응답 타입 소실 회귀** (0031 §2.2) |
| 라우트 context 를 `ApiRouteContext<...>` 로 주석              | `as never` 이중 캐스트는 스키마 드리프트를 컴파일 타임에 침묵시킨다(실제로 1건 숨기고 있었다)                           | `as never` 유지 — 드리프트 은폐 지속                                              |
| 취약 의존성은 도달성을 먼저 확인한 뒤 상향                    | audit 0건만 좇으면 실제 위험과 무관한 변경으로 릴리스가 커진다. 확인 결과 전부 올릴 수 있어 올렸다                      | 무조건 상향 / 무시                                                                |
| border 전면 제거·radius 0, 구분은 surface elevation + opacity | 사용자 지시. 선이 아니라 면의 밝기로 구분하면 모노톤에서 위계가 살아난다                                                | hairline border 최소 유지 — 사용자가 A안 선택                                     |
| shadcn 공식 소스를 **구조 기준선**으로 삼고 시각만 치환       | 자체 축약 구현이 focus-visible·aria-invalid·size를 잃어 호출부 하드코딩을 20곳 이상 낳았다                              | 기존 13개 primitive 내에서만 정리 — UX 개선 폭이 제한됨                           |
| shadcn CLI를 쓰지 않고 공식 registry JSON을 수기 이식         | CLI가 `globals.css`·`components.json`을 덮어써 토큰 체계를 파괴한다                                                     | CLI 실행 후 복구 — 회귀 위험이 큼                                                 |
| nginx 파서를 `packages/nginx-config`로 단일화                 | 서버·클라이언트 파서가 갈라지는 것 자체가 우회 재발 원인                                                                | engine-agent에 검증 전용 토크나이저 별도 구현 — 이중화                            |
| `--border`를 삭제하지 않고 6% 가드 토큰으로 유지              | CLI로 추가하는 컴포넌트가 색 없는 `border`로 currentColor 실선을 그리는 사고를 원천 차단                                | `--border: transparent` — 플로팅 표면 구분이 사라짐                               |
| 백업 복구를 `preserve-host`/`full` 2모드로 분리               | 기존 구현은 "배포 상태 롤백"에 가까웠는데 문서는 "전체 교체"라고 적어 운영자를 오도했다                                 | 단일 모드로 전체 교체 — 운영자·키·감사가 날아감                                   |
| 암호화 키를 passphrase envelope으로만 백업                    | 평문 백업은 백업 파일 유출 = 전 secret 유출                                                                             | 키 제외 유지 — 복원해도 배포 secret이 영구 복호화 불가                            |
| access log 로테이션을 컨테이너 내부에서 수행                  | 사이드카 logrotate는 컨테이너 경계를 넘어 nginx master에 USR1을 보낼 수 없다                                            | 사이드카 logrotate, 압축 보존 — 압축은 traffic-worker의 old-inode drain을 깨뜨림  |
| `POST /api/jobs/:id/cancel`을 `job:write`로 개방              | 협조적 취소 요청이지 파괴적 명령이 아니고, 막으면 CI가 교착된 release를 사람 없이 못 푼다                               | 세션 전용 유지 — 무인 운용 목표와 충돌                                            |
| 감사 로그 열람 role을 구현(4종) 기준으로 문서 정정            | 감사 로그는 읽기 전용 관측 수단이고 viewer·auditor는 정의상 읽기 role                                                   | 구현을 owner/admin으로 좁힘 — 기존 접근이 끊김                                    |
| TLS를 기본 `nginx.conf`에 넣지 않고 템플릿으로 제공           | 인증서 없이 `listen 443 ssl`이 있으면 컨테이너가 뜨지 않는다                                                            | 기본 conf에 포함 — 로컬 기본 스택이 깨짐                                          |
| 부팅에서 env·migration·secret은 격리하지 않음                 | 잘못된 schema·빈 secret으로 요청을 받으면 데이터 오염·인증 우회 위험. 실패=설정 문제이므로 재시작 루프가 올바른 신호    | 전 단계 격리 — 조용히 잘못된 상태로 서비스                                        |
| 관리 plane 컨테이너를 패널에서 은닉하지 않음                  | 파괴적 작업은 engine-agent 가 이미 차단한다. 은닉하면 "패널에 안 보이는데 포트를 점유한 컨테이너"가 생겨 진단 불가      | 은닉 — 진단성 손실 (0030)                                                         |

## 5. 사용자 방향성 & 작업 규칙

- **답변**: 한국어, 존댓말, 간결. 미사여구·자축·이모지 금지. 검증 안 된 "완벽/잘 됨" 단언 금지.
- **코드**: arrow function only, 반환타입 미명시, `any`/`enum` 금지, **코드 주석 금지**(JSDoc 영어만), named export, 매직넘버 금지, `useCallback`/`useMemo` 금지(React Compiler), `cn()` 사용, FSD 단방향·barrel 금지, TanStack Query(`queryOptions` + 중앙 `QUERY_KEY`).
- **백엔드**: Route(validator+describeRoute+withErrorHandling) → Service → `*ServiceDb`(compose가 Drizzle 격리). 에러는 `createAppError`. **새 에러 코드는 `error-code.ts`·`error-message.ts`·STATUS_MAP 3곳 모두.** 라우트 핸들러의 검증 입력은 `ApiRouteContext<{ json: ... }>` 로 주석한다(캐스트 금지).
- **디자인**: border 유틸·`rounded-*`(형태 예외만)·Tailwind 기본 팔레트 색 금지.
- **커밋**: Conventional Commits, 한국어 설명, author 사용자 단독, **`Co-Authored-By`·AI 트레일러 금지**, `git add -A` 금지(선별 스테이징), force push 금지. 논리 단위 1커밋. commit·push 는 사용자가 지시할 때만.
- **검증**: 종료 전 typecheck → lint → test → build. **정적 검사 통과 = 완료가 아니다.** 이번 세션에서 실측으로만 드러난 결함이 6건이었다(nginx HUP 미전달, 렌더러 마커 거부, Dockerfile 패키지 누락, hydration 불일치 2건, 그리고 **RPC 응답 타입 소실** — 마지막 건은 typecheck·lint·test 를 전부 통과한 상태로 Workflow 검증에서만 잡혔다).
- **작업 방식**: 모호하면 1줄 객관식으로 질문. 전수검사 지시는 샘플링 금지. **에이전트 보고를 그대로 믿지 말고 핵심 주장은 직접 재확인**(이번 세션의 RPC 회귀 판정은 `git worktree` 로 HEAD 를 병렬 체크아웃해 같은 프로브로 대조했다).
- **금지**: `.env` 생성·수정·열람, 시크릿을 코드·문서·메모리에 기록, 무단 git 조작, `docker compose down -v`·광범위 prune, 사용자 소유 Docker 리소스 추정 삭제, shadcn CLI 실행.

## 6. 미해결 질문 / 확인 필요

1. **미푸시 5커밋 push 여부** — `e286923`·`0424177`·`0e9cec2`·`fec4eab`·`221cd04`. 사용자 지시 대기 중.
2. **암호 포함 백업의 복구 다이얼로그 실렌더 미검증** — 암호 입력은 `secretsIncluded` 백업에만 뜨는데, 그런 백업을 만들려면 recent 세션(15분 내 재인증)이 필요해 확인하지 못했다. 다음 세션에서 로그인 직후 백업을 암호와 함께 생성해 확인한다. (`apps/web/src/widgets/backup/**`, `features/backup-confirm-dialog`)
3. **다크 모드 실렌더 미확인** — 토큰 주입 프리뷰로만 봤고 실제 패널을 다크 모드로 열어 확인하지 않았다.
4. **토큰 단독 blue-green release 실행 미실측** — release 메커니즘 자체는 검증됐으나([HANDOFF-STATUS.md](./HANDOFF-STATUS.md) 의 blue-green 검증 기록), API key 만으로 끝까지 도는 경로는 라이브로 돌려보지 않았다.

### 결정 완료(재론 불필요)

- ~~관리 plane 컨테이너 은닉 여부~~ — 현행 유지(노출). → [0030](./acknowledge/0030-ci-verification-surface-and-exposure-scope.md)
- ~~`/api/readyz` 무인증 노출 범위~~ — 현행 유지. 무인증은 check 별 status 만 받고 상세(백업 경과시간·job 수·DB integrity)는 세션 또는 `control-plane:read` 가 필요하다. 이전 기록의 "무인증이 상세를 노출한다"는 부정확했다.
- ~~`with-error-handling.ts`의 `any` + `eslint-disable`~~ — 제거 완료. 제품 코드에 `any`·`eslint-disable` 0건, `as never` 는 테스트 스텁 2건만 잔존. → [0031](./acknowledge/0031-dependency-and-type-hardening.md)
- ~~origin/dev 푸시 범위~~ — 이전 push 로 정리됨. 현재 미푸시는 위 1번의 5건뿐.

## 7. 환경 & 전제

- **런타임**: Bun 1.3.14 workspace(`apps/*`, `packages/*`), TypeScript strict + `exactOptionalPropertyTypes` + `noUncheckedIndexedAccess`.
- **스택**: Hono 4.13.0(api·engine-agent·traffic-worker), **Next.js 16.3.0** App Router + React 19 + React Compiler + Tailwind v4 + next-intl(ko/en/ja) + TanStack Query v5, Drizzle + SQLite, Better Auth 1.6.25.
- **호스트**: macOS Docker Desktop에서 개발·검증. Linux(rootful Docker Engine + `DOCKER_GID`)는 코드상 지원하나 **실기 검증 미수행**.
- **네트워크**: `127.0.0.1:18080` 로컬 바인딩. `panel.containers.local`/`api.containers.local` 가상 hostname. 외부 노출 수단은 opt-in(cloudflared 프로필 / TLS 템플릿)이며 **실검증 미수행**. GitHub 호스팅 러너는 이 주소에 도달할 수 없다.
- **패키지**: `packages/nginx-config`가 이번 세션 신규다. **새 workspace 패키지를 추가하면 `apps/*/Dockerfile` 4개에 `COPY` 2줄씩 추가해야 한다** — 누락 시 이미지 빌드가 깨진다(이번에 실제로 깨졌다).
- **SQLite enum 주의**: Drizzle 의 `text({ enum: [...] })` 는 **TypeScript 전용**이고 CHECK 제약을 만들지 않는다. 값을 추가해도 `drizzle-kit generate` 는 "No schema changes" 를 낸다 — 정상이다.
- **E2E 계정**: `owner@containers.local`. 비밀번호는 better-auth `hashPassword`로 재설정했고 **저장소·문서 어디에도 기록하지 않았다.** 필요하면 같은 방법으로 다시 재설정한다.
- **live nginx config**: 관리 볼륨의 `current.conf`가 정본이며 `infra/nginx/nginx.conf`는 볼륨이 비었을 때만 복사되는 기본값이다. 저장소 conf를 바꿔도 **패널 apply 경로로 이행해야** 반영된다.
- **환경변수**: `BACKUP_INTERVAL_HOURS`·`BACKUP_RETENTION_COUNT`·`UPLOAD_TOTAL_QUOTA_BYTES` 는 `apps/api` env 스키마에만 있고 `compose.yaml` 에 선언돼 있지 않다. 셸 export 로는 컨테이너에 전달되지 않으므로 `compose.override.yaml` 에 적어야 한다(README 표에 `override only` 로 표기).
- **명령**: `bun run typecheck` / `lint` / `test` / `build` / `format:check`, `bun audit`, `docker compose build && docker compose up -d --wait`, `./scripts/setup.sh`, `./scripts/migration-dry-run.sh`.

## 8. 다음 세션 TODO

### 1순위 — 남은 라이브 검증 (외부 자원 불필요) — **2026-08-05 대부분 완료**

1. ~~암호 포함 백업 복구 다이얼로그 실렌더~~ — 완료. `secretsIncluded` 분기 양쪽을 브라우저로 확인하고 위젯 테스트 2건으로 고정. **단 `full` 모드 복구 드릴은 미수행**(§6-2).
2. ~~다크 모드 실렌더~~ — 완료. 6화면 판독 문제 0건. `dark:` 변형·Tailwind 기본 팔레트 부재를 테스트로 고정.
3. ~~nginx revision 정리~~ — 완료. 프루닝은 실제 파일시스템 테스트로 검증돼 있고, 컨테이너 env → `server.ts` → `create-agent-app.ts` 배선을 라이브 대조했다.
4. ~~API SSE 동시 상한 429~~ — 완료. **이 과정에서 재시작 없이는 복구 불가한 슬롯 누수를 발견해 고쳤다** → [bug/2026-08-05-sse-stream-slot-leak.md](./bug/2026-08-05-sse-stream-slot-leak.md), [acknowledge/0032](./acknowledge/0032-stream-lifecycle-and-e2e-verification.md).
5. ~~미푸시 커밋 push~~ — 완료.
6. ~~`full` 모드 복구 드릴~~ — 완료. job succeeded, 복구 전 세션 401(DB 실제 교체 확인), 재로그인·기능·암호 envelope 복호화·SSE 전부 정상 → [acknowledge/0032](./acknowledge/0032-stream-lifecycle-and-e2e-verification.md) §3.1.
7. ~~호스트 저속 SSE 미도달~~ — 완료. 원인은 호스트 published 포트 8080 자체였고 기본값을 18080 으로 옮겼다 → [bug 문서 §7](./bug/2026-08-05-sse-stream-slot-leak.md).

### 2순위 — 외부 자원이 있어야 가능(코드는 준비됨)

- 실도메인 + TLS 또는 Cloudflare 터널 토큰으로 외부 노출 실검증 → [EXPOSURE.md](./EXPOSURE.md). **사용자가 터널을 연결해 주소를 주면 점검한다.**
- 토큰 단독 blue-green release 완주 실측 → `docs/ci-examples/github-actions-deploy.yml`. 이 저장소는 **CI 예제를 제공하는 것이 목적**이므로 GitHub Actions 자체를 돌릴 필요는 없다. 예제가 실제 API 와 일치하는지는 2026-08-05 에 엔드포인트 16개 전수 대조로 확인했고, `bun run test` 가 raw `bun test` 사용을 막는다.
- ~~새 호스트 재해복구 드릴~~ — **2026-08-05 완료.** 별도 compose 프로젝트를 새 호스트로 삼아 문서 절차 그대로 성공 → [quality-assurance/2026-08-05-disaster-recovery-drill.md](./quality-assurance/2026-08-05-disaster-recovery-drill.md).
- Linux 실기 검증(`DOCKER_GID` 탐지). **지원 대상은 macOS 로 확정**했고 README 에 "Linux 는 구현됐으나 미검증"으로 명시했다.
- Discord webhook 실전송, 24시간 경과 자동 backup job live 성공 이력.

## 9. 문서 지도

| 문서                                                   | 다루는 것                                                          |
| ------------------------------------------------------ | ------------------------------------------------------------------ |
| `HANDOFF.md`                                           | (이 문서) 세션 인수인계 단일 진입점                                |
| `../CLAUDE.md`                                         | 저장소 에이전트 실행 규칙(호스트 격리 우회·서비스 노출 금지)       |
| `RESUME-CHECKLIST.md`                                  | 재개 직후 읽기 전용 점검 명령, 안전 불변식, 중단 절차              |
| `HANDOFF-STATUS.md`                                    | 구현 완료 범위·한계·검증 증거 누적 기록                            |
| `PROCESS.md`                                           | 작업 체크리스트(시간순 전체 이력)                                  |
| `ARCHITECTURE.md`                                      | 서비스 구성, 네트워크·권한 경계, 데이터 흐름                       |
| `TECH-STACK.md`                                        | 기술 선택과 근거(버전 고정값은 `package.json` 이 정본)             |
| `SECURITY.md`                                          | 위협 모델, 권한, §15 2026-08-04 감사 반영, §15.1 nginx 계약 파서화 |
| `EXPOSURE.md`                                          | 외부 노출 경로(로컬·cloudflared·TLS)와 도메인 전환                 |
| `RUNBOOK.md`                                           | 사고 시나리오별 증상·확인·조치                                     |
| `BACKUP-RESTORE.md`                                    | 백업 세트 구성, 복구 2모드, 새 호스트 재해복구 절차                |
| `CONTROL-PLANE-UPGRADE.md`                             | 업그레이드·롤백, migration dry-run                                 |
| `NGINX-TRAFFIC.md`                                     | Nginx 설정·리로드·트래픽 수집, access log 로테이션 정책            |
| `API-DATA-AUTH.md`                                     | API 표면, 인증 방식(세션/API key/recent-auth), DB                  |
| `UPLOAD-DEPLOYMENT.md`                                 | 업로드·검사·배포·롤백 계약                                         |
| `UI-UX.md`                                             | 화면 규칙과 §12 구현 현황·설계 이탈                                |
| `SHADCN-COMPONENTS.md`                                 | 컴포넌트 목록과 §6 CLI 대신 공식 소스 이식 절차                    |
| `llm.txt`                                              | AI용 자족 레퍼런스(엔드포인트·스키마·보안·플로우)                  |
| `acknowledge/`                                         | 결정 기록(ADR). 최신 0034                                          |
| `bug/`                                                 | 결함 기록(증상·근본원인·수정·실측)                                 |
| `quality-assurance/2026-08-04-ui-backend-audit.md`     | UI/UX·백엔드 6영역 감사 132건                                      |
| `quality-assurance/2026-08-04-production-readiness.md` | 실운영·CI API 준비도 판정과 3단계 로드맵                           |
| `ci-examples/`                                         | 빌드 CI 3종 + API key 기반 배포 워크플로                           |
| `history/`                                             | 세션별 시점 기록(현재 상태 아님)                                   |

## 10. 복기 신뢰도

이 세션은 매우 길었고(워크플로 8회, 서브에이전트 70개 이상) 여러 차례 컨텍스트가 요약됐다. 다음 구간은 **원본 산출물을 직접 확인해야 정확하다.**

- 서브에이전트가 보고한 세부 구현 결정(특히 2단계 알림·헬스·백업 가드 담당의 내부 설계) — 원본은 워크플로 결과 파일과 실제 코드다. 이 문서의 요약보다 코드를 신뢰한다.
- 감사 findings 132건·준비도 findings 68건의 개별 항목 — 요약본만 이 문서에 있고 전문은 `quality-assurance/` 두 리포트에 있다.
- 반대로 **직접 코드·런타임으로 재확인한 것**은 신뢰도가 높다: critical 4건, blocker 4건, nginx HUP 회귀, 파서 버그, Dockerfile 누락, RPC 타입 회귀(worktree 대조), 보안 실측(미인증 401·rate limit 429·catch-all 444·컨테이너 권한·시크릿 퍼미션), `bun audit` 0건.
