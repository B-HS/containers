# 안전 중단·재개 체크리스트

이 문서는 새 Codex 세션, 다른 작업자, 다른 macOS shell에서 프로젝트를 안전하게 재개하기 위한 **단일 실행 진입점**이다. 현재 상태 요약은 이 문서와 [HANDOFF-STATUS.md](./HANDOFF-STATUS.md)에만 갱신하고, `acknowledge/`와 `history/`의 과거 시점 수치는 고치지 않는다.

## 1. 마지막 확인된 안전 중단점

확인 시각: **2026-08-01 16:00 KST**

- 작업 경로: `/Users/hyunseokbyun/development/containers`
- 이 디렉터리는 Git 저장소가 아니다. `git status`나 diff를 변경 범위의 근거로 사용하지 않는다.
- Compose 5개 서비스 `nginx`, `web`, `api`, `engine-agent`, `traffic-worker`가 모두 healthy다.
- `control.sqlite`, `traffic.sqlite`의 `PRAGMA integrity_check` 결과가 모두 `ok`다.
- `queued`, `running`, `cancelling` durable job은 0개다.
- maintenance gate는 정상 mutation인 traffic export가 `202`로 접수된 뒤 성공했으므로 비활성 상태다.
- Phase 16 CSV export job `de995dd6-ab88-46a5-a57c-b75ae6e1b423`과 NDJSON export job `6efa547b-3c48-4c3a-af7e-162ce2086f80`은 `succeeded`로 종결됐다.
- 두 export는 owner UI에서 생성·download됐고 create/download audit가 남았다. 파일은 `0600 bun:bun`, IP는 mask됐으며 user agent와 원본 client IP 필드는 없다.
- traffic live tail은 owner UI에서 실수신, pause 중 12초 고정, resume 후 신규 행 수신, 브라우저 console error 0건을 확인했다.
- Traffic checkpoint는 `/data/ingest-checkpoint.json`, 권한은 `0600 bun:bun`이다.
- 보존 backup directory는 `374f1798-c75f-4152-938d-be2d09d12d51`, `ddabc56c-ba20-4431-b52d-3ff3ba1b6e1e` 두 개다.
- managed Nginx current SHA-256은 `ccbe28ce36ba39e7b241950bc810f8b8477ea9a3c8814670594baf7b1e2f7d11`이다.
- 마지막 전체 gate: 7 workspace typecheck, ESLint, Prettier, 121 tests/401 assertions/31 files, backend bundle, Compose Web Turbopack production build 성공.

이 값은 재개 시점의 기대값이지 영구 상수가 아니다. 서비스 uptime, traffic row 수, schedule 시각, job 목록은 정상적으로 변할 수 있다.

## 2. 새 환경에서 읽는 순서

- [ ] `/Users/hyunseokbyun/development/llm-rules/docs/convention/`의 규칙을 전부 읽는다.
- [ ] 이 문서를 끝까지 읽는다.
- [ ] [HANDOFF-STATUS.md](./HANDOFF-STATUS.md)의 구현 범위·한계·검증 증거를 읽는다.
- [ ] [PROCESS.md](./PROCESS.md)의 마지막 활성 Phase를 읽는다.
- [ ] [IMPLEMENTATION-PLAN.md](./IMPLEMENTATION-PLAN.md)과 [quality-assurance/ACCEPTANCE.md](./quality-assurance/ACCEPTANCE.md)에서 선택한 작업의 완료 조건을 확인한다.
- [ ] 관련 최신 `acknowledge/` 문서를 읽는다. 현재 최신은 [0021](./acknowledge/0021-traffic-checkpoint-live-export.md)이다.
- [ ] UI 변경이면 [SHADCN-COMPONENTS.md](./SHADCN-COMPONENTS.md)와 `/Users/hyunseokbyun/development/flunti-otel` 패턴을 먼저 확인한다.

## 3. 재개 직후 읽기 전용 점검

```sh
cd /Users/hyunseokbyun/development/containers
pwd
docker compose ps
curl -fsS http://127.0.0.1:8080/api/health
rg --files docs | sort
```

DB와 활성 job을 파일 수정 없이 확인한다.

```sh
docker compose exec -T api bun -e 'import { Database } from "bun:sqlite"; const db = new Database("/data/control.sqlite", { readonly: true }); console.log(db.query("PRAGMA integrity_check").get()); console.log(db.query("SELECT count(*) AS activeJobs FROM operation_job WHERE status IN (?1, ?2, ?3)").get("queued", "running", "cancelling")); db.close()'
docker compose exec -T traffic-worker bun -e 'import { Database } from "bun:sqlite"; const db = new Database("/data/traffic.sqlite", { readonly: true }); console.log(db.query("PRAGMA integrity_check").get()); db.close()'
docker compose exec -T traffic-worker stat -c '%a %U:%G %n' /data/ingest-checkpoint.json
```

기대 핵심 결과는 두 integrity check의 `ok`, `activeJobs: 0`, checkpoint의 `600 bun:bun`이다. Docker Desktop socket 승인이 없는 shell에서는 명령이 실패할 수 있으므로 권한을 우회하지 말고 승인 가능한 환경에서 다시 실행한다.

- [ ] 5개 서비스가 모두 `healthy`인지 확인한다. `starting`이면 healthcheck 제한 시간만큼 기다린 뒤 다시 확인한다.
- [ ] 활성 job이 없는지 control DB를 읽기 전용으로 확인한다. 활성 job이 있으면 종료·실패·사용자 승인 필요 상태를 먼저 판단하고 새 mutation을 시작하지 않는다.
- [ ] DB integrity를 읽기 전용으로 확인한다. `ok`가 아니면 구현을 중단하고 backup·복구 문서로 전환한다.
- [ ] `.env`, secret file, registry credential, cookie store의 내용을 읽지 않는다.
- [ ] 코드가 마지막 중단점 이후 변경됐는지 Git이 아닌 파일·테스트·런타임 상태로 판단한다.

빠른 gate:

```sh
bun run typecheck
bun run lint
bun run format:check
bun test
```

프로덕션 빌드가 필요한 변경이면 host Turbopack이 장시간 정지할 수 있으므로 Compose image build를 최종 근거로 사용한다.

```sh
docker compose build <changed-service...>
docker compose up -d <changed-service...>
docker compose ps
```

## 4. 절대 지켜야 할 안전 불변식

- [ ] `docker compose down -v`, broad `docker system prune`, broad image/container/network/volume 삭제를 실행하지 않는다.
- [ ] 사용자 소유 Docker resource는 이름이나 사용 여부를 추정해 정리하지 않는다.
- [ ] 실제 prune은 owner 최근 인증, 최신 preview SHA, 정확한 확인 문구가 있어도 사용자 resource 삭제 영향이 확인되지 않으면 실행하지 않는다.
- [ ] restore는 live control·traffic 상태를 되돌린다. **사용자의 명시 승인과 직전 recovery backup 없이는 실행하지 않는다.**
- [ ] API·Web에 Docker socket을 mount하지 않는다. Agent만 socket을 가진다.
- [ ] `.env`를 만들거나 수정하지 않고 secret 원문을 문서·log·audit·테스트 출력에 넣지 않는다.
- [ ] Nginx runtime config는 volume을 직접 고치지 않는다. authenticated apply, current SHA, syntax test, probe 경로를 사용한다.
- [ ] 테스트 fixture는 고유 prefix와 정확한 ID로만 생성·정리한다.
- [ ] dirty 상태를 없애기 위한 reset·checkout·광범위 삭제를 하지 않는다.

## 5. 완료된 마지막 Phase

Phase 16은 구현·테스트·재배포·owner browser E2E까지 완료됐다.

- [x] inode/device/offset/partial-line checkpoint와 원자 저장
- [x] rename rotation old inode drain 후 active inode 전환
- [x] DB 실패 시 offset 미진행·replay·중복 제거
- [x] bounded masked Traffic Worker SSE와 API session 재검사 proxy
- [x] Web 25행 live tail과 pause/resume, ko/en/ja
- [x] 최대 24시간 CSV/NDJSON durable export
- [x] owner/admin 생성·download, audit, cancel, 14일 retention
- [x] 원본 client IP·user agent 비노출, CSV injection 방어
- [x] 전체 gate, Compose 재배포, 5개 healthy
- [x] owner live tail 실수신·pause/resume, CSV·NDJSON 생성→완료→download, console error 0

증거: [0021](./acknowledge/0021-traffic-checkpoint-live-export.md), [PROCESS.md](./PROCESS.md), [ACCEPTANCE.md](./quality-assurance/ACCEPTANCE.md).

## 6. 다음에 해야 할 일 — 우선순위와 완료 증거

### P0-A. 남은 운영 증거

- [ ] 자동 backup due 시각이 실제로 지난 뒤 `backup.create` job이 unique enqueue되고 `succeeded`가 되는지 확인한다.
    - 강제로 시각이나 DB를 바꾸지 않는다.
    - 증거: schedule의 `nextRunAt`, job timeline, 새 backup manifest, 두 DB digest·integrity.
- [ ] owner `backup.restore` durable job E2E를 수행한다.
    - live DB를 되돌리는 파괴적 검증이므로 사용자 명시 승인 전에는 실행하지 않는다.
    - 사전 조건: 새 backup 생성, 대상 backup ID와 recovery ID 기록, active job 0, maintenance off.
    - 증거: queued→running→succeeded, maintenance enable→drain→restore→disable, 두 DB integrity, panel/API 정상 응답.

### P0-B. 원격 설치·업그레이드 완결

- [ ] Cloudflare Tunnel·Access 설치, domain mapping, token rotation runbook을 작성하고 실제 환경에서 검증한다.
- [ ] fresh M1 Max Docker Desktop에서 install→owner bootstrap→restore E2E를 수행한다.
- [ ] control plane upgrade/migration dry-run/rollback matrix와 owner UI·runbook을 구현한다.
- [ ] deploy·upload를 durable job으로 전환하고 resource lock·idempotency key를 적용한다.

### 다음 기본 구현 Phase — Phase 17 durable notification/Discord

외부 credential 없이도 코드·단위 검증까지 진행할 수 있는 다음 기본 작업이다.

- [ ] 먼저 `acknowledge/0022`에 destination metadata, secret reference, retry/backoff, dedupe, redaction 결정을 기록한다.
- [ ] `notification.deliver` contract와 durable job handler를 추가한다.
- [ ] webhook URL은 암호화 secret reference로만 저장하고 API·audit·job payload에는 원문을 넣지 않는다.
- [ ] backup 실패를 첫 producer로 연결하고 같은 실패의 중복 delivery를 억제한다.
- [ ] owner/admin destination 관리·test delivery UI와 ko/en/ja catalog를 추가한다.
- [ ] timeout, 429 `Retry-After`, 5xx retry, 4xx terminal failure, cancellation, restart reconciliation을 테스트한다.
- [ ] 외부 Discord 실전송은 사용자가 승인된 webhook을 제공했을 때만 수행한다.
- [ ] 전체 gate와 변경 서비스 Compose 재배포 후 새 acknowledge·handoff·acceptance를 갱신한다.

### P1/P2 backlog

- [ ] optional client-side encrypted R2 replication과 restore
- [ ] scanner/SBOM/vulnerability policy와 owner exception
- [ ] API key·internal credential 무중단 rotation
- [ ] audit server filter/export, hash chain, external checkpoint
- [ ] traffic minute/hour rollup, histogram, saved view, time-series/errors/slow 화면
- [ ] backup·traffic export streaming writer와 큰 DB memory bound 제거
- [ ] dashboard navigation, responsive, light/dark, keyboard, screen reader, contrast 전수검증
- [ ] 목표 부하, query plan, disk-full/crash/daemon-restart chaos

## 7. 안전하게 중단하는 절차

- [ ] 새 mutation이나 durable job enqueue를 멈춘다.
- [ ] `queued`, `running`, `cancelling` job이 0인지 확인한다. 작업 중이면 임의 kill하지 말고 정상 종결 또는 안전한 협조 취소를 확인한다.
- [ ] `docker compose ps`에서 5개 서비스 healthy를 확인한다.
- [ ] control·traffic DB integrity를 읽기 전용으로 확인한다.
- [ ] 임시 credential·cookie·fixture가 남지 않았는지 확인하되 secret 내용은 읽지 않는다.
- [ ] 실행한 파괴적 작업, 생성한 정확한 fixture ID, 보존해야 할 artifact/backup을 기록한다.
- [ ] 마지막 테스트 수치, 빌드 결과, runtime 실측, 미완료 항목을 이 문서와 `HANDOFF-STATUS.md`에 갱신한다.
- [ ] `PROCESS.md`에서는 실제 증거가 있는 항목만 `[x]`로 바꾼다.
- [ ] 다음 작업의 첫 파일·첫 테스트·승인 필요 조건을 이 문서에 남긴다.
- [ ] 컨테이너를 `down`할 필요가 없다. 현재처럼 healthy 상태로 두는 것이 named volume과 다음 재개에 가장 안전하다.

중단 직전 확인 명령은 §3의 `docker compose ps`, API health, 두 DB integrity, active job query를 그대로 다시 사용한다. 이 네 결과를 확인하지 못한 환경에서는 “미확인”으로 기록하며 추정으로 완료 처리하지 않는다.

## 8. 문서 정합성 규칙

1. 실제 런타임·코드·테스트가 가장 강한 증거다.
2. 현재 중단점은 이 문서와 `HANDOFF-STATUS.md`가 소유한다.
3. `PROCESS.md`는 수행한 작업 체크리스트, `IMPLEMENTATION-PLAN.md`는 전체 backlog, `ACCEPTANCE.md`는 최종 제품 인수 증거를 소유한다.
4. `acknowledge/`와 `history/`는 시점 기록이다. 과거 test count와 당시 잔여 항목을 현재값으로 고쳐 쓰지 않는다.
5. 설계 문서의 “목표”와 “현재 구현”을 같은 문장에 섞지 않는다. 미구현 목표는 명시적으로 표시한다.
6. 새 구현 완료 시 최소한 이 문서, handoff, process, acceptance, 관련 설계, 새 acknowledge를 함께 갱신한다.
