# 웹 패널 UX 감사 — 2026-08-05

- 대상: 사용자가 기대한 흐름 **tar 업로드 → 이미지 → 컨테이너 기동 → nginx 도메인 연결**
- 계기: 사용자 평가 "UIUX 적인 부분이 매우 빈약한것 같다"
- 방법: 6개 축으로 병렬 감사(에이전트 71개, opus/medium) → 발견마다 **반증 검증** → 통과분만 병합
- 규모: 원본 **64건** 중 검증 통과 **44건**, 원인 기준 **12개**로 병합
- 축별 분포: input-affordance 11 · feedback-state 8 · route-linkage 7 · i18n-a11y 7 · compose-gap 6 · flow-continuity 5
- 심각도: blocker 8 · major 18 · minor 18

라이브 실측으로 별도 확인한 배포 런타임 결함 2건은 §13 에 있다.

> 검증 통과분 중 **1건은 이후 직접 확인에서 오탐으로 판명**됐다. "관리 plane 컨테이너가 라우트 대상 목록에 노출된다"는 주장인데, engine-agent 의 `getContainers` 가 `isManagementPlaneResource(container.Labels)` 로 이미 걸러낸다(`apps/engine-agent/src/service/domain/create-engine-query-service.ts:150`). 실 API 응답에도 없다. 반증 검증을 거쳐도 오탐이 남는다는 사례로 남긴다.

---

원본 44건을 원인 기준 12개로 병합. 사용자가 기대한 흐름(**tar 업로드 → 이미지 → 컨테이너 기동 → nginx 도메인 연결**)을 실제로 **막는 것(P0)** / 흐름은 되지만 마찰이 큰 것(P1) / 품질 결함(P2)으로 구분.

---

## P0 — 흐름을 실제로 깨뜨림 (조용히 실패)

### [blocker] 1. 라우트 대상(컨테이너·포트·네트워크)이 어디에서도 검증되지 않아 502로만 드러남

원본 5건 병합: free-text datalist / 존재 검증 없음 / 네트워크 소속 미검증 / 보호 컨테이너 노출 / 죽은 라우트 미표시.

**근거**

- `apps/web/src/features/nginx/nginx-route-create-form.tsx:116-128` — `<Input list="route-container-options">` + `<datalist>`. 같은 파일 `:155-163` protocol 은 진짜 `Select`.
- `packages/contracts/src/nginx.ts:38,54` — `containerTargetPattern` 정규식 형식 검사만.
- `apps/api/src/service/domain/nginx/create-nginx-proxy-route-service.ts:178-201` — protectedHostnames / assertProtectedTarget / findCollision 뿐. 컨테이너 존재·네트워크 조회 없음. 서비스 deps(`:39-45`)에 조회 수단 자체가 없음.
- 같은 파일 `:59` — `set $containers_route_upstream "http://${targetContainer}:${targetPort}"; proxy_pass $containers_route_upstream;` + `infra/nginx/nginx.conf:20 resolver 127.0.0.11` → **변수 proxy_pass 라 `nginx -t` 도 reload 도 성공**하고 요청 시점에만 실패.
- nginx 는 `compose.yaml:58-61` control/edge/ingress 에만 붙는데, `apps/web/src/widgets/container/container-create-widget.tsx:46` 은 모든 bridge 네트워크를 선택 가능하게 함.
- 후보 목록에 관리 plane 포함: `apps/api/src/compose/compose.ts:90-101 PROTECTED_CONTAINERS` 를 `app/[locale]/(panel)/nginx/routes/page.tsx:35` 이 걸러내지 않음 → 제출 후 409.
- 목록에도 경고 없음: `apps/web/src/features/nginx/nginx-route-table.tsx:41-50` 은 `targetContainer:targetPort` 문자열만 출력.

**사용자 영향** 이름 한 글자 오타, 중지된 컨테이너, `containers_edge` 밖 네트워크 — 어느 경우든 폼 통과·API 200·nginx reload 성공·라우트 테이블 정상 표시. 도메인 접속 시 502 만 나고 패널 어디에도 단서가 없다. 흐름 4단계 실패의 최빈 경로.

**수정안**

- `packages/contracts/src/engine.ts:32-41` `containerSummarySchema` 에 `exposedPorts`, `networks`, `protected` 추가(engine-agent `/containers/json?all=true` 응답에 이미 존재).
- `apps/web/src/features/nginx/nginx-route-create-form.tsx` — `Input+datalist` → `Select`. 옵션 = 실행 중 + `containers_edge` 소속 + 비보호 컨테이너. 선택 시 `exposedPorts` 로 targetPort 자동 채움.
- `apps/api/src/service/domain/nginx/create-nginx-proxy-route-service.ts` — deps 에 engine 조회 추가, `create`/`upsert` 에서 존재·네트워크 검증 후 전용 에러 코드(`NGINX_ROUTE_TARGET_NOT_FOUND` / `NGINX_ROUTE_TARGET_UNREACHABLE`)로 400. API key 경로도 같은 실수가 가능하므로 서버 검증 필수.
- `apps/web/src/features/nginx/nginx-route-table.tsx` — 컨테이너 목록과 대조해 미존재/비실행 시 경고 Badge(선례: `apps/web/src/widgets/image/image-widget.tsx:84-86`).

---

### [blocker] 2. 대상 포트를 알아낼 수단이 raw JSON 덤프뿐

**근거**

- `packages/contracts/src/engine.ts:32-41` 목록 계약에 포트 없음. `:53 exposedPorts` 는 상세 계약에만.
- `apps/web/src/widgets/container/container-detail-card.tsx:69-82` — `<dl>` 은 id/image/status 3개. props 타입이 `ContainerSummary` 라 접근조차 불가.
- 유일 노출 경로 `:109 <pre>{inspectOutput}</pre>` = `container-control-widget.tsx:56-59` 의 `JSON.stringify(inspectDetail.data, null, 2)` + 로그 이어붙인 문자열.
- `nginx-route-create-form.tsx:137-146` 포트 입력에 defaultValue·placeholder 없음.

**사용자 영향** 라우트를 만들려면 `/containers` → 선택 → 점검·로그 → JSON 덩어리에서 `exposedPorts` 를 눈으로 찾아 외우고 → `/nginx/routes` 로 복귀해 hostname 부터 재입력. 틀리면 1번과 동일하게 502.

**수정안** `containerSummarySchema` 에 `exposedPorts` 추가(1번과 동일 작업) → `container-detail-card.tsx` `<dl>` 에 노출 → 라우트 폼 포트 자동 채움.

---

### [blocker] 3. durable job 실패가 화면에 전혀 표시되지 않음

**근거**

- `apps/web/src/entities/job/job.query.ts:49-52` — `status !== SUCCEEDED` 면 early return. `FAILED` 분기 없음. `:58 error` 는 상세 조회 HTTP 실패만 잡음.
- 소비 위젯이 `error`/`status` 를 구조분해조차 안 함: `widgets/artifact/artifact-widget.tsx:37`, `widgets/artifact/artifact-upload-form.tsx:30`.
- API 는 실패를 명확히 기록: `apps/api/src/service/domain/job/create-operation-job-service.ts:252-254`, 실패 코드 `create-job-handlers.ts:29,204`(ARTIFACT_DIGEST_MISMATCH / UPLOAD_INCOMPLETE).

**사용자 영향** tar finalize 실패·이미지 load 실패에도 직전 성공 토스트만 남고 스피너가 조용히 사라진다. `onSucceeded` 만 목록을 invalidate 하므로 아티팩트 목록도 안 바뀐다. 실패 사실은 `/jobs` 를 직접 열기 전까지 모른다 → 1단계에서 흐름이 끊겼는데 사용자는 성공했다고 믿는다.

**수정안**

- `apps/web/src/entities/job/job.query.ts` — `onFailed`/`onSettled` 콜백과 `failureCode`·`status` 반환 추가. `refetchInterval` 을 함수형으로 바꿔 `ACTIVE_JOB_STATUSES` 일 때만 폴링(현재 종료 후에도 1초마다 무한 폴링 + effect 재실행).
- `widgets/artifact/artifact-widget.tsx`, `artifact-upload-form.tsx` — 실패 토스트 + 인라인 에러 배너, 진행률 초기화.

---

## P1 — 흐름은 완주 가능하나 마찰이 큼

### [major] 4. 4단계 사이에 이동 링크가 하나도 없음

**근거** `apps/web/src` 전체 문맥 `Link href` 6건뿐 — `traffic-summary-widget.tsx:26`, `image-widget.tsx:65`, `container-create-widget.tsx:116`, `container-control-widget.tsx:125`, `containers/page.tsx:32`, `infrastructure/page.tsx:33`. artifacts→images, images→containers/new, containers→nginx/routes 링크 없음. `container-create-widget.tsx:81-88` 은 생성 성공 시 `router.push('/containers')` 로 끝. `overview-widget.tsx:39-85` 는 상태 카드 6장뿐이고 링크·CTA·빈 상태 안내 없음. artifact 로드 성공 시 서버가 준 `messages`(`Loaded image: name:tag`)를 버림(`artifact-widget.tsx:52-59`).

**사용자 영향** 각 단계를 끝내도 다음이 무엇인지 화면에 없다. 사이드바 8섹션 24항목(`shared/lib/navigation.ts:21-88`)에서 스스로 찾아야 하고, 세 단계가 서로 다른 nav 그룹에 흩어져 흐름이라는 인식이 생기지 않는다. 태그 없는 tar 는 이미지 Select 에 sha256 으로 나열됨(`container-create-widget.tsx:161-162`).

**수정안**

- `artifact-widget.tsx` — 로드 결과 `messages` 파싱해 생성된 태그 표시 + `/containers/new?image=<tag>` 버튼.
- `image-widget.tsx` — 행마다 "이 이미지로 컨테이너 만들기".
- `container-create-widget.tsx` — 성공 시 `/containers?selected=<id>`, 성공 토스트/상세에 `/nginx/routes?container=<name>&port=<containerPort>`.
- `overview-widget.tsx` — 0건 상태 기반 4단계 온보딩 카드.
- `shared/common/page-header.tsx` 의 `actions` 를 artifacts/images/nginx routes 페이지에도 채움.

### [major] 5. 서버가 준 실패 사유를 클라이언트가 버림

원본 4건 병합.

**근거**

- `apps/web/src/features/nginx/nginx-route-create-form.tsx:56-65` — 모든 zod issue 를 `labels.invalidValue` 단일 문구로 덮어씀. `messages/*.json:245` 각 1개. 게다가 `:167-189` timeout·bodySize 는 오류 `<p>` 와 `aria-describedby` 자체가 없음(hostname `:84-96` 은 있음).
- `apps/web/src/features/deployment-manifest-form/deployment-manifest-form.tsx:49-73` — 클라 검증 0. 서버 400 본문은 `@hono/standard-validator` 가 `{ error: issue[] }` 배열로 반환하는데 `shared/lib/parse-api-error.ts` 는 `error: { message }` 객체만 파싱 → `client-fetch.ts:6` 이 하드코딩 `'요청 실패'` throw.
- `apps/web/src/widgets/container/container-create-widget.tsx:82`, `widgets/prune/prune-widget.tsx:51`, `container-control-widget.tsx:73,87,97` — `onError: () => toast.error(t('...'))` 로 error 인자 자체를 안 받음. 반면 `image-widget.tsx:39`, `deployment-widget.tsx:55` 등 다수는 제대로 사용.
- `apps/web/src/features/infrastructure/network-create-form.tsx:36-45`, `volume-create-form.tsx:21-24` — 검증·errors state 없음. 계약(`engine-control.ts:205-222`)은 name 정규식 + subnet CIDR + `gateway 는 subnet 필요` refine 을 요구.
- `apps/api/src/lib/error-message.ts` 는 한국어 고정인데 `parse-api-error.ts` 가 `error.code` 를 버려 en/ja 로케일에 한국어가 그대로 노출. `docs/acknowledge/0002-product-decisions.md:88` 결정 위반.

**사용자 영향** 이름 중복·이미지 없음·포트 충돌·CIDR 오류가 전부 "요청 실패"/"값을 다시 확인하세요" 한 줄. 필드 표시도 없어 하나씩 지우며 이분탐색해야 한다.

**수정안**

- `shared/lib/parse-api-error.ts` — `{ error: { code, message } }` 와 `{ error: issue[] }` 두 형태를 union 으로 지원하고 `code`·`path` 를 보존.
- `messages/*.json` — 에러 코드 → 로케일 문구 맵 추가.
- `container-create-widget.tsx:82`, `prune-widget.tsx:51`, `container-control-widget.tsx:73,87,97` — `error instanceof Error ? error.message : t(fallback)` 패턴으로 통일.
- `nginx-route-create-form.tsx` — `issue.message`/`issue.code` 별 문구, timeout·bodySize 오류 문단 추가. 6필드 반복이므로 `FormField` 래퍼로 묶으면 누락이 구조적으로 불가능.
- `deployment-manifest-form.tsx`, `network-create-form.tsx`, `volume-create-form.tsx` — 제출 전 대응 스키마 `safeParse` + 필드별 오류.

### [major] 6. 라우트 수정 기능이 없음 — 포트 하나 바꾸려면 삭제 후 재생성

**근거** `apps/api/src/route/nginx/create-nginx-route.ts:23` 이 `Pick<NginxProxyRouteService, 'create'|'list'|'remove'>` 만 받음. `upsert` 는 `create-nginx-proxy-route-service.ts:231` 에 구현돼 있고 배포 릴리스만 사용(`compose-deployment-release.ts:19`). 웹도 create/remove 뿐(`entities/nginx/nginx.query.ts:48-76`). `create` 는 `findCollision` 으로 덮어쓰기 차단, `remove` 는 hostname+path 정확 입력 강제(`:221`). 또한 `pathMode: 'exact'`·`enabled` 는 폼에서 하드코딩(`nginx-route-create-form.tsx:45,48`)이라 도달 불가한데, 서버는 둘 다 실제로 사용(`:54 location = `, `:75 filter(enabled)`).

**사용자 영향** 오타 수정에 확인 문자열 타이핑 + 삭제~재생성 사이 도메인 404. 라우트를 일시 정지할 방법이 없어 끄려면 삭제뿐.

**수정안** `create-nginx-route.ts` 에 `PUT /nginx/routes/:id` 로 기존 `upsert` 노출 → `nginx.query.ts` 에 `useUpdateNginxRoute` → `nginx-route-table.tsx` 행에 수정 버튼(생성 폼을 초기값 prop 으로 재사용). 같은 폼에 `pathMode` Select 와 `enabled` Switch 추가.

### [major] 7. 배포가 만든 라우트와 수동 라우트가 구분되지 않아 서로를 깰 수 있음

**근거** 릴리스가 같은 서비스로 upsert(`create-deployment-release-service.ts:96-107,431`). `packages/db-schema/src/schema.ts:380-401` `nginx_route` 에 소유자 컬럼 없음. `nginx-route-table.tsx:38-70` 은 전 행에 동일 삭제 버튼. `remove`(`:214-229`)에 소유권 가드 없음. `server.ts:178` 의 `nginx-route-reconcile` 은 DB→config 렌더라 삭제된 행을 복구하지 않음. 역방향 충돌 시 메시지는 `error-message.ts:124` "Nginx 라우트가 이미 존재합니다." 뿐.

**사용자 영향** 배포 라우트를 수동 삭제하면 서비스가 즉시 끊기고 자동 복구되지 않는다. 반대로 같은 도메인을 수동 생성하려면 원인 불명 409.

**수정안** `schema.ts` 에 `managedBy`(manifest id) 추가 → 릴리스가 채움 → `nginx-route-table.tsx` 에 "배포 관리" 배지 + 수동 삭제 차단/경고 → 충돌 에러 `details` 에 상대 manifest 명 포함.

### [major] 8. job 진행 상황을 볼 수 없음

원본 3건 병합.

**근거**

- `entities/job/job.query.ts:15-19` `jobListQueryOptions` 에 `refetchInterval` 없음 + 전역 `staleTime 60_000`(`query-provider.tsx:6,12`) → `/jobs` 가 정지 화면. 비교: `entities/deployment/deployment.query.ts:30-33` 은 활성 중 조건부 폴링.
- `apps/api/src/route/job/create-job-route.ts:88-99 GET /jobs/:id/events` 와 `create-operation-job-service.ts:282-284 reportProgress` 가 단계·상세를 계속 기록하는데 웹이 한 번도 호출하지 않음(`apps/web/src` 에 `/events` grep 0건). `progressStep` 은 `job-widget.tsx:129` 에서 id 대체 텍스트로만 사용.
- 전역 셸(`widgets/panel-shell/panel-shell-nav.tsx`)·개요 어디에도 활성 job 배지 없음. `useOperationJobPolling` 은 컴포넌트 로컬 state 라 화면을 벗어나면 추적 소멸.

**사용자 영향** 업로드·로드·배포를 걸고 다른 화면으로 가면 진행 중이라는 사실이 사라진다. `/jobs` 를 기억해 직접 열고 수동 새로고침해야 한다.

**수정안** `job.query.ts` 에 활성 시 조건부 폴링 + 이벤트 조회 쿼리 추가 → `job-widget.tsx` 행 확장에 타임라인 → `panel-shell-nav.tsx`/`overview-widget.tsx` 에 활성·실패 배지.

### [major] 9. 대용량 업로드 재개·취소 불가

**근거** 서버는 재개 전제로 설계됨 — `create-upload-service.ts:186 offsetBytes !== session.receivedBytes → OFFSET_MISMATCH`, `:246,258` 동일 idempotency-key 재사용 시 기존 세션 반환. 그런데 `entities/artifact/artifact.query.ts:49` 는 매번 `crypto.randomUUID()`, `:56` 은 항상 `offset = 0` 부터. `apps/web/src` 전체에 `AbortController` 0건. 추가로 `:261-265` 활성 세션 상한 2건 + TTL 24시간 → 두 번 끊기면 세 번째는 `UPLOAD_CONCURRENCY_LIMIT` 으로 아예 차단.

**수정안** `artifact.query.ts` — 파일 sha256 기반 idempotency-key 로 세션 재사용하고 `session.receivedBytes` 부터 루프 시작. mutation 에 AbortController 연결 → `artifact-upload-form.tsx` 에 취소 버튼 + `onSettled` 진행률 초기화(현재 100%/실패 시점 값이 잔상으로 남음).

---

## P2 — 품질·접근성

### [minor] 10. nginx GUI 편집기가 컨테이너를 모름

`widgets/nginx/nginx-upstream-editor.tsx:169-175` upstream address 가 제안 없는 자유 텍스트. `widgets/nginx/` 전체에 컨테이너 조회 훅 0건. `/nginx` 와 `/nginx/routes` 의 역할 차이 설명·상호 링크 없음(사이드바 형제 항목이기만 함).
**수정안** address 에 컨테이너 후보 제공, 두 페이지 `PageHeader` 에 역할 설명 + 상호 링크.

### [minor] 11. 접근성 결함 4건

- `widgets/nginx/nginx-directive-editor.tsx:135-147` — `Label htmlFor` 가 Checkbox 를 가리켜 값 Input 108개·Select 47개가 접근 가능한 이름 없음. `nginx-block-editor.tsx:97-101`, `nginx-upstream-editor.tsx:287-292` 도 동일. → Input 에 id 이관 또는 `aria-label={entry.name}`, 체크박스는 별도 `aria-label`.
- `shared/ui/table.tsx:5-9` — `overflow-x-auto` 컨테이너에 `tabIndex`/`role` 없음. `traffic-live-tail.tsx:72-95` 는 포커스 가능 요소가 없어 키보드로 넘친 컬럼 접근 불가. → `tabIndex={0}` + `role="region"` + `aria-label`. 한 파일 수정으로 전 표 적용.
- `widgets/panel-setting/panel-setting-widget.tsx:92,145` — 컨트롤 없는 `<Label>` 2곳(103건 중 유일 예외). → 제목 요소 + `aria-labelledby`.
- `aria-live` 0건 — `features/deployment-release-progress/deployment-release-progress.tsx:42-55` 의 단계 전이(creating→probing→observing→healthy)가 announce 되지 않음. toast 는 시작 시점에만 뜸. → 상태 영역을 `aria-live="polite"` 로.

### [minor] 12. 삭제 확인 다이얼로그 피드백

`features/confirm-remove-dialog/confirm-remove-dialog.tsx:67` `truncate` 로 입력해야 할 값이 잘리고 `title` 없음, `:78` 불일치 시 버튼 비활성만. → `break-all` + 복사 버튼 + 불일치 안내 문구.

---

## compose 미지원 — 사용자 기대와의 간극

**현재 제품에 compose 개념이 없다.** manifest 1개 = 컨테이너 1개다.

- `packages/contracts/src/deployment.ts:19-61` — `imageDigest`·`internalPort`·`name`·`route` 전부 단수. 서비스 배열도 `dependsOn` 도 없음.
- `create-deployment-release-service.ts:383` — 릴리스당 `createContainer` 호출 1회, 루프 없음. `deploymentReleaseSchema:94-95` 의 `containerId`/`containerName` 도 단수.
- `apps/api/src/route/deployment/` 전수: manifests(GET/GET:id/POST), releases(GET/GET:id/rollback), secrets, artifacts/:id/load. **compose 업로드·파싱·스택 엔드포인트 없음.**
- 저장소에서 compose 를 언급하는 유일한 지점은 금지 라벨(`packages/contracts/src/engine-control.ts:117 'com.docker.compose.project'`)과 이 저장소 자체 인프라 스택이다.

**간극의 실제 모습**

1. 앱+DB+캐시처럼 2개 이상 컨테이너로 된 서비스는 manifest 를 컨테이너 수만큼 따로 만들어야 하고, 기동 순서·서비스 간 이름 해석·공유 볼륨은 사용자가 머릿속으로 관리한다. 한 단위 배포·롤백·삭제 수단이 없다(롤백은 manifest 단위).
2. 설령 단일 컨테이너여도 **UI 가 계약의 절반을 하드코딩**해 compose 로 흔히 쓰는 기능에 도달할 수 없다 — `deployment-manifest-form.tsx:52-71` 이 `volumes: []`, `protocol: 'http'`, `restartPolicy`, `entrypoint: []`, `stripPrefix: false`, healthcheck 타이밍 4개, `pidsLimit` 을 고정. 계약(`deployment.ts:22,25-29,37-39,47,51-60`)은 전부 조절 가능한데 화면만 없다. **볼륨을 붙일 수 없으므로 상태 있는 컨테이너(DB)는 UI 로 배포 불가**, WebSocket 서비스도 불가, 기동이 느린 앱은 5초×6회 안에 못 뜨면 매번 실패.
3. `deployment-manifest-form.tsx:45,47` — 네트워크 Select 가 `name === 'containers_edge'` 로 필터되어 선택지가 최대 1개인 장식. `/infrastructure` 에서 만든 네트워크는 절대 나타나지 않고 이유 설명도 없다(서버는 임의 bridge 네트워크를 허용).
4. secret 바인딩은 `KEY=reference` 자유 텍스트(`:169-177`)이고 참조 후보를 제시하지 않는다(`useGetDeploymentSecrets` 는 별도 화면에만). manifest 생성 시 secret 존재 검증이 없어(`create-deployment-manifest-service.ts` deps 에 secret service 자체가 없음) 오타는 release 시점 `DEPLOYMENT_SECRET_UNRESOLVED` 로 터지고, 메시지에 어떤 reference 인지 없다. **manifest 는 수정 불가라 그 manifest 를 버리고 다시 만들어야 한다.**

**선택지**

- (a) 최소: manifest 에 `group` 추가 → group 단위 순차 릴리스 + 실패 시 group 롤백. UI 는 스택 카드에 서비스 N개.
- (b) 본격: `compose.yml` 업로드 → 서버에서 지원 필드(image/command/environment/volumes/ports/depends_on)만 manifest N개로 변환하고, 미지원 키는 업로드 화면에 "무시됨" 목록으로 명시.

어느 쪽이든 `features/deployment-release-progress` 를 서비스별 상태 행으로 확장해야 하고, (2)의 폼 하드코딩 해소가 선행돼야 한다.

---

## 권장 착수 순서

1. `containerSummarySchema` 확장(`exposedPorts`/`networks`/`protected`) — P0 1·2를 동시에 푸는 단일 변경점
2. 라우트 폼 Select 전환 + 서버 대상 검증
3. job 실패 분기(`job.query.ts`) + 소비 위젯 3곳
4. `parse-api-error.ts` 배열 지원 + `onError` 인자 사용 통일
5. 단계 간 CTA 링크 4곳
6. compose 지원 여부 결정 — 안 할 거면 최소한 manifest 폼 하드코딩 해소(볼륨·protocol·healthcheck)로 단일 컨테이너 범위라도 실사용 가능하게

---

## 13. 라이브 실측으로 확인한 배포 런타임 결함 2건

감사와 별개로, API key 만으로 CI 예시 순서를 그대로 돌려 확인한 것이다.

### [blocker] 표준 이미지가 배포되지 않는다

`apps/api/src/service/domain/deployment/create-deployment-release-service.ts:400` 이 `readOnlyRootFilesystem: true` 를 하드코딩하고, 생성된 컨테이너는 `CapDrop=[ALL]` + `no-new-privileges` + tmpfs 는 `/tmp` 하나뿐이다. **manifest 스키마에 이를 조정할 필드가 없다.**

실측 3회:

| 시도 | 이미지                                   | 결과                                                                                   |
| ---- | ---------------------------------------- | -------------------------------------------------------------------------------------- |
| 1    | 순정 `nginx:1.29-alpine`                 | `mkdir("/var/cache/nginx/client_temp") failed (30: Read-only file system)` → 즉시 종료 |
| 2    | temp 경로를 `/tmp` 로 옮긴 nginx         | `chown("/tmp/client_temp", 101) failed (1: Operation not permitted)` → CAP_CHOWN 없음  |
| 3    | busybox httpd, non-root, 8080, 쓰기 없음 | **release healthy**                                                                    |

즉 이 제약을 알고 전용으로 빌드한 이미지만 배포된다. 패널 사용자가 가장 먼저 시도할 정적 웹서버가 정확히 실패하는 케이스인데, `docs/ci-examples/github-actions-deploy.yml` 의 `Build image` 단계는 평범한 Dockerfile 을 가정하고 이 요구사항을 한 줄도 적지 않는다.

**수정안** — manifest 에 `writablePaths`(tmpfs 마운트 목록)와 `capabilities`(추가 허용 목록, 화이트리스트 기반)를 추가하고 기본값은 지금 그대로 둔다. CI 예시와 `docs/UPLOAD-DEPLOYMENT.md` 에 런타임 제약을 명시한다.

### [major] 실패 원인이 어디에도 노출되지 않는다

컨테이너 로그에 원인이 명확히 찍혀 있는데 job·release 는 코드 하나만 남긴다.

```
job events:  {"code": "DEPLOYMENT_HEALTHCHECK_FAILED"}
release:     failureCode=DEPLOYMENT_HEALTHCHECK_FAILED, containerName=demo-a-1.0.0-...
```

exit code 도, 마지막 로그도 없다. `containerName` 은 저장하면서 그것으로 무엇을 볼 수 있는 경로를 주지 않는다. 원인 파악에 호스트 `docker logs` 가 필요했다.

**수정안** — probe 실패 시 대상 컨테이너의 `State.ExitCode` 와 마지막 로그 N줄을 job event `detail` 에 담고, release 상세 화면에 노출한다.

---

## 성공한 것 (같은 실측에서)

API key 만으로 전 구간이 완주한다. `docs/HANDOFF.md` 에 "토큰 단독 blue-green release 완주 라이브 미실측" 으로 남아 있던 항목이 이번에 해소됐다.

| 단계                             | 결과                                        |
| -------------------------------- | ------------------------------------------- |
| 업로드 세션 + 청크 + finalize    | job succeeded → artifact                    |
| `POST /api/artifacts/{id}/load`  | job succeeded, `/api/images` 에 digest 확인 |
| `POST /api/deployment-manifests` | 201                                         |
| `POST .../releases`              | job succeeded, release **healthy**          |
| nginx `server_name` 자동 생성    | `a.hyuns.uk` · `b.hyuns.uk`                 |
| 외부 `https://a.hyuns.uk`        | **200 `A SITE`**                            |
| 외부 `https://b.hyuns.uk`        | **200 `B SITE`**                            |

CI 예시 4종의 API 호출 순서·헤더·멱등키·재개 로직은 실제 API 와 일치한다(그대로 따라 해 완주). 다만 §13 의 blocker 때문에 예시대로 만든 이미지가 실제로 뜬다는 보장이 없다.

---

## 부록 — 검증 통과 발견 44건 원본

### flow-continuity

- **[blocker] artifact → 이미지 → 컨테이너 → nginx 라우트 4단계 사이에 이동 링크가 하나도 없다**
    - 근거: `grep -rn "Link href=" apps/web/src/{widgets,features,shared/common,app}` 전체 결과가 6건뿐이다: traffic-summary-widget.tsx:26 `href="/traffic"`, image-widget.tsx:65 `href="/registry"`, container-create-widget.tsx:116 `href="/registry"`, container-control-widget.tsx:125 `href="/containers/new"`, containers/page.tsx:32 `href="/containers/new"`, infrastructure/page.tsx:33 `href="/infrastructure/prune"`. 즉 ar
    - 영향: 업로드를 마친 사용자가 다음에 무엇을 할지 화면에서 전혀 알 수 없고, 좌측 사이드바(apps/web/src/shared/lib/navigation.ts:22-49)에서 '이미지·아티팩트' → '컨테이너' → 'Nginx' 섹션을 스스로 찾아 이동해야 한다. 세 섹션이 서로 다른 nav 그룹에 흩어져 있어 흐름이라는 인식 자체가 생기지 않는다.
    - 수정안: 각 단계 완료 지점에 다음 단계 CTA 를 넣는다. (1) artifact load 성공 후 위젯에 `/images` 및 `/containers/new` 버튼, (2) images 페이지 행마다 "이 이미지로 컨테이너 만들기" → `/containers/new?image=<tag>`, (3) 컨테이너 생성 성공 후 `/nginx/routes?container=<name>`, (4) PageHeader `actions` 를 artifacts/images/nginx routes 페이지에도 채워 전/후 단계로 이동 가능하게 한다.
    - 파일: `apps/web/src/widgets/artifact/artifact-widget.tsx`, `apps/web/src/widgets/image/image-widget.tsx`, `apps/web/src/widgets/container/container-create-widget.tsx`, `apps/web/src/app/[locale]/(panel)/artifacts/page.tsx`, `apps/web/src/app/[locale]/(panel)/images/page.tsx`, `apps/web/src/app/[locale]/(panel)/nginx/routes/page.tsx`
- **[major] nginx 라우트의 대상 컨테이너가 드롭다운이 아니라 datalist 붙은 자유 입력이고, 포트는 아무 힌트도 없다**
    - 근거: apps/web/src/features/nginx/nginx-route-create-form.tsx:115-128 — `<Label htmlFor="route-container">` 아래가 `<Input id="route-container" name="targetContainer" list="route-container-options" required ... />` + `<datalist id="route-container-options">{containers.map((container) => (<option key={container} value={container} />))}</datalist>`. Select 가 아니라 Input 이라 오타를 그대로 제출할 수 있고, datalist 는 브라우저별로 표
    - 영향: "드롭다운에서 컨테이너를 고른다"는 사용자의 기대와 실제 UI가 어긋난다. 컨테이너 이름을 정확히 기억해 타이핑해야 하고, 포트는 컨테이너 생성 화면으로 되돌아가 확인해야 한다. 이름·포트를 틀려도 폼 단계에서는 통과하고 라우트 생성 후 502 로만 드러난다.
    - 수정안: targetContainer 를 `Select` 로 바꾸고 옵션 라벨에 이미지 태그와 state 를 함께 노출한다(`my-app (my-app:1.0.0, running)`). 컨테이너 선택 시 해당 컨테이너의 `exposedPorts` 를 조회해 targetPort 를 기본값으로 채우거나 후보 목록으로 제시한다. 목록은 SSR prefetch 를 유지하되 폼에서 `useGetContainerList()` 로 구독해 방금 만든 컨테이너가 즉시 반영되게 한다.
    - 파일: `apps/web/src/features/nginx/nginx-route-create-form.tsx`, `apps/web/src/app/[locale]/(panel)/nginx/routes/page.tsx`, `apps/web/src/widgets/nginx/nginx-route-control-widget.tsx`, `packages/contracts/src/engine.ts`
- **[major] 컨테이너 생성 성공 후 목록으로만 이동하고 도메인 연결 단계로 유도하지 않는다**
    - 근거: apps/web/src/widgets/container/container-create-widget.tsx:81-88 — `{ onError: () => toast.error(t('containerCreateFailed')), onSuccess: () => { toast.success(t('containerCreated')); router.push('/containers') } }`. 이동 목적지가 `/containers` 목록이고, 방금 만든 컨테이너가 선택된 상태로 열리지도 않는다(apps/web/src/widgets/container/container-control-widget.tsx:46 `useMasterDetailSelection(containers)` 는 생성된 id 를 모른다).
    - 영향: 사용자 시나리오의 3단계에서 4단계로 넘어가는 지점이 완전히 끊긴다. 컨테이너를 만들어도 도메인에 붙이려면 사이드바에서 Nginx → 프록시 라우트를 스스로 찾아 들어가 컨테이너 이름을 다시 입력해야 한다.
    - 수정안: 생성 성공 시 `/containers?selected=<id>` 로 이동해 새 컨테이너가 선택된 상태로 열고, 상세 카드 또는 성공 toast 액션에 "도메인 연결" 버튼(`/nginx/routes?container=<name>&port=<containerPort>`)을 둔다. 폼에서 이미 입력받은 `containerPort`(container-create-widget.tsx:65,73)를 쿼리로 넘기면 라우트 폼의 포트까지 프리필된다.
    - 파일: `apps/web/src/widgets/container/container-create-widget.tsx`, `apps/web/src/widgets/container/container-control-widget.tsx`
- **[minor] nginx GUI 편집기의 upstream server 주소도 자유 텍스트라 컨테이너를 고를 수 없다**
    - 근거: apps/web/src/widgets/nginx/nginx-upstream-editor.tsx:169-175 — `<Input id={`upstream-address-${index}`} className="h-8 font-mono text-xs" value={model.address} onChange={(event) => updateServer(node, { address: event.target.value })} spellCheck={false} />`. 이 파일 어디에도 컨테이너 조회 훅이 없다(`useGetContainerList` 미사용). /nginx 페이지(apps/web/src/widgets/nginx/nginx-config-widget.tsx)와 /nginx/routes 페이지가 별개로 존재하
    - 영향: Nginx 를 GUI 로 편집하는 사용자는 `containers_edge` 네트워크상의 컨테이너 이름과 포트를 외워서 `name:port` 로 직접 타이핑해야 한다. 라우트 페이지와 설정 페이지 중 어느 쪽을 써야 하는지도 화면상 설명이 없다.
    - 수정안: upstream server 주소 입력에 컨테이너 목록 기반 제안(Select 또는 combobox)을 붙이고, /nginx 와 /nginx/routes 두 화면의 역할 차이를 PageHeader 설명과 상호 링크로 명시한다.
    - 파일: `apps/web/src/widgets/nginx/nginx-upstream-editor.tsx`, `apps/web/src/widgets/nginx/nginx-config-widget.tsx`
- **[minor] 대시보드 개요에 시작 안내가 없어 첫 진입 사용자가 흐름의 출발점을 모른다**
    - 근거: apps/web/src/widgets/overview/overview-widget.tsx:39-85 전체가 `ServiceStatusCard` 6개(api / engine / nginx / containers / traffic / disk)뿐이다. 링크도 CTA 도 없고, 컨테이너 0건일 때의 분기(`containerQuery.data?.length.toString() ?? PLACEHOLDER`, 64행)도 숫자 0 을 보여줄 뿐이다.
    - 영향: 모든 것이 0건인 최초 상태에서 사용자가 무엇부터 해야 하는지 알려주는 화면이 하나도 없다. 사이드바 8개 섹션 24개 항목(apps/web/src/shared/lib/navigation.ts:21-88) 중에서 스스로 찾아야 한다.
    - 수정안: 개요 페이지에 온보딩 카드를 추가한다. artifact 0건 / 이미지 0건 / 컨테이너 0건 / 라우트 0건 상태를 조회해 4단계 체크리스트로 렌더하고 각 단계가 해당 페이지로 이동하게 한다. 이미 완료된 단계는 체크 표시로 접는다.
    - 파일: `apps/web/src/widgets/overview/overview-widget.tsx`, `apps/web/src/app/[locale]/(panel)/page.tsx`

### input-affordance

- **[blocker] nginx 라우트의 대상 컨테이너가 자유 입력(datalist)이고 존재 검증이 없어, 오타는 도메인 접속 시 502로만 드러난다**
    - 근거: apps/web/src/features/nginx/nginx-route-create-form.tsx:116-128 — 앱 전체에서 유일한 datalist다.

```tsx
<Input
    id="route-container"
    name="targetContainer"
    list="route-container-options"
    required
```

계약은 문자열 정규식만 본다. packages/contracts/src/nginx.ts:54 `targetContainer: z.string().trim().regex(containerTargetPattern)`.
서버도 존재 여부를 확인하지 않는다. apps/api/src/service/domain/nginx/create-nginx-proxy- - 영향: 사용자가 기대하는 3단계(“드롭다운에서 컨테이너를 골라 도메인에 연결”)가 실제로는 DNS 이름을 손으로 타이핑하는 작업이다. datalist 는 브라우저마다 화살표 어포던스가 없어(특히 Safari/Firefox) 목록이 있다는 사실 자체가 보이지 않고, 클릭해도 자동으로 열리지 않는다. 이름을 한 글자 틀려도 폼 통과·API 200·nginx reload 성공·라우트 테이블에 정상 표시되고, 실패는 나중에 브라우저로 도메인에 접속했을 때 502 로만 나타난다. 이 시점에는 원인이 라우트인지 컨테이너인지 nginx 인지 패널 어디에도 단서가 없다. - 수정안: `<Input list=...>` 를 실제 `Select`(이미 같은 파일 :155-163 에서 protocol 에 쓰고 있다)로 바꾸고, 값으로 컨테이너 이름을 넣는다. 선택지가 곧 존재하는 컨테이너이므로 오타가 구조적으로 불가능해진다. 추가로 API `create` 에서 `engineAgentClient` 의 컨테이너 목록과 대조해 없는 이름이면 전용 에러 코드(예: NGINX_ROUTE_TARGET_NOT_FOUND)로 400 을 반환한다 — 패널 외 경로(API key)로도 같은 실수가 가능하므로 서버 검증이 필요하다. - 파일: `apps/web/src/features/nginx/nginx-route-create-form.tsx`, `apps/api/src/service/domain/nginx/create-nginx-proxy-route-service.ts`, `packages/contracts/src/nginx.ts`

- **[blocker] 대상 포트를 알아낼 방법이 raw docker inspect JSON 밖에 없다 — 컨테이너 목록 계약에 포트가 아예 없다**
    - 근거: 목록 계약에 포트 필드가 없다. packages/contracts/src/engine.ts:32-41

```ts
export const containerSummarySchema = z.object({
    command: z.string(),
    createdAt: z.iso.datetime(),
    id: z.string().min(1),
    image: z.string().min(1),
    imageId: z.string().min(1),
    labelKeys: z.array(z.string()),
    names: z.array(z.string()),
    state: z.string().min(1),
    status: z.string().min(1),
})
```

포트는 상 - 영향: 라우트를 만들려면 사용자가 “이 컨테이너가 몇 번 포트를 여는가”를 이미 알고 있어야 한다. 모르면 /containers 로 이동 → 컨테이너 선택 → ‘점검·로그’ 버튼 → 수백 줄 JSON 에서 exposedPorts 를 눈으로 찾음 → 외워서 /nginx/routes 로 복귀, 다시 hostname 부터 입력하는 왕복이 필요하다. 포트를 틀리면 finding 1 과 똑같이 502 로만 드러난다. - 수정안: (1) `containerSummarySchema` 에 `exposedPorts: z.array(z.string())` 를 추가한다(engine-agent 의 docker ps 응답에 이미 있는 정보다). (2) 라우트 폼에서 컨테이너 Select 선택 시 그 컨테이너의 노출 포트를 포트 필드의 선택지 또는 기본값으로 채운다. 노출 포트가 1개면 자동 입력한다. (3) 최소한 container-detail-card 의 `<dl>` 에 exposedPorts 를 추가해 JSON 을 읽지 않고도 보이게 한다. - 파일: `packages/contracts/src/engine.ts`, `apps/web/src/widgets/container/container-detail-card.tsx`, `apps/web/src/widgets/container/container-control-widget.tsx`, `apps/web/src/features/nginx/nginx-route-create-form.tsx`

- **[major] nginx 라우트 폼의 모든 필드 오류가 동일한 문구 하나로 표시된다 — 무엇이 왜 틀렸는지 알 수 없다**
    - 근거: apps/web/src/features/nginx/nginx-route-create-form.tsx:56-66 — zod issue 를 필드에 매핑은 하지만 메시지는 전부 같은 상수로 덮어쓴다.

```tsx
for (const issue of result.error.issues) {
    const field = issue.path[0]
    if (typeof field === 'string') {
        nextErrors[field] = labels.invalidValue
    }
}
```

apps/web/messages/ko.json:245 `"invalidValue": "값을 다시 확인하세요."`
실제 zod 는 훨씬 구체적인 이유를 갖고 있다. packages/contracts/sr - 영향: `app.example` 처럼 TLD 가 없는 hostname, `foo.containers.local` 같은 보호 접미사, `path` 앞 슬래시 누락이 전부 “값을 다시 확인하세요.” 한 줄로 나온다. 사용자는 무엇을 고쳐야 하는지 모른 채 추측으로 재시도하게 되고, 특히 보호 접미사는 규칙을 모르면 영원히 통과시킬 수 없다. - 수정안: contracts 의 각 정규식/refine 에 `message` 를 부여하고(이미 protectedSuffix 에는 있다), 폼에서는 `issue.message` 를 그대로 필드 아래에 출력한다. i18n 이 필요하면 `issue.code` + `path` 조합을 키로 하는 메시지 맵을 두고 fallback 으로만 invalidValue 를 쓴다. - 파일: `apps/web/src/features/nginx/nginx-route-create-form.tsx`, `packages/contracts/src/nginx.ts`, `apps/web/messages/ko.json`

- **[major] 배포 manifest 폼은 클라이언트 검증이 0 이고, 서버가 돌려준 필드별 오류를 웹이 파싱하지 못해 “요청 실패” 토스트만 뜬다**
    - 근거: 폼은 값을 검증 없이 그대로 던진다. apps/web/src/features/deployment-manifest-form/deployment-manifest-form.tsx:49-73 의 `submit` 은 `onSubmit({...})` 뿐이고 safeParse 나 errors state 가 전혀 없다(같은 저장소의 nginx 폼과 대조적이다).
      계약은 엄격하다. packages/contracts/src/deployment.ts:4-5

````ts
const deploymentNameSchema = z.string().regex(/^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/)
const deploymentVersionSchema = z.string().regex(/^[A-Za-z0-9]
    - 영향: 이름에 대문자를 쓰거나(`MyService`), 버전을 비우거나, hostname 에 TLD 가 없으면 서버는 정확히 어느 필드가 왜 틀렸는지 issue 배열로 알려주는데, 화면에는 “요청 실패” 다섯 글자만 뜬다. 필드 옆에는 아무 표시도 없고 어떤 입력이 문제인지 단서가 0 이다. 폼이 길어(이름/버전/이미지/hostname/path/health path/network/port/메모리/CPU/관찰시간/command/secret) 사용자는 하나씩 지우며 이분탐색을 해야 한다.
    - 수정안: (1) `parseApiError` 에 standard-validator 형태(`error: issue[]`)를 union 으로 추가해 `path`+`message` 를 뽑아내고, mutation 에서 필드별 error state 로 되돌린다. (2) 폼 제출 전 `deploymentManifestInputSchema.safeParse` 를 돌려 nginx 폼과 동일하게 필드 아래에 메시지를 붙인다. (3) name/version 입력에 규칙을 설명하는 help 문구를 추가한다(현재는 placeholder `my-service`, `1.0.0` 뿐이다).
    - 파일: `apps/web/src/features/deployment-manifest-form/deployment-manifest-form.tsx`, `apps/web/src/widgets/deployment/deployment-widget.tsx`, `apps/web/src/shared/lib/parse-api-error.ts`, `packages/contracts/src/deployment.ts`
- **[major] 관리 plane 컨테이너(api·nginx·web 등)가 라우트 대상 목록에 그대로 노출되고, 고르면 제출 후에야 거부된다**
    - 근거: 페이지는 컨테이너 이름을 필터 없이 전부 넘긴다. apps/web/src/app/[locale]/(panel)/nginx/routes/page.tsx
```tsx
containers={containers?.map((container) => container.names[0]?.replace(/^\//, '') ?? container.id.slice(0, 12)) ?? []}
````

서버는 이 중 상당수를 거부한다. apps/api/src/compose/compose.ts:90-100

````ts
const PROTECTED_CONTAINERS = [
    'api',
    'containers-api-1',
    'containers-engine-agent-1',
    'containers-nginx-1
    - 영향: 자기 자신을 운영하는 컨테이너 6~10개가 사용자 서비스와 구분 없이 제안 목록에 섞여 있다. 자동완성에서 무심코 고르면 hostname·port·timeout 까지 다 채우고 제출한 뒤에야 토스트로 거절당한다. 선택 불가능한 값을 선택지로 보여주는 것 자체가 발견 가능성을 해친다.
    - 수정안: 보호 컨테이너 목록을 contracts(또는 `/api/containers` 응답의 `protected: boolean` 필드)로 노출하고, 페이지에서 목록을 만들 때 제외한다. finding 1 의 Select 전환과 함께 하면 “고를 수 있는 것 = 유효한 것” 이 성립한다.
    - 파일: `apps/web/src/app/[locale]/(panel)/nginx/routes/page.tsx`, `apps/api/src/compose/compose.ts`, `apps/api/src/service/domain/nginx/create-nginx-proxy-route-service.ts`
- **[major] 배포 secret 바인딩이 자유 텍스트 KEY=reference 이고, 존재하는 secret 목록 API 가 있는데도 쓰지 않는다 — 오타는 release 시점에야 터진다**
    - 근거: apps/web/src/features/deployment-manifest-form/deployment-manifest-form.tsx:169-177
```tsx
<Textarea
    id="deployment-secret-bindings"
    name="secretBindings"
    placeholder={'TOKEN=apps/my-service/token\nDATABASE_URL=apps/my-service/database-url'}
/>
````

파싱은 첫 `=` 로 자르는 것이 전부다. 같은 파일 :27-34 `splitSecretBindings`.
존재하는 reference 목록은 이미 조회 가능하다. apps/web/src/widgets/deployment/deployment-secre - 영향: secret reference 를 한 글자 틀려도 manifest 는 정상 생성되고 목록에도 뜬다. 실제 실패는 “배포 시작” 을 누른 뒤이며, 메시지는 어떤 키/reference 가 문제인지 말해주지 않는다. secret 이 여러 개면 어느 줄이 잘못됐는지 알 방법이 없다. - 수정안: textarea 대신 `useGetDeploymentSecrets` 로 받은 reference 를 Select 로 고르는 행 단위 UI(환경변수 key 입력 + reference 선택 + 행 추가/삭제)로 바꾼다. 서버 쪽은 manifest 생성 시점에 이미지와 동일하게 secret reference 존재를 검사하고, 에러 details 에 해당 reference 를 실어 보낸다. - 파일: `apps/web/src/features/deployment-manifest-form/deployment-manifest-form.tsx`, `apps/web/src/widgets/deployment/deployment-secret-widget.tsx`, `apps/api/src/service/domain/deployment/create-deployment-manifest-service.ts`, `apps/api/src/service/domain/deployment/create-deployment-secret-service.ts`

- **[minor] 라우트 폼의 컨테이너 목록이 SSR 스냅샷 prop 이라, 같은 세션에서 만든 컨테이너가 목록에 나타나지 않는다**
    - 근거: 라우트 목록은 라이브 쿼리인데 컨테이너 목록만 서버 prop 이다. apps/web/src/widgets/nginx/nginx-route-control-widget.tsx:15-18,26

```tsx
type NginxRouteControlWidgetProps = {
    containers: string[]
```

```tsx
const { data, isPending } = useGetNginxRoutes()
```

값은 페이지 렌더 시점에 한 번 계산된다. apps/web/src/app/[locale]/(panel)/nginx/routes/page.tsx 의 `getContainerList(API_INTERNAL_URL, session.cookie).catch(() => undefined)` → `c
    - 영향: 컨테이너 생성 직후 다른 탭에서 라우트를 만들려 하면 방금 만든 컨테이너가 제안에 없다. datalist 라서 “목록에 없다 = 못 쓴다”가 아니라 그냥 타이핑하면 통과되므로, 사용자는 목록이 오래됐다는 사실조차 눈치채지 못한다. 또한 getContainerList 가 실패하면 `catch(() => undefined)`로 빈 배열이 되어 제안이 조용히 사라진다.
    - 수정안: 위젯에서`useGetContainerList()`를 직접 쓰고`containers`prop 을 제거한다. 페이지의`setQueryData`prefetch 가 이미 있으므로 초기 렌더 비용은 동일하고, 이후에는 자동으로 최신화된다. 조회 실패 시에는 빈 목록 대신 “컨테이너 목록을 불러오지 못했습니다” 상태를 표시한다.
    - 파일:`apps/web/src/widgets/nginx/nginx-route-control-widget.tsx`, `apps/web/src/app/[locale]/(panel)/nginx/routes/page.tsx`

- **[minor] 라우트 테이블이 대상 컨테이너의 생존 여부를 표시하지 않아, 잘못된 라우트가 정상 라우트와 똑같이 보인다**
    - 근거: apps/web/src/features/nginx/nginx-route-table.tsx:45-47

```tsx
<TableCell className="max-w-0 truncate font-mono text-text-muted">
    {route.targetContainer}:{route.targetPort}
</TableCell>
```

대상 문자열을 그대로 찍을 뿐 컨테이너 목록과 대조하지 않는다. 대조에 필요한 데이터는 같은 화면에 이미 있다(finding 8 의 `containers` prop / `useGetContainerList`).
대조 로직의 선례는 저장소 안에 있다 — apps/web/src/widgets/image/image-widget.tsx:84-86 은 이미지가 어떤 컨테이너에 - 영향: finding 1·2 로 만들어진 잘못된 라우트가 목록에서 정상과 구분되지 않는다. “도메인이 502 인데 패널은 다 초록” 상태가 유지되어, 사용자가 문제를 라우트에서 찾을 이유를 못 찾는다. - 수정안: image-widget 과 같은 방식으로 라우트의 targetContainer 를 컨테이너 목록과 대조해, 없거나 running 이 아니면 경고 Badge(예: `variant="warning"` + 툴팁 “대상 컨테이너를 찾을 수 없습니다”)를 붙인다. - 파일: `apps/web/src/features/nginx/nginx-route-table.tsx`, `apps/web/src/widgets/image/image-widget.tsx`

- **[minor] tar 업로드 후 로드된 이미지 이름을 알려주지 않아, 다음 단계에서 무엇을 골라야 하는지 연결이 끊긴다**
    - 근거: 로드 결과의 messages 를 버린다. apps/web/src/widgets/artifact/artifact-widget.tsx:52-59

```tsx
onSuccess: (loaded) => {
    if ('job' in loaded) {
        trackJob(loaded.job)
    }
    setLoadingArtifactId(undefined)
    toast.success(translations('artifactLoaded'))
},
```

계약에는 그 정보가 실려 있다. packages/contracts/src/upload.ts 의 `imageLoadResultSchema` `messages: z.array(z.string())` 와 `deploymentSchema` `mes
    - 영향: 사용자가 기대하는 1→2 단계 이음매가 끊긴다. tar 를 올리고 ‘이미지 로드’ 를 눌러도 어떤 이미지가 생겼는지 화면에 나오지 않고, 컨테이너 생성 폼으로 이동할 동선도 없다. 태그 없는 아카이브라면 이미지 Select 에 64자리 해시가 나열되어 어느 것이 방금 올린 것인지 판별할 수 없다.
    - 수정안: 로드 성공 시 `messages`(docker load 의 `Loaded image: name:tag`)를 파싱해 만들어진 이미지 태그를 결과 영역에 표시하고, `/containers/new`로 가는 버튼을 함께 둔다(이미지 목록이 비었을 때 /registry 로 보내는 apps/web/src/widgets/container/container-create-widget.tsx:114-118 과 같은 패턴). 이미지 Select 에는 생성 시각/크기를 부제로 붙여 태그 없는 이미지도 식별 가능하게 한다.
    - 파일:`apps/web/src/widgets/artifact/artifact-widget.tsx`, `packages/contracts/src/upload.ts`, `apps/web/src/widgets/container/container-create-widget.tsx`

- **[minor] 네트워크·볼륨 생성 폼은 클라이언트 검증과 필드 오류 표시가 전혀 없다**
    - 근거: apps/web/src/features/infrastructure/network-create-form.tsx:36-45 — trim 후 그대로 콜백에 넘긴다.

```tsx
onCreate({
    gateway: String(form.get('gateway') ?? '').trim(),
    internal,
    name: String(form.get('name') ?? '').trim(),
    subnet: String(form.get('subnet') ?? '').trim(),
})
```

apps/web/src/features/infrastructure/volume-create-form.tsx:21-24 도 동일하게 `onCreate(String(...).trim())` 뿐이다. 두 파일 어 - 영향: subnet 을 `172.30.0.0` 처럼 CIDR 없이 쓰거나 이름에 허용되지 않는 문자를 넣으면, finding 4 와 같은 경로로 “요청 실패” 토스트만 뜬다. 어느 필드가 문제인지 표시가 없다. 이 네트워크는 이후 컨테이너 생성 폼의 선택지가 되므로, 여기서 막히면 흐름 전체가 멈춘다. - 수정안: 두 폼에서 대응 계약 스키마로 safeParse 하고 nginx 폼과 같은 방식으로 필드 아래 메시지를 표시한다. subnet/gateway 는 placeholder 만 있고 설명이 없으므로 help 문구도 추가한다. - 파일: `apps/web/src/features/infrastructure/network-create-form.tsx`, `apps/web/src/features/infrastructure/volume-create-form.tsx`, `packages/contracts/src/engine-control.ts`

- **[minor] nginx upstream 편집기의 server 주소는 아무 제안도 없는 완전 자유 텍스트다**
    - 근거: apps/web/src/widgets/nginx/nginx-upstream-editor.tsx:168-174

```tsx
<Input
    id={`upstream-address-${index}`}
    className="h-8 font-mono text-xs"
    value={model.address}
    onChange={(event) => updateServer(node, { address: event.target.value })}
    spellCheck={false}
/>
```

같은 편집기의 다른 옵션들(weight·max_conns·backup·down 등)은 구조화돼 있는데, 정작 무엇을 가리키는지 결정하는 address 만 문자열이다. 라우트 폼이 갖고 있는 datalist 조 - 영향: 수동 nginx 설정 경로에서도 컨테이너 이름을 외워서 타이핑해야 한다. 오타 시 라우트와 마찬가지로 설정 적용은 성공하고 런타임 502 로만 드러난다. - 수정안: address 입력에 컨테이너 목록 기반 제안(최소 datalist, 가능하면 컨테이너 선택 + 포트 입력 조합)을 붙인다. finding 2 로 exposedPorts 가 목록 계약에 들어오면 `name:port` 형태로 완성된 값을 제안할 수 있다. - 파일: `apps/web/src/widgets/nginx/nginx-upstream-editor.tsx`

### compose-gap

- **[blocker] 묶음 배포(compose) 개념 자체가 없다 — manifest 1개 = 컨테이너 1개**
    - 근거: packages/contracts/src/deployment.ts:19-61 `deploymentManifestInputSchema` 는 단수 필드만 갖는다: `imageDigest: imageDigestSchema`(:31), `internalPort: z.number()...`(:32), `name: deploymentNameSchema`(:34), `route: z.object({ hostname..., path..., stripPrefix... })`(:44-48). 서비스 배열도, `dependsOn` 도, 서비스 간 참조도 없다.
      apps/api/src/service/domain/deployment/create-deployment-release-service.ts:383 `const created
    - 영향: 사용자가 기대하는 "이미지 + compose.yml 로 up -d" 가 성립하지 않는다. 앱 + DB + 캐시처럼 2개 이상 컨테이너로 이뤄진 서비스를 올리려면 manifest 를 컨테이너 수만큼 따로 만들고, 기동 순서(depends_on)·서비스 간 이름 해석·공유 볼륨/네트워크는 사용자가 머릿속으로 관리해야 한다. 한 단위로 배포·롤백·삭제할 방법도 없다(롤백은 manifest 단위: create-deployment-release-service.ts:90 `/deployment-releases/:id/rollback`).
    - 수정안: (a) 최소안: manifest 에 `group`(스택 이름) 필드를 추가하고 릴리스를 group 단위로 순차 실행 + 실패 시 group 전체 롤백. UI 는 스택 카드 하나에 서비스 N개를 접어 보여준다. (b) 본격안: `compose.yml` 업로드 → 서버에서 파싱해 지원 필드(image/command/environment/volumes/ports/depends_on)를 manifest N개로 변환하고, 지원하지 않는 키는 업로드 화면에서 "무시됨" 목록으로 명시. 어느 쪽이든 릴리스 진행 UI(features/deployment-release-progress)는 서비스별 상태 행을 갖도록 확장이 필요하다.
    - 파일: `packages/contracts/src/deployment.ts`, `apps/api/src/service/domain/deployment/create-deployment-release-service.ts`, `apps/api/src/route/deployment/create-deployment-manifest-route.ts`, `packages/contracts/src/engine-control.ts`
- **[blocker] manifest 폼이 계약 필드의 절반을 하드코딩해 UI 로는 도달 불가**
    - 근거: apps/web/src/features/deployment-manifest-form/deployment-manifest-form.tsx:50-72 의 submit 페이로드:

```
entrypoint: [],                       // :52
environmentKeys: [],                  // :53
healthcheck: { ...DEFAULT_HEALTHCHECK, path: ... },  // :54, DEFAULT_HEALTHCHECK 는 :17 상수
pidsLimit: DEFAULT_PIDS_LIMIT,        // :61
protocol: 'http',                     // :62
restartPolicy: 'unless-stoppe
    - 영향: 볼륨을 붙일 수 없어 DB·업로드 저장소 등 상태 있는 컨테이너를 UI 로 배포할 수 없다(계약·엔진은 지원하는데 화면만 없다). WebSocket 서비스도 UI 로는 `protocol: 'http'` 로만 만들어져 nginx 업그레이드 헤더가 붙지 않는다. healthcheck 타이밍을 못 바꿔 기동이 느린 앱은 5초×6회(=DEFAULT_HEALTHCHECK, :17) 안에 못 뜨면 매번 배포 실패한다. stripPrefix 를 못 켜서 서브패스 마운트가 안 된다.
    - 수정안: 폼을 접이식 섹션으로 확장한다: 필수(이름/버전/이미지/호스트/포트) 는 지금처럼 펼치고, "고급"(entrypoint, protocol, restartPolicy, stripPrefix, healthcheck 타이밍 4개, pidsLimit, rollbackRetention)과 "볼륨"(mountPath/name/readOnly 행 추가) 을 접어 둔다. 볼륨 name 은 이미 조회 중인 인프라 데이터(deployment-widget.tsx:40 `useGetInfrastructure().data?.networks`)와 같은 소스의 volumes 로 드롭다운을 채울 수 있다.
    - 파일: `apps/web/src/features/deployment-manifest-form/deployment-manifest-form.tsx`, `packages/contracts/src/deployment.ts`
- **[major] nginx 라우트의 컨테이너 선택이 드롭다운이 아니라 자유 입력 + datalist 이고, 목록이 갱신되지 않는다**
    - 근거: apps/web/src/features/nginx/nginx-route-create-form.tsx:116-128 은 `Select` 가 아니라 `Input` + `datalist` 다:
```

<Input id="route-container" name="targetContainer" list="route-container-options" required ... />
<datalist id="route-container-options">
{containers.map((container) => (<option key={container} value={container} />))}
</datalist>

```
같은 폼의 protocol 은 진짜 `Select` 를 쓴다(:155-163) — 일관성도 없다
    - 영향: 사용자가 기대한 "컨테이너를 드롭다운으로 골라 도메인에 연결" 이 실제로는 이름을 직접 타이핑하는 입력이다. 오타·존재하지 않는 이름도 저장되어 502 가 날 때까지 알 수 없고, 컨테이너 조회가 실패하면 아무 힌트 없이 빈 입력만 남는다. datalist 는 모바일·일부 브라우저에서 후보가 잘 보이지 않아 "드롭다운이 없다" 는 인상을 직접적으로 만든다.
    - 수정안: protocol 과 동일한 `Select` 로 바꾸고 옵션을 컨테이너 목록 + 포트로 구성한다(선택 시 targetPort 자동 채움). 목록은 서버 prop 대신 클라이언트 쿼리(`useGetContainerList`, 이미 page.tsx:27 에서 `setQueryData` 로 시드 중)로 읽어 실시간 갱신되게 하고, 조회 실패 시 "컨테이너 목록을 불러오지 못했습니다" 를 표시한 뒤에만 수동 입력으로 폴백한다.
    - 파일: `apps/web/src/features/nginx/nginx-route-create-form.tsx`, `apps/web/src/app/[locale]/(panel)/nginx/routes/page.tsx`, `packages/contracts/src/nginx.ts`
- **[major] 배포가 자동 생성한 nginx 라우트와 사용자가 수동 생성한 라우트가 화면에서 구분되지 않는다**
    - 근거: 릴리스는 nginx 라우트를 자동으로 upsert 한다: apps/api/src/service/domain/deployment/create-deployment-release-service.ts:431 `const switched = await nginxProxyRouteService.upsert(routeInput(manifest, release.containerName))`, 입력은 :96-103 `routeInput = (manifest, targetContainer) => ({ ..., hostname: manifest.route.hostname, path: manifest.route.path, ... })`.
그런데 라우트 스키마에는 소유자·관리 여부 필드가 없다: packages/contracts/
    - 영향: 사용자가 /deployments 에서 배포하면 /nginx/routes 에 라우트가 저절로 나타나는데, 그것이 어느 manifest 소유인지 알 수 없다. 그 라우트를 수동으로 삭제하거나 같은 호스트/경로로 덮어쓰면 다음 배포·롤백이 예상과 다르게 동작한다(롤백 경로도 같은 upsert/remove 를 쓴다 — create-deployment-release-service.ts:473, :475). 반대로 사용자가 도메인 연결을 수동으로 하려다 이미 manifest 가 관리 중인 경로를 건드릴 수도 있다.
    - 수정안: 라우트 스키마에 `managedBy`(manifest id 또는 null)를 추가하고, 릴리스가 만든 라우트에는 이를 채운다. 라우트 테이블은 관리 라우트에 배지 + 해당 manifest 링크를 표시하고 수동 삭제/수정은 막거나 경고 후에만 허용한다. 수동 생성 폼에서도 기존 관리 라우트와 host/path 가 겹치면 제출 전에 경고한다.
    - 파일: `apps/api/src/service/domain/deployment/create-deployment-release-service.ts`, `packages/contracts/src/nginx.ts`, `apps/web/src/features/nginx/nginx-route-table.tsx`, `apps/web/src/features/nginx/nginx-route-create-form.tsx`
- **[minor] secret binding 을 자유 텍스트로 입력하게 하고 참조 후보를 제시하지 않는다**
    - 근거: apps/web/src/features/deployment-manifest-form/deployment-manifest-form.tsx:169-177 은 textarea 한 개다:
```

<Textarea id="deployment-secret-bindings" name="secretBindings" placeholder={'TOKEN=apps/my-service/token\nDATABASE_URL=apps/my-service/database-url'} />
```
파싱은 첫 `=` 기준 문자열 분리다: 같은 파일 :27-34 `splitSecretBindings`.
참조는 별도 화면에서 사용자가 손으로 만든 문자열이다: apps/web/src/widgets/deployment/deployment-secre
    - 영향: 사용자는 /deployments/secrets 에서 만든 참조 문자열을 정확히 기억해 다른 화면의 textarea 에 다시 타이핑해야 한다. 오타는 폼에서 잡히지 않고 릴리스 생성 시점(create-deployment-release-service.ts:344 `await deploymentSecretService.resolve(manifest.secrets)`)에 가서야 실패한다. manifest 는 수정 불가이므로 그 manifest 는 버리고 다시 만들어야 한다.
    - 수정안: binding 을 행 단위 UI(ENV_KEY 입력 + secret reference Select)로 바꾸고 Select 옵션을 `useGetDeploymentSecrets` 로 채운다. 등록된 secret 이 없으면 그 자리에서 "Secret 등록" 링크를 노출한다. 최소한 textarea 를 유지하더라도 제출 전에 참조 존재 여부를 클라이언트에서 대조해 오류를 표시한다.
    - 파일: `apps/web/src/features/deployment-manifest-form/deployment-manifest-form.tsx`, `apps/web/src/widgets/deployment/deployment-secret-widget.tsx`, `apps/web/src/widgets/deployment/deployment-widget.tsx`
- **[minor] 네트워크 선택 드롭다운이 사실상 선택지가 하나뿐인 장식이다**
    - 근거: apps/web/src/features/deployment-manifest-form/deployment-manifest-form.tsx:47 `const networkOptions = networks.filter((item) => item.driver === 'bridge' && item.name === DEFAULT_NETWORK)` — `DEFAULT_NETWORK` 는 :16 `'containers_edge'` 이므로 필터를 통과하는 항목은 최대 1개다.
상태 초기값도 같은 값으로 고정되어 있다: :45 `const [network, setNetwork] = useState(DEFAULT_NETWORK)`.
그럼에도 :126-137 에서 완전한 `Select` UI 를 렌더한다.
    - 영향: 항목이 하나뿐인 드롭다운은 사용자에게 "고를 수 있다" 는 잘못된 기대를 준다. 사용자가 /infrastructure 에서 네트워크를 새로 만들어도 이 목록에는 절대 나타나지 않으며, 그 이유가 화면에 설명되지 않는다.
    - 수정안: 선택지가 1개면 Select 대신 읽기 전용 표시 + "배포는 containers_edge 네트워크에서만 실행됩니다" 도움말로 바꾼다. 다른 네트워크를 실제로 허용할 계획이면 필터를 `driver === 'bridge'` 로만 두고 서버의 보호 네트워크 검증(create-deployment-manifest-service.ts:189-194 `DEPLOYMENT_NETWORK_PROTECTED` / `DEPLOYMENT_NETWORK_INVALID`)에 맡긴다.
    - 파일: `apps/web/src/features/deployment-manifest-form/deployment-manifest-form.tsx`, `apps/api/src/service/domain/deployment/create-deployment-manifest-service.ts`

### route-linkage

- **[major] 대상 컨테이너가 드롭다운이 아니라 free-text 입력이고, 중지된 컨테이너까지 후보에 섞인다**
    - 근거: apps/web/src/features/nginx/nginx-route-create-form.tsx:116-128 — 실제 컨트롤은 Select 가 아니라 datalist 가 붙은 Input 이다.
```
<Input
    id="route-container"
    name="targetContainer"
    list="route-container-options"
    required
...
<datalist id="route-container-options">
    {containers.map((container) => (
        <option key={container} value={container} />
    ))}
</datalist>
```
같은 파일 155-163 의 prot
    - 영향: 사용자는 "컨테이너를 골라 도메인에 연결"하려는데, 실제로는 이름을 직접 타이핑해야 하는 자유 입력이다. datalist 는 Firefox/Safari 에서 목록 UI가 약하고 선택 강제도 안 된다. 오타·중지된 컨테이너·관리용 컨테이너를 골라도 폼 단계에서 막히지 않고, 관리 컨테이너는 제출 후 에러로만 알게 된다.
    - 수정안: protocol 과 동일하게 `Select` 로 바꾸고, 옵션 항목에 이름 + state 배지 + image 를 함께 렌더한다. 페이지에서 넘기는 값을 `string[]` 이 아니라 `{ name, state, image }[]` 로 바꿔 running 이 아닌 컨테이너는 비활성 또는 경고 배지로 표시하고, `PROTECTED_CONTAINERS` 에 해당하는 이름은 후보에서 제외한다(현재 목록이 apps/api 에만 있으므로 packages/contracts 로 올려 공유).
    - 파일: `apps/web/src/features/nginx/nginx-route-create-form.tsx`, `apps/web/src/app/[locale]/(panel)/nginx/routes/page.tsx`, `apps/engine-agent/src/service/shared/create-docker-engine-client.ts`, `apps/api/src/compose/compose.ts`
- **[blocker] "nginx 와 같은 네트워크에 있어야 한다"는 필수 조건이 화면 어디에도 없고, 위반해도 생성이 성공한다**
    - 근거: 라우트는 컨테이너 이름을 Docker 내장 DNS 로 해석하는 형태로 렌더된다 — apps/api/src/service/domain/nginx/create-nginx-proxy-route-service.ts:59
```
set $containers_route_upstream "http://${route.targetContainer}:${route.targetPort}"; proxy_pass $containers_route_upstream;
```
변수 proxy_pass + infra/nginx/nginx.conf:20 `resolver 127.0.0.11 valid=10s ipv6=off;` 조합이라 이름이 해석되지 않아도 **reload 는 성공**하고 요청 시점에만 실패한다.

nginx 는 contr
    - 영향: containers_edge 가 아닌 네트워크에 만든 컨테이너로 라우트를 걸면 패널은 "생성 완료" 토스트를 띄우지만 실제 요청은 전부 502 가 된다. 사용자는 화면 어디서도 원인(네트워크 불일치)을 볼 수 없고, 컨테이너가 어느 네트워크에 있는지 확인할 화면조차 없다.
    - 수정안: (1) 후보 컨테이너를 nginx 가 붙은 네트워크(containers_edge) 소속으로 필터링하거나, 소속이 아닌 컨테이너는 "nginx 와 네트워크가 달라 연결되지 않습니다" 경고와 함께 비활성 처리한다. (2) create 서비스에서 대상 컨테이너의 네트워크를 조회해 불일치 시 전용 에러 코드로 거절한다. (3) 컨테이너 상세 카드에 networks 를 노출한다(engine-agent 의 containerDetail 에는 이미 networks 가 있다 — packages/contracts/src/engine.ts:68).
    - 파일: `apps/api/src/service/domain/nginx/create-nginx-proxy-route-service.ts`, `infra/nginx/nginx.conf`, `compose.yaml`, `apps/web/src/widgets/container/container-create-widget.tsx`, `apps/web/src/widgets/container/container-detail-card.tsx`, `packages/contracts/src/engine.ts`
- **[blocker] 배포 manifest 가 만든 라우트와 수동 라우트가 같은 테이블에 구분 없이 섞여, 수동 삭제로 배포를 깰 수 있다**
    - 근거: 배포 릴리스는 같은 nginx 라우트 서비스로 라우트를 upsert 한다 — apps/api/src/service/domain/deployment/create-deployment-release-service.ts:96-107
```
const routeInput = (manifest: DeploymentManifest, targetContainer: string) => ({
    bodySizeMegabytes: 64,
    enabled: true,
    hostname: manifest.route.hostname,
    path: manifest.route.path,
    pathMode: 'prefix' as const,
...
```
저장 테이블은 하나이고 출처를 구분하는 컬럼이 없다 — p
    - 영향: 사용자 입장에서 "도메인 연결"이 배포 manifest 의 route 와 nginx 라우트 화면 두 곳에 존재하는데 관계 설명이 없다. 배포가 만든 라우트를 라우트 화면에서 지우면 서비스가 즉시 끊기고(주기 작업 `nginx-route-reconcile`, apps/api/src/server.ts:178 은 DB 를 config 로 렌더할 뿐 삭제된 행을 복구하지 않는다), 반대로 배포와 같은 도메인을 수동으로 만들려 하면 원인 불명의 409 만 본다.
    - 수정안: `nginx_route` 에 소유 출처(deploymentId 또는 managedBy)를 추가해 목록에 "배포 관리" 배지를 달고 해당 행의 수동 삭제를 막거나 배포 화면으로 유도한다. 충돌 에러 메시지에 충돌 상대(배포 이름/hostname)를 담고, 라우트 화면 상단에 "배포로 만든 도메인은 여기서 관리하지 않습니다" 설명과 배포 화면 링크를 둔다.
    - 파일: `apps/api/src/service/domain/deployment/create-deployment-release-service.ts`, `packages/db-schema/src/schema.ts`, `apps/web/src/features/nginx/nginx-route-table.tsx`, `apps/web/src/features/deployment-manifest-form/deployment-manifest-form.tsx`, `apps/api/src/lib/error-message.ts`, `apps/api/src/server.ts`
- **[major] 라우트 수정 기능이 없다 — 포트 하나 바꾸려면 확인 문자열 타이핑 후 삭제하고 다시 만들어야 한다**
    - 근거: 서비스에는 upsert 가 있으나 API 라우트가 노출하지 않는다 — apps/api/src/route/nginx/create-nginx-route.ts:23
```
nginxProxyRouteService: Pick<NginxProxyRouteService, 'create' | 'list' | 'remove'>
```
(upsert 는 create-nginx-proxy-route-service.ts:231 에 구현돼 있고 배포 릴리스만 사용한다 — compose-deployment-release.ts:19 `Pick<NginxProxyRouteService, 'list' | 'remove' | 'upsert'>`)
웹도 create/remove 만 있다 — apps/web/src/entities/nginx
    - 영향: 포트·timeout·프로토콜 오타 하나를 고치는 데 hostname+path 를 정확히 타이핑하는 삭제 확인을 거치고, 삭제된 순간부터 재생성까지 해당 도메인이 404 로 끊긴다.
    - 수정안: 이미 있는 `upsert` 를 PUT /nginx/routes/:id 로 노출하고, 테이블 행에 수정 버튼 + 기존 값이 채워진 폼을 붙인다. create 폼과 동일 컴포넌트를 초기값 prop 으로 재사용하면 된다.
    - 파일: `apps/api/src/route/nginx/create-nginx-route.ts`, `apps/api/src/service/domain/nginx/create-nginx-proxy-route-service.ts`, `apps/web/src/entities/nginx/nginx.query.ts`, `apps/web/src/features/nginx/nginx-route-table.tsx`
- **[minor] 삭제 확인 문자열 규칙은 안내돼 있으나, 불일치 사유가 표시되지 않고 버튼만 비활성이다**
    - 근거: 규칙 자체는 노출된다. API 요구값은 hostname+path 다 — apps/api/src/service/domain/nginx/create-nginx-proxy-route-service.ts:221
```
if (confirmation !== `${route.hostname}${route.path}`) {
    throw createAppError('CONFIRMATION_MISMATCH')
}
```
화면은 같은 값을 target 으로 보여주고(apps/web/src/features/nginx/nginx-route-table.tsx:58-62 `expectedValue={`${route.hostname}${route.path}`}` / `target={...}`), 다이얼로그가 그 값을 mono 로
    - 영향: 규칙을 몰라서 막히지는 않지만, 공백·대소문자가 어긋나면 왜 버튼이 안 눌리는지 알 수 없고, 긴 경로는 표시가 잘려 무엇을 입력해야 하는지 확인할 수 없다.
    - 수정안: 불일치 시 "표시된 값과 정확히 일치해야 합니다" 보조 문구를 노출하고, target 표시를 `truncate` 대신 `break-all` 로 전문 노출한다(또는 복사 버튼 제공).
    - 파일: `apps/web/src/features/confirm-remove-dialog/confirm-remove-dialog.tsx`, `apps/web/src/features/nginx/nginx-route-table.tsx`, `apps/api/src/service/domain/nginx/create-nginx-proxy-route-service.ts`, `apps/web/messages/ko.json`
- **[minor] 스키마에 있는 pathMode(exact)·enabled 토글이 UI에서 하드코딩돼 사용할 수 없다**
    - 근거: apps/web/src/features/nginx/nginx-route-create-form.tsx:43-54
```
const result = nginxProxyRouteInputSchema.safeParse({
    bodySizeMegabytes: Number(form.get('bodySizeMegabytes')),
    enabled: true,
...
    pathMode: 'prefix',
```
계약은 둘 다 지원한다 — packages/contracts/src/nginx.ts:51-53
```
pathMode: z.enum(['exact', 'prefix']).default('prefix'),
protocol: z.enum(['http', 'websocket']).default('http
    - 영향: 정확 경로 매칭이 필요한 경우 패널로는 만들 수 없고, 라우트를 잠시 끄는(enabled=false) 운영 동작도 불가능하다. 끄려면 삭제밖에 없다.
    - 수정안: pathMode 를 protocol 과 같은 Select 로, enabled 를 stripPrefix 옆 Switch 로 노출하고, 목록에 두 값을 배지로 표시한다.
    - 파일: `apps/web/src/features/nginx/nginx-route-create-form.tsx`, `packages/contracts/src/nginx.ts`, `apps/api/src/service/domain/nginx/create-nginx-proxy-route-service.ts`, `apps/web/src/features/nginx/nginx-route-table.tsx`
- **[minor] 라우트 실패 토스트가 API 의 한국어 하드코딩 메시지를 그대로 노출한다 (en/ja 미대응)**
    - 근거: 위젯은 에러 객체 메시지를 그대로 토스트한다 — apps/web/src/widgets/nginx/nginx-route-control-widget.tsx:32,40
```
const toMessage = (error: unknown) => (error instanceof Error ? error.message : labels.failed)
...
toast.error(toMessage(createError))
```
그 메시지는 응답 body 의 error.message 다 — apps/web/src/shared/lib/client-fetch.ts:7 `throw new Error(parseApiError(body, '요청 실패'))`, apps/web/src/shared/lib/parse-api-error.
    - 영향: en/ja 로케일 사용자에게 한국어 에러가 그대로 뜬다. 또한 메시지가 원인만 말하고 다음 행동(무엇과 충돌했는지, 어떤 컨테이너가 보호 대상인지)을 알려주지 않는다.
    - 수정안: API 응답의 error.code 를 클라이언트로 전달받아 web 메시지 카탈로그에서 로케일별 문구로 매핑하고, 충돌/보호 대상 에러에는 상대 라우트나 컨테이너 이름을 detail 로 실어 문구에 보간한다.
    - 파일: `apps/web/src/widgets/nginx/nginx-route-control-widget.tsx`, `apps/web/src/shared/lib/parse-api-error.ts`, `apps/api/src/lib/error-message.ts`, `apps/web/messages/ko.json`

### feedback-state

- **[blocker] durable job이 실패해도 화면에 아무 것도 안 뜬다 — 폴링 훅에 failed 분기가 없다**
    - 근거: apps/web/src/entities/job/job.query.ts:49-52 는 succeeded 만 처리한다.
```ts
    useEffect(() => {
        if (status !== OPERATION_JOB_STATUS.SUCCEEDED) return
        void onSucceeded?.()
    }, [onSucceeded, status])
```
같은 파일 :58 의 error 는 job 상태가 아니라 상세 조회 HTTP 실패만 잡는다.
```ts
    const error = query.isError ? failureLabel : undefined
```
소비하는 위젯 두 곳은 그 error 조차 구조분해하지 않는다. apps/web/src/widgets/arti
    - 영향: 업로드한 tar 가 ARTIFACT_DIGEST_MISMATCH·UPLOAD_INCOMPLETE 로 finalize 실패해도(apps/api/src/service/domain/job/create-job-handlers.ts:29,204) 화면에는 직전에 띄운 성공 토스트만 남고 버튼이 다시 활성화될 뿐이다. 사용자는 실패 사실을 /jobs 로 직접 가서 표를 읽기 전까지 모른다. 이미지 load 도 동일.
    - 수정안: useOperationJobPolling 에 terminal 상태 콜백(onFailed/onSettled)과 failureCode 반환을 추가하고, 소비 위젯에서 실패 토스트 + 인라인 에러 배너로 노출한다. 최소한 artifact-widget·artifact-upload-form 이 error 와 status 를 받아 렌더하도록 바꾼다.
    - 파일: `apps/web/src/entities/job/job.query.ts`, `apps/web/src/widgets/artifact/artifact-widget.tsx`, `apps/web/src/widgets/artifact/artifact-upload-form.tsx`
- **[major] /jobs 목록이 폴링하지 않아 실행 중인 작업의 진행이 화면에서 멈춰 있다**
    - 근거: apps/web/src/entities/job/job.query.ts:15-19 에 refetchInterval 이 없다.
```ts
export const jobListQueryOptions = () =>
    queryOptions({
        queryKey: QUERY_KEY.JOB.LIST,
        queryFn: () => clientFetchData<z.infer<typeof operationJobListSchema>>('/api/jobs'),
    })
```
전역 기본값은 staleTime 60초다. apps/web/src/shared/lib/query-provider.tsx:6,12 `const DEFAULT_STALE_TIME_MS = 60_000` / `staleTime
    - 영향: job 진행을 볼 수 있는 유일한 화면인 /jobs 가 정지 화면이다. running 배지에 스피너는 돌지만(job-status-badge.tsx:25) 상태·attempt·finishedAt 는 수동 새로고침 전까지 갱신되지 않는다.
    - 수정안: jobListQueryOptions 에 deployment 와 같은 조건부 refetchInterval(활성 job 존재 시 1~2초, 없으면 false)을 넣는다.
    - 파일: `apps/web/src/entities/job/job.query.ts`, `apps/web/src/widgets/job/job-widget.tsx`, `apps/web/src/shared/lib/query-provider.tsx`
- **[major] job 진행 단계·이벤트 타임라인 API가 구현돼 있는데 웹이 한 번도 호출하지 않는다**
    - 근거: API 는 이벤트 엔드포인트를 노출한다. apps/api/src/route/job/create-job-route.ts:88,98
```ts
            '/jobs/:id/events',
...
                return context.json(successResponse(await operationJobService.listEvents(id)), 200)
```
핸들러는 단계와 상세를 계속 기록한다. apps/api/src/service/domain/job/create-operation-job-service.ts:282-284
```ts
                reportProgress: async (step, detail) => {
                    awai
    - 영향: "지금 어디까지 진행됐나"를 백엔드는 알고 있는데 사용자는 볼 수 없다. 몇 분 걸리는 image load·backup restore 가 그냥 running 배지 하나로만 보인다.
    - 수정안: job 상세/이벤트 조회 쿼리를 추가하고, /jobs 행 확장 또는 상세 패널에 이벤트 타임라인(progress·retry-scheduled·failed)을 렌더한다.
    - 파일: `apps/api/src/route/job/create-job-route.ts`, `apps/web/src/entities/job/job.query.ts`, `apps/web/src/widgets/job/job-widget.tsx`
- **[major] 대용량 tar 업로드가 중간에 끊기면 처음부터 다시 — 서버는 재개를 지원하는데 클라이언트가 안 쓴다**
    - 근거: 세션 응답에 이미 수신 바이트가 들어온다. packages/contracts/src/upload.ts:23 `receivedBytes: z.number().int().nonnegative(),`
클라이언트는 이 값을 무시하고 항상 0부터 올린다. apps/web/src/entities/artifact/artifact.query.ts:56-60
```ts
            for (let offset = 0; offset < file.size; offset += session.maxChunkBytes) {
                const end = Math.min(offset + session.maxChunkBytes, file.size)
...
                await clientF
    - 영향: 수 GB 짜리 이미지 tar 업로드가 90% 에서 네트워크 블립으로 끊기면 토스트 하나 뜨고 전량 재업로드다. 잘못 고른 파일을 올리는 중에도 멈출 방법이 없다.
    - 수정안: 파일 sha256 기준으로 세션을 재사용(idempotency-key 를 해시 기반으로)하고 session.receivedBytes 부터 루프를 시작한다. mutation 에 AbortController 를 연결해 취소 버튼을 제공한다.
    - 파일: `apps/web/src/entities/artifact/artifact.query.ts`, `packages/contracts/src/upload.ts`, `apps/web/src/widgets/artifact/artifact-upload-form.tsx`
- **[major] 컨테이너 생성·prune 실패 시 서버가 준 구체 사유를 버리고 뭉뚱그린 문구만 띄운다**
    - 근거: apps/web/src/widgets/container/container-create-widget.tsx:82
```ts
                onError: () => toast.error(t('containerCreateFailed')),
```
apps/web/src/widgets/prune/prune-widget.tsx:51 `onError: () => toast.error(t('pruneFailed')),`
API 는 코드별 한국어 메시지를 내려준다. apps/api/src/lib/with-error-handling.ts:50-54
```ts
            if (isAppError(error)) {
                console.error(`[api] request fa
    - 영향: 이름 중복·이미지 없음·네트워크 미존재·포트 충돌이 전부 "컨테이너를 만들 수 없습니다" 하나로 뭉개진다. 사용자는 무엇을 고쳐야 하는지 알 수 없다.
    - 수정안: 다른 위젯과 동일하게 `error instanceof Error ? error.message : t(fallback)` 패턴으로 통일하고, 응답의 requestId 를 토스트 하단 또는 상세에 함께 노출한다.
    - 파일: `apps/web/src/widgets/container/container-create-widget.tsx`, `apps/web/src/widgets/prune/prune-widget.tsx`, `apps/web/src/shared/lib/parse-api-error.ts`
- **[major] 패널 어디에도 실행 중 job 표시가 없어 사용자가 /jobs 를 스스로 찾아가야 한다**
    - 근거: job 쿼리를 쓰는 곳은 /jobs 위젯과 폴링 훅뿐이다. `grep -rn "JOB\." apps/web/src/widgets apps/web/src/features apps/web/src/shared` 결과 0건. 전역 셸(apps/web/src/widgets/panel-shell/panel-shell-nav.tsx)에도 job 관련 배지·표시가 없다. 대시보드 개요 카드도 API·엔진·nginx·컨테이너·트래픽·디스크 6장뿐 job 이 없다(apps/web/src/widgets/overview/overview-widget.tsx:41-83). 알림은 외부 webhook 대상 관리 화면일 뿐 인앱 수신함이 아니다(apps/web/src/widgets/notification/notification-widg
    - 영향: 업로드·로드·배포·백업을 걸어 놓은 뒤 다른 화면으로 이동하면 진행 중이라는 사실 자체가 사라진다. 결과를 알려면 /jobs 를 기억하고 직접 들어가 새로고침해야 한다.
    - 수정안: 사이드바/헤더에 활성 job 수 배지와 최근 실패 표시를 두고, 클릭 시 /jobs 로 보낸다. 개요 화면에도 진행 중/실패 job 카드를 추가한다.
    - 파일: `apps/web/src/widgets/panel-shell/panel-shell-nav.tsx`, `apps/web/src/widgets/overview/overview-widget.tsx`, `apps/web/src/entities/job/job.query.ts`
- **[minor] job 폴링이 종료 상태 이후에도 1초 간격으로 무한 지속된다**
    - 근거: apps/web/src/entities/job/job.query.ts:13,41-44
```ts
const POLL_INTERVAL_MS = 1_000
...
    const query = useQuery({
        ...operationJobDetailQueryOptions(jobId ?? ''),
        refetchInterval: POLL_INTERVAL_MS,
    })
```
succeeded/failed/cancelled 에 대한 중단 조건이 없다. 비교: 릴리스 쿼리는 활성 상태일 때만 폴링한다(apps/web/src/entities/deployment/deployment.query.ts:30-33).
    - 영향: 업로드를 한 번 한 뒤 그 화면에 머무르면 끝난 job 을 초당 1회 계속 조회한다. 여러 탭·여러 위젯이면 API 에 불필요한 지속 부하.
    - 수정안: refetchInterval 을 함수형으로 바꿔 ACTIVE_JOB_STATUSES 에 속할 때만 폴링하고 종료 상태에서 false 를 반환한다.
    - 파일: `apps/web/src/entities/job/job.query.ts`
- **[minor] 업로드 진행률 바가 완료 후에도 100%로 남아 다음 업로드까지 잔상이 된다**
    - 근거: apps/web/src/widgets/artifact/artifact-upload-form.tsx:24,40,83-91
```tsx
    const [progress, setProgress] = useState(0)
...
        setProgress(0)
...
            {progress > 0 ? (
                <div className="md:col-span-3">
                    <UploadProgress
                        label={translations('uploadProgress')}
                        description={selectedFile?.name ?? translation
    - 영향: 실패한 업로드가 95% 짜리 바를 남기고, 완료된 업로드는 100% 바가 계속 붙어 있어 지금 진행 중인지 끝난 것인지 구분되지 않는다.
    - 수정안: mutation onSettled 에서 진행률을 초기화하거나, 상태를 idle/hashing/uploading/finalizing/done/failed 로 두고 바 대신 상태 라벨을 렌더한다.
    - 파일: `apps/web/src/widgets/artifact/artifact-upload-form.tsx`, `apps/web/src/features/upload-progress/upload-progress.tsx`

### i18n-a11y

- **[major] nginx 라우트 생성 폼: timeout·bodySize 필드가 invalid 표시만 되고 오류 메시지를 렌더링하지 않음**
    - 근거: apps/web/src/features/nginx/nginx-route-create-form.tsx:167-189 — hostname/path/container/port 4개 필드는 `aria-describedby` + 오류 `<p>` 를 갖지만, timeout·bodySize 2개는 `aria-invalid` 만 있고 오류 문단이 아예 없다.

167  <Input
168      id="route-timeout"
169      name="timeoutSeconds"
...
175      aria-invalid={errors.timeoutSeconds !== undefined}
176  />
177  </div>
...
180  <Input
181      id="route-body-size"
182
    - 영향: timeout(1~3600) 또는 body size(1~1024) 범위를 벗어난 값을 넣고 제출하면 폼이 조용히 막힌다. 화면에는 빨간 링만 뜨고 이유가 어디에도 표시되지 않으며, 스크린리더는 `aria-describedby` 가 없으므로 "invalid" 만 읽고 사유를 못 읽는다. 사용자는 왜 라우트가 안 만들어지는지 알 수 없고, 상단 4개 필드만 훑어보면 오류 원인을 영영 못 찾는다.
    - 수정안: hostname 패턴과 동일하게 두 필드에 오류 문단을 추가한다. `aria-describedby={errors.timeoutSeconds === undefined ? undefined : 'route-timeout-error'}` 를 Input 에 붙이고 그 아래 `{errors.timeoutSeconds !== undefined && <p id="route-timeout-error" className="text-xs text-danger">{errors.timeoutSeconds}</p>}` 를 렌더링한다. bodySize 도 `route-body-size-error` 로 동일 처리. 6개 필드가 같은 구조를 반복하므로 `<FormField label error>` 같은 features 레벨 래퍼로 묶으면 누락이 구조적으로 불가능해진다.
    - 파일: `apps/web/src/features/nginx/nginx-route-create-form.tsx`
- **[major] nginx 라우트의 컨테이너 선택이 드롭다운이 아닌 자유입력 datalist — 존재하지 않는 컨테이너로도 라우트가 생성됨**
    - 근거: 사용자가 기대한 흐름 3번("드롭다운으로 골라 도메인에 연결")에 정면으로 해당한다.

apps/web/src/features/nginx/nginx-route-create-form.tsx:116-128 — 컨테이너는 `<Input list=...>` + `<datalist>` 자유입력이다.
116  <Input
117      id="route-container"
118      name="targetContainer"
119      list="route-container-options"
120      required
...
124  <datalist id="route-container-options">
125      {containers.map((container) => (
126          <
    - 영향: datalist 는 열림 화살표 같은 시각적 affordance 가 없어 사용자가 선택 가능한 목록이 있다는 사실 자체를 모른다(브라우저마다 동작도 다름). 더 심각한 건 오타나 이미 삭제된 컨테이너 이름을 입력해도 정규식만 통과하면 라우트가 그대로 생성된다는 점이다. 결과적으로 도메인이 502 를 내는데 패널 어디에도 경고가 없어, 사용자는 nginx 설정을 뒤지며 원인을 찾게 된다. 3단계 흐름 전체가 실패하는 가장 빈번한 경로다.
    - 수정안: protocol·image 필드와 동일하게 `Select` + `SelectItem`(컨테이너별)으로 교체해 선택지를 눈에 보이게 만든다. 자유입력을 유지해야 한다면(아직 안 뜬 컨테이너 대비) 최소한 제출 시 `containers.includes(value)` 를 확인해 미존재 시 "실행 중인 컨테이너가 아닙니다" 오류를 띄우고, 목록이 비었을 때는 "먼저 컨테이너를 생성하세요" 안내와 생성 화면 링크를 보여준다.
    - 파일: `apps/web/src/features/nginx/nginx-route-create-form.tsx`, `apps/web/src/widgets/nginx/nginx-route-control-widget.tsx`, `packages/contracts/src/nginx.ts`
- **[major] nginx directive 편집기: Label 이 체크박스에만 묶여 있어 값 입력 필드 156개가 접근 가능한 이름을 갖지 못함**
    - 근거: apps/web/src/widgets/nginx/nginx-directive-editor.tsx:133-148 — Label 의 `htmlFor` 가 Checkbox 의 id 를 가리키고, 정작 값을 넣는 Input 에는 id 가 없다.

135  <Checkbox id={`nginx-${entry.name}`} checked={checked} onCheckedChange={(next) => toggle(next === true)} />
136  <NginxHelpTooltip messageKey={helpKey}>
137      <Label className="shrink-0 font-mono text-sm" htmlFor={`nginx-${entry.name}`}>
138          {entry.
    - 영향: 스크린리더 사용자는 nginx 설정 편집 화면에서 값 입력칸이 무엇을 위한 것인지 알 수 없다 — 포커스하면 이름 없는 편집창으로만 읽힌다. directive 이름은 시각적으로 옆의 `<code>` 에만 존재해 접근성 트리에 연결되지 않는다. Label 클릭 시에도 입력칸이 아니라 체크박스가 토글돼 마우스 사용자에게도 혼란스럽다. 이 화면은 라우팅을 직접 좌우하는 설정 화면이라 영향이 크다.
    - 수정안: 값 Input 에 고유 id 를 주고 Label 을 그쪽으로 옮긴다. 체크박스는 활성화 토글이므로 `aria-label`(예: `t('nginxGui.enable', { name: entry.name })`)로 따로 이름 붙인다. 최소 수정으로는 Input/SelectTrigger 에 `aria-label={entry.name}` 을 추가한다. "기타 directive" 행의 Input 은 `aria-label={node.name}` 으로 인접 `<code>` 의 텍스트를 그대로 연결한다.
    - 파일: `apps/web/src/widgets/nginx/nginx-directive-editor.tsx`, `apps/web/src/widgets/nginx/nginx-block-editor.tsx`, `apps/web/src/widgets/nginx/nginx-upstream-editor.tsx`, `apps/web/src/shared/lib/nginx-config/nginx-directives.ts`
- **[minor] 모든 라우트 폼 검증 오류가 동일한 문구 하나로 뭉개짐**
    - 근거: apps/web/src/features/nginx/nginx-route-create-form.tsx:56-65 — zod issue 의 실제 사유를 버리고 모든 필드에 같은 문자열을 넣는다.

56  if (!result.success) {
57      const nextErrors: Record<string, string> = {}
58      for (const issue of result.error.issues) {
59          const field = issue.path[0]
60          if (typeof field === 'string') {
61              nextErrors[field] = labels.invalidValue
62          }
63
    - 영향: hostname 형식이 틀린 건지, path 가 `/` 로 시작하지 않은 건지, 포트가 범위를 벗어난 건지 구분할 수 없다. 사용자는 6개 필드를 하나씩 바꿔가며 추측으로 재시도해야 한다. zod 가 이미 정확한 사유를 알고 있는데 그 정보를 의도적으로 버리는 구조라 손해가 크다.
    - 수정안: `issue.message` 를 필드별로 보존하거나, `issue.code`·`issue.path` 를 메시지 키로 매핑해 필드별 문구를 보여준다(예: `nginxRouteError.hostnameFormat`). 세 로케일 카탈로그가 이미 정합하므로 키만 추가하면 된다. 최소한 hostname·path 처럼 형식 제약이 있는 필드에는 기대 형식 예시를 오류 문구에 포함시킨다.
    - 파일: `apps/web/src/features/nginx/nginx-route-create-form.tsx`, `apps/web/messages/ko.json`, `apps/web/messages/en.json`, `apps/web/messages/ja.json`
- **[minor] 가로 스크롤되는 표가 키보드로 스크롤 불가 — 넘친 컬럼에 접근할 수 없음**
    - 근거: apps/web/src/shared/ui/table.tsx:5-9 — 스크롤 컨테이너에 `tabIndex` 도 `role`/이름도 없다.

5  const Table: FC<ComponentProps<'table'>> = ({ className, ...props }) => (
6      <div data-slot="table-container" className="relative w-full overflow-x-auto">
7          <table data-slot="table" className={cn('w-full caption-bottom text-sm', className)} {...props} />
8      </div>
9  )

헤더 셀은 `whitespace-nowrap` 이라 좁은
    - 영향: 스크롤 컨테이너 자체는 있으므로(overflow-x-auto) 마우스·터치 사용자는 문제없다. 그러나 포커스 가능한 요소가 없는 셀(감사 로그의 시각·대상 텍스트 등)이 넘칠 경우, 키보드만 쓰는 사용자는 그 영역을 좌우로 스크롤할 수단이 없어 내용을 볼 수 없다. 좁은 화면·다국어(독일어처럼 긴 라벨) 환경에서 드러난다.
    - 수정안: 스크롤 컨테이너에 `tabIndex={0}` 과 `role="region"` + 표를 설명하는 접근 가능한 이름(`aria-label`, 또는 `aria-labelledby` 로 섹션 제목 참조)을 준다. shared/ui/table.tsx 한 곳만 고치면 전 표에 일괄 적용된다.
    - 파일: `apps/web/src/shared/ui/table.tsx`, `apps/web/src/widgets/audit/audit-widget.tsx`
- **[minor] 폼 컨트롤이 없는 <Label> 2곳 — 표 제목에 label 요소를 오용**
    - 근거: apps/web/src/widgets/panel-setting/panel-setting-widget.tsx:92 — 뒤따르는 것은 입력이 아니라 `<Table>` 이다.

91  <div className="grid gap-2">
92      <Label>{translations('panelSettingHostnameCandidates')}</Label>
93      <p className="text-xs text-text-subtle">{translations('panelSettingHostnameCandidatesDescription')}</p>
94      <Table>

같은 파일 145 도 동일 패턴:
145  <Label>{translations('panelSettingEffectiveOri
    - 영향: 연결된 컨트롤이 없는 `<label>` 은 유효하지 않은 마크업이며, 스크린리더가 이를 폼 라벨로 announce 하려다 아무것도 가리키지 못한다. 표와 제목의 프로그래밍적 연결도 없어 표가 무엇에 대한 것인지 전달되지 않는다.
    - 수정안: `<Label>` 을 제목 요소(예: `<p className="text-sm font-medium text-text-strong">` 또는 적절한 heading)로 바꾸고, 그 요소에 id 를 준 뒤 `<Table aria-labelledby={id}>` 로 표와 연결한다.
    - 파일: `apps/web/src/widgets/panel-setting/panel-setting-widget.tsx`
- **[minor] 비동기 작업 상태 변화를 알리는 live region 이 없음**
    - 근거: 코드베이스 전체에서 `aria-live` 는 0건, `role="status"` 는 Spinner 한 곳뿐이다.

apps/web/src/shared/ui/spinner.tsx:7 — 개별 스피너에만 있다:
7  <Loader2Icon role="status" aria-label="Loading" className={cn('size-4 animate-spin', className)} {...props} />

apps/web/src/features/upload-progress/upload-progress.tsx:22 — progressbar 는 있으나 live region 은 아니다:
22  role="progressbar"

배포 릴리스 진행 단계는 상태가 계속 바뀌지만 알림이 없다 — deployment
    - 영향: 이미지 업로드, 컨테이너 기동, 배포 릴리스 진행(creating→probing→observing→healthy)처럼 사용자가 기다리는 동작의 상태 변화가 스크린리더에 전혀 전달되지 않는다. 시각적으로는 배지가 바뀌지만 비시각 사용자는 작업이 끝났는지 실패했는지 알 수 없어 페이지를 반복 탐색해야 한다. 오류(Alert)는 이미 announce 되므로 성공·진행 경로만 비어 있다.
    - 수정안: 릴리스 진행 배지와 업로드 진행 영역을 `aria-live="polite"` 컨테이너로 감싸고, 상태 텍스트가 바뀔 때 읽히게 한다. progressbar 에는 `aria-valuenow`/`aria-valuetext` 로 진행률을 노출한다. toast(sonner)를 이미 쓰고 있다면 작업 완료 시 toast 를 함께 띄우는 것으로도 상당 부분 해소된다.
    - 파일: `apps/web/src/features/deployment-release-progress/deployment-release-progress.tsx`, `apps/web/src/features/upload-progress/upload-progress.tsx`, `apps/web/src/shared/ui/spinner.tsx`
