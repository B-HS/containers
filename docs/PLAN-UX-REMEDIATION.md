# 실행 계획 — 패널 UX 감사 후속 + 런타임 개방 + compose 스택

- 작성일: 2026-08-05
- 기준 커밋: `5f986fd`
- 근거: [quality-assurance/2026-08-05-panel-ux-audit.md](./quality-assurance/2026-08-05-panel-ux-audit.md) (원본 64건 → 반증 검증 44건 → 원인 12개)
- 사용자 확정 방향
    1. **표준 이미지가 기본으로 떠야 한다.** "어떤 이미지가 올라올 줄 알고 특정 이미지 세팅을 강요할 수 없다."
    2. **compose 는 (b) 본격 지원.** `compose.yml` 업로드 → 서버가 manifest N개로 변환 → 스택 단위 배포·롤백.
    3. 굵직한 단위마다 commit / push.

이 문서는 **작업 중 컨텍스트가 요약돼도 판단이 흔들리지 않게** 하려고 쓴다. 각 항목에 왜 그렇게 고치는지, 무엇을 건드리면 안 되는지, 완료 판정 기준을 함께 적는다.

---

## 0. 절대 흔들리면 안 되는 전제

작업 도중 "간단하게 하려고" 아래를 어기면 안 된다. 어기면 이 저장소의 기존 보안 계약이 깨진다.

| 전제                                                                                | 근거                                                                                                                                                                       |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 호스트 bind mount 를 패널이 허용하지 않는다                                         | `/var/run/docker.sock` 하나로 admin 이 호스트 root 를 얻는다. `packages/config/src/compose-security.ts` + `scripts/audit-runtime-security.ts` 가 강제하는 원칙과 정면 충돌 |
| 관리 plane 컨테이너·볼륨·네트워크·hostname 보호를 약화하지 않는다                   | `PROTECTED_CONTAINERS`·`PROTECTED_VOLUMES`·`protectedHostnames`·`isManagementPlaneResource`                                                                                |
| `compose.yaml`(이 저장소 스택)의 보안 불변식 테스트를 고쳐서 통과시키지 않는다      | `CLAUDE.md` §4                                                                                                                                                             |
| 사용자 컨테이너에 `privileged`·host namespace·docker socket 을 절대 허용하지 않는다 | 신규 compose 파서가 이 키를 만나면 **거부**한다. 무시가 아니라 거부다                                                                                                      |
| 시크릿을 코드·문서·로그에 남기지 않는다                                             | compose `environment` 값은 그대로 저장하지 않고 secret 참조로만 받는다                                                                                                     |

---

## 1. 체크리스트

진행 상태는 이 문서와 `PROCESS.md` 양쪽에 반영한다. 커밋 단위는 `—` 뒤에 적었다.

### P0 — 흐름을 조용히 깨뜨림

- [x] **1.1 컨테이너 요약 계약 확장** — `72cb596` 실측: `demo-a` 에서 `8080/tcp` + `containers_edge` 확인
- [x] **1.2 라우트 대상 검증(서버) + Select 전환(웹)** — 실측: 없는 대상 400 `NGINX_ROUTE_TARGET_NOT_FOUND`, bridge 컨테이너 400 `NGINX_ROUTE_TARGET_UNREACHABLE`, edge 컨테이너 201
- [x] **1.3 job 실패 표면화** — 실측: 브라우저에서 잘못된 tar 를 업로드하니 재시도 소진 후 화면에 실패 배너와 사유가 뜨고 진행률이 초기화됐다. 종료 후 job 폴링도 멈춘다

### P0' — 런타임 개방 (사용자 1순위 요구)

- [x] **2.1 컨테이너 런타임 프로필 도입** — 실측: 순정 `nginx:1.29-alpine` 무설정 배포 healthy, `https://a.hyuns.uk` 200. `SYS_ADMIN` 요청 400
- [x] **2.2 배포 실패 진단 노출** — 실측: 일부러 exit 3 하는 이미지를 배포하니 job event `detail` 에 `stage=probe`·`exitCode=3`·리댁션된 로그 8줄(`REGISTRY_TOKEN=[REDACTED]`)이 남았고, 배포 화면 실패 릴리스에서 단계·종료 코드·로그 아코디언이 렌더됐다. 결정 기록 [acknowledge/0039](./acknowledge/0039-deployment-failure-diagnostics.md)

### P1 — compose 스택 (사용자 확정: 본격 지원)

- [x] **3.1 compose 파싱·변환 계약** — 변환기 테스트 13건. manifest `route` 를 nullable 로 바꿔야 했다(내부 서비스). 결정 기록 [acknowledge/0040](./acknowledge/0040-compose-stack-contract.md)
- [x] **3.2 스택 저장·조회 API** — `feat(api): compose 스택 등록과 미리보기를 제공한다`. migration `0020`, preview/create/list/get 4개 라우트, 테스트 13건. 값 없는 환경변수 키를 거부로 바꿨다(결정 [0041](./acknowledge/0041-deployment-stack-persistence.md)). **실측은 6.2 에서 한다 — 아직 실제 compose 로 저장해 본 적이 없다**
- [x] **3.3 스택 릴리스 오케스트레이션** — `feat(deployment): 스택 단위 순차 배포와 롤백을 구현한다`. job kind `deploy.stack-release`, 되돌리기 2경로(이전 버전 있으면 rollback·없으면 revert), 테스트 12건. 결정 [0042](./acknowledge/0042-stack-release-orchestration.md). **실측은 6.2**
- [x] **3.4 스택 웹 화면** — `feat(web): compose 업로드와 스택 배포 화면을 추가한다`. `/deployments/stacks` 신규 페이지, 미리보기·등록·배포. 실측: 브라우저에서 2서비스 compose 미리보기가 위상 순서·내부 서비스·무시 목록까지 렌더되고, 값 없는 환경변수는 토스트로 거부된다(어느 키인지는 4.1 에서 드러낸다). 다크 팔레트 확인

### P1 — 마찰 해소

- [x] **4.1 에러 파싱 통일** — `fix(web): 서버가 준 실패 사유를 화면에 그대로 전달한다`. 검증 issue 배열·compose 거부 상세를 읽고, 에러 코드를 Error 에 실어 보존한다. 아티팩트 검사 실패도 안정적인 코드로 정규화했다. 실측: compose 거부 토스트가 `app: LOG_LEVEL 에 값이 없다…` 처럼 서비스·키를 그대로 보여준다
- [x] **4.2 단계 간 CTA 링크** — `feat(web): 배포 흐름 단계 사이를 잇는 이동 경로를 만든다`. 개요 온보딩 카드, 이미지 행 → `/containers/new?image=`, 컨테이너 생성 후 포트가 있으면 `/nginx/routes?container=&port=`. 실측: 프리필 3곳 확인. **아티팩트 load 후 태그·CTA 는 아티팩트가 없어 미실측 — 6.1 에서 확인한다**
- [ ] **4.3 라우트 수정·토글** — `feat(nginx): 라우트 수정과 사용 여부 전환을 지원한다`
- [ ] **4.4 라우트 소유권 표시** — `feat(nginx): 배포가 관리하는 라우트를 구분한다`
- [ ] **4.5 job 진행 가시화** — `feat(web): 실행 중 작업의 진행과 이력을 보여준다`
- [ ] **4.6 업로드 재개·취소** — `feat(web): 대용량 업로드를 재개하고 취소할 수 있게 한다`
- [ ] **4.7 manifest 폼 하드코딩 해소** — `feat(web): 배포 manifest 의 남은 계약 필드를 화면에 연다`

### P2 — 품질·접근성

- [ ] **5.1 nginx 편집기 컨테이너 인지 + 두 화면 역할 안내**
- [ ] **5.2 접근성 4건**
- [ ] **5.3 삭제 확인 다이얼로그 피드백**

### 최종

- [ ] **6.1 전 구간 재검증** — 표준 `nginx` 이미지로 업로드→배포→`https://a.hyuns.uk` 200
- [ ] **6.2 compose 스택 실측** — 2서비스 compose 업로드→스택 배포→두 도메인 확인
- [ ] **6.3 문서 정합** — `llm.txt`·`UPLOAD-DEPLOYMENT.md`·`API-DATA-AUTH.md`·`SECURITY.md`·CI 예시
- [ ] **6.4 정리** — 테스트 컨테이너·이미지·아티팩트·라우트·API key·임시 계정 제거

---

## 2. 항목별 상세

### 1.1 컨테이너 요약 계약 확장

**문제.** `packages/contracts/src/engine.ts` 의 `containerSummarySchema` 에 포트와 네트워크가 없다. 그래서 (a) 라우트 폼이 포트를 자유 입력으로 둘 수밖에 없고, (b) 사용자가 포트를 알려면 `/containers` → 상세 → `<pre>` 의 raw JSON 덤프에서 눈으로 찾아야 한다. `exposedPorts` 는 `containerDetailSchema` 에만 있다.

**할 일.**

- `containerSummarySchema` 에 추가: `exposedPorts: z.array(z.string())`, `networks: z.array(z.string())`.
- `apps/engine-agent/src/service/domain/create-engine-query-service.ts` 의 `getContainers` 매핑에서 채운다. Docker `/containers/json?all=true` 응답에 `Ports`(배열)와 `NetworkSettings.Networks`(맵)가 있다. **`create-docker-engine-client.ts` 의 `dockerContainerSummaryListSchema` 에 두 필드를 먼저 추가해야 한다** — 현재 스키마가 그 필드를 파싱하지 않는다.
- `container-detail-card.tsx` 의 `<dl>` 에 포트·네트워크를 노출한다.

**주의.** `getContainers` 는 이미 `isManagementPlaneResource(container.Labels)` 로 관리 plane 을 걸러낸다(감사의 "관리 plane 노출" 주장은 오탐이었다). 이 필터를 건드리지 않는다.

**완료 판정.** `GET /api/containers` 응답의 각 항목에 `exposedPorts`·`networks` 가 있고, 실행 중 데모 컨테이너에서 `8080/tcp` 와 `containers_edge` 가 보인다.

---

### 1.2 라우트 대상 검증 + Select 전환

**문제.** 세 겹으로 뚫려 있다.

1. 웹: `apps/web/src/features/nginx/nginx-route-create-form.tsx:116-128` 이 `<Input list="route-container-options">` + `<datalist>`. 같은 폼의 protocol 은 진짜 `<Select>` 라, 디자인시스템이 없어서가 아니라 선택하지 않은 것이다.
2. 계약: `packages/contracts/src/nginx.ts:54` 가 `containerTargetPattern` 형식만 본다.
3. 서버: `create-nginx-proxy-route-service.ts:178-201` 은 보호 hostname·보호 대상·충돌만 본다. **서비스 deps 에 engine 조회 수단 자체가 없다.**

그리고 렌더된 config 가 변수 `proxy_pass` 를 쓴다(`:59` `set $containers_route_upstream ...`) + `resolver 127.0.0.11` 이라 **`nginx -t` 도 reload 도 성공한다.** 잘못된 대상은 요청 시점 502 로만 드러난다.

**할 일.**

- 서버: `NginxProxyRouteServiceDependencies` 에 컨테이너 조회를 추가하고 `create`/`upsert` 에서 검증한다.
    - 대상이 존재하지 않으면 `NGINX_ROUTE_TARGET_NOT_FOUND`
    - 대상이 nginx 와 공유하는 네트워크에 없으면 `NGINX_ROUTE_TARGET_UNREACHABLE`
    - 둘 다 400. 에러 코드 3파일(`error-code.ts`·`error-message.ts`·`error.ts` STATUS_MAP)에 모두 추가한다.
    - **API key 경로에도 같은 실수가 가능하므로 서버 검증이 본체다.** 웹 Select 는 편의일 뿐이다.
- 웹: `Input+datalist` → `Select`. 옵션은 `useGetContainerList()` 로 구독하고(현재는 SSR 스냅샷 `string[]` prop 이라 같은 세션에서 만든 컨테이너가 안 나타난다) 라벨에 이미지·상태를 함께 보인다. 선택 시 `exposedPorts` 첫 값으로 포트를 채운다.
- 라우트 테이블: 대상이 없거나 중지 상태면 경고 Badge. 선례는 `image-widget.tsx:84-86`.

**주의.** 중지된 컨테이너를 후보에서 완전히 빼면 "잠시 멈춘 서비스의 라우트를 미리 만들어 두는" 정당한 사용이 막힌다. **후보에는 넣되 상태를 표시하고, 서버 검증도 '존재'까지만 강제하고 '실행 중'은 강제하지 않는다.**

**완료 판정.** 존재하지 않는 이름으로 `POST /api/nginx/routes` → 400 + 전용 코드. 웹에서 컨테이너를 고르면 포트가 자동으로 찬다.

---

### 1.3 job 실패 표면화

**문제(수정 전 기준).** `apps/web/src/entities/job/job.query.ts` 의 폴링 훅이 `status !== SUCCEEDED` 면 early return 했다. `FAILED` 분기가 없어서, 업로드 finalize 나 이미지 load 가 실패해도 **직전 성공 토스트만 남고 스피너가 조용히 사라진다.** API 는 실패를 명확히 기록한다(`create-job-handlers.ts` 의 `ARTIFACT_DIGEST_MISMATCH`·`UPLOAD_INCOMPLETE`).

부수 문제: `refetchInterval` 이 상수라 **종료된 job 도 1초마다 무한 폴링**한다.

**할 일.**

- `job.query.ts` — `onFailed`/`onSucceeded` 콜백, `failureCode`·`status` 반환, `refetchInterval` 을 함수형으로 바꿔 활성 상태에서만 폴링. (구현된 이름은 `onSucceeded` 다 — 계획서 초안의 `onSettled` 가 아니다)
- 소비 위젯 `artifact-widget.tsx`·`artifact-upload-form.tsx` — 실패 토스트 + 인라인 배너, 진행률 초기화.

**완료 판정.** 일부러 sha256 이 어긋난 업로드를 finalize 하면 화면에 실패와 코드가 뜬다. 종료 후 네트워크 탭에 job 폴링이 멈춘다.

**결과(2026-08-06).** 완료. 실측은 sha256 대신 잘못된 tar 로 했다 — 클라이언트가 digest 를 직접 계산하므로 불일치를 UI 로 만들 수 없다.

- **이 항목을 실측하려다 별개 blocker 를 찾았다.** CSP 가 WebAssembly 를 막아 브라우저 업로드가 아예 동작하지 않았다. `hash-wasm` 으로 증분 sha256 을 계산하기 때문이다. → [bug/2026-08-06-csp-blocks-upload-hashing.md](./bug/2026-08-06-csp-blocks-upload-hashing.md)
- 배너에 뜨는 문자열이 에러 코드가 아니라 tar 라이브러리의 영어 예외 메시지다(`Invalid tar header...`). finalize 실패가 코드로 정규화되지 않는 기존 문제이고 **4.1 에서 함께 정리한다**.
- 로케일 카탈로그 키 정합 테스트가 없어 한 로케일 누락이 조용히 통과하던 것도 함께 막았다(`apps/web/src/i18n/messages.test.ts`).

---

### 2.1 컨테이너 런타임 프로필 (사용자 1순위)

**문제 — 여기가 이번 작업의 핵심이다.**

`apps/engine-agent/src/service/shared/create-docker-engine-client.ts:535` 가 **`CapDrop: ['ALL']` 을 하드코딩**한다. 이건 배포뿐 아니라 **패널 컨테이너 생성에도 적용된다.** 거기에 `readOnlyRootFilesystem` 기본값이 `true`(`engine-control.ts:128`), tmpfs 는 `/tmp` 하나뿐(`:543`), 배포 경로는 아예 `readOnlyRootFilesystem: true` 를 하드코딩한다(`create-deployment-release-service.ts:400`).

실측으로 확인한 결과(감사 문서 §13):

| 이미지                                   | 결과                                                                               |
| ---------------------------------------- | ---------------------------------------------------------------------------------- |
| 순정 `nginx:1.29-alpine`                 | `mkdir("/var/cache/nginx/client_temp") failed (Read-only file system)` → 즉시 종료 |
| temp 경로를 `/tmp` 로 옮긴 nginx         | `chown("/tmp/client_temp", 101) failed (Operation not permitted)` — CAP_CHOWN 없음 |
| busybox httpd, non-root, 8080, 쓰기 없음 | healthy                                                                            |

즉 **표준 이미지 대부분이 뜨지 않는다.** 대부분의 공식 이미지 entrypoint 는 시작할 때 디렉터리를 만들고 소유권을 바꾸고 권한을 낮춘다. 그러려면 `CHOWN`·`SETUID`·`SETGID`·`DAC_OVERRIDE` 가 필요하다.

**설계 — 프로필 + 세부 조정.**

`packages/contracts/src/engine-control.ts` 와 `deployment.ts` 에 공통 `runtime` 블록을 둔다.

```
runtime: {
    profile: 'standard' | 'hardened'   // 기본 'standard'
    writablePaths: string[]            // hardened 에서 tmpfs 로 마운트할 경로
    capabilities: string[]             // standard 기준에서 추가로 허용할 목록
}
```

- **`standard`(기본)** — 쓰기 가능한 루트, Docker 기본 capability 집합에서 **위험한 것만 제거**(`SYS_ADMIN`·`SYS_PTRACE`·`SYS_MODULE`·`NET_ADMIN`·`SYS_RAWIO`·`SYS_BOOT`·`MAC_ADMIN`·`MAC_OVERRIDE`), `no-new-privileges` 유지, memory·cpu·pids 상한 유지.
- **`hardened`(옵트인)** — 지금 동작 그대로. `readOnlyRootFilesystem` + `CapDrop: ALL` + `writablePaths` 를 tmpfs 로.

**왜 기본을 여는가.** 사용자 요구가 명확하다 — "어떤 이미지가 올라올 줄 알고 특정 이미지 세팅을 강요할 수 없다". 기본이 열려 있어도 `no-new-privileges` + capability 거부목록 + 자원 상한 + 관리 plane 보호 + 네트워크 격리가 남는다. 이건 `docker run` 기본값보다 여전히 엄격하다. 반대로 지금처럼 기본이 닫혀 있으면 **제품이 성립하지 않는다.**

**절대 허용하지 않는 것.** `privileged`, host namespace(`pid`/`ipc`/`uts`/`network`), docker socket 마운트, 호스트 bind mount, 거부목록 capability. `capabilities` 입력은 **화이트리스트 검증**을 거쳐 거부목록에 있는 값이 오면 400 이다.

**할 일.**

- 계약에 `runtime` 추가. 기존 `readOnlyRootFilesystem` 은 `runtime.profile` 로 대체하되, 저장된 기존 manifest 가 깨지지 않게 migration 에서 `profile='hardened'` 로 채운다(기존 배포의 동작을 바꾸지 않는다).
- `create-docker-engine-client.ts` — `CapDrop` 하드코딩 제거, 프로필에 따라 `CapDrop`/`CapAdd`/`ReadonlyRootfs`/`Tmpfs` 구성.
- `create-deployment-release-service.ts:400` — 하드코딩 제거, manifest 의 `runtime` 사용.
- 웹: 컨테이너 생성 폼의 read-only 스위치를 프로필 선택으로 바꾸고, hardened 일 때만 `writablePaths` 입력을 보인다.
- 보안 문서에 새 기본값과 근거를 적는다.

**완료 판정.** 순정 `nginx:1.29-alpine` 을 아무 설정 없이 업로드→배포하면 healthy 가 되고 도메인에서 200 이 나온다. `capabilities: ['SYS_ADMIN']` 은 400.

---

### 2.2 배포 실패 진단 노출

**문제.** 컨테이너 로그에 원인이 명확히 있는데 job·release 는 코드 하나만 남긴다.

```
job events:  {"code": "DEPLOYMENT_HEALTHCHECK_FAILED"}
release:     failureCode=DEPLOYMENT_HEALTHCHECK_FAILED, containerName=demo-a-1.0.0-...
```

`containerName` 은 저장하면서 그걸로 뭘 볼 수 있는 경로가 없다. 원인 파악에 호스트 `docker logs` 가 필요했다.

**할 일.** probe 실패 시 `inspectContainer` 로 `State.ExitCode`·`State.Error` 를 읽고 `getContainerLogs` 로 마지막 N줄을 받아 job event `detail` 에 담는다. release 상세 화면에 노출한다.

**주의.** 로그에 시크릿이 섞일 수 있다. **저장 줄 수를 제한**하고(예: 20줄), production 응답에서 `details` 를 감추는 기존 정책(`docs/API-DATA-AUTH.md` §3)과 충돌하지 않게 job event detail 로만 남긴다.

**완료 판정.** 일부러 실패하는 이미지를 배포하면 job event 에 exit code 와 로그 꼬리가 남는다.

**결과(2026-08-06).** 완료. 설계와 달랐던 점과 함께 고친 것을 남긴다.

- 계획서가 적은 `inspectContainer` 는 존재하지 않는 이름이다. API 측 클라이언트의 inspect 는 `getContainer` 이고 `containerDetailSchema.state` 에 `exitCode`·`error`·`running`·`finishedAt` 이 이미 있다. agent 라우트 추가는 필요 없었다.
- 수집은 릴리스 서비스가 하고 job handler 가 `reportProgress` 로 연결한다. 서비스는 job 을 모른 채 `run(id, { reportDiagnostics })` 콜백만 받는다.
- **시크릿 리댁션 유틸이 저장소에 없었다.** `SECURITY.md` §9 등 3개 문서가 있다고 기술했지만 구현이 없었다. `packages/config/src/redact-log.ts` 로 만들고 적용 범위(배포 실패 진단 한 곳)를 문서에 명시했다.
- **`DEPLOYMENT_RELEASE_FAILED` 가 `ERROR_CODE` 에 없어 500 으로 떨어지고 있었다.** 3파일에 400 으로 등록했다.
- 진단은 job event 에만 둔다. `GET /api/deployment-releases` 는 전 역할이 볼 수 있어 release 계약에 넣으면 컨테이너 로그가 viewer 에게 열린다.
- 남은 범위: 수동 롤백(`runRollback`) 실패에는 진단이 붙지 않는다. 로그 조회 API·SSE stream 은 여전히 원문이다(영속화가 없는 경로).

---

### 3.x compose 스택 (본격 지원)

**전제 확인.** `Bun.YAML.parse` 가 런타임에 존재한다(Bun 1.3.14, `packages/config/src/compose-security.test.ts:7` 이 이미 사용). **YAML 의존성을 새로 추가하지 않는다.**

**설계.**

1. `POST /api/deployment-stacks/preview` — compose YAML 텍스트(크기 상한)를 받아 파싱하고 **변환 결과를 미리 보여준다.** 저장하지 않는다.
    - 지원: `services.*.image`, `command`, `entrypoint`, `environment`(`secret:<reference>` 값만 — 3.1 결과: 값 없는 키는 현재 조용히 버려진다), `ports`(컨테이너 포트만 추출), `volumes`(named volume 만), `depends_on`, `healthcheck`(타이밍만), `restart`, `deploy.resources.limits`
    - 무시: 로컬 개발 전용 키(`build`·`develop`·`profiles`·`env_file` 등)와 `networks`(스택 서비스는 배포 네트워크에 함께 붙는다) — **무시 목록을 응답에 명시**한다
    - 거부: `privileged`, `pid`/`ipc`/`uts`/`network_mode: host`, `cap_add` 거부목록, 호스트 bind mount, docker socket — **조용히 무시하지 않고 400 으로 거부**한다
2. `POST /api/deployment-stacks` — 미리보기와 같은 변환을 수행하고 `deployment_stack` + manifest N개를 한 트랜잭션으로 저장한다.
3. `POST /api/deployment-stacks/{id}/releases` — `depends_on` 위상 정렬 순서로 서비스별 릴리스를 수행하고, 하나라도 실패하면 **이미 전환된 서비스를 역순으로 롤백**한다.

**DB.** 3.1 에서 확정한 계약이 정본이다 — `deploymentStackSchema` 는 `manifestIds: uuid[]` + `serviceOrder: string[]` 를 갖는 **정참조**이고 `composeSource` 필드가 없다. 따라서 `deployment_manifest.stackId` 역참조 안은 폐기했다. 3.2 에서 만든 것: `deployment_stack`(id·name·version·manifestIdsJson·serviceOrderJson·createdBy·createdAt·updatedAt) + `deployment_stack_release`(스택 릴리스 묶음, `status='releasing'` 부분 unique index 로 스택당 1건 잠금), migration `0020`. **compose 원문은 보관하지 않기로 확정했다** → [acknowledge/0041](./acknowledge/0041-deployment-stack-persistence.md). 기존 단일 manifest 흐름은 그대로다.

**주의.**

- `ports` 의 호스트 포트는 **무시한다.** 이 제품은 nginx 라우트로 노출하지 콘테이너 포트를 호스트에 publish 하지 않는다(loopback publish 불변식). 무시 목록에 그 사실을 적는다.
- `environment` 에 값이 그대로 적혀 있으면 **거부**한다. 시크릿이 compose 파일에 평문으로 들어오는 걸 받아주면 안 된다. secret 참조 문법만 허용한다.
- 서비스 간 이름 해석은 같은 Docker 네트워크에 붙이면 자동으로 된다. 별도 구현이 필요 없다.

**완료 판정.** 2서비스 compose 를 업로드해 스택 배포하면 두 컨테이너가 뜨고 각 도메인에서 200 이 나온다. 두 번째 서비스를 일부러 실패시키면 첫 서비스가 롤백된다.

---

### 4.x 마찰 해소 (요약)

| 항목              | 핵심                                                                                                                                                                                                                                                       | 파일                                                                                                                                                 |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4.1 에러 파싱     | **완료.** 봉투·issue 배열·평평한 message 3형태를 읽고 `details.rejections` 를 메시지 뒤에 붙인다. `parseApiErrorCode` 로 코드를 보존해 `ApiError.code` 로 던진다(로케일 매핑은 아직 없다 — 서버 한국어 메시지를 그대로 쓴다). error 인자를 버리던 5곳 수정 | `shared/lib/parse-api-error.ts`, `client-fetch.ts`, `container-create-widget.tsx:82`, `prune-widget.tsx:51`, `container-control-widget.tsx:73,87,97` |
| 4.2 CTA 링크      | artifact load 성공 시 생성된 태그 표시 + `/containers/new?image=`, 이미지 행에 "컨테이너 만들기", 컨테이너 생성 후 `/nginx/routes?container=&port=`, 개요에 온보딩 카드                                                                                    | `artifact-widget.tsx`, `image-widget.tsx`, `container-create-widget.tsx`, `overview-widget.tsx`                                                      |
| 4.3 라우트 수정   | `upsert` 는 이미 구현돼 있고 배포만 쓴다. `PUT /nginx/routes/:id` 로 노출하고 `pathMode`·`enabled` 를 폼에 연다(둘 다 서버는 쓰는데 UI 가 하드코딩)                                                                                                        | `create-nginx-route.ts`, `nginx.query.ts`, `nginx-route-create-form.tsx`                                                                             |
| 4.4 라우트 소유권 | `nginx_route` 에 `managedBy`(manifest id) 추가. 배포가 만든 라우트를 수동 삭제하면 서비스가 끊기고 자동 복구되지 않는다                                                                                                                                    | `schema.ts`, `create-deployment-release-service.ts`, `nginx-route-table.tsx`                                                                         |
| 4.5 job 진행      | `jobListQueryOptions` 에 조건부 폴링, `/jobs/:id/events` 를 실제로 호출(웹에 grep 0건), 전역 셸에 활성·실패 배지                                                                                                                                           | `job.query.ts`, `job-widget.tsx`, `panel-shell-nav.tsx`                                                                                              |
| 4.6 업로드 재개   | 서버는 재개 전제인데(`OFFSET_MISMATCH`, idempotency-key 재사용) 클라가 매번 새 UUID + offset 0. 파일 sha256 기반 키로 바꾸고 `receivedBytes` 부터 재개. AbortController 로 취소                                                                            | `artifact.query.ts`, `artifact-upload-form.tsx`                                                                                                      |
| 4.7 manifest 폼   | `deployment-manifest-form.tsx:52-71` 이 volumes·protocol·restartPolicy·entrypoint·stripPrefix·healthcheck 타이밍 4개·pidsLimit 을 하드코딩. **볼륨을 못 붙여 상태 있는 컨테이너를 배포할 수 없다**                                                         | `deployment-manifest-form.tsx`                                                                                                                       |

---

### 5.x 품질·접근성 (요약)

- **5.1** `nginx-upstream-editor.tsx:169-175` upstream 주소가 제안 없는 자유 텍스트. `/nginx` 와 `/nginx/routes` 의 역할 차이 설명·상호 링크 없음.
- **5.2** `nginx-directive-editor.tsx:135-147` 의 `Label htmlFor` 가 Checkbox 를 가리켜 값 입력 155개가 접근 가능한 이름을 못 가진다. `shared/ui/table.tsx:5-9` 의 `overflow-x-auto` 에 `tabIndex`/`role` 없음(한 파일 고치면 전 표 적용). `panel-setting-widget.tsx:92,145` 컨트롤 없는 `<Label>`. `aria-live` 저장소 전체 0건.
- **5.3** `confirm-remove-dialog.tsx:67` 이 입력해야 할 값을 `truncate` 로 자르고 `title` 도 없다. 불일치 시 버튼만 비활성.

---

## 3. 작업 규칙

- 굵직한 항목 하나 = 커밋 하나. 커밋 전 `bun run typecheck` → `lint` → `test` → 필요 시 `build`.
- 런타임을 건드리는 항목(2.1, 2.2, 3.x)은 **compose 재빌드 후 실측**한다. 정적 검사 통과는 완료가 아니다.
- 계약을 바꾸면 `docs/llm.txt` 드리프트 테스트가 깨질 수 있다. 계약 변경과 문서 갱신을 같은 커밋에 넣는다.
- 새 워크스페이스 패키지를 만들면 `apps/*/Dockerfile` 4개에 `COPY` 2줄씩 추가한다.
- 감사 발견이 코드와 어긋나면 **코드를 신뢰**하고 이 문서를 고친다. 이미 오탐 1건이 있었다.
