# 0016 — Maintenance mode·mutation drain·restore durable job 설계 결정

날짜: 2026-08-01 KST
상태: 구현 완료 (잔여: owner 인증 restore job E2E — PROCESS.md Phase 11 i-2)
근거: [HANDOFF-STATUS.md](../HANDOFF-STATUS.md) §8 P0-3·P1-2, §9-4, [0013](./0013-local-backup-restore-runtime.md) restore 한계, [0014](./0014-durable-operation-job-queue.md)

## 결정

### 1. Maintenance mode — API in-process 상태

- 단일 API 프로세스가 유일한 mutation 경로이므로 maintenance 상태는 in-memory 로 둔다 (재시작하면 해제 — restore job 은 어차피 maxAttempts 1 로 재개되지 않으므로 안전).
- `createMaintenanceService`: `enable(reason)`(이미 켜져 있으면 false 반환 — 수동 모드 존중), `disable()`, `getStatus()`, mutation in-flight `enter()/leave()`, `drain(timeoutMs)`(50ms poll, 초과 시 `MAINTENANCE_DRAIN_TIMEOUT`).

### 2. Mutation gate — create-app 전역 middleware

- `/api/*` 의 POST·PUT·PATCH·DELETE 는 maintenance 중 503 `MAINTENANCE_MODE` (+`retry-after`).
- 예외: `POST /api/maintenance` (owner 가 해제할 수 있어야 함). 조회·SSE·WebSocket 은 영향 없다.
- gate 가 mutation in-flight 수를 추적해 drain 의 근거가 된다. 로그인(sign-in)도 mutation 이므로 maintenance 중 차단된다 — restore 는 수 초 내에 끝나고 세션 초기화가 동반되므로 허용하지 않는 쪽이 안전하다.

### 3. Maintenance API

- `GET /api/maintenance`: 전 role session 조회 `{ enabled, reason, startedAt }`
- `POST /api/maintenance`: owner 전용, 최근 15분 인증, audit(targetType `maintenance`). control plane upgrade 수동 절차의 기반.

### 4. `backup.restore` durable job

- `POST /api/backups/:id/restore` 는 동기 실행 대신 `backup.restore` job 을 enqueue 하고 job 을 반환한다. confirmation 검증은 route 에서 유지한다.
- handler 순서: maintenance enable(`backup-restore`) → drain → `backupService.restore` → 성공/실패와 무관하게 job 이 켠 경우에만 disable.
- `maxAttempts: 1` — restore 는 자동 재시도하지 않는다. 중단 시 reconcile 이 `JOB_INTERRUPTED` 실패로 확정하고, 보상은 기존 pre-restore recovery snapshot 으로 수동 수행한다.
- `unique: true` — 동시 restore 대기 중복을 막는다. worker 가 단일 동시성이므로 backup job 과도 겹쳐 실행되지 않는다.
- handler 는 `create-job-handlers.ts` factory 로 분리해 server.ts 밖에서 테스트한다.

### 5. Web

- backup 복구 버튼 문구를 "복구 작업이 시작되었습니다"로 바꾸고 기존 reload 흐름을 유지한다 (완료 후 세션이 사라질 수 있어 재로그인 안내 동일).
- 작업 큐 위젯 header 에 maintenance 활성 badge 를 표시한다.

## 파일

- `packages/contracts/src/maintenance.ts`, `operation-job.ts`(kind·restore payload)
- `apps/api/src/service/domain/maintenance/create-maintenance-service.ts`
- `apps/api/src/route/maintenance/create-maintenance-route.ts`
- `apps/api/src/service/domain/job/create-job-handlers.ts`
- `apps/api/src/compose/create-app.ts`(gate), `apps/api/src/route/backup/create-backup-route.ts`, `apps/api/src/server.ts`
- `apps/web` backup·job 위젯, `packages/db-schema/src/schema.ts`(kind enum, TS 수준)
