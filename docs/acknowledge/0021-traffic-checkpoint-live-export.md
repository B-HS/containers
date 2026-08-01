# 0021 — Traffic checkpoint·live SSE·export

## 결정

- Traffic Worker는 `device + inode + offset + oversized-line discard state`를 `/data/ingest-checkpoint.json`에 `0600` 원자 교체로 저장한다. 완성되지 않은 마지막 line은 offset을 진행하지 않고 다음 poll에서 다시 읽는다.
- rename rotation에서는 이전 inode 파일을 EOF까지 비운 뒤 active inode의 offset 0으로 전환한다. DB transaction 실패 시 checkpoint를 저장하지 않으며 `request_id` unique key로 재시도 중복을 제거한다.
- DB에 새로 삽입된 event만 bounded subscriber에 발행한다. Worker와 API SSE는 최대 연결 수·backpressure drop·15초 heartbeat를 적용하고 API는 15초마다 session을 재검사한다.
- live event와 일반 export는 원본 IP와 user agent를 포함하지 않는다. IP는 Worker 경계에서 mask하고 Web은 25행 buffer와 pause/resume을 제공한다.
- `traffic.export`는 최대 24시간 CSV/NDJSON durable job이다. Worker가 shared backup volume에 `0600` 파일을 원자 생성하고 14일 지난 export를 정리한다. owner/admin만 생성·다운로드하며 두 작업을 audit한다.

## 검증

- partial line, process restart, rename rotation, DB write failure, replay duplicate, live filter·mask 테스트
- CSV injection 방어, 기간 상한, 원본 IP·user agent 비노출, 14일 export retention 테스트
- durable export handler 취소 확인, owner/admin job 생성·완료 파일 다운로드, 미인증 API 차단 테스트
- 전체 121 tests, 401 assertions, 31 files 통과
- 7 workspace typecheck, ESLint, Prettier, backend bundle, Compose Web Turbopack production build 통과
- 재배포 후 5개 서비스 healthy, checkpoint `600 bun:bun`, 실제 페이지 요청 3건에 DB row 3건 증가, 미인증 live·export 401 확인
- owner browser에서 live tail pause 중 12초 고정·resume 후 신규 행 수신, CSV·NDJSON job 생성→성공→download와 audit, console error 0건 확인
- CSV 383행·NDJSON 389행 runtime export가 `0600 bun:bun`으로 생성됐고 NDJSON field는 masked IP만 포함하며 client IP 원문·user agent 필드가 없음을 확인

## 잔여

- 24시간 고밀도 export를 위한 cursor pagination·streaming writer와 minute/hour rollup은 후속 작업이다.
