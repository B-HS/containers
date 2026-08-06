# 계정 초기화가 참조 무결성을 깨서 백업이 막혔다

- 발견일: 2026-08-06
- 심각도: critical — 백업이 전혀 되지 않는다. 복구 수단이 사라진 상태로 운영된다
- 발견 경로: headless API 실측 중 `POST /api/backups` 가 `BACKUP_CONTROL_FOREIGN_KEY_INVALID` 로 거부

## 증상

```
POST /api/backups → 409 BACKUP_CONTROL_FOREIGN_KEY_INVALID
pragma foreign_key_check → 107건
  audit_log 82 · operation_job 12 · deployment_release 4 · upload_session 4 · deployment_manifest 3 · deployment 2
```

전부 삭제된 `user.id` 를 가리키는 행이었다. 백업은 스냅샷을 뜨기 전에 `foreign_key_check` 로 정합성을 확인하고 위반이 있으면 거부한다(이 동작 자체는 옳다).

## 원인

`scripts/reset-accounts.ts` 가 `bun:sqlite` 로 계정을 지우는데, **bun:sqlite 는 `PRAGMA foreign_keys` 가 기본 OFF** 다. 그래서 `user` 를 지울 때 `on delete set null`·`cascade` 가 **하나도 실행되지 않았고**, 다른 테이블의 참조가 그대로 남았다.

런타임(`packages/db-schema/src/database.ts`)은 연결마다 `PRAGMA foreign_keys = ON` 을 켠다. 스크립트만 이 규칙에서 빠져 있었다.

여기에 더해, 이력 테이블의 `created_by` 가 `not null` + `on delete restrict` 였다. FK 를 켰더라도 배포 이력이 있는 설치에서는 **계정 삭제 자체가 막혔을 것**이고, `DELETE /api/users/:id` 도 같은 이유로 500 이 났을 것이다. 한 번이라도 배포한 운영자는 지울 수 없는 상태였다.

## 수정

1. **스크립트가 FK 를 켠다** — `reset-accounts.ts` 의 삭제 스크립트가 `PRAGMA foreign_keys = ON` 을 실행하고, 삭제 후 `foreign_key_check` 로 위반이 없는지 확인해 있으면 실패한다. 조용히 깨뜨리는 대신 즉시 드러난다.
2. **이력 귀속은 null 을 허용한다** — `artifact`·`deployment`·`deployment_manifest`·`deployment_release`·`deployment_stack`·`deployment_stack_release`·`deployment_secret`·`notification_destination` 의 `created_by` 를 nullable + `on delete set null` 로 바꿨다(migration `0026`). 이미 `audit_log.actor_id`·`operation_job.created_by` 가 쓰던 방식으로 통일한 것이다. 계정을 지워도 이력은 남고, 귀속만 "알 수 없음" 이 된다.
    - 계약도 `createdBy` 를 nullable 로 바꿨다(`deployment.ts`·`deployment-stack.ts` 4곳). UI 는 이 값을 쓰지 않아 영향이 없다.
    - 스택 배포 실행처럼 **실행 주체가 반드시 필요한 경로**는 null 이면 `DEPLOYMENT_STACK_RELEASE_ACTOR_MISSING`(409)로 거부한다.

## 실측 복구

이미 깨져 있던 이 스택은 아래 순서로 고쳤다.

1. migration `0026` 적용 (컬럼을 nullable 로)
2. 사라진 사용자를 가리키는 `created_by` 를 null 로 (operation_job 12 · deployment 2 · deployment_manifest 3 · deployment_release 4)
3. 고아 `upload_session` 4건과 그에 딸린 `upload_chunk` 4건 삭제 (cascade 가 했어야 할 일)
4. `audit_log.actor_id` 82건을 null 로. **해시 체인에 든 기록이 하나도 포함되지 않는 것을 먼저 확인**하고 실행했다(포함됐다면 중단하도록 조건을 걸었다)
5. `foreign_key_check` 0건 → `POST /api/backups` 성공

## 교훈

- SQLite 에서 참조 무결성은 **연결마다 켜야 한다.** 앱이 켠다고 스크립트도 켜져 있는 것이 아니다. DB 를 건드리는 모든 진입점에서 확인한다.
- `on delete restrict` 를 이력 테이블에 걸면 "계정을 지울 수 없다"가 된다. 이력의 귀속은 null 을 허용하고, 실행에 주체가 꼭 필요한 지점에서만 거부한다.
