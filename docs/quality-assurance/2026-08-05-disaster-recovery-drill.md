# 2026-08-05 — 새 호스트 재해복구 드릴

- 대상 절차: [BACKUP-RESTORE.md](../BACKUP-RESTORE.md) §4.4 "새 호스트 재해복구 절차"
- 결과: **성공.** 문서의 4단계를 그대로 따라 복구했고, 절차 문서에 수정할 점은 없었다.
- 한계: 물리적으로 다른 머신이 아니라 **같은 Docker 호스트의 별도 compose 프로젝트**(`containers-dr`, 별도 볼륨·네트워크·포트)를 새 호스트로 삼았다. 검증되지 않은 것은 "다른 커널·다른 Docker 버전"뿐이고, 상태 이전 자체는 실제와 동일하다.

## 1. 절차와 실행 결과

| 단계                             | 실행                                                                                                       | 결과                                           |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| 0. 키 포함 백업 생성             | `POST /api/backups` + passphrase, label `disaster-recovery-drill`                                          | 201, `secretsIncluded: true`                   |
| 1. backup volume 오프사이트 복사 | `docker run --rm -v containers_backups:/d -v "$PWD":/out alpine tar czf /out/backups.tgz -C /d .`          | 8.3 MiB 아카이브                               |
| 2. 새 호스트 스택 기동(빈 상태)  | `COMPOSE_PROJECT_NAME=containers-dr PANEL_PORT=19080 EDGE_SUBNET=10.91.0.0/24 docker compose up -d --wait` | 5개 서비스 healthy, `/api/readyz` 전 항목 `ok` |
| 3. 아카이브 풀기                 | `docker run --rm -v containers-dr_backups:/d -v "$PWD":/in alpine tar xzf /in/backups.tgz -C /d`           | 백업 7세트 인식                                |
| 4. owner bootstrap → `full` 복구 | `POST /api/bootstrap/owner` → `POST /api/backups/:id/restore` (`mode: full`, passphrase)                   | 201 → 202, job `backup.restore` **succeeded**  |

## 2. 검증

- **DB 가 실제로 교체됐다**: 복구 직전 bootstrap 한 DR owner 세션이 401 이 됐고(스냅샷에 없는 계정), 스냅샷 시점 계정(`e2e@containers.local`)이 새 호스트에 존재해 로그인 200 이었다.
- **데이터 이전**: 감사 로그 33건, 백업 목록·컨테이너·API 키·control plane 상태 전부 200.
- **암호 envelope 로 복원한 키**: 배포 secret 200, 알림 대상 200 — 복호화 경로가 살아 있다. 문서대로 **키 파일은 기동 시 읽히므로 API 재시작 후** 적용했다.
- **보안 자세 유지**: 새 스택도 `bun run audit:runtime` 5개 컨테이너 전부 통과.
- **원본 스택 무영향**: 드릴 내내 healthy, 종료 후에도 불변식 통과.

## 3. 문서와 실제가 어긋나지 않은 것 (재확인)

- **nginx 설정은 자동 적용되지 않는다.** 새 호스트의 `current.conf` SHA 는 원본과 달랐고(기본 설정 그대로), 이는 [BACKUP-RESTORE.md](../BACKUP-RESTORE.md) §4.3 의 "`nginx.conf` 는 사본 보관용이고 라우팅은 복구된 `nginx_route` 행으로 재생성" 서술과 일치한다. 이번 스냅샷의 `nginx_route` 는 0건이라 재생성할 것이 없었다.
- `__drizzle_migrations` 를 되돌리지 않으므로 새 호스트가 최신 migration 상태로 기동한 뒤 데이터만 스냅샷으로 교체됐고, 재기동 시 crash loop 가 발생하지 않았다.

## 4. 절차에 추가할 주의사항 하나

`EDGE_SUBNET` 기본값이 `10.89.0.0/24` 고정이라, **같은 호스트에서 두 번째 스택을 띄우면 네트워크 풀이 겹쳐 기동에 실패한다**(`Pool overlaps with other one on this address space`). 진짜 새 호스트에서는 발생하지 않지만, 드릴을 같은 머신에서 재현할 때는 `EDGE_SUBNET` 을 다른 대역으로 지정해야 한다. 이 사실을 BACKUP-RESTORE.md §4.4 에 반영했다.

## 5. 정리

드릴용 프로젝트는 `docker compose -p containers-dr down -v` 로 컨테이너·볼륨·네트워크 전부 제거했다(잔존 0건 확인). 오프사이트 아카이브와 자격증명 파일은 세션 스크래치패드에만 있었고 저장소에는 남기지 않았다.
