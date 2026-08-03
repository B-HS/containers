# 0024 — deploy·upload 경로의 durable job 전환과 resource lock·idempotency key 설계 결정

날짜: 2026-08-01 KST
상태: 구현 완료
근거: [RESUME-CHECKLIST.md](../RESUME-CHECKLIST.md) P0-B "deploy·upload를 durable job으로 전환하고 resource lock·idempotency key를 적용", [IMPLEMENTATION-PLAN.md](../IMPLEMENTATION-PLAN.md) Phase 5 "resource lock, idempotency key", [operation-job.ts](../../packages/contracts/src/operation-job.ts), [create-operation-job-service.ts](../../apps/api/src/service/domain/job/create-operation-job-service.ts)

## 배경

세 경로가 HTTP 요청 처리와 분리되지 않아 제어권·관측성·안전성이 부족하다.

1. **artifact load** — `POST /api/artifacts/:artifactId/load`가 `engineAgentClient.loadImage()`를 요청 스레드에서 동기 실행한다. 대용량 image archive(수 GB)는 수 분이 걸려 HTTP 응답이 블로킹되고, 중간 취소·재시도·실패 원인 추적이 불가능하다. 같은 artifact를 동시에 두 번 load 하면 두 개의 `deployment` 행이 생겨 상태가 모호해진다(resource lock 부재). 완료된 load 를 다시 요청하면 새 `deployment` 행이 생긴다(idempotency 부재).
2. **upload finalize** — `POST /api/uploads/sessions/:sessionId/finalize`가 전체 파일 sha256 재검증(최대 10GiB)과 artifact inspection 을 요청 스레드에서 동기 실행한다. 검증이 완료될 때까지 응답이 수 초~수 분 블로킹된다. 같은 내용을 두 번 업로드하면 `artifact.sha256` unique 제약 위반으로 잡히지 않은 DB 오류가 난다(내용 기반 idempotency 부재).
3. **release run/rollback** — `POST /api/deployment-manifests/:manifestId/releases`와 `POST /api/deployment-releases/:id/rollback`이 `void run().catch()` / `void runRollback().catch()` fire-and-forget 이다. 실패가 job timeline 에 남지 않고, 취소·재시도·완료 알림이 없다. 자체 상태 머신(`deployment_release.status`)과 boot reconcile 은 있으나 운영자가 진행 상황을 한 곳에서 볼 수 없다.

upload session **생성**에는 이미 idempotency key 가 있다(`upload_session_actor_idempotency_unique` unique index + route `idempotency-key` 헤더, min 8 max 128). 부족한 것은 위 세 경로다.

## 결정

### 1. 신규 job kind 4종

`OPERATION_JOB_KIND`에 다음을 추가한다.

- `deploy.load` — payload `{ artifactId }`. artifact image 를 engine 에 load 한다.
- `deploy.release` — payload `{ releaseId }`. release 의 run() 을 실행한다.
- `deploy.rollback` — payload `{ releaseId }`. release 의 runRollback() 을 실행한다.
- `upload.finalize` — payload `{ sessionId }`. 업로드 세션 검증·inspection·artifact 등록을 실행한다.

`operation_job.kind`는 SQLite `text`(CHECK 제약 없음, migration 0008 참조)이므로 kind 추가에 SQL migration 이 필요 없다. `schema.ts`의 enum 타입과 contracts `operationJobKindSchema`만 갱신한다.

### 2. resource-scoped unique: enqueue 확장 + `resource_key` 컬럼

기존 `enqueue({ unique: true })`는 **kind 단위**로만 active job 을 검사한다(같은 kind 의 active job 이 있으면 그 job 을 돌려줌). deploy/upload 는 kind 내부에서 **리소스 단위**로 잠가야 한다(artifact A 를 load 하는 중 artifact B 도 load 되어야 하고, 서로 다른 release 는 동시에 배포되어야 한다).

- `operation_job` 테이블에 `resource_key`(nullable text) 컬럼을 추가한다(migration 0010). `kind + resource_key` 복합 index 도 추가한다.
- `enqueue` input 에 `uniqueResourceKey?: string` 을 추가한다. 지정 시 active 검사 조건이 `kind` + `resource_key` 로 좁혀지고, active job 이 있으면 그것을 돌려준다(중복 enqueue 방지 = resource lock).
- contracts `operationJobSchema`에 `resourceKey: z.string().nullable()` 을 추가한다.

각 경로의 `uniqueResourceKey`:

| kind              | uniqueResourceKey | 잠금 범위                                                |
| ----------------- | ----------------- | -------------------------------------------------------- |
| `deploy.load`     | `artifactId`      | artifact 단위 — 같은 artifact 는 동시에 하나만 load      |
| `deploy.release`  | `releaseId`       | release 단위 — 중복 enqueue 방어(상태 머신 lock 도 병존) |
| `deploy.rollback` | `releaseId`       | release 단위 — 중복 enqueue 방어                         |
| `upload.finalize` | `sessionId`       | session 단위 — 같은 session 동시 finalize 방지           |

### 3. deploy.load — 행 생성은 handler 가, 응답은 job

`createDeploymentService.loadArtifact`를 두 단계로 나눈다.

- **route/service(동기, 빠름)**: (a) 해당 artifact 의 `status = 'loaded'` deployment 행이 이미 있으면 그것을 그대로 돌려준다(내용 idempotency fast path, job 불필요). (b) 없으면 `enqueue({ kind: 'deploy.load', uniqueResourceKey: artifactId, payload: { artifactId }, createdBy })` 를 호출해 job 을 받는다. 같은 artifact 의 active job 이 이미 있으면 그 job 을 돌려준다. (c) 응답은 `202 { job }`.
- **handler(비동기, 느림)**: artifact 의 기존 deployment 행을 `loaded`/`loading`/`failed` 순으로 재사용하고(같은 artifact 에 대한 active job 은 단 하나뿐이므로 그 행은 이 job 의 것), 없으면 새로 만든다. 그다음 `engineAgentClient.loadImage()` → 행을 `loaded`/`failed`로 갱신. loadImage 는 멱등(docker load)이므로 실패 시 기본 재시도(3회)를 허용한다. 결과는 `{ deploymentId, messages }`.

이 설계는 (1) 같은 artifact 동시 load 시 하나의 job·하나의 deployment 행만 생기고, (2) 완료된 load 를 다시 요청하면 job 없이 기존 행이 반환되며, (3) API 재시작 시 `reconcileInterrupted`가 running load job 을 재시도하고 handler 는 같은 행을 이어간다.

행 재사용 우선순위는 상수(`DEPLOYMENT_REUSE_STATUS_PRIORITY = ['loaded', 'loading', 'failed']`)로 고정한다. 같은 status 가 여럿이면 `createdAt` 내림차순으로 최신 행을 고른다.

### 4. upload.finalize — 내용 기반 idempotency

`finalizeSession`을 job handler 로 옮긴다. handler 는 다음 순서로 동작한다.

1. session 이 `uploading` 이 아니면 **이미 `artifact` 행에 이 session 의 sha256 이 존재하는지** 확인한다. 존재하면 그 artifact 를 돌려준다(재시도·재요청 멱등 완료).
2. `uploading` 이면 기존 검증(hashFile + inspect) → quarantine → ready rename → artifact insert + session `completed` 갱신을 수행한다. 단 **insert 직전에 한 번 더 `artifact.sha256` 로 중복을 조회**한다(content-addressed dedup). 검증이 오래 걸리는 사이 다른 세션이 같은 내용을 먼저 등록했을 수 있으므로, 존재하면 rename·insert 를 건너뛰고 기존 artifact 를 돌려주며 세션만 `completed` 로 갱신한다.
3. 실패 코드 `ARTIFACT_DIGEST_MISMATCH`·`UPLOAD_SESSION_INVALID`·`UPLOAD_INCOMPLETE`는 **terminal**(`createJobError(..., { terminal: true })`)로 표시한다 — 재시도로 해결되지 않는 검증 오류다. 그 외(디스크 등 일시적 오류)는 기본 재시도를 허용한다.

이로써 같은 내용의 archive 를 두 번 업로드해도 두 번째 finalize 가 기존 artifact 를 돌려주어 `artifact.sha256` unique 제약 위반이 사라진다. 응답은 `202 { job }`, job 결과는 `{ artifactId }`.

route 는 enqueue 하기 전에 **session 존재 여부와 actor 소유(`createdBy` 일치)를 동기로 검증**한다. 존재하지 않거나 남의 session 이면 job 을 만들지 않고 기존 오류 코드(`UPLOAD_SESSION_NOT_FOUND` 등)로 즉시 응답한다 — 잘못된 요청이 job timeline 을 오염시키지 않게 한다.

### 5. deploy.release / deploy.rollback — 상태 머신은 원천, job 은 실행·관측 래퍼

release 상태 머신(`deployment_release.status`)은 그대로 **진실의 원천**으로 유지한다. job 은 실행을 감싸 timeline·취소·실패 코드를 제공한다.

- route: `create()`(또는 `prepareRollback()`)는 동기로 수행해 상태를 `creating`(또는 `rolling-back`)으로 만들고(기존 `DEPLOYMENT_RELEASE_IN_PROGRESS` lock 유지), 이어서 `enqueue({ kind: 'deploy.release' | 'deploy.rollback', uniqueResourceKey: releaseId, payload: { releaseId }, createdBy })`. 응답은 `202 { release, job }`.
- handler: `run(releaseId)` / `runRollback(releaseId)`를 호출하고 **반환된 release 의 `status`·`failureCode`를 해석한다**. `run()`/`runRollback()`은 실패해도 내부 롤백 후 release 를 반환하므로(throw 하지 않음), handler 는 기대 상태(`healthy` / `rolled-back`)가 아니면 `failureCode`로 `createJobError(code, { terminal: true })`를 던져 job 을 실패로 기록한다.
- **재시도 금지**: `maxAttempts: 1`로 enqueue 한다. 이유 — (a) 상태 머신이 이미 해당 시도를 소비했고 재시도는 `DEPLOYMENT_RELEASE_STATE_INVALID`를 낳으며, (b) API 재시작 시 `operationJobService.reconcileInterrupted`가 running job 을 requeue 하는 대신 failed 처리하고, 실제 컨테이너·라우트 정리는 기존 `deploymentReleaseService.reconcileInterrupted()`가 담당한다(중복 reconciliation 방지).

### 6. route 응답 변경

| route                                                 | 이전             | 이후                                                |
| ----------------------------------------------------- | ---------------- | --------------------------------------------------- |
| `POST /api/artifacts/:artifactId/load`                | `201 deployment` | `200 { deployment }` 또는 `202 { job }`<sup>1</sup> |
| `POST /api/uploads/sessions/:sessionId/finalize`      | `201 artifact`   | `202 { job }`                                       |
| `POST /api/deployment-manifests/:manifestId/releases` | `202 release`    | `202 { release, job }`                              |
| `POST /api/deployment-releases/:id/rollback`          | `202 release`    | `202 { release, job }`                              |

<sup>1</sup> artifact load 는 두 응답을 갖는다. 해당 artifact 의 `status = 'loaded'` deployment 행이 이미 있으면 job 없이 `200 { deployment }`(idempotency fast path), 없으면 job 을 enqueue 하고 `202 { job }`. 클라이언트는 응답 body 의 key(`deployment` / `job`)로 두 경우를 구분한다.

audit 은 기존 패턴대로 route 에서 attempt/success/failure 를 기록하고(이미지 pull 등과 동일), job 실행 실패는 job timeline·failureCode 로 남긴다. 각 route 의 dependency 에 `operationJobService`(enqueue)를 추가한다.

### 7. server.ts wiring 순서 조정

job handler 가 `deploymentReleaseService`·`uploadService`를 필요로 하므로, 현재 `operationJobService` 생성(143행)이 두 service 생성(161·175행)보다 먼저인 순서를 **뒤집는다**: `deploymentReleaseService` → `uploadService` → `operationJobService(handlers)` 순으로 생성한다. `createJobHandlers`의 dependency 에 `deploymentService`, `deploymentReleaseService`(run·runRollback), `uploadService`(finalizeSession)를 추가한다.

### 8. Web

- `artifact-control-widget`: load/finalize 호출 후 `{ job }`을 받아 job status 를 polling(queued/running → loading 표시, succeeded → 목록 갱신, failed → 오류 표시)하도록 바꾼다. page refresh 를 없앤다.
- `deployment-control-widget`: deploy/rollback 응답을 `{ release, job }`으로 파싱하도록 바꾸고, 기존 active release 2초 polling 을 유지해 release 상태를 실시간 갱신한다.
- `job-control-widget`: 신규 kind 가 자동으로 나타나므로 변경 없음(단, i18n catalog 에 신규 kind 표기 문자열이 필요하면 추가).
- web entities 에 `{ job }` / `{ release, job }` 응답 schema 를 추가한다.

### 9. handler 공통 방어 — `job.createdBy` null

`operation_job.createdBy`는 nullable 이지만(system 발행 job), deploy.load·upload.finalize handler 는 actor 를 반드시 필요로 한다(deployment `createdBy` 기록, upload session 소유 검증). 두 handler 는 진입 시 `job.createdBy === null` 이면 `createJobError('JOB_ACTOR_MISSING', { terminal: true })`를 던진다 — 재시도로 해결되지 않으므로 terminal 이며, actor 없는 job 이 어떻게 만들어졌는지는 job timeline 에 남는다.

## 파일

- `packages/contracts/src/operation-job.ts` — kind 4종, payload schema, `resourceKey`
- `packages/db-schema/src/schema.ts` — `operationJob.resourceKey`, kind enum
- `packages/db-schema/drizzle/0010_*.sql` — `resource_key` 컬럼 + `(kind, resource_key)` index
- `apps/api/src/service/domain/deployment/create-deployment-service.ts` — load 를 job 으로 분리(행 재사용 + idempotency fast path)
- `apps/api/src/service/domain/upload/create-upload-service.ts` — finalize 를 job 으로 분리(내용 idempotency)
- `apps/api/src/service/domain/job/create-job-handlers.ts` — 신규 handler 4종 + deps
- `apps/api/src/service/domain/job/create-operation-job-service.ts` — `uniqueResourceKey` 지원
- `apps/api/src/route/deployment/create-deployment-route.ts`, `create-deployment-release-route.ts`, `apps/api/src/route/upload/create-upload-route.ts` — 202 + job 응답
- `apps/api/src/compose/create-app.ts`, `apps/api/src/server.ts` — wiring·생성 순서
- `apps/api/src/compose/create-app.test.ts` — stub·기대값 갱신
- `apps/web/src/widgets/artifact-control/`, `deployment-control/`, `apps/web/src/entities/` — job polling·응답 schema
- `docs/acknowledge/0024-deploy-upload-durable-job.md`(본 문서)

## 검증

- 단위: `enqueue(uniqueResourceKey)` 가 같은 리소스의 active job 을 돌려주고 다른 리소스는 새 job 을 만든다; deploy.load handler 가 `loaded` 행 재사용·`loading` 이어가기·신규 생성; upload.finalize handler 가 기존 artifact(sh256) 멱등 반환; release handler 가 비기대 상태를 terminal 실패로 기록.
- 통합: 4개 route 가 202 + job 을 반환하고, enqueue 실패/인가 실패 시 기존 오류 코드 유지.
- 전체 gate(typecheck·lint·format·test·build) 후 api·web Compose 재배포와 runtime 실측(job timeline 에 deploy/upload 진행 표시, load 중 페이지 블로킹 없음).

## 구현 후 감사 반영 (2026-08-02)

구현물을 컨벤션·문서 기준으로 감사해 아래를 정리했다.

- 구현 중 들어간 코드 주석을 제거하고, 설명이 필요한 내용은 본 문서(§3 행 재사용 우선순위, §4 insert 직전 dedup)로 옮겼다.
- `upload.finalize` route 가 enqueue 전에 session 존재·actor 소유를 동기 검증하도록 정리했다(§4) — 잘못된 요청이 job 을 만들지 않는다.
- deploy.load handler 의 행 재사용 우선순위를 `loaded → loading → failed` 상수로 고정하고, 동일 status 는 `createdAt` 최신 행을 쓰도록 명시했다(§3).
- web 은 `{ job }` / `{ release, job }` 응답 schema 를 entities 로 통일하고, artifact·deployment 위젯이 중복 구현하던 job polling 을 공통 hook 으로 합쳤다(§8).
- 테스트를 보강했다 — `uniqueResourceKey` 잠금 범위, handler 의 `JOB_ACTOR_MISSING` terminal 처리, finalize 의 sha256 dedup 경로, route 응답(200 fast path / 202 job).
