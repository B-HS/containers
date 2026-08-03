# Control Plane Upgrade·Rollback Runbook

control plane(nginx·web·api·engine-agent·traffic-worker)은 compose 로 단일 호스트에 배포된다. 이 문서는 호스트 터미널에서 수행하는 upgrade·rollback 절차와, 그 전에 owner UI(`/api/control-plane/status`)로 확인해야 할 준비 상태를 정의한다.

> **권한 경계**: 이 문서의 모든 호스트 명령은 **사용자가 직접** 수행한다. API·Web 은 준비 상태를 읽기 전용으로 보고할 뿐 컨테이너 생성·재시작·이미지 pull 을 실행하지 않는다 (SECURITY.md §11 불변식).

## 사전 개념

- **버전 단일 원천**: `packages/contracts/src/control-plane.ts` 의 `CONTROL_PLANE_VERSION` (`0.1.0`) 이 API·Web·health endpoint 의 버전 표시의 원천이다.
- **migration dry-run**: API 가 각 migration SQL 파일 내용의 sha256 과 control DB `__drizzle_migrations.hash` 를 비교하여 `applied`/`pending` 을 판정한다. 파일 내용 기준이므로 journal `when` 변경과 무관하게 실제 적용 여부를 보여준다.
- **자기 재배포 없음**: API 가 자신의 컨테이너를 재생성하지 않는다. 실행 중 프로세스가 끊기면 job·세션이 비결정적으로 실패하므로, 실제 재배포는 반드시 호스트에서 수행한다.

## upgrade 준비 상태 확인 (owner UI)

`/api/control-plane/status` 는 owner·admin 세션에 대해 다음을 반환한다.

| 항목                        | 만족 조건                     | 불만족 시 조치                                                                       |
| --------------------------- | ----------------------------- | ------------------------------------------------------------------------------------ |
| `migrations.pending`        | 비어 있어야 함                | pending migration 을 적용하기 전에 upgrade 하지 않는다. (아래 "migration 적용" 참고) |
| `maintenance.enabled`       | upgrade 중에는 켜는 것을 권장 | maintenance 를 켠 뒤 진행한다                                                        |
| `activeJobCount`            | 0 이어야 함                   | 실행 중 job 이 끝날 때까지 기다린다. 0 이 아니면 upgrade 를 시작하지 않는다          |
| `lastBackupAt`              | 최근 backup 이 존재해야 함    | `docs/BACKUP-RESTORE.md` 절차로 신선한 backup 을 만든다                              |
| `databaseIntegrity.control` | `ok` 여야 함                  | control DB 손상이 의심되면 backup 복원을 먼저 검토한다                               |

## upgrade 절차

1. owner UI 에서 `control-plane` 위젯으로 위 준비 상태가 모두 만족하는지 확인한다.
2. maintenance 를 켠다 (owner UI 또는 `POST /api/maintenance { "enabled": true }`). upgrade 중 생성·변경 요청이 503 으로 막힌다.
3. 호스트에서 코드를 최신으로 가져온다.

    ```sh
    git pull --ff-only
    ```

4. 이미지를 다시 빌드한다.

    ```sh
    docker compose build
    ```

5. 서비스를 재배포한다.

    ```sh
    docker compose up -d --wait
    ```

6. owner UI 또는 `GET /api/control-plane/status` 로 다음을 확인한다.
    - `version` 이 새 코드 버전인가
    - `migrations.pending` 이 비어 있는가 (새 migration 이 있으면 부팅 시 자동 적용됨)
    - `databaseIntegrity.control` 이 `ok` 인가
7. 문제가 없으면 maintenance 를 끈다 (`POST /api/maintenance { "enabled": false }`).
8. 문제가 있으면 아래 rollback 절차를 따른다.

### migration 적용

- compose `up -d --wait` 시 api 컨테이너 부팅이 drizzle `migrate` 를 실행하므로 새 migration 은 자동 적용된다.
- 적용 실패로 api 가 뜨지 않으면 `docker compose logs api` 로 원인을 확인한다.
- **적용된 migration 을 되돌리는 downgrade 는 지원하지 않는다.** schema 를 이전 버전으로 되돌려야 하면 아래 rollback 의 "DB 복원" 단계로 control DB 를 backup 에서 복원한다.

## rollback 절차

1. 호스트에서 이전 릴리스를 가리킨다.

    ```sh
    git checkout <이전 커밋>
    ```

2. 이미지를 다시 빌드하고 재배포한다.

    ```sh
    docker compose build
    docker compose up -d --wait
    ```

3. control DB schema 가 이전 코드와 호환되지 않으면 (새 migration 이 적용된 경우) **downgrade 없이** backup 에서 복원한다. 절차는 `docs/BACKUP-RESTORE.md` 를 따른다. 복원 시점 이후의 데이터 변경은 손실된다.
4. owner UI 또는 `GET /api/control-plane/status` 로 버전·migration·integrity 를 확인한다.

## 참고

- `GET /api/health` 의 `version` 도 `CONTROL_PLANE_VERSION` 을 따른다.
- maintenance 상태와 active job 은 upgrade 시작 여부 판단에만 쓰이며, API 가 강제로 upgrade 를 막거나 자동화하지 않는다.
