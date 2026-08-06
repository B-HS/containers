# HANDOFF — 2026-08-06 세션 스냅샷

- 대응 커밋: `4192f99`(`fix(notification): 정기 보고를 타이머 대신 마지막 보고 시각 기준으로 보낸다`) 기준 (`dev`, origin/dev 와 동기)
- 최종 갱신일: 2026-08-06
- 검증 상태: typecheck 8/8 · lint 0 · **test 532**(+ web 28) · build 8/8 · format · `audit:runtime` 5/5 · 스택 5개 healthy · `foreign_key_check` 0 · `https://hyuns.uk` 200
- **이 문서가 세션 인수인계 단일 진입점이다.** 다른 문서보다 먼저 읽는다.
- **현재 상태와 검증 수치는 이 문서가 단독으로 소유한다.** `RESUME-CHECKLIST.md` 는 절차·불변식, `HANDOFF-STATUS.md` 는 구현 범위·한계(시점 기록)를 소유한다. 같은 수치를 두 곳에 적지 않는다.
- **진행 중 작업의 실행 계획 정본은 [PLAN-UX-REMEDIATION.md](./PLAN-UX-REMEDIATION.md) 다.**

## 1. 프로젝트 한 줄 정의

단일 Docker 호스트를 웹 패널로 관리하는 self-hosted control plane. 컨테이너 제어·이미지·배포(blue-green)·Nginx 설정 GUI·트래픽 분석·백업/복구를 role 기반 권한과 durable job queue 위에서 제공한다.

## 2. 현재 목표

- **최종 목표**: 실운영 가능 + GitHub Actions 가 API key 만으로 배포를 완주.
- **현재 마일스톤**: 패널 UX 감사 후속 처리(원본 64건 → 검증 44건 → 원인 12개) + 라이브 실측 결함 + compose 스택 본격 지원.
- **직전 작업(2026-08-06)**: 2.2 → 1.3 → 3.1 → **3.2 → 3.3 → 3.4 → 4.1~~4.7 → 5.1~~5.3 → 6.1~6.4 완료.** [PLAN-UX-REMEDIATION.md](./PLAN-UX-REMEDIATION.md) 체크리스트를 전부 닫았다. 중간에 사용자 지시로 실운영 전 전체 초기화를 했고, 그 뒤 실측으로 결함 4건을 더 찾아 3건 수정·1건 기록했다.
- **2026-08-06 후반**: 공개 주소(`https://hyuns.uk`) 복구 후 보안 강화(계정 잠금·API key 만료 필수·세션 12시간·감사 해시 체인·CSP nonce)와 headless API 완주(업로드→배포→롤백·compose 스택·backup/restore)를 마쳤다. 라이브 실측이 결함 3건을 잡았다 — 감사 체인 해시 정밀도, 재배포 409, **백업 전면 불가(critical)**. 전부 수정·검증했다.
- **실운영 owner 계정은 확보됐다.** 사용자가 계정을 초기화하고 bootstrap 으로 실계정을 만들었으며, 공개 주소도 패널 설정에서 `https://hyuns.uk` 로 복구했다. seed 계정은 남아 있지 않다.
- **다음 한 줄**: **계획서를 전부 닫았다.** 실운영 판정은 아래 §2.1 을 본다. 남은 것은 겪어보지 않은 영역(오프박스 백업·새 머신 설치·부하·장애 주입)이며, 새 마일스톤은 그중에서 잡는다.

## 2.1 실운영 판정 (2026-08-06)

**실측으로 확인한 것** — 패널 전 구간(업로드→배포→서빙), API key 전 구간(+롤백·compose 스택), 백업 생성·복원, 공개 주소 서빙, CSP nonce, 감사 체인, 계정 잠금, 런타임 보안 불변식 5/5. 개인·소규모 실운영은 이 상태로 가능하다.

**아직 겪어보지 않은 것 — 위험 순서**

1. **오프박스 백업이 없다.** 백업이 원본과 같은 디스크(`containers_backups` 볼륨)에만 있다. 디스크 고장·볼륨 삭제면 데이터와 백업이 함께 사라진다. 사용자 판단으로 보류했다(둘 곳이 없음). 저장 위치가 하나 생기면 백업 job 성공 뒤 사본을 하나 더 만드는 작은 작업이다.
2. **새 머신 설치 E2E 가 없다.** 1번과 이어진다. 백업이 있어도 다른 머신에 처음부터 세우는 절차를 해본 적이 없다.
3. **부하·동시성 미측정.** SQLite 단일 파일이고 목표 규모 부하 테스트가 없다.
4. **장애 주입 미검증.** 디스크 가득 참·docker 데몬 재시작·컨테이너 OOM 상황을 시험하지 않았다.
5. **알림 실전송 미확인.** `system.report` 구현은 끝났으나 알림 대상이 0건이라 실제 Discord 전송을 본 적이 없다. **감사 체인 꼬리 자르기 탐지는 이 알림에 의존하므로, 대상을 등록하고 `system.report` 를 구독해야 실제로 동작한다.**
6. 배포하는 이미지의 CVE 관리는 제품 밖 습관(베이스 이미지 재pull·재빌드)에 달려 있다.

## 3. 완료 / 진행 중 / 미착수

### 완료 — 이번 세션 커밋 13건

| 커밋      | 내용                                                                                                      |
| --------- | --------------------------------------------------------------------------------------------------------- |
| `7d5e729` | 직전 세션의 미커밋 문서(런타임 프로필·라우트 검증 + ADR 0037·0038) 정리                                   |
| `dbacd7a` | **2.2** 배포 실패 진단을 job event 에 남긴다 + 시크릿 리댁션 유틸 신설 + `DEPLOYMENT_RELEASE_FAILED` 등록 |
| `1e32d41` | 2.2 실측 결과 기록                                                                                        |
| `7d8c251` | **1.3** durable job 실패를 화면에 드러낸다(조건부 폴링 포함)                                              |
| `6495759` | 로케일 카탈로그 키 정합 테스트                                                                            |
| `9d3769d` | **CSP 가 업로드 해시 WebAssembly 를 막던 blocker** 수정                                                   |
| `6934baa` | 1.3 실측 결과 기록                                                                                        |
| `d68016f` | **3.1** compose 스택 계약과 변환 규칙(+ manifest route nullable, migration 0019)                          |
| `376a4d4` | 테이블 재생성 마이그레이션이 적용되게 하고 DB 무결성 점검을 붙인다                                        |
| `efc93c0` | 세션 상태 인수인계 문서 갱신                                                                              |
| `28becf0` | 실운영 전 전체 초기화 결과 기록                                                                           |
| `66d48aa` | 인수인계 문서의 소유 범위와 구현 서술 정정                                                                |
| `3b587b2` | **3.2** compose 스택 등록과 미리보기 API (migration 0020)                                                 |
| `a72e76a` | **3.3** 스택 단위 순차 배포와 롤백 (job kind `deploy.stack-release`)                                      |
| `a4f8abd` | **3.4** compose 업로드와 스택 배포 화면 (`/deployments/stacks`)                                           |
| `cb81d5f` | **4.1** 서버가 준 실패 사유를 화면에 그대로 전달                                                          |
| `b77c80b` | **4.2** 배포 흐름 단계 사이를 잇는 이동 경로                                                              |
| `4c56ec5` | **4.3** 라우트 수정과 사용 여부 전환 (`PUT /api/nginx/routes/:id`)                                        |
| `07d44c9` | **4.4** 배포가 관리하는 라우트 구분 (`managedBy`, migration 0021)                                         |
| `63e570c` | **4.5** 실행 중 작업의 진행과 이력                                                                        |
| `475429b` | **4.6** 대용량 업로드 재개·취소                                                                           |
| `6240620` | **4.7** manifest 의 남은 계약 필드를 화면에 개방                                                          |
| `f493502` | **5.1~5.3** 화면 역할 안내와 접근성                                                                       |
| `8085811` | **6.1·6.2 실측에서 드러난 배포 결함 2건 수정**                                                            |
| `5e79f54` | **6.3** 문서와 코드의 어긋난 서술 전수 정정                                                               |

**2.2 배포 실패 진단** — 실패 시 컨테이너 중지 **전에** exit code·container error·로그 꼬리를 모아 durable job event `detail` 에 남기고 배포 화면에서 펼쳐 본다.

- `apps/api/src/service/domain/deployment/create-deployment-release-service.ts` — `collectFailureDiagnostics`, `run(id, options)` 의 `reportDiagnostics` 콜백, `failureStage`(probe→route→observation)
- `apps/api/src/service/domain/job/create-job-handlers.ts` — 콜백을 `reportProgress` 로 연결
- `packages/config/src/redact-log.ts` — `redactSecretText`·`redactSecretLines`(민감 key 대입·Bearer/Basic·JWT·URL 자격증명 마스킹, 512자 절단 + 말줄임)
- `packages/contracts/src/deployment.ts` — `deploymentFailureDiagnosticsSchema`, `DEPLOYMENT_FAILURE_DIAGNOSTICS_STEP`
- `apps/web/src/features/deployment-failure-detail/deployment-failure-detail.tsx`(신규), `apps/web/src/entities/job/job.query.ts`(events·kind 조회), `apps/web/src/widgets/deployment/deployment-widget.tsx`
- 실측: exit 3 이미지 배포 → `stage=probe`·`exitCode=3`·`REGISTRY_TOKEN=[REDACTED]` 8줄, 화면 렌더 확인

**1.3 job 실패 표면화** — `apps/web/src/entities/job/job.query.ts` 의 `useOperationJobPolling` 에 `onFailed`·`failureCode` 추가, `refetchInterval` 함수형(활성 상태에서만 폴링). 소비 위젯 `artifact-widget.tsx`·`artifact-upload-form.tsx` 에 실패 배너·토스트·진행률 초기화. 실측: 잘못된 tar 업로드 → 재시도 소진 후 배너 표시.

**3.1 compose 스택 계약** — `packages/contracts/src/deployment-stack.ts`(신규), `apps/api/src/lib/compose-stack.ts`(신규, 테스트 13건). manifest `route` 를 nullable 로 바꾸고(migration `0019`) 릴리스에 `isPublished` 가드를 넣었다.

**3.2 스택 저장·조회 API** — `deployment_stack`·`deployment_stack_release`(migration `0020`, compose 원문 컬럼 없음, `status='releasing'` 부분 unique index 로 스택당 1건 잠금), `create-deployment-stack-service.ts`(preview·create·get·list), `compose-deployment-stack.ts`(`insertStack` 한 트랜잭션), `create-deployment-stack-route.ts`(4개 라우트). manifest row 매핑과 정책 검사를 `deployment-manifest-row.ts` 로 뽑아 manifest 서비스와 공유한다. 값 없는 환경변수 키는 이제 `environment-value-missing` 으로 거부한다(거부 7종 → 8종). 태그→digest 맵은 `buildImageDigestByReference` 가 `getImages()` **1회**로 만든다.

**부수 수정** — CSP `'wasm-unsafe-eval'`(`infra/nginx/nginx.conf`·`nginx-tls.conf.example` + 회귀 테스트 2건), `apps/web/src/i18n/messages.test.ts`(로케일 키 정합 4건), `packages/db-schema/src/database.ts`(마이그레이션 전후 FK pragma + `foreign_key_check` 보고).

### 초기화 (커밋 아님, 런타임 작업)

지운 것: volume 6종(`control-data`·`traffic-data`·`artifacts`·`backups`·`nginx-config`·`nginx-logs`), 테스트 컨테이너 6개(`demo-*`·`fail-demo-*`), 테스트 이미지 6개. 유지: 자격증명 volume 3종, 사용자 소유 리소스(`poc1c`·`poc1d`·`poc1-debug2`·`api-proxy2`), `containers-dr-*` 이미지. 전 이미지를 HEAD 로 재빌드했다.

**6.1 전 구간 재검증** — `nginx:alpine` 아카이브 26MB 업로드 → `Loaded image: nginx:alpine` → manifest → blue-green 배포 healthy → `https://a.hyuns.uk` 200.

**6.2 compose 스택 실측** — 2서비스 compose 미리보기 → 등록(manifest 2건) → 스택 배포. `cache → web` 순서로 배포되고 내부 서비스는 라우트 없이 healthy, `https://b.hyuns.uk` 200.

**실측이 찾은 결함 4건** — 내부 서비스 관찰 불가([bug](./bug/2026-08-06-internal-service-observation-unreachable.md), 수정), 검사 실패 업로드 세션이 슬롯 점유([bug](./bug/2026-08-06-rejected-upload-session-blocks-slot.md), 수정), job 목록이 유휴에 폴링을 멈춰 새 job 을 못 봄(수정), 로드한 아티팩트를 지울 수 없음([bug](./bug/2026-08-06-loaded-artifacts-cannot-be-deleted.md), **미해결**).

### 진행 중

없음. 워킹트리 clean, 계획서 체크리스트 전부 닫힘.

### 미착수

계획서에 남은 항목이 없다. 다음 마일스톤은 §6 의 미해결 질문을 정한 뒤 잡는다.

## 4. 의사결정 요약

상세는 [acknowledge/](./acknowledge/) (최신 **0042**).

| 결정                                                                                                      | 이유                                                                                                                       | 기각한 대안                                                                                                                    |
| --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **진단 수집은 릴리스 서비스, 전달은 콜백** ([0039](./acknowledge/0039-deployment-failure-diagnostics.md)) | 어느 단계에서 죽었는지는 서비스만 안다. 서비스는 job 을 모른 채 `reportDiagnostics` 콜백만 받는다                          | job handler 가 실패 후 직접 수집(단계를 모름)                                                                                  |
| **진단은 job event 에만 저장** ([0039](./acknowledge/0039-deployment-failure-diagnostics.md))             | `GET /api/deployment-releases` 는 전 역할이 본다. release 계약에 넣으면 컨테이너 로그가 viewer 에게 열린다                 | release 스키마에 필드 추가 / 전용 진단 엔드포인트 신설(둘 다 권한 확대)                                                        |
| **로그는 20줄 + 512자 + 리댁션 후 저장**                                                                  | `SECURITY.md` §9 의 "원본 Docker log 를 영구 DB 에 복제하지 않는다" 기본의 명시적 예외라 범위를 좁혔다                     | 로그 통째 저장(정책 위반) / 리댁션 없이 저장(기동 실패 로그에 env 덤프가 흔함)                                                 |
| **CSP 에 `'wasm-unsafe-eval'` 추가** ([bug](./bug/2026-08-06-csp-blocks-upload-hashing.md))               | WebAssembly 컴파일만 허용하는 좁은 지시어. 업로드 해시가 `hash-wasm` 을 쓴다                                               | `'unsafe-eval'`(임의 실행까지 열림) / Web Crypto 교체(증분 해시 API 없음, GB tar 를 메모리에 올려야 함) / 순수 JS sha256(느림) |
| **manifest `route` 를 nullable 로** ([0040](./acknowledge/0040-compose-stack-contract.md))                | compose 스택의 DB·캐시는 공개 도메인이 있으면 안 되는데 route 가 필수여서 배포 자체가 불가능했다                           | 모든 서비스에 hostname 강제(DB 가 공개된다) / 예약 접미사로 내부 hostname 합성(여전히 공개 라우트가 생긴다)                    |
| **compose 라우팅은 패널 label 로**                                                                        | compose 에 "어느 도메인에 붙일지" 표준 키가 없다. healthcheck 는 명령이고 패널은 HTTP 경로라 타이밍만 이관                 | compose healthcheck 를 그대로 사용(의미가 다름)                                                                                |
| **manifest 이름 = `<스택>-<서비스>`**                                                                     | manifest name 이 사실상 전역 유일 키라 스택 간 `web`·`api` 가 충돌한다                                                     | 서비스 이름 그대로 사용                                                                                                        |
| **값 없는 compose 환경변수 키는 거부** ([0041](./acknowledge/0041-deployment-stack-persistence.md))       | 무시하면 오타가 그대로 배포된다. 유효성 검사 실패로 어느 서비스의 어느 키인지 화면에 드러낸다                              | `environmentKeys` 로 자동 이관(의도를 알 수 없다) / `ignored` 에 실어 무시(동작이 같다)                                        |
| **compose 원문은 보관하지 않는다** ([0041](./acknowledge/0041-deployment-stack-persistence.md))           | 저장 정본은 변환된 manifest 다. 원문에는 검사가 닿지 않는 텍스트(주석·`x-` 확장)가 남는다                                  | 원문 보관(재편집·diff 에 유리하나 계약·DB 를 넓히고 시크릿 노출면을 따로 막아야 한다)                                          |
| **마이그레이션 중 FK OFF, 위반은 로그만**                                                                 | SQLite 는 트랜잭션 안에서 `PRAGMA foreign_keys` 를 무시해 테이블 재생성이 실패한다. 위반으로 기동을 막으면 가용성이 깨진다 | 위반 시 throw(기존 데이터 불일치 하나로 control plane 전체가 안 떴다)                                                          |
| **전체 초기화 + 테스트 리소스만 삭제**                                                                    | 사용자 확정. 실운영 시작 전이라 더미 데이터를 남길 이유가 없다                                                             | DB 2개만 / control DB 만 / 사용자 컨테이너 전부 삭제                                                                           |

이전 세션 결정(런타임 프로필, 아티팩트 범위, compose (b) 본격 지원, 라우트 대상 서버 검증, bootstrap 로컬 제한, 쿠키 `Secure`)은 [acknowledge/0037](./acknowledge/0037-container-runtime-profile.md)·[0038](./acknowledge/0038-nginx-route-target-validation.md) 에 있다.

## 5. 사용자 방향성 & 작업 규칙

- **답변**: 한국어, 존댓말, **간결**. 미사여구·자축·이모지 금지. **뺑 돌리지 말고 순서대로, 할 일만.** 검증 안 된 "완벽/잘 됨" 단언 금지.
- **하드코딩 금지 — 가장 자주 지적받은 것.** 값을 두 곳에 적는 것, 스크립트에 주소·포트를 박는 것, 테스트 픽스처에 실도메인을 쓰는 것 전부 포함. 실제 설정에서 읽거나 관측값에서 고르게 만든다.
- **사용자가 준 자료는 끝까지 읽는다.** 자료가 내 결론과 다르면 자료가 이긴다.
- **자격증명을 묻지 않는다.** `bun scripts/seed-e2e.ts` 로 직접 만든다. 단 공개 주소가 설정된 스택에서는 스크립트가 스스로 거부한다(`--allow-configured` 로만 우회).
- **탐색은 workflow 로. 모델은 opus + effort medium** (2026-08-06 확정).
- **굵직한 단위마다 commit / push.** 진행 전 체크리스트와 상세 설명을 docs 에 남긴다.
- **코드**: arrow function only, 반환타입 미명시, `any`/`enum` 금지, **코드 주석 금지**(JSDoc 영어만), named export, 매직넘버 금지, `useCallback`/`useMemo` 금지, `cn()` 사용, FSD 단방향·barrel 금지, TanStack Query(`queryOptions` + 중앙 `QUERY_KEY`).
- **백엔드**: Route(validator+describeRoute+withErrorHandling) → Service → `*ServiceDb`. 에러는 `createAppError`. **새 에러 코드는 `error-code.ts`·`error-message.ts`·`error.ts` STATUS_MAP 3곳 모두.** 한 곳만 빠지면 `resolveErrorCode` 폴백으로 조용히 500 이 된다(이번 세션에 실제로 겪었다).
- **디자인**: border 유틸·`rounded-*`·Tailwind 기본 팔레트 색 금지.
- **커밋**: Conventional Commits, 한국어 설명, author 사용자 단독, **`Co-Authored-By`·AI 트레일러 금지**, `git add -A` 금지, force push 금지. 논리 단위 1커밋.
- **검증**: 종료 전 typecheck → lint → test → build. 스택이 떠 있으면 `audit:runtime` 도. **정적 검사 통과 = 완료가 아니다.** 이번 세션에서도 실측으로만 드러난 결함이 3건이었다.
- **금지**: `.env` 생성·수정·열람, 시크릿을 코드·문서에 기록, 무단 git 조작, `docker compose down -v`·광범위 prune, 사용자 소유 Docker 리소스 삭제, shadcn CLI 실행, 특권 컨테이너·호스트 네임스페이스 진입·loopback 외 포트 publish(→ [CLAUDE.md](../CLAUDE.md)).

## 6. 미해결 질문 / 사용자 확인 필요

앞선 5건(아티팩트·manifest·스택 삭제, 실운영 owner, 공개 주소, control DB 고아 행, 백업 불가)은 2026-08-06 에 전부 닫혔다. 남은 것은 아래 4건이다.

1. **오프박스 백업이 없다 — 잔여 위험 1위.** 백업이 원본과 같은 호스트 볼륨에만 있다. 사용자 판단으로 보류(둘 곳이 없음). 외장 디스크·NAS·버킷 중 하나가 생기면 백업 job 성공 뒤 사본을 하나 더 만드는 작은 작업이다.
2. **Cloudflare Access 미적용.** 패널이 공개 인터넷에서 로그인 화면까지 도달한다. 사용자가 "상관없다"고 판단했다. 계정 잠금·rate limit·CSP·짧은 세션이 그 전제 위의 방어다.
3. **`containers-dr-*` 이미지 5개**를 남겨 뒀다. 재해복구 드릴 산출물이라 정리 범위에서 뺐다. 지울지 확인이 필요하다.
4. HSTS `preload` 미적용 — 등재 취소가 어려워 운영자 판단이 필요하다.

## 7. 환경 & 전제

- **런타임**: Bun 1.3.14 workspace(`apps/*` 4 + `packages/*` 4 = 8), TypeScript strict + `exactOptionalPropertyTypes` + `noUncheckedIndexedAccess`.
- **스택**: Hono 4.13.0, Next.js 16.3.0 App Router + React 19 + React Compiler + Tailwind v4 + next-intl(ko/en/ja) + TanStack Query v5, Drizzle + SQLite, Better Auth 1.6.25.
- **접속**: `http://127.0.0.1:18080`. **8080 이 아니다** — macOS Docker Desktop 이 그 포트에서 저속 스트림을 버퍼링한다.
- **계정**: 실운영 owner 하나(사용자 본인). seed 계정은 남아 있지 않다. **공개 주소가 설정된 스택에서 `bun scripts/seed-e2e.ts` 는 스스로 거부한다** — 개발 스택에서만 쓴다. 계정을 초기 상태로 되돌리는 것은 `bun scripts/reset-accounts.ts --confirm` 이며 파괴적이라 사용자가 직접 실행한다.
- **재인증 창**: 위험한 쓰기(API key 발급, nginx 설정 적용, 백업 복원, 아티팩트 삭제 등)는 **세션 생성 15분 이내**를 요구한다(`RECENT_AUTH_REQUIRED`). 페이지 새로고침으로는 갱신되지 않고 로그아웃 → 로그인이어야 새 세션이 생긴다. 쿠키는 호스트별이라 `127.0.0.1` 과 `hyuns.uk` 세션은 별개다.
- **외부**: `hyuns.uk` 가 Cloudflare 터널로 연결돼 있고 패널 공개 주소도 `https://hyuns.uk` 로 설정돼 있다(패널 설정 화면). nginx 패널 server 블록의 `server_name` 에 자동으로 추가된다. 터널은 스택 밖 호스트 프로세스라 초기화·재배포와 무관하다.
- **`Bun.YAML.parse` 가 존재한다** — compose 파싱에 새 의존성이 필요 없다. multi-document 는 첫 문서만 쓴다.
- **SQLite 주의 3가지**: ① `PRAGMA foreign_keys` 는 트랜잭션 안에서 무시된다(테이블 재생성 마이그레이션이 실패한다). ② Drizzle `text({ enum: [...] })` 는 TypeScript 전용이고 CHECK 제약을 만들지 않는다. ③ **`bun:sqlite` 는 연결마다 외래 키가 기본 OFF 다.** 앱은 `database.ts` 에서 켜지만 스크립트는 스스로 켜야 하며, 끄고 지우면 `set null`·`cascade` 가 조용히 실행되지 않는다 → [bug](./bug/2026-08-06-reset-accounts-broke-referential-integrity.md)
- **시각 컬럼은 초 단위다**: Drizzle `integer({ mode: 'timestamp' })` 는 밀리초를 버린다. 해시·비교에 시각을 넣을 때 밀리초까지 쓰면 저장·재계산이 어긋난다 → [bug](./bug/2026-08-06-audit-chain-hashed-milliseconds.md)
- **nginx 설정 정본은 관리 볼륨의 `current.conf`** 다. `infra/nginx/nginx.conf` 는 볼륨이 비었을 때 이미지에서 복사되는 기본값이다. **볼륨만 비우고 이미지를 재빌드하지 않으면 옛 기본값이 복사된다**(이번 세션에 CSP 수정이 한 번 유실됐다). 실행 중 반영은 `POST /api/nginx/config/apply`.
- **새 workspace 패키지**: `apps/*/Dockerfile` 4개에 `COPY` 2줄씩 추가한다.
- **드리즐 마이그레이션**: 손으로 SQL 을 쓰지 말고 `bun run --cwd packages/db-schema generate` 를 쓴다. 최신은 `0026_brave_zarek.sql`.
- **웹 테스트는 preload 가 달라** raw `bun test` 가 아니라 `bun run test` 를 써야 한다.
- **브라우저 실측 팁**: MCP `file_upload` 로 `<input type=file>` 에 파일을 넣으면 React state 가 갱신되지 않는다. 페이지 컨텍스트에서 `DataTransfer` 로 `input.files` 를 채우고 `change` 이벤트를 직접 dispatch 해야 폼이 인식한다. 업로드 digest 는 클라이언트가 계산하므로 sha256 불일치는 UI 로 만들 수 없다 — 실패 경로는 잘못된 tar 로 만든다.
- **명령**: `bun run typecheck` / `lint` / `test` / `build` / `format:check`, `bun audit`, `bun run audit:runtime`, `docker compose build && docker compose up -d --wait`, `./scripts/setup.sh`, `./scripts/setup-macos.sh`, `./scripts/setup-cloudflare-tunnel.sh`, `./scripts/migration-dry-run.sh`, `bun scripts/seed-e2e.ts`, `bun scripts/reset-accounts.ts`.

## 8. 다음 세션 TODO

계획서(PLAN-UX-REMEDIATION)는 전부 닫혔다. 다음 마일스톤은 아래에서 고른다. **위에서부터 값이 크다.**

1. **알림 실전송 확인 (5분, 사용자 1단계 필요)** — 알림 대상에 Discord webhook 을 등록하고 `system.report` 를 구독한 뒤 테스트 버튼으로 전송을 확인한다. 이걸 하기 전에는 **감사 체인 꼬리 자르기 탐지가 실제로 동작하지 않는다**(외부 checkpoint 가 이 알림이다). 첫 정기 보고는 마지막 보고가 24시간 지난 뒤 1시간 단위 tick 에서 나간다.
2. **오프박스 백업** — 저장 위치가 정해지면 백업 job 성공 뒤 사본을 하나 더 만든다. 목적지만 다르고 모양은 같다(다른 디스크 / NAS·ssh / R2·S3). 보류 사유는 §6-1.
3. **새 머신 설치 E2E** — 2번과 짝이다. 백업을 다른 머신에 올려 처음부터 세우는 절차를 한 번 해본다. 지금은 해본 적이 없어 복구 가능 여부가 미지수다.
4. **부하·장애 주입** — 목표 규모 부하 테스트, 디스크 가득 참·docker 데몬 재시작·컨테이너 OOM 시 동작 확인. SQLite 단일 파일의 한계를 실측으로 잡는다.
5. **감사 로그 export** — server-side filter 는 있고 export 가 없다(HANDOFF-STATUS P1-7).
6. **UI 품질** — 모바일·다크·키보드·스크린리더 전수 검증(P2-2), 대시보드 정보 구조 재설계(P2-1).

### 새 세션이 먼저 할 일

1. 이 문서 §2.1(실운영 판정)·§6(미해결)·§7(환경) 을 읽는다.
2. [RESUME-CHECKLIST.md](./RESUME-CHECKLIST.md) §3 읽기 전용 점검으로 현재 값을 직접 확인한다(문서 수치를 믿지 않는다).
3. 코드를 건드리면 종료 전 `bun run typecheck` → `lint` → `test` → `build`, 스택이 떠 있으면 `bun run audit:runtime` 까지 통과시킨다.

## 9. 문서 지도

| 문서                                                                                                  | 다루는 것                                                                              |
| ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `HANDOFF.md`                                                                                          | (이 문서) 세션 인수인계 단일 진입점. **현재 상태·검증 수치·다음 작업의 단독 소유자**   |
| `PLAN-UX-REMEDIATION.md`                                                                              | **완료된** 실행 계획(2026-08-06 전 항목 종료). 항목별 문제·근거·주의·완료 판정·실측    |
| `quality-assurance/2026-08-05-panel-ux-audit.md`                                                      | UX 감사 원본(64건 → 44건 → 12원인) + 배포 런타임 실측                                  |
| `../CLAUDE.md`                                                                                        | 저장소 에이전트 실행 규칙(호스트 격리 우회·서비스 노출 금지)                           |
| `RESUME-CHECKLIST.md`                                                                                 | 재개 절차와 안전 불변식, 읽기 전용 점검 명령                                           |
| `HANDOFF-STATUS.md`                                                                                   | 구현 범위·한계·시점 검증 증거                                                          |
| `PROCESS.md`                                                                                          | 작업 체크리스트(시간순 전체 이력) + 초기화 기록                                        |
| `ARCHITECTURE.md`                                                                                     | 서비스 구성, 네트워크·권한 경계, 데이터 흐름                                           |
| `TECH-STACK.md`                                                                                       | 기술 선택과 근거                                                                       |
| `SECURITY.md`                                                                                         | 위협 모델·권한. §9 리댁션 적용 범위, §17 런타임 프로필, §18 라우트 검증, §19 배포 진단 |
| `EXPOSURE.md`                                                                                         | 외부 노출, 터널, 공개 주소                                                             |
| `RUNBOOK.md`                                                                                          | 사고 시나리오별 조치                                                                   |
| `BACKUP-RESTORE.md`                                                                                   | 백업 세트, 복구 2모드, 재해복구                                                        |
| `CONTROL-PLANE-UPGRADE.md`                                                                            | 업그레이드·롤백, migration dry-run                                                     |
| `NGINX-TRAFFIC.md`                                                                                    | Nginx 설정·리로드·트래픽 수집, 라우트 대상 검증                                        |
| `API-DATA-AUTH.md`                                                                                    | API 표면, 인증 3층, 세션/쿠키 계약, 에러 코드, job event `detail` 계약                 |
| `DOCKER-CONTROL.md`                                                                                   | 컨테이너·이미지·네트워크·볼륨 제어, 요약 계약과 런타임 프로필                          |
| `UPLOAD-DEPLOYMENT.md`                                                                                | 업로드·검사·배포·롤백, manifest 런타임, 실패 시 진단 보존                              |
| `UI-UX.md`                                                                                            | 화면 규칙과 구현 현황                                                                  |
| `SHADCN-COMPONENTS.md`                                                                                | 컴포넌트 목록과 CLI 대신 공식 소스 이식                                                |
| `TESTING.md`                                                                                          | 검증 사다리와 checkpoint                                                               |
| `llm.txt`                                                                                             | AI용 자족 레퍼런스. `packages/db-schema/src/llm-reference.test.ts` 가 드리프트를 강제  |
| `README.md`                                                                                           | docs 디렉터리 안내                                                                     |
| `acknowledge/`                                                                                        | 결정 기록(ADR). **최신 0042**                                                          |
| `bug/`                                                                                                | 결함 기록 9건. 2026-08-06 만 6건이고 전부 라이브 실측이 잡았다(정적 검사는 통과했다)   |
| `quality-assurance/`                                                                                  | 감사·드릴 실행 기록                                                                    |
| `history/`                                                                                            | 세션별 이력. 2026-08-06 브랜치 정리 기록 포함(지운 브랜치 SHA)                         |
| `ci-examples/`                                                                                        | 빌드 CI 3종 + 배포 스크립트 `containers-deploy.sh` + 이를 부르는 CI 3종                |
| `ci-examples/`                                                                                        | 빌드 CI 3종 + API key 배포 스크립트 1개와 이를 부르는 GitHub·Gitea·GitLab 워크플로 3종 |
| `history/`                                                                                            | 세션별 시점 기록(현재 상태 아님)                                                       |
| `PRODUCT-REQUIREMENTS.md`·`REQUIREMENTS-TRACEABILITY.md`·`IMPLEMENTATION-PLAN.md`·`OPEN-DECISIONS.md` | 요구사항·추적·초기 계획(시점 기록)                                                     |

## 10. 복기 신뢰도

- **직접 실측한 것은 신뢰도가 높다**: 배포 실패 진단(exit 3 이미지), job 실패 배너(잘못된 tar), CSP 수정 전후(`WebAssembly.compile` 실패→성공), 초기화 후 스택 healthy·`readyz` 6종 ok·FK 위반 0.
- **정적 검사만 거친 것**: 3.1 compose 변환기는 단위 테스트 13건만 통과했고 **실제 compose 파일을 올려 스택을 배포한 적이 없다**(3.2·3.3 미구현). 6.2 에서 실측한다.
- **이 문서의 코드 참조는 2026-08-06 에 전수 대조했다.** 대조에서 나온 불일치 32건은 이 문서를 포함한 docs 전반에 반영했다.
