# 0014 — Durable operation job queue 설계 결정

날짜: 2026-08-01 KST
상태: 구현 완료 (live 24시간 주기 job 실행 증거만 잔여 — PROCESS.md Phase 8 g-2)
근거: [HANDOFF-STATUS.md](../HANDOFF-STATUS.md) §8 P0-2, §9 권장 순서 1·3

## 배경

장기 작업(backup, 이후 image pull·prune·traffic export·notification·upgrade)이 프로세스 메모리의 in-flight promise 로만 존재해, API 재시작 시 진행 상태·실패 이력·취소 수단이 모두 사라진다. 자동 backup 은 `server.ts` 의 `setInterval` 하나이며 실패를 조용히 삼키고 재시작 후 첫 interval 까지 실행되지 않는다.

## 결정

### 1. 저장소 — control DB 신규 테이블 2개

- `operation_job`: id(uuid), kind, status, payload(JSON text), result(JSON text), failureCode, attempt, maxAttempts, progressStep, createdBy(nullable FK user, system job 은 NULL), scheduledAt, startedAt, heartbeatAt, cancelRequestedAt, finishedAt, createdAt, updatedAt
- `operation_job_event`: id, jobId(FK cascade), event, detail(JSON text nullable), createdAt — append-only timeline
- 외부 큐·Redis 도입 없음. 단일 API 프로세스 + SQLite 가 현재 환경 계약이다.

### 2. 상태 machine

```text
queued → running → succeeded
queued → cancelled                     (시작 전 취소)
running → cancelling → cancelled      (handler 협조 취소)
running|cancelling → failed           (attempt ≥ maxAttempts)
running|cancelling → queued           (attempt < maxAttempts, backoff 후 재시도)
```

- 재시도 backoff 는 `attempt × 60초` 선형, `scheduledAt` 으로 영속화한다.
- 협조 취소: handler 가 `isCancelRequested()` 를 단계 경계에서 확인한다. 강제 중단은 하지 않는다.

### 3. Worker — API in-process 단일 worker

- `start()` 가 poll loop(기본 1초)를 시작하고 stop 함수를 반환한다 (traffic-worker ingestion 패턴).
- claim 은 `UPDATE ... WHERE status='queued' AND scheduledAt<=now` 조건부 갱신으로 원자화한다.
- 실행 중 30초 간격 heartbeat 를 기록한다.
- boot 시 `reconcileInterrupted()`: running·cancelling 잔존 job 을 attempt 여부에 따라 재큐 또는 `JOB_INTERRUPTED` 실패 확정하고 이벤트를 남긴다 (deployment release 의 실패 확정 선례를 따르되, job 은 재큐가 기본).
- 완료 job 은 14일 뒤 GC(`cleanupFinished`, 1시간 간격).

### 4. 첫 소비자 — 자동 backup

- `server.ts` 의 직접 `backupService.create` interval 을 **`backup.create` job enqueue** 로 교체한다.
- enqueue 는 unique — 같은 kind 의 queued·running·cancelling job 이 있으면 건너뛴다.
- boot catch-up: 부팅 시 최신 backup 이 `BACKUP_INTERVAL_HOURS` 보다 오래됐으면 즉시 1회 enqueue 한다. (재시작 직후 공백과 실패 은폐 문제를 함께 해소)
- 수동 backup·restore API 계약은 변경하지 않는다. restore 의 durable job 전환은 maintenance mode 이후 단계다 (HANDOFF §9-4).

### 5. API 경계

- `GET /api/jobs`(status·kind·limit 필터), `GET /api/jobs/:id`, `GET /api/jobs/:id/events`, `POST /api/jobs/:id/cancel`
- 권한: 조회·취소 모두 session 의 owner·admin. 취소는 최근 15분 인증. API key scope 는 이번 단계에서 추가하지 않는다 (필요 소비자가 생길 때 도입).
- 임의 kind 를 외부에서 enqueue 하는 endpoint 는 만들지 않는다. enqueue 는 서버 내부 코드만 수행한다.

### 6. 이번 단계에서 하지 않는 것

- SSE live stream (Docker events/logs/stats) — 다음 단계에서 job·stream 기반 위에 구현
- backup restore·deployment release 의 job 전환
- next-run 시각의 영속 노출(현재는 interval 기반), scheduler 전용 UI 패널
- job API key scope, 알림(Discord) 연동

## 2026-08-01 후속 결정 — scheduler 관측 (Phase 10)

- 자동 backup 의 고정 interval enqueue 를 **1분 due-check** 로 교체했다. due 조건은 "최신 backup 시각 + interval 경과"이며, next-run 이 상태에서 유도되므로 재시작·중단에 안전하고 별도 영속 컬럼이 필요 없다.
- `createBackupScheduleService` 가 due enqueue 와 schedule 조회(interval·last success/failure·next run)를 담당한다.
- `GET /api/jobs/backup-schedule` (owner·admin). Hono 경로 매칭 때문에 `/jobs/:id` 보다 먼저 등록한다.
- 패널에 owner·admin 전용 작업 큐 SSR 위젯을 추가했다 — job 목록·상태·attempt·failureCode·활성 job 취소·schedule 카드.

## 구현 중 추가 결정

- lint hook 이 `throw new Error` 를 차단해 `apps/api/src/lib/app-error.ts` 의 `createAppError(code)` 를 신설했다. 반환은 message 가 code 인 `Error` 이므로 기존 route 의 `error.message` → status 매핑과 완전 호환된다. 신규 코드(job 서비스·route·create-app.test)는 이것을 쓰고, 기존 서비스 8곳의 `throw new Error('CODE')` 는 요청 범위 밖이라 유지한다. 해당 파일을 다음에 수정할 때 점진 전환한다.
- job 이벤트 timeline 정렬은 `rowid`(삽입 순서)다. timestamp 는 초 단위라 같은 초의 이벤트 순서를 보장하지 못한다.
- audit `targetType` 에 `job` 을 추가했다.

## 파일

- `packages/contracts/src/operation-job.ts`
- `packages/db-schema/src/schema.ts` + `drizzle/0008_*`
- `apps/api/src/service/domain/job/create-operation-job-service.ts`
- `apps/api/src/route/job/create-job-route.ts`
- `apps/api/src/server.ts`, `apps/api/src/compose/create-app.ts`
