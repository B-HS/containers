# Control Plane Upgrade·Rollback Runbook

control plane(nginx·web·api·engine-agent·traffic-worker)은 compose 로 단일 호스트에 배포된다. 이 문서는 호스트 터미널에서 수행하는 upgrade·rollback 절차와, 그 전에 확인해야 할 준비 상태를 정의한다.

> **권한 경계**: 이 문서의 모든 호스트 명령은 **사용자가 직접** 수행한다. API·Web 은 준비 상태를 읽기 전용으로 보고할 뿐 컨테이너 생성·재시작·이미지 pull 을 실행하지 않는다 (SECURITY.md §11 불변식).

## 사전 개념

- **버전 단일 원천**: `packages/contracts/src/control-plane.ts` 의 `CONTROL_PLANE_VERSION` 이 API·Web·health endpoint 버전 표시의 원천이다.
- **migration 자동 적용**: api 컨테이너 부팅 시 drizzle `migrate` 가 실행되어 새 migration 이 자동 적용된다. 실패하면 api 프로세스가 뜨지 않는다(의도된 fail-fast).
- **부팅 격리**: migration·DB 열기·secret 로드는 치명적이라 실패 시 부팅을 중단한다. 반면 부가 복구 단계(중단된 release·job reconcile, 만료 정리, nginx route reconcile, backup 스케줄 확인)는 개별로 격리되어 있어, 하나가 실패해도 구조화 로그(`{"event":"startup_task_failed",...}`)만 남기고 HTTP 서버는 정상 기동한다. 이는 `restart: unless-stopped` 환경에서 부가 단계 실패가 crash loop 로 번지지 않게 하기 위함이다.
- **자기 재배포 없음**: API 가 자신의 컨테이너를 재생성하지 않는다. 실행 중 프로세스가 끊기면 job·세션이 비결정적으로 실패하므로, 실제 재배포는 반드시 호스트에서 수행한다.

## upgrade 준비 상태 확인 (owner UI)

`/api/control-plane/status` 는 owner·admin 세션에 대해 다음을 반환한다.

| 항목                        | 만족 조건                     | 불만족 시 조치                                                              |
| --------------------------- | ----------------------------- | --------------------------------------------------------------------------- |
| `maintenance.enabled`       | upgrade 중에는 켜는 것을 권장 | maintenance 를 켠 뒤 진행한다                                               |
| `activeJobCount`            | 0 이어야 함                   | 실행 중 job 이 끝날 때까지 기다린다. 0 이 아니면 upgrade 를 시작하지 않는다 |
| `lastBackupAt`              | 최근 backup 이 존재해야 함    | `docs/BACKUP-RESTORE.md` 절차로 신선한 backup 을 만든다                     |
| `databaseIntegrity.control` | `ok` 여야 함                  | control DB 손상이 의심되면 backup 복원을 먼저 검토한다                      |
| `migrations.pending`        | (아래 한계 참고)              | upgrade 전 확인 지표로 쓰지 않는다                                          |

### `migrations.pending` 의 한계 — upgrade 전 지표가 아니다

`migrations.pending` 은 **실행 중 api 이미지에 포함된 migration 폴더**(`/app/drizzle`)를 control DB 의 `__drizzle_migrations` 와 비교한다. 그 폴더의 migration 은 같은 컨테이너가 부팅할 때 이미 전부 적용됐고, 적용에 실패했다면 api 자체가 뜨지 않는다. 따라서 **정상 동작 중인 api 에서 이 값은 구조적으로 항상 비어 있다.**

이 값은 "새 릴리스가 어떤 migration 을 적용할 예정인가"를 알려주지 않는다. 그 질문의 답은 **호스트에서 dry-run 스크립트**로 확인한다(아래).

### upgrade 전 migration dry-run (호스트)

새 코드를 체크아웃한 뒤, 아직 이미지를 빌드하기 전에 실행한다. 읽기 전용이며 DB 를 수정하지 않는다.

```sh
git pull --ff-only
./scripts/migration-dry-run.sh
```

동작:

- 체크아웃된 코드의 `packages/db-schema/drizzle/meta/_journal.json` 순서대로 각 migration SQL 파일의 sha256 을 계산한다.
- 실행 중 api 컨테이너를 통해 control DB 의 `__drizzle_migrations.hash` 를 읽어(읽기 전용) 대조한다.
- 아직 적용되지 않은 migration 을 `pending` 으로 나열하고, 해당 SQL 에 `DROP`/`ALTER`/`DELETE`/`TRUNCATE` 가 포함되면 파괴적 변경으로 경고한다.

출력에 pending 이 하나라도 있으면 그 upgrade 는 **schema 를 바꾸는 릴리스**이고, 아래 "되돌릴 수 없음" 항목이 적용된다. api 컨테이너가 내려가 있으면 적용 이력을 읽을 수 없어 스크립트가 실패한다 — upgrade 전(서비스가 살아 있을 때) 실행해야 한다.

## upgrade 절차

1. owner UI 에서 준비 상태(maintenance·activeJobCount·lastBackupAt·integrity)를 확인한다.
2. maintenance 를 켠다 (owner UI 또는 `POST /api/maintenance { "enabled": true }`). upgrade 중 생성·변경 요청이 503 으로 막힌다.
3. 호스트에서 코드를 최신으로 가져오고 dry-run 을 실행한다.

    ```sh
    git pull --ff-only
    ./scripts/migration-dry-run.sh
    ```

4. **pending migration 이 있으면** 아래 "볼륨 스냅샷" 절차를 먼저 수행한다. 없으면 건너뛸 수 있다.
5. 이미지를 다시 빌드한다.

    ```sh
    docker compose build
    ```

6. 서비스를 재배포한다.

    ```sh
    docker compose up -d --wait
    ```

7. owner UI 또는 `GET /api/control-plane/status` 로 다음을 확인한다.
    - `version` 이 새 코드 버전인가
    - `databaseIntegrity.control` 이 `ok` 인가
    - `docker compose logs api | grep startup_task_failed` 로 격리된 부가 단계 실패가 없는지 확인한다
8. 문제가 없으면 maintenance 를 끈다 (`POST /api/maintenance { "enabled": false }`).
9. 문제가 있으면 아래 rollback 절차를 따른다.

### 다운타임 예상

| 단계                            | 예상 소요                                            |
| ------------------------------- | ---------------------------------------------------- |
| 볼륨 스냅샷 (api·web 중지 상태) | 수십 초 ~ 2분 (control-data 크기에 비례)             |
| `docker compose build`          | 2 ~ 10분 (캐시 적중 여부에 따라). 서비스는 계속 동작 |
| `docker compose up -d --wait`   | 30초 ~ 2분 (컨테이너 재생성 + healthcheck)           |
| 실제 요청 단절 구간             | 스냅샷 구간 + `up -d` 구간 = 대략 1 ~ 5분            |

nginx 컨테이너가 재생성되는 릴리스에서는 사용자 트래픽도 그 시간만큼 끊긴다. maintenance 를 켜 두면 API 는 살아 있어도 변경 요청이 503 으로 막히므로, 사용자 공지 기준 다운타임은 upgrade 전체 구간으로 잡는 것이 안전하다.

## 볼륨 스냅샷 (migration 이 포함된 upgrade의 유일한 되돌리기 수단)

> **migration 이 적용된 뒤에는 "backup 복원"으로 되돌릴 수 없다.** control DB backup 은 이전 schema 로 만들어졌고, 복원 절차의 schema 검증에 막힌다. downgrade migration 도 지원하지 않는다. 즉 schema 변경이 포함된 upgrade 는 **파일 레벨 볼륨 스냅샷 없이는 편도**다.

스냅샷은 **api 를 멈춘 상태**에서 뜬다. SQLite 는 실행 중 복사하면 WAL 이 잘려 정합성이 깨질 수 있다.

```sh
docker compose stop api web
docker run --rm \
    -v containers_control-data:/d:ro \
    -v "$PWD":/out \
    alpine tar czf /out/control-data.tgz -C /d .
docker compose start api web
```

- 볼륨 이름은 `<compose 프로젝트명>_control-data` 다. 프로젝트명은 기본적으로 repo 디렉터리명(`containers`)이며, `docker volume ls | grep control-data` 로 정확한 이름을 확인한다.
- `control-data` 에는 control DB(`control.sqlite`)와 deployment·notification secret key 가 함께 들어 있다. 이 하나만 떠도 control plane 상태 전체를 되돌릴 수 있다.
- 배포 산출물(`artifacts`)·backup 파일(`backups`)은 크고 schema 와 무관하므로 기본 스냅샷 대상에서 제외한다. 같은 방식으로 별도로 뜰 수는 있다.
- 스냅샷 파일에는 secret key 원문이 포함된다. backup 파일과 동일한 보안 등급으로 취급하고, 검증이 끝나면 안전하게 폐기한다.

### 스냅샷 복구

```sh
docker compose down
docker run --rm \
    -v containers_control-data:/d \
    -v "$PWD":/in \
    alpine sh -c 'rm -rf /d/* /d/..?* /d/.[!.]* 2>/dev/null; tar xzf /in/control-data.tgz -C /d'
git checkout <이전 커밋>
docker compose build
docker compose up -d --wait
```

- 반드시 **코드도 스냅샷 시점의 커밋으로 되돌린 뒤** 기동한다. 새 코드 + 옛 DB 조합은 부팅 시 migration 을 다시 적용해 스냅샷을 무의미하게 만든다.
- 스냅샷 시점 이후의 모든 변경(배포·job·감사 로그·초대 등)은 손실된다.

## rollback 절차

### A. migration 이 없던 릴리스 (dry-run 에서 pending 0 이었던 경우)

1. 이전 릴리스로 되돌린다.

    ```sh
    git checkout <이전 커밋>
    docker compose build
    docker compose up -d --wait
    ```

2. owner UI 또는 `GET /api/control-plane/status` 로 버전·integrity 를 확인한다.

DB 는 손대지 않는다. 데이터 손실이 없다.

### B. migration 이 포함된 릴리스

1. 위 "스냅샷 복구" 절차를 그대로 수행한다. 이것이 유일한 경로다.
2. 스냅샷을 뜨지 않았다면 schema 를 이전 상태로 되돌릴 방법이 없다. 선택지는 두 가지뿐이다.
    - 새 코드로 계속 진행하며 앞으로 나아가는 방식으로 고친다(hotfix + 새 migration).
    - control DB 를 backup 에서 복원하고, 복원본과 호환되는 **그 backup 시점의 코드**로 되돌린다. 복원 절차·제약은 `docs/BACKUP-RESTORE.md` 를 따르며, 복원 시점 이후의 데이터 변경은 손실된다.

## 참고

- `GET /api/health` 의 `version` 도 `CONTROL_PLANE_VERSION` 을 따른다.
- maintenance 상태와 active job 은 upgrade 시작 여부 판단에만 쓰이며, API 가 강제로 upgrade 를 막거나 자동화하지 않는다.
- 적용된 migration 을 되돌리는 downgrade 는 지원하지 않는다.
