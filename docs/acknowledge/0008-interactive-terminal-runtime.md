# ADR 0008 — 대화형 Docker TTY 런타임

- 상태: 구현 기준선
- 날짜: 2026-08-01

## 결정

- 대화형 exec ticket 발급과 WebSocket 연결은 owner 역할만 허용한다.
- ticket 발급에는 15분 이내의 최근 로그인이 필요하고 WebSocket handshake에서도 session과 역할을 다시 확인한다.
- Agent ticket은 암호학적 난수로 만들고 30초 후 만료하며 최초 연결 시 원자적으로 소진한다.
- 브라우저는 xterm.js와 FitAddon을 사용하고 입력과 resize를 명시 JSON frame으로 전달한다.
- heartbeat는 idle 시간을 갱신하지만 최대 연결 시간은 연장하지 않는다. idle 5분과 최대 연결 30분을 넘기면 policy code로 종료한다.
- 동시 terminal은 10개, attach 전 대기 입력은 64KiB, browser 방향 buffered output은 1MiB로 제한한다.
- 브라우저 close는 명시 detach frame을 전송하고 정상 exec 종료는 Docker inspect에서 확인한 exit code를 전달한다.
- API는 공개 WebSocket과 내부 Agent WebSocket을 연결하고 Nginx는 Upgrade header와 buffering 비활성 계약을 유지한다.
- API는 연결 중 15초마다 session과 owner 역할을 다시 확인하고 revoke되면 code 1008로 종료한다.
- Agent는 Docker Engine의 Unix socket에 HTTP Upgrade를 직접 수행한다. Bun의 Node HTTP 호환 계층에서 `101`이 일반 응답으로 전달되는 동작에 의존하지 않는다.
- stdin과 terminal 출력은 저장하거나 audit에 기록하지 않는다. audit에는 actor, container, executable, argument 개수와 ticket 발급 결과만 남긴다.

## 검증 결과

- 단위 테스트에서 30초 만료와 단회 ticket 소진 확인
- 실제 Nginx→API→Agent→Docker Desktop WebSocket 경로에서 `read` 기반 TTY stdin·stdout 왕복 확인
- 같은 ticket의 두 번째 연결이 `ready` 없이 종료되는 실제 재사용 거부 확인
- 실제 interactive shell prompt 출력과 terminal 제어 sequence 전달 확인
- 실제 heartbeat·pong, resize, stdin·stdout, exit code 0을 한 세션에서 확인
- 실제 장기 명령의 명시 detach가 11ms, close code 1000으로 종료됨을 확인
- 실제 연결 중 로그아웃 후 15.0초에 session revoke, close code 1008 확인
- 단위 테스트에서 동시 session 10개 제한과 release 후 재사용 확인
- 단위 테스트에서 idle timeout과 heartbeat로 idle을 연장해도 max duration이 유지되는 계약 확인
- 한국어 패널의 xterm dialog, 명령 배열 입력, 닫기 동작 확인
- 1280×720 browser viewport에서 dialog 렌더링과 horizontal overflow 0 확인
- format, TypeScript, ESLint, unit·integration test 50개 통과

## 남은 검증 범위

- 동시 terminal 10개 실제 Docker 부하 test
- 느린 browser의 output backpressure와 1MiB 차단 실제 부하 test
- 30분 max duration 장시간 soak test
