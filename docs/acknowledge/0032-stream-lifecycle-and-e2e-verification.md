# 0032 — 스트림 수명 관리 원칙과 E2E 검증 수단

- 작성일: 2026-08-05
- 상태: 결정 확정 (구현 완료)
- 선행: [0031](./0031-dependency-and-type-hardening.md), [bug/2026-08-05-sse-stream-slot-leak.md](../bug/2026-08-05-sse-stream-slot-leak.md)
- 범위: 실시간 스트림 슬롯 수명, 동시 상한 단일화, E2E seed 스크립트, 웹 테스트 러너 선택

## 1. 배경

HANDOFF §8 1순위의 "SSE 동시 상한 429 확인"을 라이브로 돌리다가 **재시작 없이는 복구되지 않는 슬롯 누수**를 발견했다(상세는 bug 문서). 이를 고치는 과정에서 세 가지 결정이 필요했다.

## 2. 결정

### 2.1 제한된 자원의 수명은 요청 `AbortSignal` 에 건다

응답 body ReadableStream 의 `cancel` 에만 해제를 거는 방식을 폐기한다. body 는 클라이언트가 소비할 때만 콜백이 돌기 때문에, **자원을 점유한 뒤 body 를 만들기 전까지의 구간이 통째로 사각지대**가 된다.

- **원칙**: `activeStreams += 1` 같은 점유 직후에 `request.signal.addEventListener('abort', release)` 를 건다. `release()` 는 멱등이며 카운터·타이머·업스트림 소켓을 한 번에 정리한다.
- **기각한 대안 1** — body `cancel` 만 유지하고 타임아웃으로 회수: 누수를 늦출 뿐 없애지 못하고, 타임아웃 값이 새 매직넘버가 된다.
- **기각한 대안 2** — 상한을 없앤다: 상한은 Docker 소켓 보호 수단이라 제거 대상이 아니다.

### 2.2 동시 상한은 계약(contracts)의 단일 상수로 둔다

API 32 / engine-agent 20 이라 API 가 받아들인 12개는 반드시 실패했다. 두 서비스가 1:1로 연결되는 자원이면 상한도 하나여야 한다 → `MAX_CONCURRENT_ENGINE_STREAMS`(`packages/contracts/src/engine-stream.ts`).

- **기각한 대안** — API 상한을 agent 보다 크게 두고 초과분은 503 으로 흘린다: 사용자에게 "열렸다가 곧 끊기는" 스트림을 주게 되고, 실패가 정상 동작처럼 보인다.

### 2.3 SSE 는 시작 즉시 flush 한다

조용한 스트림은 첫 heartbeat(15초)까지 한 바이트도 나가지 않아 **응답 헤더 자체가 전송되지 않았다.** 브라우저 `EventSource` 의 `onopen` 이 15초 늦고 중간 프록시는 헤더 타임아웃으로 끊는다. 스트림 시작 시 `SSE_STREAM_OPEN_COMMENT`(`: connected`)를 즉시 내보낸다. SSE 주석이라 클라이언트 파서에 영향이 없다.

### 2.4 회귀 테스트는 "상한까지 전부 열리는가"로 단언한다

"한 개 더 열리는가"는 슬롯 1개 누수를 통과시킨다 — 실제로 처음 작성한 테스트가 구 코드에서도 통과했다. 자원 풀 테스트는 **풀 전체를 소진했다가 반환하고 다시 소진할 수 있는지**로 검증한다.

### 2.5 E2E 로그인은 seed 스크립트로 자급한다

검증 때마다 사용자에게 계정·비밀번호를 요구하지 않는다. `scripts/seed-e2e.ts` 가 control DB 에 E2E 계정을 만들거나 비밀번호를 재설정한다.

- 비밀번호는 `E2E_PASSWORD` 환경변수를 쓰고, 없으면 무작위 생성해 **stdout 에 한 번만** 출력한다. 저장소·문서·메모리에 기록하지 않는다([memory.md](../../README.md) seed credential 규칙).
- 해시는 better-auth `hashPassword` 로 만들어 스키마와 어긋나지 않게 한다. 직접 scrypt 를 재구현하지 않는다.
- 컨테이너는 `read_only` 라 `docker compose cp` 가 막힌다. tmpfs 인 `/tmp` 로 파이프해 실행한다.
- 브라우저 로그인은 폼 입력이 아니라 페이지 컨텍스트의 `fetch('/api/auth/sign-in/email')` 로 한다. 브라우저가 HttpOnly 쿠키를 직접 받으므로 세션이 정상 성립한다.

### 2.6 웹 테스트는 vitest 가 아니라 기존 러너(bun test)에 붙인다

사용자는 "vitest+RTL 추가"를 골랐으나, 러너를 둘로 늘리는 대신 **이미 쓰는 `bun test` + `@happy-dom/global-registrator` + Testing Library** 로 구성했다. 이유:

- 저장소 전체가 Bun 단일 런타임이고([common.md §1](../../README.md)), 러너가 둘이면 `bun run check` 사다리와 CI 신호가 갈라진다.
- 의존성이 3개(`@testing-library/react`·`@testing-library/dom`·`@happy-dom/global-registrator`)로 끝난다. vitest 경로는 vitest·플러그인·환경까지 5개 이상이다.
- 설정은 `apps/web/bunfig.toml` 의 `preload` 한 줄이다.

DOM preload 가 백엔드 테스트에 새지 않도록 루트 `test` 스크립트를 `bun test apps/api apps/engine-agent apps/traffic-worker packages && bun run --filter '@containers/web' test` 로 분리했다.

### 2.7 패널 published 포트 기본값을 18080 으로 옮긴다

macOS 호스트에서 `127.0.0.1:8080` 으로 접근할 때만 저속 SSE 가 도달하지 않았다. 워크플로 실험(가설 5건)으로 **결함 키가 호스트 published 포트 8080 자체**임을 확정했다 — 운영 스택과 무관한 stock socat 프로브도 8080 이면 0바이트, 18480/18481 이면 TTFB 0.002초. 상세는 [bug 문서 §7](../bug/2026-08-05-sse-stream-slot-leak.md).

`compose.yaml` 4곳과 `scripts/setup.sh` 2곳의 기본값만 바꾼다. 컨테이너 내부 `listen 8080`·managed nginx 설정·healthcheck 는 무변경이므로 nginx 설정 계약을 건드리지 않는다.

- **기각한 대안 1** — nginx 설정을 손봐 우회: 설정은 이미 면책됐다(같은 설정이 다른 포트에서 정상).
- **기각한 대안 2** — 실시간 화면을 long-polling·수동 새로고침으로 대체: 원인이 규명된 뒤에는 제품 기능을 축소할 이유가 없다.
- 부수 이점: 8080 은 개발 머신에서 가장 흔히 충돌하는 포트라 기본값으로서도 18080 이 낫다.

## 3. 검증 (2026-08-05)

- 스트림: 동시 32개 → 33번째 429 → 전부 종료 → 다시 32개 전부 200. 3회 반복 동일. `/api/readyz` 전 항목 `ok`
- 백업 암호 UI: 브라우저에서 `secretsIncluded=true` 백업은 암호 입력 렌더, `false` 백업은 미렌더 실확인 + 위젯 테스트 2건으로 고정
- 다크 모드: 개요·컨테이너 제어·네트워크/볼륨·Nginx 설정·트래픽 분석·백업 다이얼로그 6화면 판독 문제 0건. `dark:` 변형 0건·Tailwind 기본 팔레트 0건을 테스트로 고정
- typecheck 8/8 · lint 0 · test 320 + web 6 · format:check · build 8/8

### 3.1 `full` 모드 복구 드릴 (2026-08-05, 실행 완료)

암호 포함 백업 `verify-passphrase` 로 `mode: full` 복구를 실제로 돌렸다. 사용자가 "실운영 데이터 없음"을 확인해 진행했다.

| 확인                       | 결과                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------- |
| 복구 job                   | `backup.restore` **succeeded**, attempt 1                                             |
| DB 가 실제로 교체됐는가    | 복구 전 세션이 **401** (스냅샷 시점에 없던 세션), seed 가 "갱신"이 아니라 "생성" 보고 |
| 복구 후 기동               | 5개 서비스 healthy, `/api/readyz` 전 항목 `ok`                                        |
| 재로그인·기능              | seed 재실행 → 로그인 200, `/api/containers` 200, 백업 목록 5건, 패널 `/ko` 200        |
| 암호 envelope 로 복원한 키 | 배포 secret 조회 200, 알림 대상 조회 200 — 복호화 경로 정상                           |
| 실시간 스트림              | 복구 후 SSE 0.04초에 헤더 + `: connected`                                             |

## 4. 남은 것

- `com.docker.backend` 가 왜 8080 포트만 HTTP 완결 대기로 버퍼링하는지는 규명하지 않았다. 수정에 필요하지 않아 중단했다
