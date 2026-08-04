# HANDOFF — 2026-08-05 세션 스냅샷

- 대응 커밋: `157ffdb` (`dev`, **미푸시**)
- 최종 갱신일: 2026-08-05
- 검증 상태: typecheck 8/8 · lint 0 · **test 296 pass / 47 files** · format:check · build 8/8 · Compose 5개 healthy
- 이 문서가 **세션 인수인계 단일 진입점**이다. 다른 문서보다 먼저 읽는다.

## 1. 프로젝트 한 줄 정의

단일 Docker 호스트를 웹 패널로 관리하는 self-hosted control plane. 컨테이너 제어·이미지·배포(blue-green)·Nginx 설정 GUI·트래픽 분석·백업/복구를 role 기반 권한과 durable job queue 위에서 제공한다. Portainer 대안이지만 "작은 프로덕션 control plane" 수준의 보안·복구 요구를 스스로에게 적용한다.

## 2. 현재 목표

- **최종 목표**: 실운영 가능한 상태 + GitHub Actions가 API key만으로 배포를 완주할 수 있는 상태.
- **현재 마일스톤**: 실운영 준비도 로드맵 **1·2단계 완료 + 3단계 착수 전 1순위 5건 완료**, **3단계 미착수**.
- **직전 작업(2026-08-05)**: 1순위 5건 — `GET /api/images` `engine:read` 분기, API key scope UI 하드코딩 제거, 백업 복구 UI 의 복구 범위·암호 입력, `scripts/setup.sh` 비대화식 모드, 미해결 질문 2건 확인(둘 다 현행 유지). 결정 기록은 [acknowledge/0030](./acknowledge/0030-ci-verification-surface-and-exposure-scope.md).

판정 근거는 [quality-assurance/2026-08-04-production-readiness.md](./quality-assurance/2026-08-04-production-readiness.md). 판정 당시 실운영 `no-go` / CI API `partially-possible`였고, 1·2단계로 blocker 9건 중 코드로 해결 가능한 것은 전부 해소했다. **남은 no-go 사유는 "외부 환경에서의 실검증 미수행"이지 코드 결함이 아니다**(§7 참조).

## 3. 완료 / 진행 중 / 미착수

### 완료 (이번 세션, 커밋 30건)

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

**3단계 착수 전 1순위 (2026-08-05, 커밋 4건)** — 상세: [acknowledge/0030](./acknowledge/0030-ci-verification-surface-and-exposure-scope.md)

- `apps/api/src/route/control/create-control-route.ts` — `GET /api/images` 에 `engine:read` 분기(+`apiKeyService` 의존성, 통합 테스트 4건). CI 가 image load 결과를 확인할 수 있게 됐고 워크플로 예제에 digest 확인 단계를 넣었다.
- `apps/web/src/widgets/api-key/api-key-widget.tsx` — scope 9종 하드코딩 → `API_KEY_SCOPE_VALUES`. 2단계 신설 scope 4종이 패널에서 선택 가능해졌다.
- `apps/web/src/widgets/backup/**`·`features/backup-confirm-dialog` — 복구 범위(`preserve-host`/`full`) 선택과 암호 입력(백업이 `secretsIncluded` 일 때만), 생성 폼 암호 입력.
- `scripts/setup.sh` — `--non-interactive`(비-TTY 자동 적용)·`--start-mode`·override 처리 플래그·`--help`.

### 진행 중

없음. 다만 **2026-08-05 커밋 4건은 아직 push 하지 않았다.**

### 미착수

**3단계(장기 운영 안정화)** — 항목·근거는 [quality-assurance/2026-08-04-production-readiness.md](./quality-assurance/2026-08-04-production-readiness.md) §3의 3단계. 요약은 §8 TODO 참조.

**2단계에서 범위 밖으로 넘어온 잔여 5건** — §8 TODO 2순위.

## 4. 의사결정 요약

상세는 [acknowledge/0029](./acknowledge/0029-monotone-design-system.md)와 [SECURITY.md](./SECURITY.md) §15·§15.1.

| 결정                                                          | 이유                                                                                                                 | 기각한 대안                                                                      |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| border 전면 제거·radius 0, 구분은 surface elevation + opacity | 사용자 지시. 선이 아니라 면의 밝기로 구분하면 모노톤에서 위계가 살아난다                                             | hairline border 최소 유지 — 사용자가 A안 선택                                    |
| shadcn 공식 소스를 **구조 기준선**으로 삼고 시각만 치환       | 자체 축약 구현이 focus-visible·aria-invalid·size를 잃어 호출부 하드코딩을 20곳 이상 낳았다                           | 기존 13개 primitive 내에서만 정리 — UX 개선 폭이 제한됨                          |
| shadcn CLI를 쓰지 않고 공식 registry JSON을 수기 이식         | CLI가 `globals.css`·`components.json`을 덮어써 토큰 체계를 파괴한다                                                  | CLI 실행 후 복구 — 회귀 위험이 큼                                                |
| nginx 파서를 `packages/nginx-config`로 단일화                 | 서버·클라이언트 파서가 갈라지는 것 자체가 우회 재발 원인                                                             | engine-agent에 검증 전용 토크나이저 별도 구현 — 이중화                           |
| `--border`를 삭제하지 않고 6% 가드 토큰으로 유지              | CLI로 추가하는 컴포넌트가 색 없는 `border`로 currentColor 실선을 그리는 사고를 원천 차단                             | `--border: transparent` — 플로팅 표면 구분이 사라짐                              |
| 백업 복구를 `preserve-host`/`full` 2모드로 분리               | 기존 구현은 "배포 상태 롤백"에 가까웠는데 문서는 "전체 교체"라고 적어 운영자를 오도했다                              | 단일 모드로 전체 교체 — 운영자·키·감사가 날아감                                  |
| 암호화 키를 passphrase envelope으로만 백업                    | 평문 백업은 백업 파일 유출 = 전 secret 유출                                                                          | 키 제외 유지 — 복원해도 배포 secret이 영구 복호화 불가                           |
| access log 로테이션을 컨테이너 내부에서 수행                  | 사이드카 logrotate는 컨테이너 경계를 넘어 nginx master에 USR1을 보낼 수 없다                                         | 사이드카 logrotate, 압축 보존 — 압축은 traffic-worker의 old-inode drain을 깨뜨림 |
| `POST /api/jobs/:id/cancel`을 `job:write`로 개방              | 협조적 취소 요청이지 파괴적 명령이 아니고, 막으면 CI가 교착된 release를 사람 없이 못 푼다                            | 세션 전용 유지 — 무인 운용 목표와 충돌                                           |
| 감사 로그 열람 role을 구현(4종) 기준으로 문서 정정            | 감사 로그는 읽기 전용 관측 수단이고 viewer·auditor는 정의상 읽기 role                                                | 구현을 owner/admin으로 좁힘 — 기존 접근이 끊김                                   |
| TLS를 기본 `nginx.conf`에 넣지 않고 템플릿으로 제공           | 인증서 없이 `listen 443 ssl`이 있으면 컨테이너가 뜨지 않는다                                                         | 기본 conf에 포함 — 로컬 기본 스택이 깨짐                                         |
| 부팅에서 env·migration·secret은 격리하지 않음                 | 잘못된 schema·빈 secret으로 요청을 받으면 데이터 오염·인증 우회 위험. 실패=설정 문제이므로 재시작 루프가 올바른 신호 | 전 단계 격리 — 조용히 잘못된 상태로 서비스                                       |

## 5. 사용자 방향성 & 작업 규칙

- **답변**: 한국어, 존댓말, 간결. 미사여구·자축·이모지 금지. 검증 안 된 "완벽/잘 됨" 단언 금지.
- **코드**: arrow function only, 반환타입 미명시, `any`/`enum` 금지, **코드 주석 금지**(JSDoc 영어만), named export, 매직넘버 금지, `useCallback`/`useMemo` 금지(React Compiler), `cn()` 사용, FSD 단방향·barrel 금지, TanStack Query(`queryOptions` + 중앙 `QUERY_KEY`).
- **백엔드**: Route(validator+describeRoute+withErrorHandling) → Service → `*ServiceDb`(compose가 Drizzle 격리). 에러는 `createAppError`. **새 에러 코드는 `error-code.ts`·`error-message.ts`·STATUS_MAP 3곳 모두.**
- **디자인**: border 유틸·`rounded-*`(형태 예외만)·Tailwind 기본 팔레트 색 금지.
- **커밋**: Conventional Commits, 한국어 설명, author 사용자 단독, **`Co-Authored-By`·AI 트레일러 금지**, `git add -A` 금지(선별 스테이징), force push 금지. 논리 단위 1커밋.
- **검증**: 종료 전 typecheck → lint → test → build. **정적 검사 통과 = 완료가 아니다.** 이번 세션에서 실측으로만 드러난 결함이 5건이었다(nginx HUP 미전달, 렌더러 마커 거부, Dockerfile 패키지 누락, hydration 불일치 2건).
- **작업 방식**: 모호하면 1줄 객관식으로 질문. 전수검사 지시는 샘플링 금지. 에이전트 보고를 그대로 믿지 말고 핵심 주장은 직접 재확인.
- **금지**: `.env` 생성·수정·열람, 시크릿을 코드·문서·메모리에 기록, 무단 git 조작, `docker compose down -v`·광범위 prune, 사용자 소유 Docker 리소스 추정 삭제.

## 6. 미해결 질문 / 확인 필요

1. ~~관리 plane 컨테이너 은닉 여부~~ — **2026-08-05 결정: 현행 유지(노출).** 파괴적 작업은 engine-agent 가 이미 차단하고, 은닉하면 진단이 어려워진다. → [0030](./acknowledge/0030-ci-verification-surface-and-exposure-scope.md)
2. ~~`/api/readyz` 무인증 노출 범위~~ — **2026-08-05 결정: 현행 유지.** 애초에 무인증은 check 별 status 만 받고 백업 경과시간·job 수·DB integrity 는 세션(owner·admin) 또는 `control-plane:read` 가 필요했다. 이전 기록의 "무인증이 상세를 노출한다"는 **부정확했다.**
3. **`with-error-handling.ts`의 `any` 4개 + `eslint-disable`** — hono `Handler` 제네릭 기본값이라 제거하면 라우트 6곳의 `c.req.valid()` 타입이 붕괴한다. 컨벤션 위반이지만 유지 중. (`apps/api/src/lib/with-error-handling.ts:24-25`)
4. **origin/dev 푸시 범위** — `dev` 푸시 시 분기 전부터 있던 미푸시 커밋 18개가 함께 올라갔다(총 48). 문제 없는지 확인 필요.
5. **3단계 범위** — 착수 전 사용자 확인이 필요하다(§8 2순위, 9개 항목·수 주 규모).
6. **암호 포함 백업의 복구 다이얼로그 실렌더 미검증** — 암호 입력은 `secretsIncluded` 백업에만 뜨는데, 그런 백업을 만들려면 recent 세션(15분 내 재인증)이 필요해 확인하지 못했다. 다음 세션에서 로그인 직후 백업을 암호와 함께 생성해 확인한다.

## 7. 환경 & 전제

- **런타임**: Bun 1.3.14 workspace(`apps/*`, `packages/*`), TypeScript strict + `exactOptionalPropertyTypes` + `noUncheckedIndexedAccess`.
- **스택**: Hono(api·engine-agent·traffic-worker), Next.js 16.2.12 App Router + React 19 + React Compiler + Tailwind v4 + next-intl(ko/en/ja) + TanStack Query v5, Drizzle + SQLite, Better Auth 1.6.25.
- **호스트**: macOS Docker Desktop에서 개발·검증. Linux(rootful Docker Engine + `DOCKER_GID`)는 코드상 지원하나 **실기 검증 미수행**.
- **네트워크**: `127.0.0.1:8080` 로컬 바인딩. `panel.containers.local`/`api.containers.local` 가상 hostname. 외부 노출 수단은 opt-in(cloudflared 프로필 / TLS 템플릿)이며 **실검증 미수행**.
- **패키지**: `packages/nginx-config`가 이번 세션 신규다. **새 workspace 패키지를 추가하면 `apps/*/Dockerfile` 4개에 `COPY` 2줄씩 추가해야 한다** — 누락 시 이미지 빌드가 깨진다(이번에 실제로 깨졌다).
- **E2E 계정**: `owner@containers.local`. 비밀번호는 이번 세션에서 better-auth `hashPassword`로 재설정했고 **저장소·문서 어디에도 기록하지 않았다.** 필요하면 같은 방법으로 다시 재설정한다(§8 참조).
- **live nginx config**: 관리 볼륨의 `current.conf`가 정본이며 `infra/nginx/nginx.conf`는 볼륨이 비었을 때만 복사되는 기본값이다. 저장소 conf를 바꿔도 **패널 apply 경로로 이행해야** 반영된다.
- **명령**: `bun run typecheck` / `lint` / `test` / `build` / `format:check`, `docker compose build && docker compose up -d --wait`, `./scripts/setup.sh`, `./scripts/migration-dry-run.sh`.

## 8. 다음 세션 TODO

### 1순위 — 3단계 착수 전 마무리 — **2026-08-05 전부 완료**

1. ~~`GET /api/images`에 `engine:read` 분기~~ — 완료(`2c87a95`).
2. ~~API key scope UI 하드코딩 제거~~ — 완료(`502efb9`).
3. ~~백업 복구 UI의 `mode`·`passphrase` 입력~~ — 완료(`3fa3a03`). 생성 폼 암호 입력도 함께.
4. ~~`scripts/setup.sh` 비대화식(CI) 모드~~ — 완료(`157ffdb`).
5. ~~§6 질문 1·2 확인~~ — 완료(둘 다 현행 유지).

남은 것: §6 의 6번(암호 포함 백업 복구 다이얼로그 실렌더 확인)과 커밋 4건 push.

### 2순위 — 3단계(장기 운영 안정화)

- `apps/traffic-worker` — `access_event.raw_json` 제거(실측 용량의 약 70%), 행수/바이트 상한, 정기 VACUUM.
- traffic 분석 쿼리 복합 인덱스·시간 범위 상한, 무거운 쿼리를 별도 연결로 분리해 healthcheck 보호.
- `apps/api/src/service/domain/backup/create-backup-service.ts` — `serialize()`(DB 크기만큼 메모리 상주) → `VACUUM INTO` 또는 SQLite backup API.
- traffic export·upload chunk 스트리밍화.
- 암호화 마스터 키 keyring + `keyVersion` 컬럼 + owner 전용 재암호화 rotate job.
- artifact 삭제 API·retention GC, `UPLOAD_TOTAL_QUOTA` 기본값 조정.
- API 단일 인스턴스 전제 문서화 후 worker instance id 기반 job 회수·원자적 claim.
- audit 보존 정책·아카이브, nginx revision 파일 정리, SSE·exec 동시 세션 상한, traffic ingestion 이상 지표 패널 노출.

### 3순위 — 외부 자원이 있어야 가능(코드는 준비됨)

- 실도메인 + TLS 또는 Cloudflare 터널 토큰으로 외부 노출 실검증 → [EXPOSURE.md](./EXPOSURE.md).
- GitHub Actions 실제 실행(러너가 패널에 도달 가능해야 함) → `docs/ci-examples/github-actions-deploy.yml`.
- 새 호스트 재해복구 드릴(볼륨 tar → 새 호스트 → `full` 모드 복구 → API 재시작) → [BACKUP-RESTORE.md](./BACKUP-RESTORE.md).
- Linux 실기 검증(`DOCKER_GID` 탐지).
- Discord webhook 실전송, 24시간 경과 자동 backup job live 성공 이력.

## 9. 문서 지도

| 문서                                                   | 다루는 것                                                          |
| ------------------------------------------------------ | ------------------------------------------------------------------ |
| `HANDOFF.md`                                           | (이 문서) 세션 인수인계 단일 진입점                                |
| `RESUME-CHECKLIST.md`                                  | 재개 직후 읽기 전용 점검 명령, 안전 불변식, 중단 절차              |
| `HANDOFF-STATUS.md`                                    | 구현 완료 범위·한계·검증 증거 누적 기록                            |
| `PROCESS.md`                                           | 작업 체크리스트(시간순 전체 이력)                                  |
| `ARCHITECTURE.md`                                      | 서비스 구성, 네트워크·권한 경계, 데이터 흐름                       |
| `SECURITY.md`                                          | 위협 모델, 권한, §15 2026-08-04 감사 반영, §15.1 nginx 계약 파서화 |
| `EXPOSURE.md`                                          | 외부 노출 경로(로컬·cloudflared·TLS)와 도메인 전환                 |
| `RUNBOOK.md`                                           | 사고 시나리오별 증상·확인·조치                                     |
| `BACKUP-RESTORE.md`                                    | 백업 세트 구성, 복구 2모드, 새 호스트 재해복구 절차                |
| `CONTROL-PLANE-UPGRADE.md`                             | 업그레이드·롤백, migration dry-run                                 |
| `NGINX-TRAFFIC.md`                                     | Nginx 설정·리로드·트래픽 수집, access log 로테이션 정책            |
| `API-DATA-AUTH.md`                                     | API 표면, 인증 방식(세션/API key/recent-auth), DB                  |
| `UI-UX.md`                                             | 화면 규칙과 §12 구현 현황·설계 이탈                                |
| `SHADCN-COMPONENTS.md`                                 | 컴포넌트 목록과 §6 CLI 대신 공식 소스 이식 절차                    |
| `llm.txt`                                              | AI용 자족 레퍼런스(엔드포인트·스키마·보안·플로우)                  |
| `acknowledge/`                                         | 결정 기록(ADR). 최신 0030                                          |
| `quality-assurance/2026-08-04-ui-backend-audit.md`     | UI/UX·백엔드 6영역 감사 132건                                      |
| `quality-assurance/2026-08-04-production-readiness.md` | 실운영·CI API 준비도 판정과 3단계 로드맵                           |
| `ci-examples/`                                         | 빌드 CI 3종 + API key 기반 배포 워크플로                           |
| `history/`                                             | 세션별 시점 기록(현재 상태 아님)                                   |

## 10. 복기 신뢰도

이 세션은 매우 길었고(워크플로 7회, 서브에이전트 41개) 후반부에 컨텍스트가 요약됐다. 다음 구간은 **원본 산출물을 직접 확인해야 정확하다.**

- 서브에이전트가 보고한 세부 구현 결정(특히 2단계 알림·헬스·백업 가드 담당의 내부 설계) — 원본은 워크플로 결과 파일과 실제 코드다. 이 문서의 요약보다 코드를 신뢰한다.
- 감사 findings 132건·준비도 findings 68건의 개별 항목 — 요약본만 이 문서에 있고 전문은 `quality-assurance/` 두 리포트에 있다.
- 반대로 **직접 코드로 재확인한 것**(critical 4건, blocker 4건, nginx HUP 회귀, 파서 버그, Dockerfile 누락)은 신뢰도가 높다.
