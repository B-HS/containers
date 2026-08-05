# HANDOFF — 2026-08-06 세션 스냅샷

- 대응 커밋: `376a4d4` (`dev`, origin/dev 와 동기)
- 최종 갱신일: 2026-08-06
- 검증 상태: typecheck 8/8 · lint 0 · **test 454** · format:check · build 8/8 · `audit:runtime` 5/5 · compose 스택 5개 healthy
- 이 문서가 **세션 인수인계 단일 진입점**이다. 다른 문서보다 먼저 읽는다.
- **진행 중 작업의 실행 계획 정본은 [PLAN-UX-REMEDIATION.md](./PLAN-UX-REMEDIATION.md) 다.** 이 문서는 상태만 요약한다.

## 1. 프로젝트 한 줄 정의

단일 Docker 호스트를 웹 패널로 관리하는 self-hosted control plane. 컨테이너 제어·이미지·배포(blue-green)·Nginx 설정 GUI·트래픽 분석·백업/복구를 role 기반 권한과 durable job queue 위에서 제공한다.

## 2. 현재 목표

- **최종 목표**: 실운영 가능 + GitHub Actions 가 API key 만으로 배포를 완주.
- **현재 마일스톤**: 패널 UX 감사 후속 처리. 원본 64건 → 반증 검증 44건 → 원인 12개. 여기에 라이브 실측으로 찾은 배포 런타임 결함 2건이 더해졌다.
- **직전 작업(2026-08-06)**: 2.2 → 1.3 → 3.1 을 완료했다. 그 과정에서 발견한 결함 3건(CSP 가 브라우저 업로드를 전부 막음, `DEPLOYMENT_RELEASE_FAILED` 미등록으로 500, control DB 고아 행 78건)도 함께 처리하거나 기록했다.
- **다음 한 줄**: 계획서 **3.2 스택 저장·조회 API** — `deployment_stack` 테이블과 `POST /api/deployment-stacks/preview`·`POST /api/deployment-stacks`. 변환기(`apps/api/src/lib/compose-stack.ts`)와 계약(`packages/contracts/src/deployment-stack.ts`)은 3.1 에서 이미 만들어 두었고 테스트 13건이 붙어 있다.

## 3. 완료 / 진행 중 / 미착수

### 완료 — 이번 세션 커밋 22건, 전부 push

**패널 설정·신뢰 프록시 마무리** (`390ee21`·`22f5abe`·`ad8125a`·`d38f68c`·`07a6b2d`·`582d0a0`)

- 신뢰 프록시 주소 하드코딩 제거, 접근 시도된 host 를 공개 주소 후보로 표시
- 후보 필터를 `server_name` 이 아니라 **신뢰 origin** 기준으로 — nginx 는 응답하는데 인증이 막는 host 가 숨는 문제
- 사이드바 아이콘·라벨 누락 수정 + 회귀 테스트

**seed 스크립트가 손상시킨 timestamp 복구** (`149949f`)

- `scripts/seed-e2e.ts` 가 `Date.now()`(ms)를 `mode:'timestamp'`(초) 컬럼에 써서 `GET /api/users` 가 500 이었다. drizzle 이 그 값을 초로 읽어 서기 58000년대 `Date` 가 되고 `z.iso.datetime()` 파싱 실패
- migration `0017` 로 `user`·`account`·`user_role` 18개 값 복구, 스크립트 수정, 단위 어긋남을 잡는 테스트 2건

**실운영 점검 6건** (`3371ea7`·`7f57ece`·`47b4b38`·`a172474`·`a83b53e`) → [acknowledge/0036](./acknowledge/0036-public-origin-single-source-and-shutdown.md)

- 공개 https 로그인 쿠키에 `Secure` 가 없었다 → 응답 미들웨어가 `x-forwarded-proto` 가 https 일 때만 부착(`apps/api/src/lib/secure-cookie.ts`). 쿠키 이름은 유지
- owner 계정을 삭제·비활성화할 수 없었다 → 자기 자신만 불변(`SELF_MODIFICATION_FORBIDDEN`), `DELETE /api/users/:id` 추가, `z.uuid()` 제약 제거(better-auth id 는 UUID 가 아니라 bootstrap owner 는 애초에 관리 불가였다)
- `GET /api/session` 이 세션 토큰 원문을 반환 → 요약만
- 보호 hostname 이 부팅 배열이라 공개 주소가 빠져 있었다 → 호출 시점 평가
- 초대 링크가 부팅 URL → 저장된 공개 주소 사용
- `SIGTERM` 핸들러 없음 → 8초 상한 드레인 + `stop_grace_period: 20s`

**seed 없는 초기화** (`aea8bc4`·`88ddfd7`·`003a189`)

- bootstrap 은 인증 없이 첫 owner 를 만드는 경로라 **로컬 이름에서만** 허용(`BOOTSTRAP_ORIGIN_FORBIDDEN` 403). 웹은 공개 주소에서 폼 대신 안내
- seed 스크립트는 공개 주소가 저장된 스택에서 거부(`--allow-configured` 로만 우회)
- `scripts/reset-accounts.ts` 추가 — dry run 기본, `--confirm` 필요, 실행 전 DB 사본

**문서 정합** (`de20290`) — `HANDOFF-STATUS.md` 가 `service/domain` 분리 이전 경로와 없어진 위젯 이름을 가리키던 것 17건 교정

**와일드카드 터널** (`4cfcce4`) — `scripts/setup-cloudflare-tunnel.sh`

**UX 감사·계획** (`5f986fd`·`a121756`) — 감사 결과와 실행 계획 고정

**UX 후속 3건**

| 항목                          | 커밋      | 실측                                                               |
| ----------------------------- | --------- | ------------------------------------------------------------------ |
| 1.1 컨테이너 요약 계약 확장   | `027e08b` | 목록에 `8080/tcp` + `containers_edge`                              |
| 2.1 런타임 프로필             | `0a94269` | 순정 `nginx:alpine` 무설정 배포 healthy, 외부 200, `SYS_ADMIN` 400 |
| 1.2 라우트 대상 검증 + Select | `e76fb67` | 없는 대상 400 / bridge 400 / edge 201                              |

### 2026-08-06 세션에서 한 일 — 커밋 9건, 전부 push

| 커밋      | 내용                                                                                          |
| --------- | --------------------------------------------------------------------------------------------- |
| `7d5e729` | 직전 세션의 미커밋 문서(런타임 프로필·라우트 검증 + ADR 0037·0038) 정리                       |
| `1c50f24` | **2.2** 배포 실패 진단을 job event 에 남긴다 + 시크릿 리댁션 유틸 신설 + 에러 코드 3파일 등록 |
| `1e32d41` | 2.2 실측 결과 기록                                                                            |
| `7d8c251` | **1.3** durable job 실패를 화면에 드러낸다(조건부 폴링 포함)                                  |
| `6495759` | 로케일 카탈로그 키 정합 테스트                                                                |
| `9d3769d` | **CSP 가 업로드 해시 WebAssembly 를 막던 blocker** 수정                                       |
| `6934baa` | 1.3 실측 결과 기록                                                                            |
| `d68016f` | **3.1** compose 스택 계약과 변환 규칙(+ manifest route nullable, migration 0019)              |
| `376a4d4` | 테이블 재생성 마이그레이션이 적용되게 하고 DB 무결성 점검을 붙인다                            |

**이번 세션에서 새로 찾은 결함 3건**

1. **CSP 가 브라우저 업로드를 전부 막고 있었다**(blocker). `hash-wasm` 이 WebAssembly 를 쓰는데 `script-src` 에 허용이 없었다. API 경로는 CSP 와 무관해 지금까지 드러나지 않았다. → [bug/2026-08-06-csp-blocks-upload-hashing.md](./bug/2026-08-06-csp-blocks-upload-hashing.md). **실행 중 스택에도 적용 완료**(사용자 승인 후 `POST /api/nginx/config/apply`).
2. `DEPLOYMENT_RELEASE_FAILED` 가 `ERROR_CODE` 에 없어 응답 경로에서 500 으로 떨어지고 있었다. 3파일에 등록했다.
3. **control DB 에 삭제된 user 를 참조하는 고아 행 78건**(`audit_log` 62·`api_key` 9·`operation_job` 4·`trusted_proxy` 2·`panel_setting` 1). → [bug/2026-08-06-control-db-orphan-user-references.md](./bug/2026-08-06-control-db-orphan-user-references.md). **처리 방침은 사용자 판단이 필요하다 — 특히 소유자 없는 `api_key` 9건이 살아 있는지 먼저 확인해야 한다.**

### 진행 중

없음. 워킹트리 clean.

### 미착수 — [PLAN-UX-REMEDIATION.md](./PLAN-UX-REMEDIATION.md) 체크리스트

- **3.2~3.4** compose 스택 — 저장·조회 API, 오케스트레이션, 화면 (3.1 계약·변환기는 완료)
- **4.1~4.7** 마찰 — 에러 파싱, CTA 링크, 라우트 수정, 소유권 표시, job 진행, 업로드 재개, manifest 폼 하드코딩
- **5.1~5.3** 품질·접근성
- **6.1~6.4** 최종 재검증·문서 정합·정리

## 4. 의사결정 요약

상세는 [acknowledge/](./acknowledge/) (최신 0038).

| 결정                                                                                                 | 이유                                                                                                                                                     | 기각한 대안                                                                                                                                                    |
| ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **런타임을 프로필로 열고 기본 `standard`** ([0037](./acknowledge/0037-container-runtime-profile.md)) | 기본이 닫혀 있으면 공식 이미지 대부분이 뜨지 않아 제품이 성립하지 않는다. 사용자 판단 — "어떤 이미지가 올라올 줄 알고 특정 이미지 세팅을 강요할 수 없다" | `readOnlyRootFilesystem` 만 뒤집기(`CapDrop:ALL` 이 남아 chown 이 계속 막힘) / 읽기 전용 유지 + `writablePaths` 만 추가(사용자가 필요한 경로를 미리 알아야 함) |
| **아티팩트는 이미지 아카이브만** ([0037 §4](./acknowledge/0037-container-runtime-profile.md))        | 호스트 bind mount 는 컨테이너 탈출 경로. 사용자가 범위를 좁혔다 — "의도적으로 그냥 컨테이너만 업로드해서 묶는게 좋겠다"                                  | raw 파일 업로드 + bind mount(거부) / raw 아카이브 → 관리 볼륨 추출(제안했으나 불채택)                                                                          |
| **compose 는 (b) 본격 지원**                                                                         | 사용자 확정. "할거면 제대로해야지 b 로 가도록해"                                                                                                         | (a) manifest `group` 최소안 / (c) 미지원 + 폼 하드코딩만 해소                                                                                                  |
| **라우트 대상을 서버에서 검증** ([0038](./acknowledge/0038-nginx-route-target-validation.md))        | 변수 `proxy_pass` 라 `nginx -t` 도 리로드도 성공하고 502 로만 드러난다. API key 경로도 같은 실수가 가능하므로 서버가 본체                                | nginx 네트워크 자동 판별(관리 plane 필터로 nginx 자신이 목록에 없음) / 실행 중이 아니면 거부(라우트 사전 준비를 막음)                                          |
| **중지된 컨테이너는 라우트 허용**                                                                    | 라우트를 미리 만들어 두는 것은 정당한 사용이고, 중지 상태에선 네트워크 목록이 비어 판단 불가                                                             | 실행 중만 허용                                                                                                                                                 |
| bootstrap 을 로컬 이름으로 제한                                                                      | 인증 없이 첫 owner 를 만드는 경로. 공개 노출 중 계정이 비면 누구나 선점                                                                                  | 공개 주소에서도 허용                                                                                                                                           |
| 쿠키 `Secure` 를 요청마다 부착                                                                       | better-auth 는 생성 시 한 번 정해 loopback http 와 공개 https 를 함께 못 쓴다                                                                            | `useSecureCookies: true`(로컬 로그인 죽음) / nginx `proxy_cookie_flags`(플래그에 변수 불가)                                                                    |
| owner 보호를 자기 자신으로 축소                                                                      | "마지막 owner 보호" 가드는 도달 불가능한 죽은 코드였다(owner 만 호출 가능 + 자기 자신 제외 ⇒ 항상 다른 owner 가 남음)                                    | last-owner 가드 유지                                                                                                                                           |
| 와일드카드 터널                                                                                      | 대시보드 **Subdomain 칸에 `*` 하나만** 넣으면 된다. 로컬 `config.yml` ingress 도 가능                                                                    | "대시보드는 와일드카드 불가" — **내가 처음에 잘못 단정했고 사용자가 준 아티클로 정정**                                                                         |
| 감사 발견도 코드로 재확인                                                                            | 반증 검증을 통과한 발견 1건이 오탐이었다("관리 plane 컨테이너 노출" — 실제로는 이미 필터됨)                                                              | 검증 결과를 그대로 신뢰                                                                                                                                        |

## 5. 사용자 방향성 & 작업 규칙

- **답변**: 한국어, 존댓말, **간결**. 미사여구·자축·이모지 금지. **뺑 돌리지 말고 순서대로, 할 일만.** 검증 안 된 "완벽/잘 됨" 단언 금지.
- **하드코딩 금지 — 가장 자주 지적받은 것.** 값을 두 곳에 적는 것, 스크립트에 주소·포트를 박는 것, 테스트 픽스처에 실도메인을 쓰는 것 전부 포함. "사용자가 한 번 실행하는 스크립트라도 나중에 값이 바뀌면 틀린다"가 기준. 실제 설정에서 읽거나 관측값에서 고르게 만든다.
- **사용자가 준 자료는 끝까지 읽는다.** 아티클을 받고도 내 추측을 유지해 강하게 질책받았다("내가 준 아티클 안처읽은거야?"). 자료가 내 결론과 다르면 자료가 이긴다.
- **자격증명을 묻지 않는다.** `bun scripts/seed-e2e.ts` 로 직접 만든다.
- **탐색은 workflow 로.** 사용자 지시 — "workflow opus medium 으로 적극 사용 권장".
- **굵직한 단위마다 commit / push.** 진행 전 체크리스트와 상세 설명을 docs 에 남겨 컨텍스트가 요약돼도 판단이 흔들리지 않게 한다.
- **코드**: arrow function only, 반환타입 미명시, `any`/`enum` 금지, **코드 주석 금지**(JSDoc 영어만), named export, 매직넘버 금지, `useCallback`/`useMemo` 금지, `cn()` 사용, FSD 단방향·barrel 금지, TanStack Query(`queryOptions` + 중앙 `QUERY_KEY`).
- **백엔드**: Route(validator+describeRoute+withErrorHandling) → Service → `*ServiceDb`. 에러는 `createAppError`. **새 에러 코드는 `error-code.ts`·`error-message.ts`·`error.ts` STATUS_MAP 3곳 모두.**
- **디자인**: border 유틸·`rounded-*`·Tailwind 기본 팔레트 색 금지.
- **커밋**: Conventional Commits, 한국어 설명, author 사용자 단독, **`Co-Authored-By`·AI 트레일러 금지**, `git add -A` 금지, force push 금지. 논리 단위 1커밋.
- **검증**: 종료 전 typecheck → lint → test → build. **정적 검사 통과 = 완료가 아니다.** 이번 세션에서 실측으로만 드러난 결함이 여러 건이었다(표준 이미지 미기동, `GET /api/users` 500, 쿠키 `Secure` 누락).
- **금지**: `.env` 생성·수정·열람, 시크릿을 코드·문서에 기록, 무단 git 조작, `docker compose down -v`·광범위 prune, 사용자 소유 Docker 리소스 삭제, shadcn CLI 실행, 특권 컨테이너·호스트 네임스페이스 진입·loopback 외 포트 publish(→ [CLAUDE.md](../CLAUDE.md)).

## 6. 미해결 질문 / 확인 필요

0. **`verify2@containers.local`(owner) 계정을 이번 세션에서 만들었다.** 실측용이고 `hs@gumyo.net` 으로 로그인해 `/ko/users` 에서 지워야 한다. 남은 테스트 자산: `fail-demo` manifest·컨테이너(exited)·이미지 `containers-fail-demo:1.0.0`·artifact `fail-demo.tar`·`ui-failure-check.tar`. 6.4 에서 정리한다.
1. **`verify@containers.local`(admin) 계정이 남아 있다.** 내가 검증용으로 만든 것이고 owner 만 지울 수 있다. `hs@gumyo.net` 으로 로그인해 `/ko/users` 에서 삭제해야 한다.
2. **테스트 배포가 살아 있다** — `demo-a-2.0.0`·`demo-b-2.0.0`·`demo-plain-3.0.0` 컨테이너와 `a.hyuns.uk`·`b.hyuns.uk` 라우트. 계획서 6.1·6.2 재검증에 쓰고 6.4 에서 정리한다.
3. **CI 검증용 API key `ci-flow-verify`** 가 남아 있다(1일 만료). 6.4 에서 폐기.
4. Cloudflare Access 미적용. 패널이 공개 인터넷에 열려 있다.
5. HSTS `preload` 미적용 — 등재 취소가 어려워 운영자 판단이 필요하다.

## 7. 환경 & 전제

- **런타임**: Bun 1.3.14 workspace(`apps/*`, `packages/*`), TypeScript strict + `exactOptionalPropertyTypes` + `noUncheckedIndexedAccess`.
- **스택**: Hono 4.13.0, Next.js 16.3.0 App Router + React 19 + React Compiler + Tailwind v4 + next-intl(ko/en/ja) + TanStack Query v5, Drizzle + SQLite, Better Auth 1.6.25.
- **접속**: `http://127.0.0.1:18080`. **8080 이 아니다** — macOS Docker Desktop 이 그 포트에서 저속 스트림을 버퍼링한다.
- **외부**: `hyuns.uk` 가 Cloudflare 터널로 연결돼 있고 **`*` 와일드카드 public hostname 이 설정돼 있다**(대시보드 Subdomain 칸에 `*`). 미등록 서브도메인은 nginx catch-all 이 444 로 끊어 Cloudflare 가 502 를 표시한다.
- **계정**: owner 는 `hs@gumyo.net`(사용자가 bootstrap 으로 생성). seed 계정은 배포에 없다. 개발 스택에서만 `bun scripts/seed-e2e.ts`.
- **`Bun.YAML.parse` 가 존재한다** — compose 파싱에 새 의존성이 필요 없다(`packages/config/src/compose-security.test.ts` 가 이미 사용).
- **SQLite enum 주의**: Drizzle `text({ enum: [...] })` 는 TypeScript 전용이고 CHECK 제약을 만들지 않는다.
- **live nginx config**: 관리 볼륨의 `current.conf` 가 정본. `infra/nginx/nginx.conf` 는 볼륨이 비었을 때만 복사되는 기본값이다. **저장소 파일만 고치고 반영됐다고 판단하지 않는다** — 패널 API(`POST /api/nginx/config/apply`)로 적용한다.
- **새 workspace 패키지**: `apps/*/Dockerfile` 4개에 `COPY` 2줄씩 추가한다.
- **드리즐 마이그레이션**: 손으로 SQL 을 쓰지 말고 `bun run --cwd packages/db-schema generate` 를 쓴다. 손으로 쓰면 스냅샷이 어긋나 중복 마이그레이션이 생긴다(이번 세션에 겪었고 정리했다).
- **명령**: `bun run typecheck` / `lint` / `test` / `build` / `format:check`, `bun audit`, `bun run audit:runtime`, `docker compose build && docker compose up -d --wait`, `./scripts/setup.sh`, `./scripts/setup-cloudflare-tunnel.sh`, `bun scripts/seed-e2e.ts`, `bun scripts/reset-accounts.ts`.

## 8. 다음 세션 TODO

**[PLAN-UX-REMEDIATION.md](./PLAN-UX-REMEDIATION.md) 의 체크리스트를 그대로 따른다.** 아래는 우선순위 요약이다.

1. **2.2 배포 실패 진단 노출** — `apps/api/src/service/domain/deployment/create-deployment-release-service.ts`. probe 실패 시 `inspectContainer` 의 `State.ExitCode`·`State.Error` 와 `getContainerLogs` 마지막 20줄을 job event `detail` 에 담고 release 상세에 노출. 완료 조건: 일부러 실패하는 이미지를 배포하면 exit code 와 로그 꼬리가 job event 에 남는다.
2. **1.3 job 실패 표면화** — `apps/web/src/entities/job/job.query.ts` 에 `onFailed`/`onSettled` 와 조건부 폴링, 소비 위젯 `artifact-widget.tsx`·`artifact-upload-form.tsx` 에 실패 배너. 완료 조건: sha256 이 어긋난 업로드를 finalize 하면 화면에 실패와 코드가 뜬다.
3. **3.1~3.4 compose 스택** — 가장 큰 덩어리. `Bun.YAML.parse` 사용, `privileged`·host namespace·docker socket·호스트 bind mount 를 만나면 **무시가 아니라 거부**, `ports` 의 호스트 포트는 무시(무시 목록에 명시), `environment` 평문 값은 거부하고 secret 참조만 허용.
4. **4.1~4.7 마찰 7건**
5. **5.1~5.3 접근성 3건**
6. **6.1~6.4 최종** — 표준 nginx 재검증, 2서비스 compose 실측, 문서 정합, 테스트 자산 정리

## 9. 문서 지도

| 문서                                                                                                  | 다루는 것                                                                                       |
| ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `HANDOFF.md`                                                                                          | (이 문서) 세션 인수인계 단일 진입점                                                             |
| `PLAN-UX-REMEDIATION.md`                                                                              | **진행 중 작업의 실행 계획 정본.** 항목별 문제·근거·할 일·주의·완료 판정                        |
| `quality-assurance/2026-08-05-panel-ux-audit.md`                                                      | UX 감사 원본(64건 → 44건 → 12원인) + 배포 런타임 실측                                           |
| `../CLAUDE.md`                                                                                        | 저장소 에이전트 실행 규칙(호스트 격리 우회·서비스 노출 금지)                                    |
| `RESUME-CHECKLIST.md`                                                                                 | 재개 직후 읽기 전용 점검 명령, 안전 불변식                                                      |
| `HANDOFF-STATUS.md`                                                                                   | 구현 완료 범위·한계·검증 증거 누적                                                              |
| `PROCESS.md`                                                                                          | 작업 체크리스트(시간순 전체 이력)                                                               |
| `ARCHITECTURE.md`                                                                                     | 서비스 구성, 네트워크·권한 경계, 데이터 흐름                                                    |
| `TECH-STACK.md`                                                                                       | 기술 선택과 근거                                                                                |
| `SECURITY.md`                                                                                         | 위협 모델, 권한. §16 노출 점검, **§17 사용자 컨테이너 런타임 프로필**, **§18 라우트 대상 검증** |
| `EXPOSURE.md`                                                                                         | 외부 노출. 터널은 스택 밖, 와일드카드 두 방법, 프록시는 패널에서 승인, 최초 계정은 로컬에서     |
| `RUNBOOK.md`                                                                                          | 사고 시나리오별 조치. §10 owner 상실, §11 공개 주소 403                                         |
| `BACKUP-RESTORE.md`                                                                                   | 백업 세트, 복구 2모드, 재해복구                                                                 |
| `CONTROL-PLANE-UPGRADE.md`                                                                            | 업그레이드·롤백, migration dry-run                                                              |
| `NGINX-TRAFFIC.md`                                                                                    | Nginx 설정·리로드·트래픽 수집, real_ip, **라우트 대상 검증**                                    |
| `API-DATA-AUTH.md`                                                                                    | API 표면, 인증 3층, 세션/쿠키 계약, 에러 코드                                                   |
| `DOCKER-CONTROL.md`                                                                                   | 컨테이너·이미지·네트워크·볼륨 제어, **요약 계약과 런타임 프로필**                               |
| `UPLOAD-DEPLOYMENT.md`                                                                                | 업로드·검사·배포·롤백, **manifest 런타임**                                                      |
| `UI-UX.md`                                                                                            | 화면 규칙과 구현 현황                                                                           |
| `SHADCN-COMPONENTS.md`                                                                                | 컴포넌트 목록과 CLI 대신 공식 소스 이식                                                         |
| `TESTING.md`                                                                                          | 검증 사다리와 checkpoint                                                                        |
| `llm.txt`                                                                                             | AI용 자족 레퍼런스. 드리프트 테스트가 강제                                                      |
| `acknowledge/`                                                                                        | 결정 기록(ADR). 최신 0038                                                                       |
| `bug/`                                                                                                | 결함 기록                                                                                       |
| `quality-assurance/`                                                                                  | 감사·드릴 실행 기록                                                                             |
| `ci-examples/`                                                                                        | 빌드 CI 3종 + API key 배포 워크플로                                                             |
| `history/`                                                                                            | 세션별 시점 기록(현재 상태 아님)                                                                |
| `PRODUCT-REQUIREMENTS.md`·`REQUIREMENTS-TRACEABILITY.md`·`IMPLEMENTATION-PLAN.md`·`OPEN-DECISIONS.md` | 요구사항·추적·초기 계획(시점 기록)                                                              |

## 10. 복기 신뢰도

이 세션은 매우 길었고 여러 차례 컨텍스트가 요약됐다.

- **직접 코드·런타임으로 재확인한 것은 신뢰도가 높다**: 런타임 프로필 실측 3회, 라우트 검증 3케이스, API key 전 구간 완주, 와일드카드 터널 외부 200, seed timestamp 손상 복구.
- **요약본만 이 문서에 있는 것**: UX 감사 44건의 개별 항목. 전문은 `quality-assurance/2026-08-05-panel-ux-audit.md` 에 있다.
- **알려진 오탐 1건**: 감사의 "관리 plane 컨테이너가 라우트 후보에 노출" 은 반증 검증을 통과했지만 실제로는 이미 필터되고 있었다. **감사 발견도 코드로 재확인한다.**
