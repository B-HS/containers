# 테스트 전략

## 1. 절대 격리 원칙

Docker 파괴 테스트는 개발자 또는 운영 호스트의 `/var/run/docker.sock`을 사용하지 않는다. CI와 로컬 integration test는 전용 disposable Docker daemon을 사용한다.

- CI: 격리 runner 안의 Docker-in-Docker 또는 전용 test VM
- 로컬 macOS: Docker Desktop 안의 privileged `docker:dind` 또는 disposable test context를 사용하고 host Docker Desktop Engine 자체를 파괴 대상으로 사용하지 않음
- test startup은 daemon name, ID, label을 검증하고 조건이 다르면 즉시 중단
- production 관리 plane 이름·label과 일치하는 resource를 test fixture로 사용하지 않음
- cleanup은 이번 test run ID label이 있는 resource만 대상으로 함

## 2. 테스트 피라미드

| 단계     | 도구                                    | 대상                                                |
| -------- | --------------------------------------- | --------------------------------------------------- |
| 정적     | TypeScript, formatter, dependency audit | 타입, import 방향, generated contract               |
| 단위     | `bun:test`                              | DTO, policy, state machine, parser, rollup, service |
| 계약     | `bun:test` + Hono `app.request`         | status·응답 envelope·RPC 추론·권한                  |
| 통합     | disposable Docker, real Nginx, SQLite   | Engine operation, reload, upload, worker            |
| 컴포넌트 | Testing Library                         | form, confirm, 상태 분기, 접근성                    |
| E2E      | Playwright                              | 로그인부터 배포·rollback까지 실제 browser           |
| 성능     | 고정된 load tool container              | traffic ingest, logs, stats, upload, SSR            |
| 복구     | fault injection                         | crash, disk full, rotation, connection loss         |

## 3. 단위 테스트

### 3.1 공통

- 모든 Zod schema의 정상·경계·unknown field·과대 입력
- error code와 status mapping 완전성
- capability matrix deny-by-default
- idempotency body digest와 conflict
- job state machine의 허용·금지 전이
- UTC range와 pagination

### 3.2 Docker

- Docker payload 정규화와 민감 필드 제거
- 위험 HostConfig 필드 거부
- command array validation과 shell detection
- multiplexed stdout·stderr frame parser
- progress JSON stream parser와 partial chunk
- Engine error mapping
- dependency impact 계산
- management-plane protection filter
- Docker Desktop disk signal 분리와 watermark admission
- arm64·amd64 platform compatibility 판정

### 3.3 Nginx·traffic

- route에서 deterministic config render
- hostname·path collision
- 전체 config의 include path·보호 계약·directive policy
- revision state machine과 rollback decision
- JSONL partial line, invalid JSON, schema version, duplicate offset
- log rotation inode 전환
- histogram merge와 percentile
- retention boundary와 redaction

### 3.4 upload·deployment

- artifact state machine
- checksum과 chunk ordering
- archive path traversal, absolute path, NUL, symlink·hardlink escape
- compression ratio, file count, nesting limit
- Docker·OCI manifest reference integrity
- image, OCI, rootfs, Compose bundle, Dockerfile build의 형식 혼동과 각 성공 경로
- secret·malware·critical vulnerability 차단과 owner 예외 만료
- deployment rollout과 cleanup warning 분리

## 4. API 계약 테스트

- Hono validator가 web RPC 입력 타입을 실제로 생성하는지 type fixture로 검사
- 성공·실패 HTTP status와 JSON union
- global error response가 RPC 추론에 포함되는지 검사
- session, role, API key scope별 endpoint matrix
- cookie mutation의 Origin·Host·CSRF
- API key rate limit, expiry, revoke, rotation
- `Idempotency-Key` 재호출과 body mismatch
- job `202`, status polling, SSE replay, cancel
- WebSocket exec ticket 단회 사용과 만료
- 패널 hostname의 Access+session profile과 외부 API hostname의 API-key-only profile
- 외부 API에서 session cookie·auth route 거부
- invitation 단회 사용·만료·회수·role 상한

OpenAPI snapshot은 breaking change 감지용으로 사용하되 UI snapshot test로 사용하지 않는다.

## 5. Docker 통합 테스트

fixture image는 작은 multi-platform test image를 digest로 고정한다.

- ping, version negotiation, incompatible version
- create, start, inspect, stats, logs, stop, remove
- paused container exec conflict
- non-TTY exec stdout·stderr·exit code
- TTY attach, stdin, resize, detach, timeout
- archive upload·download와 path error
- image pull, load compressed archive, tag, dependency-aware remove
- network create·connect·disconnect·remove
- volume create·사용 중 remove conflict·remove
- events reconnect와 reconciliation
- Agent crash 중 job unknown 후 inspect 복구
- prune preview와 management resource 제외
- `/system/df`, volume `statfs`, 384GB 구성값을 혼동하지 않는지 검사
- `linux/arm64` native와 지원 시 `linux/amd64` emulation fixture를 별도로 수행

각 테스트는 생성 resource에 run ID label을 붙이고 종료 후 남은 resource가 0인지 별도 검사한다.

## 6. Nginx 통합 테스트

- 관리 route와 workload route precedence
- WebSocket upgrade와 SSE buffering 비활성
- Next.js streaming 첫 chunk가 buffering 없이 도착
- request ID 생성·응답·upstream 전파
- Cloudflare header 신뢰·spoof 거부
- valid revision 적용과 worker generation 변경
- invalid syntax가 기존 response를 중단하지 않음
- port bind·missing upstream 같은 runtime apply 실패 rollback
- apply 후 health probe 실패 rollback
- concurrent apply optimistic lock
- config volume과 DB checksum reconciliation
- log rotation + USR1 + worker offset continuity
- 전체 `nginx.conf`에서 문법은 유효하지만 패널·API·WebSocket·SSE·JSON log·watchdog 계약을 제거한 변경 거부
- shadow 기동 probe와 apply 관찰 window 실패 시 독립 watchdog rollback

## 7. traffic 통합·정확성 테스트

고정된 request fixture를 Nginx에 보내고 기대 raw event·rollup과 1:1 대조한다.

- 2xx·3xx·4xx·5xx, timeout, upstream retry
- keep-alive 다중 request
- path와 query 분리, secret redaction
- IPv4·IPv6 원본 IP 정확성, spoof 거부와 UI masking
- multi-upstream timing 값
- worker restart 전후 중복 0, 누락 0
- file rotation 경계의 partial line
- DB 잠금·일시 장애 후 replay
- raw에서 rollup 재생성 결과 동일
- p50·p95·p99와 exemplar 정확성
- retention purge 경계
- 원본 IP가 rollup·일반 export·Discord payload에 포함되지 않는지 검사

대량 부하에서 Nginx 요청 처리와 worker ingest를 동시에 측정해 log lag와 drop이 0인지 확인한다.

## 8. UI·접근성 테스트

- Server Component auth redirect와 권한별 렌더
- query hydration 뒤 중복 fetch 여부
- loading, background refresh, empty, partial error, offline, unknown 상태
- Data Table filter·sort·pagination·column visibility URL 보존
- 위험 작업 대상명 확인과 재인증
- upload 재접속과 진행률
- terminal keyboard, resize, disconnect, reconnect 불가 안내
- Dialog·Sheet focus trap과 focus restore
- icon button accessible name
- chart textual alternative
- desktop·tablet·mobile, light·dark
- `ko`, `en`, `ja` 전 route 실렌더, hydration 일치, 날짜·숫자·byte 형식
- 번역 key·parameter 완전성과 신규 fixture locale 자동 등록

Playwright에서 좌표와 computed style을 측정해 [UI-UX.md](./UI-UX.md)의 12px, 1px, radius 0, shadow none, sidebar border 0을 검증한다.

## 9. E2E 시나리오

1. 최초 owner bootstrap 후 bootstrap endpoint가 잠기는지 확인
2. 사용자 초대, role 변경, disabled session 차단
3. scope 제한 API key로 허용·거부 작업 수행
4. image, OCI, rootfs, Compose, Dockerfile build artifact를 각각 upload, scan, load·build, 배포
5. 외부 hostname 요청이 새 container로 전달되고 traffic에 나타남
6. container logs·stats·exec 사용
7. invalid 또는 보호 계약을 깨는 전체 Nginx config 적용 실패와 기존 route 유지
8. 새 version health 실패 후 자동 rollback
9. container·image remove impact 확인과 audit
10. UI 없이 API만으로 동일 배포·조회·rollback 수행
11. operator 초대 링크 생성·수락·회수와 권한 분리
12. Discord test notification과 선택적 R2 backup·restore

## 10. 성능 기준

M1 Max production 기준 목표는 100 containers, 지속 1,000 req/s, burst 5,000 req/s, 동시 terminal 10, 동시 upload 2다. 측정 항목은 다음과 같다.

- dashboard SSR p95와 API read p95
- Docker list 100·1000 containers에서 응답과 UI render
- stats 동시 stream 수와 Agent memory
- logs 10MB·100MB follow backpressure
- access log 지속 1,000과 burst 5,000 requests/s ingest lag·누락·중복
- traffic 24h·7d query p95
- 1GB·10GB upload memory가 file size에 비례하지 않는지
- Nginx reload 동안 실패 request 0
- SQLite backup 중 API·ingest latency

Phase 0 baseline에서 M1 Max의 CPU·memory와 랜 회선 조건을 함께 기록하고 p95·memory budget을 수치화한다. 네트워크가 병목이어도 origin 내부 load test와 end-to-end Tunnel test를 구분하고 정확성 게이트를 완화하지 않는다.

## 11. 복구·chaos

- API, Agent, worker를 job 중 강제 종료하고 재시작
- Docker daemon restart와 events stream 단절
- traffic DB busy·readonly·disk full
- upload volume soft·hard watermark
- access log rotate 중 worker 종료
- Nginx reload 직후 worker crash
- cloudflared 단절과 reconnect
- control DB backup 복원
- 이전 release로 control plane rollback
- raw Nginx config가 관리 route를 끊은 상황에서 API와 독립된 watchdog 복구
- R2 미설정·일시 장애에서 로컬 backup 지속, R2 restore checksum 실패

기존 workload가 계속 제공되는지와 job·audit가 `unknown`을 포함해 사실대로 복구되는지를 확인한다.

## 12.1 개인정보 정교 검증

- 신뢰한 Cloudflare 경로의 원본 IP와 직접·위조 header를 구분한다.
- raw row의 원본 IP, 일반 UI mask, auditor 재인증 상세값이 같은 request ID로 정확히 연결되는지 확인한다.
- 14일 경계 전후를 고정 clock으로 검증하고 purge 후 DB, export cache, job payload에 잔존하지 않는지 검사한다.
- backup retention과 restore fixture에서 원본 IP가 정책대로 암호화·만료되는지 검증한다.
- IP 조회 사유, actor, 범위, 결과 건수의 audit 누락이 0인지 검사한다.

## 13. 매 페이즈 품질 게이트

1. `bun run typecheck`
2. formatter·lint check
3. `bun test`
4. 해당 페이즈 integration test
5. 필요한 Playwright E2E
6. build
7. container smoke test
8. 문서와 `PROCESS.md` 갱신

검증하지 않은 항목을 통과로 표시하지 않는다.

## 14. 2026-08-01 현재 검증 checkpoint

- 전체 34 test files, 158 pass, 530 assertions (2026-08-02 기준)
- workspace typecheck·ESLint·Prettier 통과
- Next.js production SSR build와 Bun API·Agent·Worker bundle 통과
- Docker Compose 5개 서비스 health 통과
- Nginx 보안 header·429, dashboard hydration, backup panel Chromium 검증
- blue-green·자동/수동 rollback, encrypted secret injection, control·traffic 실제 restore drill 통과
- live control SQLite integrity `ok`, FK violation 0

이 checkpoint는 현재 구현 범위의 회귀 기준이며 최종 인수 완료를 뜻하지 않는다. 다음 기능을 추가하면 test count보다 새 위험 경로의 의미 있는 assertion과 실제 runtime 증거를 우선한다.
