# control DB 에 삭제된 user 를 참조하는 고아 행이 남아 있다

- 발견일: 2026-08-06
- 심각도: major — 데이터 무결성. 서비스 중단은 없다
- 발견 경로: manifest route nullable 마이그레이션(0019) 적용 중 SQLite 테이블 재생성이 FK 로 막혀, 부팅 시 `PRAGMA foreign_key_check` 를 추가하다 드러났다

## 증상

부팅 로그에 남는다.

```
{"event":"control-database.foreign-key.violation","total":78,
 "byTable":{"audit_log→user":62,"api_key→user":9,"operation_job→user":4,
            "trusted_proxy→user":2,"panel_setting→user":1}}
```

`audit_log`·`api_key`·`operation_job`·`trusted_proxy`·`panel_setting` 의 `user` 참조가 실제로 존재하지 않는 사용자를 가리킨다. 스키마는 이 참조들을 FK 로 선언하고 있는데도 그렇다.

## 원인 (미확정)

확정하지 못했다. 가능성은 두 가지다.

1. **사용자 삭제 경로가 FK 를 우회했다.** `DELETE /api/users/:id` 는 2026-08-05 에 추가됐고, 그때 삭제된 계정(`verify@containers.local` 등)이 남긴 감사 기록·API 키가 정확히 이 고아 집합과 겹친다.
2. **과거 테이블 재생성 마이그레이션이 FK 를 끈 채 돌았다.** SQLite 는 `PRAGMA foreign_keys` 를 트랜잭션 안에서 무시한다. drizzle 이 만드는 재생성 마이그레이션은 첫 줄에 `PRAGMA foreign_keys=OFF` 를 넣지만 migrator 가 트랜잭션으로 감싸므로 그 지시가 먹지 않는다.

2번은 이번에 **직접 확인**했다. 0019 를 적용하려 하자 `SQLITE_CONSTRAINT_TRIGGER: FOREIGN KEY constraint failed` 로 부팅이 실패했고, 연결 수준에서 `PRAGMA foreign_keys = OFF` 를 켠 뒤에야 통과했다.

## 조치 (이번에 한 것)

- `createControlDatabase` 가 마이그레이션 **전에** 연결 수준에서 `foreign_keys = OFF`, **후에** 다시 `ON` 으로 되돌린다. SQLite 테이블 재생성 마이그레이션이 성립하려면 필요하다.
- 마이그레이션 직후 `PRAGMA foreign_key_check` 를 돌려 위반을 `table→parent` 별 개수와 합계로 로그에 남긴다(`control-database.foreign-key.violation`).
- migrate 가 throw 하면 catch 에서 `foreign_keys = ON` 을 되돌리고 `control-database.migrate.failed` 를 남긴 뒤 그대로 다시 던진다.
- **기동은 막지 않는다.** 처음에는 위반 시 throw 했는데, 기존 데이터 불일치 하나로 control plane 전체가 뜨지 않았다. 가용성을 데이터 위생보다 앞에 둔다.

## 2026-08-06 후속 — control DB 를 초기화했다

사용자 지시로 실운영 전 전체 초기화를 했다(`control-data`·`traffic-data`·`artifacts`·`backups`·`nginx-config`·`nginx-logs` 볼륨 제거). **고아 행 78건은 데이터와 함께 사라졌고, 재기동 후 `foreign_key_check` 위반은 0건이다.**

다만 **근본 원인은 그대로 남아 있다.** 아래 "남은 것"의 판단은 여전히 필요하고, 같은 경로로 다시 쌓일 수 있다.

## 남은 것 (사용자 판단 필요)

고아 행을 어떻게 할지는 정하지 않았다. 임의로 지우지 않았다.

- `audit_log` 는 append-only 가 원칙이라(`SECURITY.md` §11) 삭제도 수정도 함부로 할 수 없다. 62건이 여기 있었다.
- ~~`api_key` 9건 확인~~ — 초기화로 전부 사라졌다. 소유자 없는 유효 키가 남을 위험은 지금은 없다.
- 근본 원인 1번(사용자 삭제 경로)이 맞다면 `DELETE /api/users/:id` 가 참조를 어떻게 정리할지(참조 무효화 / 삭제 거부 / 익명화)를 결정해야 한다.
