# 0028 — 모노레포 계층·DB·쿼리·env 접근 컨벤션 정합 결정

- 작성일: 2026-08-04
- 상태: 결정 확정 (convention-audit-refactor 플랜 Wave 0)
- 근거: 사용자 결정 — "전면 컨벤션 준수 + 컨벤션 문서 우선". 다만 공유 패키지는 모노레포의 일관된 공유 계층으로 유지하고, 컨벤션 문서(backend.md 등)를 이 프로젝트 현실에 맞춰 정합한다. 적용 우선순위(사용자 최신 지시 > acknowledge 기록 > 설계 문서 > 컨벤션)에 따라 본 ADR이 컨벤션 문서보다 우선한다.

## 배경

이 모노레포는 백엔드 Hono 3앱(api·engine-agent·traffic-worker), Next.js 웹(web), 3개 공유 패키지(contracts·db-schema·config)로 구성되어 있다. 코딩 컨벤션(backend.md·frontend.md·fsd.md·query.md·common.md)과 현재 구현 사이에 아래 불일치가 있다.

| 불일치            | 컨벤션 문서 전제            | 현재 구현                                                             |
| ----------------- | --------------------------- | --------------------------------------------------------------------- |
| 공유 패키지       | 앱별 `dto/`·`db/` 폴더 구조 | `packages/contracts`·`packages/db-schema`·`packages/config` 공유 계층 |
| traffic-worker DB | `db/` + Drizzle             | `database/create-traffic-database.ts`의 bun:sqlite raw SQL            |
| 웹 서버 상태      | TanStack Query v5           | raw `fetch`·polling·SSE 인라인                                        |
| DB 벤더           | MySQL                       | SQLite(bun:sqlite)                                                    |
| env 접근          | `getEnv()` 싱글턴으로만     | `parseEnv()` 재사용 파서 (앱별 스키마·싱글턴 부재)                    |

이 중 DB 벤더 전환(MySQL 재도입)은 스키마·인프라 재구축이 수반되어 이 계획의 범위 밖이며, 그 외 항목은 본 ADR의 결정에 따라 정합한다.

## 결정

### 1. 공유 패키지 유지 (앱 폴더 분산 없음)

`packages/contracts`(Zod 스키마 + Hono RPC 타입 + 내부 인증 헬퍼), `packages/db-schema`(control DB SQLite 스키마 + `createControlDatabase` 팩토리), `packages/config`(`parseEnv` + `loadOrCreateSecret`)는 **각 앱의 `dto/`·`db/` 폴더로 분산하지 않고 모노레포 공유 계층으로 유지**한다.

- 근거: 세 패키지는 3앱이 같은 계약·스키마·env 로직을 공유하는 일관된 공유 계층이다. 분산 시 중복·불일치가 생긴다.
- 정합 방식: 컨벤션 backend.md의 `dto/`·`db/` 폴더 구조 규정은 모노레포 공유 패키지 현실에 맞춰 문서 수준에서 정합한다. 앱별 신규 도메인 코드가 컨벤션을 따르는 한, 공유 스키마·계약은 패키지 경유가 기본이다.

### 2. traffic-worker는 앱 로컬 Drizzle로 전환 (db-schema에 넣지 않음)

traffic-worker의 별도 SQLite store(`database/create-traffic-database.ts`)는 Drizzle로 전환하되, **`packages/db-schema`에 넣지 않고** 앱 로컬 `db/` + 자체 migrations로 전환한다.

- 근거: traffic DB는 `access_event` 테이블을 쓰는 별도 SQLite 파일이다. 이를 `packages/db-schema/schema.ts`에 넣으면 `createControlDatabase`의 migrate가 control DB에 `access_event`를 생성해 control DB를 오염시킨다. 두 DB는 수명·용도가 다르므로 격리한다.
- 결과: `apps/traffic-worker/db/schema.ts` + `db/database.ts` + 자체 migrations 폴더, `drizzle-kit`·`drizzle-orm` 의존성은 traffic-worker의 `package.json`에만 추가. 동작 등가 보존(`INSERT OR IGNORE` dedup → `onConflictDoNothing()`, STRICT 테이블·인덱스·WAL·busy_timeout 유지).

### 3. 웹 서버 상태는 TanStack Query v5로 관리

웹의 서버 상태는 TanStack Query v5로 관리한다. `entities/*.query.ts`(`queryOptions` 팩토리 + `use` 훅) + 중앙 `QUERY_KEY` + SSR 프리페치(`new QueryClient()` → `prefetchQuery` → `HydrationBoundary`)를 도입하고, 위젯·features의 인라인 raw `fetch`를 `entities/*.api.ts`·`*.query.ts` 경유로 교체한다. polling은 `useQuery` `refetchInterval`, SSE(EventSource)는 `useQuery`로 불가능하므로 훅으로 캡슐화해 유지한다.

- 근거: query.md 규약 준수 + 서버 상태와 UI 상태의 명확한 분리. 전역 상태 라이브러리(zustand 등)는 실수요가 없어 도입하지 않는다.

### 4. MySQL→SQLite 불일치는 문서 갱신으로 정합 (DB 벤더 전환 범위 밖)

컨벤션 문서(backend.md)는 MySQL을 전제하지만 이 프로젝트는 SQLite(bun:sqlite)를 사용한다. **DB 벤더 전환(MySQL 재도입)은 스키마·인프라 재구축이 수반되어 이 계획의 범위 밖**이다. 문서를 SQLite 현실에 맞춰 갱신하는 것으로 정합한다.

- 근거: SQLite는 이 프로젝트의 확정된 스택(0001 기준, bun:sqlite)이며 동작·성능 요구를 충족한다. 벤더 전환은 배포 인프라·마이그레이션 구조 전면 재작업이 필요해 단순 컨벤션 정합의 범위를 벗어난다.

### 5. env 접근: `parseEnv` 유지 + `getEnv()` 싱글턴 신규 도입 (확정)

`packages/config`의 `parseEnv`(재사용 가능한 Zod 파서)를 유지하되, **각 앱의 env 스키마를 싱글턴으로 접근하는 `getEnv()`를 `packages/config`에 새로 도입**해 backend.md §14의 "`getEnv()`로만" 규정을 준수한다. 본 ADR에서 이 방식을 **결정으로 확정**한다.

- 근거: `parseEnv`는 스키마를 인자로 받는 재사용 가능한 순수 파서로 유지 가치가 있다. 그러나 컨벤션은 env 접근을 싱글턴으로 한정한다. `getEnv()` 싱글턴(앱별 env 스키마 + `parseEnv` 기반 캐시 접근)을 두면 앱 코드는 스키마 인자를 반복 전달하지 않고 컨벤션을 준수한다.
- 결과: 앱 코드의 `process.env` 직접 접근은 금지하고 `getEnv()`로만 접근한다. 앱 스코프(`apps/*/src`)에서 `process.env` 직접 참조는 0건이 되어야 한다. `packages/config/src/env.ts`는 `process.env`의 정당한 단일 독자로 남는다.

## 영향

- 3개 공유 패키지는 구조 유지 — 기존 contracts/db-schema/config consumer는 파급 없음.
- traffic-worker는 Drizzle 전환 시 raw SQL 제거 — 동작 회귀는 기존 테스트 + Compose 실측으로 검증.
- 웹은 TanStack Query 도입 시 SSR 프리페치 경로·hydration 주의.
- 컨벤션 문서(backend.md 등)는 공유 패키지·SQLite·getEnv() 현실에 맞춰 갱신 대상이 된다. 문서 적용 시 본 ADR이 우선한다.
- 앱 스코프 `process.env` 직접 접근 0건이 F2 검증 항목이 된다.

## 관련 파일

- `packages/contracts` — 공유 Zod 스키마 + RPC 타입 + 내부 인증 헬퍼 (유지)
- `packages/db-schema` — control DB SQLite 스키마 + `createControlDatabase` 팩토리 (유지)
- `packages/config/src/env.ts` — `parseEnv` 유지 + `getEnv()` 싱글턴 신규 도입 (변경 대상)
- `packages/config/src/secret.ts` — `loadOrCreateSecret` (유지)
- `apps/traffic-worker/src/database/create-traffic-database.ts` — 앱 로컬 `db/` + 자체 migrations로 Drizzle 전환 (변경 대상)
- `apps/web/src/entities/**/*.query.ts`, `shared/lib/query-key.ts` — TanStack Query 도입 (변경 대상)
- `docs/` — 컨벤션 경로·MySQL→SQLite·공유 패키지 기준 문서 갱신 대상
- 본 문서: `docs/acknowledge/0028-monorepo-convention-alignment.md`

## 검증

- [x] ADR 0028 파일 생성 — 위 5개 결정 원문·근거·영향·관련 파일 포함
- [x] 기존 ADR(0001~0027) 형식과 일관 — 제목 `# 00NN —`, 배경·결정·검증 구조, 상대 링크
- [x] `docs/README.md`의 acknowledge 최신 포인터를 0028로 갱신
- [x] ledger.jsonl에 Wave0-2 완료 이벤트 append
- [ ] Wave1+ 실현 검증(결정의 실행 기준) — `getEnv()` 존재, 앱 스코프 `process.env` 직접 접근 0건, traffic-worker raw SQL 0건, 웹 `QUERY_KEY`·`queryOptions`·HydrationBoundary 존재
