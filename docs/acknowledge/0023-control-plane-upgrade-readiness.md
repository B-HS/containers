# 0023 — Control plane upgrade·rollback 준비 상태 검증 설계 결정

날짜: 2026-08-01 KST
상태: 구현 완료
근거: [RESUME-CHECKLIST.md](../RESUME-CHECKLIST.md) P0-B "control plane upgrade/migration dry-run/rollback matrix와 owner UI·runbook", [IMPLEMENTATION-PLAN.md](../IMPLEMENTATION-PLAN.md) Phase 12 "migration dry-run과 upgrade·rollback matrix", [SECURITY.md](../SECURITY.md) §11 안전 불변식

## 배경

control plane(nginx·web·api·engine-agent·traffic-worker)은 compose 로 단일 호스트에 배포된다. upgrade/rollback 을 owner 가 호스트 터미널 없이 계획·감독할 수 있어야 한다는 로드맵 항목이다. 다만 **안전 불변식은 API·Web 에 Docker socket mount 를 금지하고 host shell 문자열 실행 endpoint 를 만들지 못하게 한다.** 따라서 control plane 컨테이너를 API 가 스스로 재생성하는 "자기 재배포 자동화"는 원천 차단된다.

## 결정

### 1. 범위 — 준비 상태 검증과 runbook, 자기 재배포 제외

- API 가 하는 일은 **upgrade 전 준비 상태를 읽기 전용으로 보고**하는 것에 한정한다. 컨테이너 생성·재시작·이미지 pull 은 절대 하지 않는다.
- 실제 upgrade·rollback 은 호스트에서 수행하는 runbook 으로 문서화하고, owner UI 는 runbook 의 전제 조건(migration dry-run·maintenance·active job·최신 backup)이 만족되는지를 보여준다.
- 자기 재배포 자동화를 넣지 않는 근거: (a) SECURITY.md §11 불변식 위반, (b) API 가 자신의 컨테이너를 재생성하면 실행 중 프로세스가 끊겨 job 이나 세션이 비결정적으로 실패한다.

### 2. `GET /api/control-plane/status` (owner·admin, session)

단일 읽기 endpoint 가 upgrade 준비 상태를 종합 반환한다.

- `version` — control plane 코드 버전 (contract 상수 `CONTROL_PLANE_VERSION` 단일 원천)
- `migrations` — `{ applied: [{ tag, appliedAt }], pending: [{ tag }] }`
    - 적용 판정은 drizzle 방식과 동일하게 **각 migration SQL 파일 내용의 sha256** 과 `__drizzle_migrations.hash` 를 비교한다 (journal `when` 의존 아님 — 파일 내용 기준 dry-run).
- `maintenance` — `getStatus()` (enabled·reason·startedAt). upgrade 는 maintenance 켠 상태를 전제로 하므로 경고 표시에 쓴다.
- `activeJobCount` — `queued|running|cancelling` operation job 수. 0 이 아니면 upgrade 시작을 막는 경고로 쓴다.
- `lastBackupAt` — 최신 backup manifest 의 `createdAt` (없으면 null). upgrade 전 backup 을 권장하는 데 쓴다.
- `databaseIntegrity.control` — control DB `PRAGMA integrity_check` 결과.
- audit 은 조회(read)라 기록하지 않는다 (maintenance GET 과 동일).

### 3. 버전 단일 원천

- `packages/contracts/src/control-plane.ts` 에 `CONTROL_PLANE_VERSION = '0.1.0'` 을 두고 status service 가 사용한다.
- 기존 health service 의 하드코딩 `'0.1.0'` 도 같은 상수를 import 하도록 바꾼다 (이중 원천 제거).

### 4. upgrade·rollback runbook (문서)

- 새 문서 `docs/CONTROL-PLANE-UPGRADE.md` 를 작성한다.
- upgrade 절차: status 확인(owner UI) → maintenance 켜기 → host 에서 `git pull` → `docker compose build` → `docker compose up -d --wait` → status 로 migration·health 확인 → maintenance 끄기.
- rollback 절차: 이전 commit(`git checkout`) → rebuild → `up -d --wait`. **schema migration 을 되돌리는 downgrade 는 지원하지 않는다** (control DB 는 새 backup 으로 복원).
- 권한 경계: 이 문서의 host 명령은 사용자가 수행한다. API 가 실행하지 않는다.

### 5. Web

- owner·admin 에게 control plane 상태 위젯을 추가한다 — version, migration applied/pending, maintenance, active job, 최신 backup, DB integrity. pending migration 이 있거나 active job 이 있으면 경고 배지를 표시한다.
- ko/en/ja catalog 에 위젯 문자열을 추가한다.

## 파일

- `packages/contracts/src/control-plane.ts`
- `apps/api/src/service/domain/control-plane/create-control-plane-status-service.ts`(+test)
- `apps/api/src/route/control-plane/create-control-plane-route.ts`
- `apps/api/src/compose/create-app.ts`(+test stub), `apps/api/src/server.ts`
- `apps/web/src/entities/control-plane/`, `apps/web/src/widgets/control-plane-control/`, page.tsx, ko/en/ja.json
- `docs/CONTROL-PLANE-UPGRADE.md`, `docs/acknowledge/0023-control-plane-upgrade-readiness.md`

## 검증

- 단위: migration pending 판정(파일 sha256 vs DB hash), integrity `ok`, active job count, backup 최신 시각, version 노출
- 통합: `/api/control-plane/status` 미인증 401, owner·admin 200, operator 이하 403
- 전체 gate(typecheck·lint·format·test·build) 후 api·web Compose 재배포와 runtime 실측
