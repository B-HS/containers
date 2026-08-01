# 2026-08-01 — Durable job·SSE stream·maintenance·Docker 명령 세션 이력

한 세션에서 Phase 8 부터 12 까지 순차 완료했다. 각 Phase 의 체크리스트는 [PROCESS.md](../PROCESS.md), 설계 결정은 acknowledge 0014 부터 0017 에 있다.

## Phase 8 — Durable operation job queue ([0014](../acknowledge/0014-durable-operation-job-queue.md))

- control DB `operation_job`·`operation_job_event` (migration 0008), 상태 machine(queued→running→succeeded/failed/cancelled, 협조 취소), 60초×attempt backoff 재시도, boot reconcile, 14일 GC, 1초 poll worker·30초 heartbeat
- `/api/jobs` 조회·상세·이벤트 timeline·취소 (owner·admin)
- 첫 소비자로 자동 backup 이전. `lib/app-error.ts` `createAppError` 신설(신규 코드 표준)

## Phase 9 — Docker events·logs·stats SSE ([0015](../acknowledge/0015-docker-stream-sse.md))

- Agent 가 Docker socket chunked stream 을 정규화해 SSE 방출(heartbeat 15초·동시 20개·최대 30분), API 는 인증 후 byte pass-through(15초 세션 재검사·양방향 abort)
- incremental multiplex parser·NDJSON parser, stats 공식 계산식, event Actor attribute 는 name 만
- Nginx 런타임 config 무변경(heartbeat 로 read timeout 통과), 패널 실시간 로그 follow UI
- 실측: api 컨테이너 내부 HMAC 호출로 3종 stream 실수신

## Phase 10 — Jobs 패널·backup schedule 관측

- 자동 backup 을 1분 due-check 로 개선(next-run = 최신 backup + interval, 재시작 안전)
- `GET /api/jobs/backup-schedule`, 패널 작업 큐 위젯(목록·취소·schedule 카드, ko/en/ja)

## Phase 11 — Maintenance mode·restore durable job ([0016](../acknowledge/0016-maintenance-restore-job.md))

- in-memory maintenance 상태 + create-app mutation gate(503·retry-after 30, `/api/maintenance` 예외), in-flight 추적·drain
- `GET/POST /api/maintenance` (조회 전 role / 변경 owner 최근 인증 + audit)
- restore 를 `backup.restore` job 으로 전환: enable→drain→restore→(job 이 켠 경우만) disable, maxAttempts 1, 중복 방지

## Phase 12 — Docker 명령 완전성 1차 ([0017](../acknowledge/0017-docker-command-completeness.md))

- container kill(signal 화이트리스트)·update(resource), wait(bound)·top·changes
- image pull = `image.pull` durable job(진행 line 소비·error 검출), image tag
- 실측 E2E: alpine:3.20 fixture 로 전 명령 수행(kill→wait exit 137 포함) 후 정확 ID 로 완전 정리

## 종료 시점 검증 수치

- typecheck 7 workspace·ESLint·Prettier·production build 통과
- `bun test --silent`: 101 pass, 0 fail, 317 assertions, 29 files (세션 시작 76 pass → +25)
- Compose 5개 서비스 healthy, 신규 API 전부 미인증 401 확인
- migration 은 0008 하나 추가(job kind 확장은 TS 수준)

## 잔여 (다음 세션)

- Phase 13: prune dry-run·관리 plane 보호, dependency-aware image remove
- 실측 증거 3건: g-2(live backup job — 24시간 경과 시 자동), e-2(브라우저 UI), i-2(restore job E2E)
- 이후 순서는 [HANDOFF-STATUS.md §9](../HANDOFF-STATUS.md)
