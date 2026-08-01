# 2026-08-01 문서 정합성 감사

## 범위와 기준

- 범위: `docs/**/*.md`, 현재 source, test, Compose runtime, control·traffic SQLite
- 강한 증거 순서: 실제 runtime·DB → source·contract → 자동 test·build → 현재 handoff → 시점별 acknowledge/history → 목표 설계
- 감사 시각: 2026-08-01 16:00 KST

## 확인한 현재 증거

- Compose 5개 서비스 healthy
- control·traffic SQLite integrity `ok`
- active durable job 0
- 최신 CSV·NDJSON traffic export job 2개 `succeeded`
- 전체 121 tests, 401 assertions, 31 files
- 7 workspace typecheck, ESLint, Prettier, backend bundle, Compose Web production build 성공
- owner browser live tail pause/resume와 두 export download, console error 0

## 발견·수정한 불일치

- `HANDOFF-STATUS.md` 상단의 113 tests/363 assertions를 최신 121/401로 수정했다.
- `ARCHITECTURE.md`의 “공통 durable job schema 미구현”을 실제 `operation_job` source-of-truth로 수정했다.
- `README.md`의 최신 acknowledge 0017 표기를 0021과 단일 resume 문서 링크로 수정했다.
- Phase 16의 마지막 runtime/browser 항목을 실제 증거에 따라 완료 처리했다.
- Handoff의 “traffic owner browser 실측 잔여” 표현을 완료 증거로 교체했다.
- traffic acceptance 중 rotation/restart, percentile, live/export처럼 현재 증거가 충분한 항목만 완료 처리했다.
- 현재 상태와 과거 시점 기록을 구분하기 위해 `RESUME-CHECKLIST.md`를 추가했다.
- `API-DATA-AUTH.md`에서 실제 `operation_job` 열과 traffic `access_event`·파일 checkpoint·control DB export job을 목표 schema와 분리했다.
- `NGINX-TRAFFIC.md`의 중복 키를 실제 `request_id` primary key로 바로잡고, DB 성공 뒤 checkpoint 전진·현재 raw JSON 저장을 명시했다.
- 아직 없는 minute/hour rollup·ingest failure ledger·metrics를 현재 pipeline에서 후속 목표로 이동했다.
- `TECH-STACK.md`, `ARCHITECTURE.md`, `DOCKER-CONTROL.md`에서 현재 5개 서비스와 향후 worker·rollup 설계를 구분했다.

## 의도적으로 유지한 과거 수치

`acknowledge/0019`, `acknowledge/0020`, `history/`의 test count와 “당시 잔여”는 그 시점의 결정 증거이므로 최신 수치로 덮어쓰지 않았다. 새 세션은 이를 현재 상태로 해석하지 않고 `RESUME-CHECKLIST.md`와 `HANDOFF-STATUS.md`를 우선한다.

## 여전히 미완료인 문서상 요구

- Cloudflare 실제 설치·Access·domain·token rotation
- fresh machine install/restore E2E와 upgrade/rollback matrix
- 자동 backup due runtime 증거와 승인 기반 restore durable job E2E
- Discord notification, optional encrypted R2
- deploy/upload durable job 전환, resource lock, idempotency
- scanner/SBOM/vulnerability policy
- traffic rollup·saved view·시계열 고도화
- 전체 반응형·접근성·성능·chaos·보안 인수

이 항목은 구현·실측 증거가 없으므로 체크하지 않았다.

## 반복 감사 방법

```sh
rg -n "tests|assertions|현재|미구현|남았다|다음 세션|\[ \]" docs --glob '*.md'
bun run format:check
bun run typecheck
bun run lint
bun test
docker compose ps
```

Markdown 상대 링크 검증과 현재 runtime/DB 안전 점검을 함께 수행해야 한다. 문자열 검색만으로 완료 여부를 판단하지 않는다.

## 최종 재검증

- Markdown 상대 링크: 45개 문서, 누락 0
- Prettier: 전체 workspace 통과
- typecheck: 7개 workspace 통과
- ESLint: 통과
- test: 121 pass, 0 fail, 401 assertions, 31 files
- 문서 수정 직전 runtime: Compose 5개 healthy, 두 DB integrity `ok`, active durable job 0
- 문서 수정 뒤 동일 runtime 재조회 시도는 데스크톱 샌드박스의 Docker socket 승인 크레딧 제한으로 실행되지 않았다. 상태 변경 명령은 수행하지 않았고, 다음 재개 시 `RESUME-CHECKLIST.md` §3의 읽기 전용 명령으로 재확인한다.
