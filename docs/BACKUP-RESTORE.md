# 로컬 백업·복구 운영 지침

## 1. 현재 지원 범위

하나의 backup set은 다음 파일로 구성된다.

- `control.sqlite`: 사용자, 세션, API key hash, audit, artifact metadata, Nginx route, deployment manifest·release, AES-GCM ciphertext secret, migration 기록(`__drizzle_migrations`)
- `traffic.sqlite`: Nginx raw traffic event
- `nginx.conf`: Engine Agent가 관리하는 Nginx `current.conf` 사본 (Engine Agent 조회 실패 시 생략되고 manifest에 `nginxSha256: null`로 남는다)
- `secrets.enc`: `deployment-secret-key`·`notification-secret-key` keyring **전 버전**을 운영자 passphrase로 envelope 암호화한 봉투 (passphrase를 주지 않으면 생성되지 않는다). v1 은 기존 필드에도 그대로 담아 구버전 복원 경로와 호환된다
- `manifest.json`: schema version, 생성 시각, label, 각 파일 byte 수와 SHA-256, 키 포함 여부(`secretsIncluded`)

파일은 `containers_backups` Docker named volume의 UUID 디렉터리에 저장된다. API와 Traffic Worker만 `/backups`로 mount한다. host path나 임의 backup 경로를 API 입력으로 받지 않는다.

`secrets.enc`는 scrypt(N=16384, r=8, p=1)로 유도한 키의 AES-256-GCM 봉투다. 키 원문은 API 응답·로그·audit·manifest 어디에도 나오지 않으며, 서버는 passphrase를 저장하지 않는다. 복구 시 같은 passphrase를 다시 제출해야 한다.

**키 없이 만든 backup으로 복구하면 살아나지 않는 것**: deployment secret(`deployment_secret` ciphertext)과 notification destination의 webhook credential이다. 두 값은 마스터 키로만 복호화되므로, 키를 잃은 새 호스트에서는 ciphertext 행이 복구되어도 영구 복호화 불가다. 이 경우 모든 deployment secret과 webhook을 재등록해야 한다.

## 2. API와 권한

| Method   | Path                       | 요구 권한                                                            |
| -------- | -------------------------- | -------------------------------------------------------------------- |
| `GET`    | `/api/backups`             | Owner session 또는 `backup:read` API key                             |
| `POST`   | `/api/backups`             | Owner session 또는 `backup:write` API key                            |
| `POST`   | `/api/backups/:id/restore` | Owner session 또는 `backup:restore` API key + `confirmation`이 `:id` |
| `DELETE` | `/api/backups/:id`         | 동일 + body의 `confirmation`이 `:id`와 일치                          |

- 생성 body: `{ "label": string | null, "passphrase": string | null }` — `passphrase`(12자 이상)를 주면 마스터 키 2종을 봉인해 함께 저장한다.
- 복구 body: `{ "confirmation": "backup UUID", "mode": "preserve-host" | "full", "passphrase": string | null }` — `mode` 기본값은 `preserve-host`다.
- 삭제 body: `{ "confirmation": "backup UUID" }`
- 자동 backup(job)은 passphrase를 받지 않는다. 즉 **자동 backup에는 키가 포함되지 않는다.** 키를 포함한 backup은 운영자가 수동으로 만든다.
- 복구 passphrase는 job payload(DB)에 저장되지 않는다. 복구 요청 시 API 프로세스 메모리에 15분 TTL로만 보관하고 job 실행 시 1회 소비한다. API가 그 사이 재시작하면 passphrase는 사라지고 키 복원 없이 DB만 복구된다.

## 3. 생성 순서

1. live control DB의 `PRAGMA foreign_key_check`가 비어 있는지 확인한다.
2. Traffic Worker에 HMAC·timestamp·nonce 서명된 UUID 요청을 보낸다.
3. Worker가 자신의 SQLite connection에서 `VACUUM INTO` 로 임시 파일에 snapshot을 쓰고 원자 rename한다.
4. API가 control DB를 같은 방식으로 snapshot한다. byte 수와 SHA-256은 완성된 파일을 스트리밍으로 읽어 계산하므로 DB 전체가 메모리에 올라오지 않는다.
5. Engine Agent에서 Nginx `current.conf`를 받아 `nginx.conf`로 저장한다(실패해도 backup은 계속된다).
6. passphrase가 있으면 두 keyring 의 전 키 버전을 봉인해 `secrets.enc`로 저장한다.
7. byte 수와 SHA-256을 기록한 manifest를 마지막에 원자 rename한다.
8. 완료 manifest 기준 최신 `BACKUP_RETENTION_COUNT`개만 남긴다. 기본값은 7이다.

자동 백업은 2026-08-01부터 durable operation job(`backup.create` kind)으로 실행된다 ([acknowledge/0014](./acknowledge/0014-durable-operation-job-queue.md)).

- API 프로세스는 1분 간격 due-check 로, 최신 backup 이 `BACKUP_INTERVAL_HOURS`(기본 24시간)보다 오래됐을 때만 `automatic` label 의 `backup.create` job 을 enqueue 한다. 다음 실행 시각은 타이머가 아니라 최신 backup 시각 + interval 로 유도되므로 재시작에 안전하다.
- `GET /api/jobs/backup-schedule` (owner·admin) 이 interval·마지막 성공/실패·다음 실행 시각을 반환하고, 패널의 작업 큐 카드에 표시된다.
- 같은 kind 의 활성 job 이 있으면 중복 enqueue 하지 않는다.
- 실패는 60초×attempt backoff 로 최대 3회 시도 후 `failed` 로 영속 기록되며, `GET /api/jobs` 와 `GET /api/jobs/:id/events` 로 마지막 성공·실패·진행 timeline 을 조회할 수 있다. 취소는 `POST /api/jobs/:id/cancel` 이다.
- 수동 backup·restore API 는 기존과 동일하게 동기 실행이다.

## 4. 복구 모드와 순서

복구는 `backup.restore` durable job 으로 실행된다 ([acknowledge/0016](./acknowledge/0016-maintenance-restore-job.md)). `POST /api/backups/:id/restore` 는 confirmation 검증 후 job 을 enqueue(중복 방지 unique, 자동 재시도 없음 maxAttempts 1)하고 job 을 반환한다. job handler 가 maintenance mode 를 켜 mutation 을 503 으로 차단하고 in-flight mutation 을 drain(최대 10초)한 뒤 복구를 수행하며, 종료 시 maintenance 를 해제한다(수동으로 켠 maintenance 는 유지).

### 4.1 `preserve-host` (기본) — 같은 호스트의 배포 상태 되돌리기

control DB의 **일부 table만** snapshot 값으로 교체한다.

- 교체(복구) 대상: `artifact`, `deployment`, `deployment_manifest`, `deployment_release`, `nginx_route`
- 보존(현재 호스트 값 유지): `__drizzle_migrations`, `user`, `session`, `account`, `verification`, `user_role`, `invitation`, `api_key`, `audit_log`, `deployment_secret`, `notification_destination`, `notification_delivery`, `operation_job`, `operation_job_event`, `upload_session`, `upload_chunk`

즉 운영자 계정·로그인 세션·API key·감사 로그·업로드 세션·암호화된 secret은 그대로 두고, 배포와 라우팅 상태만 되돌린다. `artifact`는 `deployment.artifact_id`가 `ON DELETE RESTRICT`로 참조하므로 **deployment와 반드시 함께** 복구된다(둘 중 하나만 되돌리면 FK가 깨진다).

주의: snapshot의 `artifact`·`deployment`가 참조하는 사용자가 그 사이 삭제됐다면 FK 검사에서 `BACKUP_FOREIGN_KEY_INVALID`로 전체 롤백된다. 이때는 `full` 모드를 쓰거나 해당 사용자를 먼저 복원해야 한다.

### 4.2 `full` — 새 호스트 재해복구

`__drizzle_migrations`·`operation_job`·`operation_job_event`를 제외한 **모든 table을 snapshot으로 교체**한다. 운영자·세션·API key·audit까지 backup 시점으로 돌아가므로, 복구 후에는 snapshot 시점의 계정으로 다시 로그인해야 한다.

- `__drizzle_migrations`는 **어떤 모드에서도 절대 되돌리지 않는다.** migration 기록이 과거로 돌아가면 재기동 시 이미 적용된 migration을 다시 실행해 API가 영구 기동 불가(restart loop)가 되기 때문이다.
- `operation_job`·`operation_job_event`는 복구를 수행 중인 job 자신의 행이 사라지지 않도록 보존한다. 대신 `ON DELETE SET NULL`로 선언된 dangling 참조(`operation_job.created_by`, `notification_delivery.job_id`, `audit_log.actor_id`)는 선언된 의미대로 `NULL`로 정규화한 뒤 FK 검사를 통과시킨다.

### 4.3 공통 절차

1. UUID와 confirmation, mode를 검증한다.
2. control·traffic 파일 존재, byte 수, SHA-256을 검증한다. `nginx.conf`·`secrets.enc`가 manifest에 있으면 함께 검증한다.
3. control snapshot의 SQLite integrity, FK, 현재 schema와 table·column 일치를 검증한다.
4. passphrase가 있으면 **DB를 건드리기 전에** `secrets.enc`를 복호화해 본다. 실패하면 `BACKUP_SECRET_PASSPHRASE_INVALID`로 즉시 중단하고 아무것도 바꾸지 않는다.
5. 현재 상태를 `pre-restore:<target-id>` recovery set으로 만든다(키는 포함하지 않는다).
6. Traffic Worker가 traffic DB를 transaction으로 교체한다.
7. API가 FK를 잠시 끄고 위 모드의 대상 table을 단일 `BEGIN IMMEDIATE` transaction으로 교체한다.
8. dangling `SET NULL` 참조를 정규화하고 `foreign_key_check`를 실행한다. 위반이 있으면 transaction 전체를 롤백한다.
9. passphrase로 복호화한 키가 있으면 `deployment-secret-key`·`notification-secret-key`를 `0600`으로 덮어쓴다. **키 파일은 프로세스 기동 시 읽히므로, 키를 복구했으면 API를 재시작해야 실제로 적용된다.**
10. 어느 단계든 실패하면 recovery set으로 두 DB를 `full` 모드 보상 복구한다.
11. 성공 후 현재 session이 snapshot에 없을 수 있으므로 패널은 reload하며 다시 로그인이 필요할 수 있다.

control과 traffic은 서로 다른 프로세스이므로 진정한 분산 원자 transaction은 아니다. 현재 구현은 사전 snapshot과 보상 복구로 안전성을 확보한다.

Nginx 설정은 **자동으로 적용하지 않는다.** `nginx.conf`는 사본으로만 보관하며, 실제 라우팅은 복구된 `nginx_route` 행을 기준으로 Engine Agent가 재생성한다(API 재시작 시 `nginx-route-reconcile`). 사본은 수작업 대조·수동 복구용이다.

### 4.4 새 호스트 재해복구 절차

1. 기존 호스트에서 backup volume을 오프사이트로 복사한다.

    ```sh
    docker run --rm -v containers_backups:/d -v "$PWD":/out alpine tar czf /out/backups.tgz -C /d .
    ```

2. 새 호스트에 저장소를 배치하고 `docker compose up -d`로 스택을 기동한다(빈 상태로 migration이 최신까지 적용된다).
3. 복사한 아카이브를 새 호스트의 backup volume에 푼다.

    ```sh
    docker run --rm -v containers_backups:/d -v "$PWD":/in alpine tar xzf /in/backups.tgz -C /d
    ```

4. 새 호스트에서 owner를 bootstrap해 로그인하고, `POST /api/backups/:id/restore`를 `{"confirmation":"<id>","mode":"full","passphrase":"<생성 시 사용한 passphrase>"}`로 호출한다.
5. 완료 후 API를 재시작한다(`docker compose restart api`). 마스터 키가 새로 쓰였으므로 재시작 전에는 기존 secret 복호화가 되지 않는다.
6. artifact 파일 자체는 control DB가 아니라 `containers_artifacts` volume에 있다. 필요하면 같은 방식으로 함께 복사한다. 복사하지 않으면 artifact metadata만 복구되고 실제 이미지 파일은 없다.
7. 복구 후 새 호스트의 `current.conf`는 기본 설정 그대로다. Nginx 라우팅은 복구된 `nginx_route` 행을 기준으로 API 재시작 시 재생성된다(§4.3). backup의 `nginx.conf` 사본은 수작업 대조용이다.

> **같은 머신에서 드릴을 재현할 때**: `EDGE_SUBNET` 기본값이 `10.89.0.0/24` 고정이라 두 번째 스택이 `Pool overlaps with other one on this address space`로 기동에 실패한다. `COMPOSE_PROJECT_NAME`·`PANEL_PORT`와 함께 `EDGE_SUBNET`을 다른 대역으로 지정한다. 실제 새 호스트에서는 해당 없다.
>
> ```sh
> COMPOSE_PROJECT_NAME=containers-dr PANEL_PORT=19080 EDGE_SUBNET=10.91.0.0/24 \
>     PANEL_PUBLIC_ORIGIN=http://127.0.0.1:19080 \
>     AUTH_TRUSTED_ORIGINS=http://127.0.0.1:19080,http://localhost:19080 \
>     docker compose up -d --wait
> ```

실행 기록은 [quality-assurance/2026-08-05-disaster-recovery-drill.md](./quality-assurance/2026-08-05-disaster-recovery-drill.md)에 있다.

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

- snapshot 생성과 digest 계산은 `VACUUM INTO` + 스트리밍 해시로 메모리 상주가 없다. 다만 복원 시의 control 검증은 여전히 대상 DB를 열어 대조하므로 대형 DB에서는 시간이 걸린다.
- 자동 backup 실패는 job 으로 영속 기록되고 schedule API·패널에 노출되지만, 실패 alert(Discord 등)는 아직 없다.
- 불완전 디렉터리는 목록과 retention 계산에서 제외되어 장기적으로 별도 garbage collection이 필요하다.
- restore 는 maintenance mode 로 mutation 을 차단하고 drain 한 뒤 수행된다. 단 API 재시작 시 maintenance 는 in-memory 라 해제되며, 중단된 restore job 은 자동 재개되지 않고 `JOB_INTERRUPTED` 실패로 확정된다 — 이때는 pre-restore recovery snapshot 으로 수동 복구한다.
- schema가 정확히 같아야 복구된다. upgrade 전 backup, migration dry-run, forward restore, rollback matrix는 아직 없다. 단 `__drizzle_migrations`는 어떤 모드에서도 보존되므로 migration 기록이 과거로 역행하지는 않는다.
- `control.sqlite`·`traffic.sqlite` 본문 자체의 envelope encryption은 없다. 봉인 대상은 마스터 키(`secrets.enc`)뿐이므로, backup volume 사본은 DB 평문을 담고 있다고 보고 관리한다.
- 키를 복구하면 API 재시작이 필요하다(키는 프로세스 기동 시 1회 로드). 무중단 키 reload는 없다.
- artifact 파일·nginx config 실제 적용은 backup set 범위 밖이다(각각 volume 복사, route 기반 재생성).
- 선택적 Cloudflare R2 upload/download, multipart retry, encryption key 관리, object retention은 미구현이다.
- backup export/download endpoint는 의도적으로 아직 제공하지 않는다. 오프사이트 사본은 §4.4의 volume tar 절차로 만든다.
- 정기 restore rehearsal과 disk-full·corruption·Worker crash chaos test가 필요하다.

## 7. 다음 구현 순서

1. backup run 상태·마지막 성공·다음 실행·실패 원인을 DB job으로 영속화한다.
2. maintenance mode와 mutation drain을 추가하고 restore를 durable job으로 전환한다.
3. incomplete directory GC와 disk watermark를 backup에도 적용한다.
4. streaming snapshot 또는 bounded-memory helper를 도입한다.
5. R2 adapter는 로컬 성공과 분리된 비동기 job으로 구현하고 실패가 로컬 백업을 실패시키지 않게 한다.
6. Discord에는 backup ID·결과·byte 수만 보내며 DB 내용, 원본 IP, URL credential을 포함하지 않는다.
