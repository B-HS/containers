# 안전 중단·재개 체크리스트

이 문서는 새 세션·다른 작업자·다른 macOS shell 에서 프로젝트를 안전하게 재개하기 위한 **실행 절차와 안전 불변식**을 담는다.

**소유권 규칙(2026-08-06 정리).** 현재 상태와 검증 수치는 [HANDOFF.md](./HANDOFF.md) 가 **단독으로** 소유한다. 이 문서는 절차와 불변식, [HANDOFF-STATUS.md](./HANDOFF-STATUS.md) 는 구현 범위·한계(시점 기록)를 소유한다. 같은 수치를 두 곳에 적지 않는다. `acknowledge/`·`history/` 의 과거 시점 수치는 고치지 않는다.

## 1. 재개 전 알아야 할 상태

- 작업 경로: `/Users/gkn/containers`. Git 저장소(원격 `origin`, 브랜치 `dev`).
- **현재 검증 수치·커밋·완료 범위는 [HANDOFF.md](./HANDOFF.md) §1·§3 을 본다.** push 여부는 문서가 아니라 `git status -sb` 로 판단한다.
- **2026-08-06 전체 초기화를 했다.** `control-data`·`traffic-data`·`artifacts`·`backups`·`nginx-config`·`nginx-logs` 볼륨을 지웠고 자격증명 볼륨 3종만 남겼다. 따라서:
    - **owner 계정과 공개 주소는 2026-08-06 재설정을 마쳤다.** 사용자가 `bun scripts/reset-accounts.ts --confirm` 으로 seed 계정을 비운 뒤 `http://127.0.0.1:18080` 에서 실운영 owner 를 bootstrap 했고, 패널 설정에서 공개 주소를 `https://hyuns.uk` 로 되돌렸다(초기화가 `panel_setting` 을 비워 그때까지 hyuns.uk 요청이 전부 444/502 였다).
    - 계정이 다시 비어 bootstrap 이 필요하면 로컬 이름에서만 된다. bootstrap 허용 host 는 `127.0.0.1`·`localhost`·`::1`·`panel.containers.local`·`api.containers.local` 이고(`packages/config/src/bootstrap-origin.ts`), 공개 주소로 오면 `BOOTSTRAP_ORIGIN_FORBIDDEN` 이다.
    - 신뢰 프록시·API 키·라우트는 비어 있다. 감사 로그와 배포 이력은 그 뒤 실측으로 다시 쌓였고, 정리 후 릴리스 이력 일부와 그 manifest 만 남아 있다.
    - **알림 대상이 0건이다.** `system.report` 를 구독하는 대상이 없으면 감사 체인 head 가 호스트 밖으로 나가지 않아 꼬리 자르기를 탐지할 수 없다 → [HANDOFF.md](./HANDOFF.md) §8-1.
    - `/data/ingest-checkpoint.json` 은 **첫 트래픽 인입 뒤에 생성된다.** 초기화 직후 `stat` 실패는 정상이다.
- Compose 6개 서비스 `nginx`·`web`·`api`·`engine-agent`·`traffic-worker`·`egress-broker` 가 healthy 여야 한다.

아래 §3의 읽기 전용 점검으로 현재 값을 직접 확인한다. 서비스 uptime, traffic row 수, schedule 시각, job 목록은 정상적으로 변한다.

## 2. 새 환경에서 읽는 순서

- [ ] `/Users/gkn/.config/opencode/llm-rules/`의 규칙을 전부 읽는다.
- [ ] 이 문서를 끝까지 읽는다.
- [ ] [HANDOFF-STATUS.md](./HANDOFF-STATUS.md)의 구현 범위·한계·검증 증거를 읽는다.
- [ ] [PROCESS.md](./PROCESS.md)의 마지막 활성 Phase를 읽는다.
- [ ] [IMPLEMENTATION-PLAN.md](./IMPLEMENTATION-PLAN.md)과 [quality-assurance/ACCEPTANCE.md](./quality-assurance/ACCEPTANCE.md)에서 선택한 작업의 완료 조건을 확인한다.
- [ ] 관련 `acknowledge/` 문서를 읽는다. **번호가 가장 큰 것이 최신**이다(2026-08-06 기준 0040).
- [ ] 세션 인수인계는 [HANDOFF.md](./HANDOFF.md)가 단일 진입점이다. 이 체크리스트보다 먼저 읽는다.
- [ ] UI 변경이면 [SHADCN-COMPONENTS.md](./SHADCN-COMPONENTS.md)와 `/Users/gkn/flunti-otel` 패턴을 먼저 확인한다.

## 3. 재개 직후 읽기 전용 점검

```sh
cd /Users/gkn/containers
pwd
docker compose ps
curl -fsS http://127.0.0.1:18080/api/health
rg --files docs | sort
```

DB와 활성 job을 파일 수정 없이 확인한다.

```sh
docker compose exec -T api bun -e 'import { Database } from "bun:sqlite"; const db = new Database("/data/control.sqlite", { readonly: true }); console.log(db.query("PRAGMA integrity_check").get()); console.log(db.query("SELECT count(*) AS activeJobs FROM operation_job WHERE status IN (?1, ?2, ?3)").get("queued", "running", "cancelling")); db.close()'
docker compose exec -T traffic-worker bun -e 'import { Database } from "bun:sqlite"; const db = new Database("/data/traffic.sqlite", { readonly: true }); console.log(db.query("PRAGMA integrity_check").get()); db.close()'
docker compose exec -T traffic-worker stat -c '%a %U:%G %n' /data/ingest-checkpoint.json
```

기대 핵심 결과는 두 integrity check의 `ok`, `activeJobs: 0`, checkpoint의 `600 bun:bun`이다. Docker Desktop socket 승인이 없는 shell에서는 명령이 실패할 수 있으므로 권한을 우회하지 말고 승인 가능한 환경에서 다시 실행한다.

- [ ] 6개 서비스가 모두 `healthy`인지 확인한다. `starting`이면 healthcheck 제한 시간만큼 기다린 뒤 다시 확인한다.
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
- [ ] 실제 prune은 owner 세션, 최신 preview SHA, 정확한 확인 문구가 있어도 사용자 resource 삭제 영향이 확인되지 않으면 실행하지 않는다.
- [ ] restore는 live control·traffic 상태를 되돌린다. **사용자의 명시 승인과 직전 recovery backup 없이는 실행하지 않는다.**
- [ ] API·Web에 Docker socket을 mount하지 않는다. Agent만 socket을 가진다.
- [ ] `.env`를 만들거나 수정하지 않고 secret 원문을 문서·log·audit·테스트 출력에 넣지 않는다.
- [ ] Nginx runtime config는 volume을 직접 고치지 않는다. authenticated apply, current SHA, syntax test, probe 경로를 사용한다.
- [ ] 테스트 fixture는 고유 prefix와 정확한 ID로만 생성·정리한다.
- [ ] dirty 상태를 없애기 위한 reset·checkout·광범위 삭제를 하지 않는다.
- [ ] **호스트 격리를 우회하지 않는다** — `--privileged`, host namespace(`--pid`·`--ipc`·`--uts`·`--network=host`), `nsenter`, 호스트 루트 마운트, docker socket 마운트(engine-agent 예외), loopback 이 아닌 포트 publish, `sudo`. 상세는 [../CLAUDE.md](../CLAUDE.md) §1·§2.
- [ ] 스택이 떠 있으면 `bun run audit:runtime` 으로 실행 중 컨테이너의 보안 불변식을 확인한다. `packages/config/src/compose-security.ts` 의 불변식 테스트를 고쳐서 통과시키지 않는다.

## 5. 완료된 마지막 Phase

**진행 정본은 [PLAN-UX-REMEDIATION.md](./PLAN-UX-REMEDIATION.md) 다.** 현재 마일스톤(패널 UX 감사 후속 + compose 스택)의 완료·미완료는 그 체크리스트가 소유한다. 아래 Phase 기록은 그 이전 단계의 시점 기록이다.

Phase 18(control plane upgrade 준비 상태 검증)은 구현·테스트·재배포·runtime 검증까지 완료됐다. Phase 17(durable notification/Discord)의 항목은 아래 §6의 Phase 17 블록에 [x]로 남아 있다.

- [x] `packages/contracts/src/control-plane.ts` — `CONTROL_PLANE_VERSION = '0.1.0'` 단일 원천, migration·status 스키마, export/build 등록
- [x] `GET /api/control-plane/status`(owner·admin) — migration sha256 dry-run, DB integrity, active job, 최신 backup, maintenance 종합 보고
- [x] health service version 을 `CONTROL_PLANE_VERSION` import 로 통일(이중 원천 제거)
- [x] Web owner·admin 위젯 — version, applied/pending, maintenance, active job, 최신 backup, DB integrity, ko/en/ja
- [x] 단위·통합 테스트 — service 3건, route(owner·admin 200 + 역할 인자, FORBIDDEN 403)
- [x] `docs/CONTROL-PLANE-UPGRADE.md` runbook — upgrade/rollback 절차, migration downgrade 미지원·backup 복원
- [x] 전체 gate(143 pass)와 api·web Compose 재배포, 미인증 401·health version 실측

증거: [0023](./acknowledge/0023-control-plane-upgrade-readiness.md), [CONTROL-PLANE-UPGRADE.md](./CONTROL-PLANE-UPGRADE.md), [PROCESS.md](./PROCESS.md), [ACCEPTANCE.md](./quality-assurance/ACCEPTANCE.md).

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
- [x] control plane upgrade/migration dry-run/rollback matrix와 owner UI·runbook을 구현한다.
    - 증거: [0023](./acknowledge/0023-control-plane-upgrade-readiness.md), `docs/CONTROL-PLANE-UPGRADE.md`, `GET /api/control-plane/status`(owner·admin), migration sha256 dry-run, DB integrity, active job·최신 backup·maintenance 종합 보고.
- [x] deploy·upload를 durable job으로 전환하고 resource lock·idempotency key를 적용한다.
    - 증거: [0024](./acknowledge/0024-deploy-upload-durable-job.md), 신규 kind `deploy.load`·`deploy.release`·`deploy.rollback`·`upload.finalize`, `operation_job.resource_key`와 `(kind, resource_key)` index(migration 0010), `enqueue({ uniqueResourceKey })` 리소스 잠금, upload finalize sha256 내용 멱등, 4개 route의 `202 { job }`·`202 { release, job }`·load 완료 시 `200 { deployment }`.

### 다음 기본 구현 Phase — Phase 17 durable notification/Discord

외부 credential 없이도 코드·단위 검증까지 진행할 수 있는 다음 기본 작업이다.

- [x] 먼저 `acknowledge/0022`에 destination metadata, secret reference, retry/backoff, dedupe, redaction 결정을 기록한다.
- [x] `notification.deliver` contract와 durable job handler를 추가한다.
- [x] webhook URL은 암호화 secret reference로만 저장하고 API·audit·job payload에는 원문을 넣지 않는다.
- [x] backup 실패를 첫 producer로 연결하고 같은 실패의 중복 delivery를 억제한다.
- [x] owner/admin destination 관리·test delivery UI와 ko/en/ja catalog를 추가한다.
- [x] timeout, 429 `Retry-After`, 5xx retry, 4xx terminal failure, cancellation, restart reconciliation을 테스트한다.
- [ ] 외부 Discord 실전송은 사용자가 승인된 webhook을 제공했을 때만 수행한다.
- [x] 전체 gate와 변경 서비스 Compose 재배포 후 새 acknowledge·handoff·acceptance를 갱신한다.

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
- [ ] `docker compose ps`에서 6개 서비스 healthy를 확인한다.
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
2. 현재 상태·검증 수치는 `HANDOFF.md` 가 **단독** 소유한다. 이 문서는 절차·불변식, `HANDOFF-STATUS.md` 는 구현 범위·한계(시점 기록)를 소유한다.
3. `PROCESS.md`는 수행한 작업 체크리스트, `IMPLEMENTATION-PLAN.md`는 전체 backlog, `ACCEPTANCE.md`는 최종 제품 인수 증거를 소유한다.
4. `acknowledge/`와 `history/`는 시점 기록이다. 과거 test count와 당시 잔여 항목을 현재값으로 고쳐 쓰지 않는다.
5. 설계 문서의 “목표”와 “현재 구현”을 같은 문장에 섞지 않는다. 미구현 목표는 명시적으로 표시한다.
6. 새 구현 완료 시 최소한 이 문서, handoff, process, acceptance, 관련 설계, 새 acknowledge를 함께 갱신한다.
