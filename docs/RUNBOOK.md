# 운영 RUNBOOK

실제 사고 상황에서 순서대로 따라가는 절차서다. 각 시나리오는 **증상 → 확인 → 조치 → 확인** 순서다.
설계 배경은 [ARCHITECTURE.md](./ARCHITECTURE.md), 백업 세부는 [BACKUP-RESTORE.md](./BACKUP-RESTORE.md), 업그레이드는 [CONTROL-PLANE-UPGRADE.md](./CONTROL-PLANE-UPGRADE.md)를 본다.

## 0. 공통 전제

- compose 프로젝트 루트에서 실행한다. 서비스는 `nginx`, `api`, `web`, `engine-agent`, `traffic-worker`, `egress-broker` 6개이며 선택적으로 `cloudflared`가 있다.
- 볼륨은 `containers_control-data`, `containers_artifacts`, `containers_backups`, `containers_nginx-config`, `containers_nginx-logs`, `containers_traffic-data`, `containers_agent-credentials`, `containers_egress-credentials`, `containers_traffic-credentials`, `containers_registry-credentials`다.
- 패널·API는 기본적으로 `${PANEL_BIND_ADDRESS:-127.0.0.1}:${PANEL_PORT:-8080}`에만 publish된다. 아래 `curl` 예시는 호스트에서 실행한다.
- 조회 API는 세션 쿠키 또는 API key로 호출한다. API key는 `authorization: Bearer ctk_...`이며 필요한 scope는 [API-DATA-AUTH.md](./API-DATA-AUTH.md) 2.1절 표를 본다.
- 상태 판단의 1차 소스는 세 가지다.

| 확인 대상             | 명령                                                                  | 의미                                                                                |
| --------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 컨테이너 생존·healthy | `docker compose ps`                                                   | 6개 서비스가 `Up (healthy)`인지                                                     |
| API 프로세스 생존     | `curl -s localhost:18080/api/health`                                  | 프로세스만 확인한다. downstream은 보지 않는다                                       |
| 의존 구성요소 준비도  | `curl -s -o /dev/null -w '%{http_code}\n' localhost:18080/api/readyz` | `200`=ok, `503`=degraded. 상세는 owner·admin 세션 또는 `control-plane:read` API key |

`/api/readyz`의 check 이름은 `engineAgent`, `trafficWorker`, `controlDatabase`, `jobs`, `backup`, `maintenance`다. 인증 없이 호출하면 check별 상태값만 요약으로 나오고, 인증하면 백업 경과 시간·stalled job 수 같은 상세가 함께 나온다.

---

## 1. 호스트 재부팅 후 복구

**증상** — 재부팅·Docker 재시작 이후 패널이 뜨지 않거나 배포 워크로드로 가는 트래픽이 끊긴다.

**확인**

```bash
docker compose ps
docker compose logs --since 10m api nginx engine-agent
curl -s -o /dev/null -w '%{http_code}\n' localhost:18080/api/readyz
```

**조치**

1. 6개 서비스는 `restart: unless-stopped`이므로 Docker 데몬이 뜨면 자동 기동한다. 데몬 자체가 안 떠 있으면 먼저 Docker Desktop 로그인 시 자동 시작(또는 Linux `systemctl enable --now docker`)을 확인한다.
2. 이전에 `docker compose stop`으로 명시적으로 멈춘 서비스는 `unless-stopped` 정책상 자동 기동하지 않는다. 이 경우에만 운영자가 기동한다.
3. `api` 기동 시 startup task가 중단 작업을 스스로 정리한다: 중단된 release 조정, 중단 job 재큐잉, nginx route 재조정, 만료 upload 세션 정리, 백업 due-check.

**확인** — `docker compose ps`가 6개 모두 healthy, `/api/readyz`가 200, `GET /api/deployment-releases`에 `creating`·`probing`·`switching`·`observing`·`rolling-back` 상태로 멈춰 있는 release가 없어야 한다.

---

## 2. api crash loop

**증상** — `api` 컨테이너가 반복 재시작하고 패널이 502/504를 낸다.

**확인**

```bash
docker compose ps api
docker compose logs --tail 200 api
```

로그에서 다음을 구분한다.

- Zod `parseEnv` 실패 — 환경변수 누락·형식 오류. compose 환경변수를 고친다.
- migration 실패 — control DB migration이 `drizzle` 폴더와 어긋난다. 백업 복원 후 이미지 롤백을 한 경우 자주 난다.
- secret 파일 접근 실패 — `containers_control-data`·`containers_agent-credentials` 볼륨 권한 문제.

**조치**

1. 환경변수 문제면 값을 고치고 해당 서비스만 다시 만든다.
2. migration 문제면 **먼저 볼륨 스냅샷을 뜬 뒤** [CONTROL-PLANE-UPGRADE.md](./CONTROL-PLANE-UPGRADE.md) 절차로 이전 이미지·이전 스키마 조합으로 되돌린다. 백업 복원은 migration 기록까지 되돌리지 않으므로 단독 롤백 수단이 아니다.
3. 원인 불명이면 볼륨을 건드리지 말고 로그 전체를 보존한다(`docker compose logs api > api-crash.log`).

**확인** — `curl -s localhost:18080/api/health`가 200, `/api/readyz` 상세에서 `controlDatabase.integrity`가 `ok`.

---

## 3. engine-agent 다운

**증상** — 컨테이너·이미지 조회가 `ENGINE_UNAVAILABLE`, 배포 release가 시작 직후 실패, 업로드가 `DISK_STATUS_UNAVAILABLE`로 거절된다.

**확인**

```bash
docker compose ps engine-agent
docker compose logs --tail 100 engine-agent
curl -s localhost:18080/api/readyz | jq '.data.checks.engineAgent'
```

engine-agent의 healthcheck는 자체 HTTP 응답만 본다. **healthy로 떠 있어도 Docker socket 접근이 막혀 있을 수 있다.** 다음으로 실제 접근을 확인한다.

```bash
docker compose exec -T engine-agent ls -l /var/run/docker.sock
curl -s localhost:18080/api/system/engine | jq '.data.version'
```

**조치**

1. socket 마운트·권한 문제면 호스트의 socket GID를 확인하고 compose의 `group_add` 값을 맞춘다(macOS Docker Desktop은 gid 0, 일반 Linux는 `docker` 그룹).
2. 프로세스만 죽은 경우 컨테이너 재기동으로 복구된다.
3. 복구 전까지는 배포를 시도하지 않는다. release job이 `maxAttempts 1`이라 즉시 실패로 소진된다.

**확인** — `GET /api/system/engine`이 200이고 `/api/readyz`의 `engineAgent`가 `ok`.

---

## 4. traffic-worker 다운 · 수집 정지

**증상** — 트래픽 화면이 비어 있거나 최신 이벤트가 갱신되지 않는다. traffic export·traffic 백업이 실패한다.

**확인**

```bash
docker compose ps traffic-worker
docker compose logs --tail 100 traffic-worker
curl -s localhost:18080/api/readyz | jq '.data.checks.trafficWorker'
docker compose exec -T traffic-worker cat /data/ingest-checkpoint.json
docker compose exec -T nginx ls -l /var/log/nginx/access.jsonl
```

checkpoint는 `device`·`inode`·`offset`을 담는다. nginx access log가 로테이션되면 inode가 바뀌고, worker는 새 파일을 처음부터 다시 읽는다. checkpoint의 inode와 현재 파일의 inode가 다른데 offset이 그대로면 수집이 멈춘 것이다.

**조치**

1. 프로세스 다운이면 재기동으로 복구된다. 재기동 후 checkpoint 기준으로 이어 읽는다.
2. 로그 파일이 사라졌거나(수동 삭제) inode가 어긋나 진행이 없으면, checkpoint 파일을 지우지 말고 먼저 `docker compose logs traffic-worker`에서 폐기 사유(oversized line 등)를 확인한다.
3. 디스크 부족으로 쓰기가 막힌 경우 6번 시나리오를 먼저 처리한다.

**확인** — `/api/traffic/summary`의 최신 시각이 현재에 근접하고, checkpoint의 `offset`이 증가한다.

---

## 5. nginx 설정 적용 실패 · 리로드 안 됨

**증상** — 배포 release가 `switching`·`observing`에서 실패하거나, `POST /api/nginx/config/apply`가 오류를 낸다.

**확인** — 오류 코드로 원인을 구분한다.

| 코드                                                | 의미                                                       |
| --------------------------------------------------- | ---------------------------------------------------------- |
| `NGINX_CONFIG_INVALID:<출력>`                       | `nginx -t` 문법 검증 실패. 뒤에 실제 검증 출력이 붙는다    |
| `NGINX_CONFIG_CONFLICT`                             | `expectedSha256`가 현재 `current.conf`와 다르다(동시 변경) |
| `NGINX_POST_RELOAD_PROBE_FAILED`                    | 리로드 후 probe 실패. 이전 설정으로 자동 롤백됨            |
| `NGINX_POST_RELOAD_PROBE_FAILED:ROLLBACK_UNHEALTHY` | 롤백까지 실패. 즉시 수동 개입 필요                         |
| `NGINX_CONTAINER_UNAVAILABLE`                       | nginx 컨테이너를 찾지 못함                                 |
| `NGINX_PROTECTED_CONTRACT`                          | 보호 계약(관리 server 블록·status 리스너 등)을 깨는 설정   |

```bash
curl -s localhost:18080/api/nginx/status | jq .
docker compose exec -T nginx nginx -t -c /etc/nginx/managed/current.conf
docker compose exec -T nginx head -40 /etc/nginx/managed/current.conf
docker compose logs --tail 100 nginx
```

**조치**

1. `NGINX_CONFIG_INVALID`면 오류 출력에 적힌 줄을 고쳐 다시 apply한다. 검증 실패 설정은 적용되지 않으므로 서비스 영향은 없다.
2. `NGINX_CONFIG_CONFLICT`면 `GET /api/nginx/config`로 현재 설정과 sha256을 다시 받아 재시도한다.
3. `ROLLBACK_UNHEALTHY`면 nginx가 잘못된 설정으로 떠 있을 수 있다. `nginx -t -c /etc/nginx/managed/current.conf`로 확인 후 마지막 정상 설정으로 되돌리고 컨테이너를 재기동한다.
4. `NGINX_PROTECTED_CONTRACT`는 요청 자체가 잘못된 것이다. 보호 대상 블록을 건드리지 않도록 route 정의를 고친다.

**확인** — `docker compose exec -T nginx nginx -t -c /etc/nginx/managed/current.conf`가 성공, `curl -s localhost:18080/api/nginx/status`가 200, 배포 라우트가 실제로 응답한다.

---

## 6. 디스크 가득 참

**증상** — 업로드가 `DISK_HARD_WATERMARK`·`UPLOAD_QUOTA_EXCEEDED`로 거절되고, 백업이 실패하며, SQLite 쓰기 오류가 로그에 남는다.

**확인**

```bash
curl -s localhost:18080/api/system/engine | jq '.data.disk'
docker system df
docker compose logs --tail 50 api | grep -i disk
```

`DISK_SOFT_WATERMARK`는 업로드 응답의 `warnings`로만 나오는 경고이고, `DISK_HARD_WATERMARK`는 거절이다. 임계값은 `UPLOAD_DISK_SOFT_AVAILABLE_BYTES`·`UPLOAD_DISK_HARD_AVAILABLE_BYTES`, 총량 상한은 `UPLOAD_TOTAL_QUOTA_BYTES`다.

**조치**

1. 무엇이 먹고 있는지부터 확인한다: artifact(`containers_artifacts`), 백업(`containers_backups`), traffic DB(`containers_traffic-data`), Docker 이미지·빌드 캐시.
2. Docker 쪽이면 `GET /api/system/prune-preview`로 회수 가능량을 먼저 보고, 확인 후 `POST /api/system/prune`을 owner 권한으로 실행한다. preview 없이 prune하지 않는다.
3. 백업이 원인이면 보존 개수(`BACKUP_RETENTION_COUNT`)와 총량 상한을 확인하고 오래된 백업을 `DELETE /api/backups/:id`로 정리한다.
4. traffic raw 이벤트는 `TRAFFIC_RAW_RETENTION_DAYS`(기본 14일) 보존이다. 즉시 회수가 필요하면 보존 일수를 줄인다.

**확인** — `GET /api/system/engine`의 `disk.availableBytes`가 hard watermark보다 충분히 크고, 업로드가 다시 성공한다.

---

## 7. 중단된 restore

**증상** — `backup.restore` job이 중간에 끊겼다. 패널이 계속 점검 중(503)이거나, 복구가 실패로 끝났다.

**확인**

```bash
curl -s 'localhost:18080/api/jobs?kind=backup.restore&limit=10' | jq '.data[] | {id, status, failureCode, progressStep, finishedAt}'
curl -s localhost:18080/api/jobs/<jobId>/events | jq .
curl -s localhost:18080/api/maintenance | jq .
curl -s localhost:18080/api/control-plane/status | jq '{integrity: .data.databaseIntegrity, migrations: (.data.migrations.pending | length)}'
```

**조치**

1. restore job은 `maxAttempts 1`이라 자동 재시도하지 않는다. api가 중간에 죽었다면 기동 시 reconcile이 해당 job을 `failed`로 확정한다.
2. 복구 트랜잭션은 `PRAGMA foreign_key_check` 위반 시 통째로 롤백된다. 즉 실패한 restore는 DB를 반쯤 바꿔 놓지 않는다. job event의 실패 코드로 원인을 확인한다.
3. 점검 모드가 남아 있으면 owner 세션으로 해제한다: `POST /api/maintenance` body `{"enabled": false}`. (job이 켠 점검 모드는 job 종료 시 자동 해제되지만, 프로세스가 죽으면 남을 수 있다.)
4. passphrase로 봉인한 백업을 복원하는 중 api가 재시작했다면 passphrase는 메모리에서 사라진다. 키 복원이 필요하면 **처음부터 다시** 복구를 요청한다.
5. 다시 시도하기 전에 `GET /api/backups`로 대상 백업의 manifest가 온전한지 확인한다.

**확인** — job이 `succeeded`, 점검 모드 해제, `/api/readyz`의 `controlDatabase.integrity`가 `ok`, 배포 목록이 기대한 시점 상태다.

---

## 8. 배포 교착 — job이 running에서 끝나지 않음

**증상** — CI가 job을 폴링하는데 `running`에서 진행이 없다. 또는 새 release 생성이 `DEPLOYMENT_RELEASE_IN_PROGRESS`로 거절된다.

**확인**

```bash
curl -s 'localhost:18080/api/jobs?status=running&limit=20' | jq '.data[] | {id, kind, progressStep, startedAt, heartbeatAt}'
curl -s localhost:18080/api/jobs/<jobId>/events | jq .
curl -s localhost:18080/api/deployment-releases | jq '.data[] | select(.status != "healthy" and .status != "failed" and .status != "rolled-back")'
```

먼저 **정상적인 장시간 실행**과 구분한다. release는 healthcheck `startPeriodSeconds` + `retries × intervalSeconds` + `rollout.observationSeconds`만큼 정상적으로 오래 걸린다. manifest 값을 보고 예상 소요를 계산한다.

**조치**

1. worker는 30초마다 heartbeat를 쓴다. heartbeat가 90초 이상 멈춘 job은 60초 주기 sweep이 잡아 재큐잉하거나(재시도 여유가 있을 때) `failed`로 확정한다. 즉 진짜 교착은 스스로 풀린다. 최소 2~3분은 기다린다.
2. 그래도 안 풀리면 취소한다: `POST /api/jobs/<jobId>/cancel`. owner·admin 세션 또는 `job:write` scope API key가 필요하다. 취소는 즉시 종료가 아니라 `cancelling`으로 표시되고 handler가 체크포인트에서 중단한다.
3. release가 활성 상태로 남아 새 배포를 막으면, 그 release의 job이 끝난 뒤 상태를 다시 확인한다. api 재기동 시 reconcile이 `switching`·`observing`·`rolling-back`에 걸린 release를 이전 라우트로 되돌린다.
4. 같은 대상에 대한 중복 job은 `resourceKey`로 단일화된다. 재요청이 새 job을 만들지 않고 기존 job을 돌려주는 것은 정상이다.

**확인** — 해당 job이 종단 상태(`succeeded`·`failed`·`cancelled`)에 도달하고, `GET /api/deployment-releases`에 활성 상태 release가 없으며, 새 release 생성이 다시 받아들여진다.

---

## 9. API key 유출 대응

**증상** — 키가 로그·저장소·스크린샷에 노출됐다. 또는 예상치 못한 배포·업로드가 감사 로그에 보인다.

**확인**

```bash
curl -s localhost:18080/api/api-keys | jq '.data[] | {id, name, prefix, lastUsedAt, expiresAt, revokedAt}'
curl -s 'localhost:18080/api/audit?limit=100' | jq '.data[] | select(.authMethod == "api-key") | {occurredAt, actorId, operation, targetType, targetId, result, sourceIp}'
```

감사 로그는 `operation`·`targetType`·`targetId`·`result`·`from`·`to`로 필터할 수 있다. 응답에 키 원문은 절대 나오지 않는다(저장은 sha256 해시, 식별은 `prefix`).

**조치**

1. **먼저 폐기한다**: `DELETE /api/api-keys/<id>` (owner·admin 세션 — 키 관리는 세션 전용). 폐기 즉시 rate limit 창도 삭제되고 이후 인증이 실패한다.
2. 노출 구간을 정리한다. GitHub Secrets에 있던 값이면 Secret을 교체하고, 로그·아티팩트에 남았으면 해당 실행 로그를 삭제한다.
3. 새 키를 최소 scope로 발급한다. CI 배포용은 `artifact:upload`, `image:load`, `deployment:read`, `deployment:write`, `job:read`가 기본이고, 배포 후 검증까지 돌리면 `engine:read`를 더한다(`docs/ci-examples/containers-deploy.sh`). `backup:write`·`secret:write`는 owner만 발급 가능하므로 CI에 넣지 않는다.
4. 유출 기간의 감사 로그를 훑어 실제 사용 흔적(`lastUsedAt`, `authMethod: api-key` 이벤트)을 확인하고, 의심스러운 배포가 있으면 8번·해당 release rollback 절차로 되돌린다.
5. 배포 secret이 함께 노출됐을 가능성이 있으면 `deployment_secret` 값을 재등록한다.

**확인** — 폐기한 키로 호출하면 401, `GET /api/api-keys`에서 `revokedAt`이 채워져 있고, 새 키로 CI 파이프라인이 정상 통과한다.

---

## 10. owner 계정 상실 · 자격증명 유출

**증상** — owner 비밀번호를 잃었다. 또는 owner 세션이 탈취된 정황이 있다.

**owner 가 둘 이상이면**

다른 owner 로 로그인해 해당 계정을 비활성화하거나 삭제한다. 자기 자신은 대상이 될 수 없다(`SELF_MODIFICATION_FORBIDDEN`).

```bash
curl -s localhost:18080/api/users | jq '.data[] | {id, email, role, disabledAt}'
curl -sX PATCH localhost:18080/api/users/<id> -H 'content-type: application/json' -d '{"disabled":true}'
curl -sX DELETE localhost:18080/api/users/<id>
```

비활성화·강등·삭제는 그 사용자의 세션을 지우고 그가 만든 API key 를 폐기한다.

**owner 가 하나뿐이면**

패널 안에서 되돌릴 방법이 없다. 서버에서 계정을 초기 상태로 되돌리고 다시 만든다. 계정 관련 테이블만 지우고 배포·nginx·트래픽 데이터는 남는다.

```bash
bun scripts/reset-accounts.ts              # 대상만 보여준다
bun scripts/reset-accounts.ts --confirm    # 실행 전 control.sqlite.pre-reset 사본을 남긴다
```

그다음 서버에서 `http://127.0.0.1:18080` 에 접속해 첫 owner 를 다시 만든다. **공개 주소에서는 403 이다.** 되돌리려면 `control.sqlite.pre-reset` 를 원위치에 복사하고 api 를 재시작한다.

**확인** — `GET /api/bootstrap/status` 가 `required: true` → 새 owner 생성 후 `false`, 감사 로그에 `bootstrap.owner` `success` 가 남는다.

---

## 11. 공개 주소로 로그인이 403 INVALID_ORIGIN

**증상** — 도메인으로 패널은 열리는데 로그인만 실패한다. nginx access log 에 그 host 의 `444` 가 쌓인다.

**원인** — 그 host 가 신뢰 origin 에 없다. nginx `server_name` 과 인증 origin 은 별개 값이라 한쪽만 맞으면 이 상태가 된다.

**조치** — 패널 **공개 주소** 화면을 연다. 접근이 시도된 host 가 요청 수·거부 수와 함께 후보로 뜬다. 해당 host 를 골라 저장하면 `server_name` 과 신뢰 origin 이 함께 적용된다. 신뢰 origin 은 즉시 반영되고, 쿠키·생성 링크에 쓰이는 base URL 은 `restartRequired` 안내대로 api 재시작 후 적용된다.

환경변수 origin 은 하한선으로 항상 남으므로 잘못 저장해도 loopback 로그인은 살아 있다.

**확인** — 그 도메인에서 로그인 200, 응답 쿠키에 `Secure` 가 붙는다.

---

## 12. docker compose up 이 통째로 실패한다

**증상** — `docker compose up -d --wait` 이 아래로 끝나고 일부 서비스만 정지 상태로 남는다. `docker compose logs` 에는 원인이 나오지 않는다.

```
Error response from daemon: error while removing network: network containers_edge
has active endpoints (name:"containers-api-1" ...)
```

**원인** — `compose.yaml` 의 네트워크 정의(주로 `subnet`)가 이미 만들어진 네트워크와 다르다. Compose 는 기존 네트워크를 그 자리에서 갱신하지 못해 삭제 후 재생성을 시도하는데, 다른 서비스가 붙어 있으면 삭제가 거부되고 `up` 전체가 멈춘다. 스택을 오래 띄워 둔 채 `compose.yaml` 만 갱신하면 재현된다.

**진단** — 정의와 실제를 대조한다. `scripts/setup.sh` 는 기동 전에 이 점검을 자동으로 한다.

```bash
docker compose config --format json | jq '.networks'
docker network inspect containers_edge --format '{{range .IPAM.Config}}{{.Subnet}}{{end}}'
```

**조치** — 스택 전체를 내렸다 올린다. 네트워크는 마지막 컨테이너가 떨어질 때 삭제되고 다음 `up` 에서 정의대로 만들어진다.

```bash
docker compose down          # -v 를 붙이지 않는다. 볼륨과 DB 는 보존된다
docker compose up -d --wait
```

컨테이너가 네트워크에서만 분리된 중간 상태로 남아 `up` 도 `restart` 도 받지 않으면(`is not connected to the network ...`), 그 컨테이너만 `docker rm` 으로 지운 뒤 `down` 을 실행한다.

**확인** — 6개 서비스 healthy, `docker volume ls | grep containers` 로 볼륨 보존 확인.

상세는 [bug/2026-08-18-edge-subnet-mismatch-blocks-startup.md](./bug/2026-08-18-edge-subnet-mismatch-blocks-startup.md).

---

## 13. 프록시 라우트 저장이 409 NGINX_PROTECTED_CONTRACT 로 막힌다

**증상** — 입력값이 유효한데도 "관리 plane에서 보호하는 Nginx 계약을 변경할 수 없습니다" 로 저장이 거부된다.

**원인** — 추가하려는 라우트가 아니라 **기존 `current.conf` 가** 보호 계약을 어기고 있다. 라우트 추가는 설정 전체를 다시 적용하는 동작이라 여기서 함께 검사된다. 오래 운영한 스택의 관리 설정이 코드가 요구하는 계약보다 낡으면 발생한다.

**진단** — catch-all 서버가 있는지 본다. 없으면 이 경우다.

```bash
docker run --rm -v containers_nginx-config:/managed:ro alpine grep -c "return 444" /managed/current.conf
```

**조치** — 등록된 라우트를 먼저 확인한 뒤(있으면 내용을 기록해 둔다) 옛 설정을 치우고 nginx 를 재시작한다. `entrypoint.sh` 가 이미지의 최신 템플릿을 복사한다.

```bash
docker run --rm -v containers_nginx-config:/managed alpine mv /managed/current.conf /managed/current.conf.old
docker compose restart nginx
```

**교체 직후 공개 hostname 이 끊긴다.** 템플릿의 패널 블록에는 loopback 이름만 있다. `http://127.0.0.1:18080` 으로 접속해 패널 설정에서 공개 주소를 저장하면 `server_name` 에 다시 들어간다. 그 다음 프록시 라우트를 추가한다.

상세는 [bug/2026-08-18-stale-nginx-config-fails-protected-contract.md](./bug/2026-08-18-stale-nginx-config-fails-protected-contract.md).

---

## 14. 사고 후 정리

- 원인·조치·타임라인을 `docs/history/`에 남긴다. 반복되면 `docs/quality-assurance/`에 점검 체크리스트로 승격한다.
- 절차가 실제와 달랐던 부분은 **이 문서를 그 자리에서 고친다.** 문서와 코드가 어긋나면 코드가 진실이다.
