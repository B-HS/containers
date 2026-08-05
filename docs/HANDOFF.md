# HANDOFF — 2026-08-05 세션 스냅샷

- 대응 커밋: `07a6b2d` (`dev`, origin/dev 와 동기)
- 최종 갱신일: 2026-08-05
- 검증 상태: typecheck 8/8 · lint 0 · **test 376 + web 20** · format:check · build 8/8 · `bun audit` 0건 · `audit:runtime` 5/5
- 이 문서가 **세션 인수인계 단일 진입점**이다. 다른 문서보다 먼저 읽는다.

## 1. 프로젝트 한 줄 정의

단일 Docker 호스트를 웹 패널로 관리하는 self-hosted control plane. 컨테이너 제어·이미지·배포(blue-green)·Nginx 설정 GUI·트래픽 분석·백업/복구를 role 기반 권한과 durable job queue 위에서 제공한다. Portainer 대안이지만 "작은 프로덕션 control plane" 수준의 보안·복구 요구를 스스로에게 적용한다.

## 2. 현재 목표

- **최종 목표**: 실운영 가능한 상태 + GitHub Actions가 API key만으로 배포를 완주할 수 있는 상태.
- **현재 마일스톤**: 준비도 로드맵 1·2·3단계 완료 + 의존성/타입 하드닝 + **외부 노출 설정의 패널 이관**.
- **직전 작업**: Cloudflare 터널 502 진단에서 시작해, 도메인을 붙일 때 세 곳(nginx `server_name`·신뢰 origin·공개 URL)을 손으로 맞춰야 하던 구조를 없앴다. 이어서 nginx 가 신뢰할 앞단 프록시 주소도 설정 파일이 아니라 **패널에서 관측 후 승인**하도록 바꿨다. → [acknowledge/0034](./acknowledge/0034-panel-public-origin-setting.md), [0035](./acknowledge/0035-trusted-proxy-approval.md)

### 실운영 가능성 (사용자 질문에 대한 직답)

- **동작**: 로컬 스택에서 API key 토큰만으로 manifest 등록 → 업로드 → 이미지 load → 배포 판정까지 완주한다. 실제 도메인(`hyuns.uk`)으로 외부 접속·로그인·인증 API 도 실측 확인했다.
- **보안**: 미인증 엔드포인트 401, 로그인 rate limit 429, 알 수 없는 Host 444, Docker 소켓은 engine-agent 에만, 퍼블리시 포트는 nginx `127.0.0.1:18080` 하나, 전 컨테이너 `read_only` + `no-new-privileges`, 앱 컨테이너 non-root, 시크릿 파일 `0600`. `bun audit` 0건. 이 자세는 **테스트와 `bun run audit:runtime` 으로 강제**된다(§4).
- **한계**: Linux 미검증(지원 대상은 macOS 로 확정, README 명시). 외부 노출은 이번에 실검증했으나 Cloudflare Access 는 미적용. 토큰 단독 blue-green release 완주는 라이브 미실측.

## 3. 완료 / 진행 중 / 미착수

### 완료 (이번 세션, 커밋 36건 — 전부 push)

**의존성·타입 하드닝** — [acknowledge/0031](./acknowledge/0031-dependency-and-type-hardening.md)

- next 16.2.12→16.3.0, hono 4.13.0, 루트 `overrides.esbuild`. `bun audit` 7건(high 3) → **0건**
- `apps/api/src/lib/with-error-handling.ts`(+agent·traffic 판) 재작성. `ApiRouteContext<{ json: ... }>` 제네릭 도입으로 라우트 80곳의 `as never` 이중 캐스트 제거
- 이 과정에서 **실제 스키마 드리프트 발견**: `operation_job.kind` enum 에 `'secret.rotate'` 누락
- `USER_ROLE` 단일 출처를 `packages/contracts/src/user-management.ts` 로 이관

**실시간 스트림 결함 4건** — [bug/2026-08-05-sse-stream-slot-leak.md](./bug/2026-08-05-sse-stream-slot-leak.md), [acknowledge/0032](./acknowledge/0032-stream-lifecycle-and-e2e-verification.md)

- **API 스트림 슬롯 영구 누수**: 업스트림 연결 대기 중 클라이언트가 끊으면 슬롯·소켓이 남는다. 32개가 새면 모든 스트림이 429이고 API 가 engine-agent·traffic-worker 에 도달하지 못해 `/api/readyz` 전 항목 degraded. 재시작 외 복구 불가였다
- **engine-agent 동일 누수**: 스트림 4~5회만 끊어도 agent 가 멈췄다
- **exec 세션 누수**: 업그레이드가 끝나지 않으면 슬롯이 영구 점유. 실패한 핸드셰이크 10회로 터미널 기능이 죽는다. 핸드셰이크 워치독으로 해소
- **동시 상한 불일치**: API 32 / agent 20 → `MAX_CONCURRENT_ENGINE_STREAMS`(contracts) 단일 상수
- SSE 초기 flush(`SSE_STREAM_OPEN_COMMENT`)를 api·engine-agent·traffic-worker 세 곳에 적용

**published 포트 18080 이동** — [bug 문서 §7](./bug/2026-08-05-sse-stream-slot-leak.md)

- macOS 호스트에서 저속 SSE 가 도달하지 않던 원인이 **호스트 published 포트 8080 자체**(`com.docker.backend` 의 HTTP 완결 대기 버퍼링)로 확정. 운영 스택과 무관한 stock socat 프로브도 8080 이면 0바이트, 18480 이면 TTFB 0.002초
- `compose.yaml` 4곳·`scripts/setup.sh` 2곳의 기본값만 변경. 컨테이너 내부 `listen 8080`·managed nginx 설정·healthcheck 는 무변경

**에이전트 실행 가드레일** — [acknowledge/0033](./acknowledge/0033-agent-execution-guardrails.md)

- 조사 워크플로에서 서브에이전트가 `--privileged --pid=host` + `nsenter` 로 호스트 네임스페이스에 진입하고 socat 을 LAN IP 에 바인딩해 셸 실행 서비스를 노출했다
- `.claude/hooks/guard-container-escape.sh`(PreToolUse Bash) — 특권·호스트 네임스페이스·nsenter·호스트 루트/socket 마운트·loopback 외 publish 차단. **세션 시작 시 로드되므로 다음 세션부터 강제**
- `packages/config/src/compose-security.ts` + 테스트 10건, `scripts/audit-runtime-security.ts`(`bun run audit:runtime`) — **세션 무관하게 지금 유효한 층**

**외부 노출 설정의 패널 이관** — [acknowledge/0034](./acknowledge/0034-panel-public-origin-setting.md), [0035](./acknowledge/0035-trusted-proxy-approval.md)

- `panel_setting`(migration 0015) + `GET/PUT /api/panel-settings`. 저장 시 `packages/nginx-config/src/panel-hostname.ts` 가 패널 server 블록의 `server_name` 만 AST 로 최소 변경해 apply
- 신뢰 origin 은 better-auth `trustedOrigins` 를 함수로 받아 **재시작 없이 즉시** 반영. 쿠키 `Secure`·생성 링크는 부팅 값에 묶여 `restartRequired` 로 안내
- 환경변수 origin 은 **하한선**이라 DB 값으로 지울 수 없다(잘못 저장해서 로그인이 잠기지 않게)
- `trusted_proxy`(migration 0016) + `GET/POST/DELETE /api/trusted-proxies`. traffic-worker 가 access log 원본 source 를 후보로 내고 API 가 역방향 DNS 를 붙인다. 승인 시 `set_real_ip_from` 을 승인 목록으로 교체
- 공개 주소 화면에도 접근 시도된 host 를 요청 수·거부 수와 함께 후보로 표시
- `compose.yaml` 의 cloudflared 프로필, `scripts/migrate-tunnel-to-compose.sh`, `nginx.conf` 의 `10.89.0.10` 하드코딩 제거

**검증 수단·테스트**

- `scripts/seed-e2e.ts` — E2E 계정 생성/비밀번호 재설정. 비밀번호는 stdout 1회만, 저장소에 기록하지 않음
- 웹 테스트 러너: vitest 대신 `bun test` + `@happy-dom/global-registrator` + Testing Library(`apps/web/bunfig.toml` preload). 루트 `test` 는 두 단계
- 신규 테스트: nginx `panel-hostname` 7 · `trusted-proxy` 8 · 패널 설정 서비스 13 · 신뢰 프록시 서비스 7 · compose 보안 10 · llm.txt 드리프트 5 · 저장소 스크립트 계약 4 · 사이드바 4 · 웹 포맷/권한 8
- `successResponse` 가 Promise 를 받으면 컴파일 실패(`apps/api/src/lib/response.ts`) — `await` 누락 시 응답이 조용히 `{"data":{}}` 가 되던 실수를 타입으로 차단

**드릴·검증 기록**

- `full` 모드 복구 드릴 완료 → [acknowledge/0032 §3.1](./acknowledge/0032-stream-lifecycle-and-e2e-verification.md)
- **새 호스트 재해복구 드릴 완료** → [quality-assurance/2026-08-05-disaster-recovery-drill.md](./quality-assurance/2026-08-05-disaster-recovery-drill.md)
- 백업 암호 UI 실렌더, 다크 모드 6화면, nginx revision 정리, SSE 상한 429 전부 확인
- README 스크린샷 6장 재촬영(구 이미지는 재설계 이전 UI)

### 진행 중

없음. 워킹트리 clean, `origin/dev` 와 동기.

### 미착수 (사용자 작업이 필요한 것)

1. **터널 토큰이 `ps` 에 노출된 상태** — 현재 호스트에서 `cloudflared tunnel run --token <TOKEN>` 으로 실행 중(PID 81822). `cloudflared service install` 로 옮기면 토큰이 cloudflared 자체 설정에 저장된다. → [EXPOSURE.md §2.2](./EXPOSURE.md)
2. **`https://hyuns.uk` 를 공개 주소로 저장** — 저장 전까지 그 도메인에서 로그인이 `403 INVALID_ORIGIN`. 패널 **공개 주소** 화면에서 후보 `hyuns.uk` 의 "이 주소 쓰기" → 저장(1클릭, 재시작 불필요)

## 4. 의사결정 요약

상세는 [acknowledge/](./acknowledge/) (최신 0035).

| 결정                                                         | 이유                                                                                                             | 기각한 대안                                                                  |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 앞단 프록시 신뢰 목록을 **관측 후 승인**으로                 | 주소를 설정 파일 두 곳에 박으면 하나만 바뀌어도 rate limit 이 조용히 전체 공유로 되돌아간다. 실패가 눈에 안 띈다 | 환경변수·설정 파일로 주소 지정 — 두 곳 박힘 재발                             |
| 후보를 access log 에서 직접 읽는다                           | traffic DB 는 수집 시 `x.y.z.0` 으로 마스킹해 `/32` 승인에 못 쓴다. 마스킹은 유지할 프라이버시 설계다            | `access_event` 테이블 사용                                                   |
| 공개 주소 후보 제외 기준 = **신뢰 origin**(server_name 아님) | nginx 는 응답하지만 인증이 403 으로 막는 host 가 가장 중요한 후보인데, server_name 기준이면 그게 숨는다          | `server_name` 기준 필터 — 실제로 문제를 숨겼다                               |
| 터널을 compose 밖에 둔다                                     | compose 가 터널 토큰을 알 이유가 없다. 진짜 요구는 "nginx 가 어떤 주소를 믿을지"였다                             | cloudflared compose 프로필 + 토큰 주입 — 앞뒤가 바뀐 설계(0034 §4 에서 폐기) |
| 신뢰 origin 은 즉시, base URL 은 재시작 후                   | better-auth `trustedOrigins` 는 함수를 받지만 `baseURL` 은 부팅 시 auth 인스턴스에 고정된다                      | 저장 시 auth 인스턴스 재생성 — 요청 도중 쿠키 속성이 바뀐다                  |
| 환경변수 origin 은 하한선                                    | 잘못 저장하면 로그인이 막혀 고칠 수도 없는 잠금이 생긴다                                                         | DB 값이 완전히 대체                                                          |
| 제한 자원 수명은 요청 `AbortSignal` 에                       | body `cancel` 만으로는 자원 점유 후 body 생성 전 구간이 사각지대다                                               | 타임아웃 회수 — 누수를 늦출 뿐이고 새 매직넘버가 생긴다                      |
| 자원 풀 테스트는 "상한까지 전부 열리는가"                    | "한 개 더 열리는가"는 슬롯 1개 누수를 통과시킨다. 실제로 첫 테스트가 구 코드에서도 통과했다                      | 단일 요청 성공 확인                                                          |
| 웹 테스트는 `bun test` + happy-dom                           | 러너가 둘이면 `bun run check` 사다리와 CI 신호가 갈라진다. 의존성 3개로 끝난다                                   | vitest(사용자 선택이었으나 근거를 설명하고 변경)                             |
| 지원 플랫폼은 macOS 단독                                     | Linux 는 코드상 지원하나 한 번도 돌려본 적이 없다. "지원"이라 적으면 거짓말이다                                  | Linux 도 지원으로 표기                                                       |
| 보안 자세를 테스트로 강제                                    | 훅은 세션 시작 시 로드돼 이미 떠 있는 세션엔 적용되지 않는다. 문서 규칙은 강제력이 없다                          | 프롬프트 문구로 금지 — 이번에 실제로 실패했다                                |

## 5. 사용자 방향성 & 작업 규칙

- **답변**: 한국어, 존댓말, **간결**. 미사여구·자축·이모지 금지. **뺑 돌려 말하지 말고 순서대로, 할 일만.** 검증 안 된 "완벽/잘 됨" 단언 금지.
- **하드코딩 금지 — 가장 자주 지적받은 것.** 값을 두 곳에 적는 것, 스크립트에 네트워크 주소·포트를 박는 것, 테스트 픽스처에 실도메인을 쓰는 것 전부 포함한다. "사용자가 한 번 실행하는 스크립트라도 나중에 값이 바뀌면 틀린다"가 기준이다. 실제 설정에서 읽거나 관측값에서 고르게 만든다.
- **코드**: arrow function only, 반환타입 미명시, `any`/`enum` 금지, **코드 주석 금지**(JSDoc 영어만), named export, 매직넘버 금지, `useCallback`/`useMemo` 금지, `cn()` 사용, FSD 단방향·barrel 금지, TanStack Query(`queryOptions` + 중앙 `QUERY_KEY`).
- **백엔드**: Route(validator+describeRoute+withErrorHandling) → Service → `*ServiceDb`(compose가 Drizzle 격리). 에러는 `createAppError`. **새 에러 코드는 `error-code.ts`·`error-message.ts`·STATUS_MAP 3곳 모두.** 검증 입력은 `ApiRouteContext<{ json: ... }>` 로 주석(캐스트 금지).
- **디자인**: border 유틸·`rounded-*`·Tailwind 기본 팔레트 색 금지.
- **커밋**: Conventional Commits, 한국어 설명, author 사용자 단독, **`Co-Authored-By`·AI 트레일러 금지**, `git add -A` 금지, force push 금지. 논리 단위 1커밋. commit·push 는 지시할 때만.
- **검증**: 종료 전 typecheck → lint → test → build. **정적 검사 통과 = 완료가 아니다.** 이번 세션에서 실측/워크플로로만 드러난 결함이 7건이었다(슬롯 누수 3, RPC 타입 소실, CI 예시 파손, 사이드바 라벨, `{"data":{}}`).
- **작업 방식**: 모호하면 1줄 객관식. 전수검사는 샘플링 금지. **에이전트·도구 보고를 그대로 믿지 말고 직접 재확인.**
- **금지**: `.env` 생성·수정·열람, 시크릿을 코드·문서에 기록, 무단 git 조작, `docker compose down -v`·광범위 prune, 사용자 소유 Docker 리소스 삭제, shadcn CLI 실행, 특권 컨테이너·호스트 네임스페이스 진입·loopback 외 포트 publish(→ [CLAUDE.md](../CLAUDE.md)).

## 6. 미해결 질문 / 확인 필요

1. **Cloudflare Access 적용 여부** — 패널이 공개 인터넷에 열려 있다. 앞에 Access 를 둘지 사용자 판단.
2. **토큰 단독 blue-green release 완주 미실측** — release 메커니즘 자체는 이전 세션에 검증됐으나 API key 만으로 끝까지 도는 경로는 라이브로 돌려본 적이 없다.
3. **공개 주소 후보의 내장 이름 노이즈** — `panel.containers.local` 같은 내부 이름도 후보에 섞인다. 걸러내려면 이름 목록을 박아야 해서 하지 않았다. 정렬로 의미 있는 항목이 위로 온다.

## 7. 환경 & 전제

- **런타임**: Bun 1.3.14 workspace(`apps/*`, `packages/*`), TypeScript strict + `exactOptionalPropertyTypes` + `noUncheckedIndexedAccess`.
- **스택**: Hono 4.13.0(api·engine-agent·traffic-worker), Next.js 16.3.0 App Router + React 19 + React Compiler + Tailwind v4 + next-intl(ko/en/ja) + TanStack Query v5, Drizzle + SQLite, Better Auth 1.6.25.
- **접속**: `http://127.0.0.1:18080`. **8080 이 아니다** — macOS Docker Desktop 이 그 포트에서 저속 스트림을 버퍼링한다.
- **호스트**: macOS Docker Desktop 에서만 검증. Linux 는 코드상 지원하나 미검증(README 명시).
- **외부 노출**: `hyuns.uk` 가 Cloudflare 터널로 연결돼 있다. 터널은 호스트에서 실행(compose 밖). 대시보드 service 는 `http://127.0.0.1:18080`.
- **로그인**: `owner@containers.local`. 비밀번호는 `bun scripts/seed-e2e.ts --email owner@containers.local --role owner` 로 재설정하고 출력값을 쓴다. 저장소·문서에 기록하지 않는다.
- **SQLite enum 주의**: Drizzle `text({ enum: [...] })` 는 TypeScript 전용이고 CHECK 제약을 만들지 않는다. 값을 추가해도 `drizzle-kit generate` 는 "No schema changes" — 정상이다.
- **live nginx config**: 관리 볼륨의 `current.conf` 가 정본. `infra/nginx/nginx.conf` 는 볼륨이 비었을 때만 복사되는 기본값이다.
- **새 workspace 패키지**: `apps/*/Dockerfile` 4개에 `COPY` 2줄씩 추가해야 한다. 이번에도 `apps/api` 에서 빠뜨렸다가 잡았다.
- **환경변수**: `BACKUP_INTERVAL_HOURS`·`BACKUP_RETENTION_COUNT`·`UPLOAD_TOTAL_QUOTA_BYTES` 는 `compose.yaml` 에 없어 셸 export 로는 전달되지 않는다. `compose.override.yaml` 에 적어야 한다(README 표에 `override only` 표기).
- **명령**: `bun run typecheck` / `lint` / `test` / `build` / `format:check`, `bun audit`, `bun run audit:runtime`, `docker compose build && docker compose up -d --wait`, `./scripts/setup.sh`, `./scripts/migration-dry-run.sh`, `bun scripts/seed-e2e.ts`.

## 8. 다음 세션 TODO

### 1순위 — 사용자 작업 (코드 변경 없음)

1. **터널을 `cloudflared service install` 로 이관** — 현재 `--token` 이 `ps` 에 노출. 완료 조건: `pgrep -af cloudflared` 에 토큰이 보이지 않고 외부 접속이 유지된다.
2. **공개 주소 저장** — 패널 `/panel-settings` 에서 `hyuns.uk` 후보 선택 후 저장. 완료 조건: `https://hyuns.uk` 에서 로그인 200.

### 2순위 — 코드

3. **Cloudflare Access 적용 여부 결정 후 문서화** → [EXPOSURE.md](./EXPOSURE.md) §2.1.
4. **토큰 단독 blue-green release 라이브 실측** → `docs/ci-examples/github-actions-deploy.yml`. 러너가 패널에 도달 가능해야 하므로 터널 경유 또는 셀프호스티드 러너 필요.
5. **`traffic-worker` query worker 의 pending 요청** — `onerror` 없이 worker 가 종료하면 pending 이 남는다. 파일: `apps/traffic-worker/src/db/create-query-worker.ts`. → [bug 문서 §6](./bug/2026-08-05-sse-stream-slot-leak.md)

### 3순위 — 외부 자원 필요

6. Linux 실기 검증(`DOCKER_GID` 탐지).
7. Discord webhook 실전송, 24시간 경과 자동 backup job live 성공 이력.

## 9. 문서 지도

| 문서                       | 다루는 것                                                                              |
| -------------------------- | -------------------------------------------------------------------------------------- |
| `HANDOFF.md`               | (이 문서) 세션 인수인계 단일 진입점                                                    |
| `../CLAUDE.md`             | 저장소 에이전트 실행 규칙(호스트 격리 우회·서비스 노출 금지, 대체 진단 경로 표)        |
| `RESUME-CHECKLIST.md`      | 재개 직후 읽기 전용 점검 명령, 안전 불변식, 중단 절차                                  |
| `HANDOFF-STATUS.md`        | 구현 완료 범위·한계·검증 증거 누적 기록                                                |
| `PROCESS.md`               | 작업 체크리스트(시간순 전체 이력)                                                      |
| `ARCHITECTURE.md`          | 서비스 구성, 네트워크·권한 경계, 데이터 흐름                                           |
| `TECH-STACK.md`            | 기술 선택과 근거(버전 고정값은 `package.json` 이 정본)                                 |
| `SECURITY.md`              | 위협 모델, 권한, §15 2026-08-04 감사 반영                                              |
| `EXPOSURE.md`              | 외부 노출 경로와 도메인 전환. **터널은 스택 밖에서 돌리고 프록시는 패널에서 승인한다** |
| `RUNBOOK.md`               | 사고 시나리오별 증상·확인·조치                                                         |
| `BACKUP-RESTORE.md`        | 백업 세트, 복구 2모드, 새 호스트 재해복구 절차                                         |
| `CONTROL-PLANE-UPGRADE.md` | 업그레이드·롤백, migration dry-run                                                     |
| `NGINX-TRAFFIC.md`         | Nginx 설정·리로드·트래픽 수집, access log 로테이션                                     |
| `API-DATA-AUTH.md`         | API 표면, 인증 방식(세션/API key/recent-auth), DB                                      |
| `UPLOAD-DEPLOYMENT.md`     | 업로드·검사·배포·롤백 계약                                                             |
| `UI-UX.md`                 | 화면 규칙과 구현 현황·설계 이탈                                                        |
| `SHADCN-COMPONENTS.md`     | 컴포넌트 목록과 CLI 대신 공식 소스 이식 절차                                           |
| `llm.txt`                  | AI용 자족 레퍼런스. scope·job kind·상한·포트가 코드와 어긋나면 테스트가 실패한다       |
| `acknowledge/`             | 결정 기록(ADR). 최신 0035                                                              |
| `bug/`                     | 결함 기록(증상·근본원인·수정·실측)                                                     |
| `quality-assurance/`       | 감사·준비도 판정·드릴 실행 기록                                                        |
| `ci-examples/`             | 빌드 CI 3종 + API key 기반 배포 워크플로                                               |
| `history/`                 | 세션별 시점 기록(현재 상태 아님)                                                       |

## 10. 복기 신뢰도

이 세션은 매우 길었고(워크플로 8회, 서브에이전트 70개 이상) 여러 차례 컨텍스트가 요약됐다.

- **직접 코드·런타임으로 재확인한 것은 신뢰도가 높다**: 슬롯 누수 3건, 포트 8080 버퍼링(worktree·프로브 대조), 패널 설정·신뢰 프록시 승인의 nginx 반영, 복구 드릴 2회, 보안 실측, `bun audit` 0건.
- **요약본만 이 문서에 있는 것**: 감사 findings 132건·준비도 findings 68건의 개별 항목. 전문은 `quality-assurance/` 두 리포트에 있다.
- 서브에이전트가 보고한 세부 구현 결정(2단계 알림·헬스·백업 가드)은 원본 코드를 신뢰한다.
