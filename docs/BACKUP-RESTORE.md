# 로컬 백업·복구 운영 지침

## 1. 현재 지원 범위

하나의 backup set은 다음 세 파일로 구성된다.

- `control.sqlite`: 사용자, 세션, API key hash, audit, artifact metadata, Nginx route, deployment manifest·release, AES-GCM ciphertext secret
- `traffic.sqlite`: Nginx raw traffic event
- `manifest.json`: schema version, 생성 시각, label, 각 파일 byte 수와 SHA-256

파일은 `containers_backups` Docker named volume의 UUID 디렉터리에 저장된다. API와 Traffic Worker만 `/backups`로 mount한다. host path나 임의 backup 경로를 API 입력으로 받지 않는다.

## 2. API와 권한

| Method   | Path                       | 요구 권한                                      |
| -------- | -------------------------- | ---------------------------------------------- |
| `GET`    | `/api/backups`             | Owner session 또는 `backup:read` API key       |
| `POST`   | `/api/backups`             | 최근 Owner session 또는 `backup:write` API key |
| `POST`   | `/api/backups/:id/restore` | 동일 + body의 `confirmation`이 `:id`와 일치    |
| `DELETE` | `/api/backups/:id`         | 동일 + body의 `confirmation`이 `:id`와 일치    |

생성 body는 `{ "label": string | null }`, 복구·삭제 body는 `{ "confirmation": "backup UUID" }`다. 패널은 Owner에게만 표시된다.

## 3. 생성 순서

1. live control DB의 `PRAGMA foreign_key_check`가 비어 있는지 확인한다.
2. Traffic Worker에 HMAC·timestamp·nonce 서명된 UUID 요청을 보낸다.
3. Worker가 자신의 SQLite connection에서 native `serialize()` snapshot을 만들어 원자 rename한다.
4. API가 control DB를 같은 방식으로 snapshot한다.
5. byte 수와 SHA-256을 기록한 manifest를 마지막에 원자 rename한다.
6. 완료 manifest 기준 최신 `BACKUP_RETENTION_COUNT`개만 남긴다. 기본값은 7이다.

자동 백업은 2026-08-01부터 durable operation job(`backup.create` kind)으로 실행된다 ([acknowledge/0014](./acknowledge/0014-durable-operation-job-queue.md)).

- API 프로세스는 1분 간격 due-check 로, 최신 backup 이 `BACKUP_INTERVAL_HOURS`(기본 24시간)보다 오래됐을 때만 `automatic` label 의 `backup.create` job 을 enqueue 한다. 다음 실행 시각은 타이머가 아니라 최신 backup 시각 + interval 로 유도되므로 재시작에 안전하다.
- `GET /api/jobs/backup-schedule` (owner·admin) 이 interval·마지막 성공/실패·다음 실행 시각을 반환하고, 패널의 작업 큐 카드에 표시된다.
- 같은 kind 의 활성 job 이 있으면 중복 enqueue 하지 않는다.
- 실패는 60초×attempt backoff 로 최대 3회 시도 후 `failed` 로 영속 기록되며, `GET /api/jobs` 와 `GET /api/jobs/:id/events` 로 마지막 성공·실패·진행 timeline 을 조회할 수 있다. 취소는 `POST /api/jobs/:id/cancel` 이다.
- 수동 backup·restore API 는 기존과 동일하게 동기 실행이다.

## 4. 복구 순서

2026-08-01부터 복구는 `backup.restore` durable job 으로 실행된다 ([acknowledge/0016](./acknowledge/0016-maintenance-restore-job.md)). `POST /api/backups/:id/restore` 는 confirmation 검증 후 job 을 enqueue(중복 방지 unique, 자동 재시도 없음 maxAttempts 1)하고 job 을 반환한다. job handler 가 maintenance mode 를 켜 mutation 을 503 으로 차단하고 in-flight mutation 을 drain(최대 10초)한 뒤 아래 순서를 수행하며, 종료 시 maintenance 를 해제한다(수동으로 켠 maintenance 는 유지). 진행·결과는 `GET /api/jobs`·`/api/jobs/:id/events` 로 조회한다.

1. UUID와 confirmation을 검증한다.
2. control·traffic 파일 존재, byte 수, SHA-256을 검증한다.
3. control snapshot의 SQLite integrity, FK, 현재 schema와 table·column 일치를 검증한다.
4. 현재 상태를 `pre-restore:<target-id>` recovery set으로 만든다.
5. Traffic Worker가 traffic DB를 transaction으로 교체한다.
6. API가 FK를 잠시 끄고 control DB의 모든 user table을 단일 `BEGIN IMMEDIATE` transaction으로 교체한다.
7. FK를 다시 켜고 `foreign_key_check`를 실행한다.
8. 어느 단계든 실패하면 recovery set으로 두 DB 보상 복구를 시도한다.
9. 성공 후 현재 session이 snapshot에 없을 수 있으므로 패널은 reload하며 다시 로그인이 필요할 수 있다.

control과 traffic은 서로 다른 프로세스이므로 진정한 분산 원자 transaction은 아니다. 현재 구현은 사전 snapshot과 보상 복구로 안전성을 확보한다.

## 5. 실제 검증 기록

2026-08-01 KST 실제 Docker Compose 환경에서 다음을 확인했다.

- 성공 원본: `374f1798-c75f-4152-938d-be2d09d12d51`, label `verified-runtime-restore`
- 자동 사전 복구: `ddabc56c-ba20-4431-b52d-3ff3ba1b6e1e`
- 원본 control 356,352 bytes, traffic 1,912,832 bytes
- 두 DB 복구 API가 `restored: true`와 recovery ID를 반환
- 복구 뒤 live control `PRAGMA integrity_check = ok`, FK 위반 0
- API·Traffic Worker·Web·Nginx·Engine Agent 모두 healthy
- 패널에서 두 backup card와 생성 버튼 SSR 렌더링 확인

초기 drill에서는 이전 invitation E2E synthetic 사용자의 orphan child 4개가 발견됐다. session·role·account 3개는 cascade 의미대로 제거하고 audit row는 보존하면서 actor만 `NULL`로 만들었다. 이후 live FK 사전검사와 snapshot FK 검사를 제품 코드·테스트에 추가했다. 실패 drill set은 API로 삭제했다.

## 6. 현재 한계와 후속 작업

- `serialize()`와 control 검증은 DB 전체를 메모리에 올린다. 큰 traffic DB를 위한 streaming SQLite backup API 또는 sidecar 방식이 필요하다.
- 자동 backup 실패는 job 으로 영속 기록되고 schedule API·패널에 노출되지만, 실패 alert(Discord 등)는 아직 없다.
- 불완전 디렉터리는 목록과 retention 계산에서 제외되어 장기적으로 별도 garbage collection이 필요하다.
- restore 는 maintenance mode 로 mutation 을 차단하고 drain 한 뒤 수행된다. 단 API 재시작 시 maintenance 는 in-memory 라 해제되며, 중단된 restore job 은 자동 재개되지 않고 `JOB_INTERRUPTED` 실패로 확정된다 — 이때는 pre-restore recovery snapshot 으로 수동 복구한다.
- schema가 정확히 같아야 복구된다. upgrade 전 backup, migration dry-run, forward restore, rollback matrix는 아직 없다.
- local backup 파일 자체의 envelope encryption은 없다.
- 선택적 Cloudflare R2 upload/download, multipart retry, encryption key 관리, object retention은 미구현이다.
- backup export/download endpoint는 의도적으로 아직 제공하지 않는다.
- 정기 restore rehearsal과 disk-full·corruption·Worker crash chaos test가 필요하다.

## 7. 다음 구현 순서

1. backup run 상태·마지막 성공·다음 실행·실패 원인을 DB job으로 영속화한다.
2. maintenance mode와 mutation drain을 추가하고 restore를 durable job으로 전환한다.
3. incomplete directory GC와 disk watermark를 backup에도 적용한다.
4. streaming snapshot 또는 bounded-memory helper를 도입한다.
5. R2 adapter는 로컬 성공과 분리된 비동기 job으로 구현하고 실패가 로컬 백업을 실패시키지 않게 한다.
6. Discord에는 backup ID·결과·byte 수만 보내며 DB 내용, 원본 IP, URL credential을 포함하지 않는다.
