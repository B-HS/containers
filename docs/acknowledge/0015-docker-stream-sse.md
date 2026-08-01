# 0015 — Docker events·logs·stats SSE 설계 결정

날짜: 2026-08-01 KST
상태: 구현 완료 (잔여: 로그인 브라우저에서 실시간 로그 UI 확인 — PROCESS.md Phase 9 e-2)
근거: [HANDOFF-STATUS.md](../HANDOFF-STATUS.md) §8 P0-1, §9-2, Docker Engine API v1.52 OpenAPI(2026-08-01 확인)

## 공식 계약 확인 (요약)

- `GET /events`: NDJSON stream. `EventMessage { Type(enum), Action, Actor{ID, Attributes}, scope(local|swarm), time(sec), timeNano }`
- `GET /containers/{id}/logs?follow=1`: TTY 면 raw stream, 아니면 multiplexed stream — 8바이트 header `[STREAM_TYPE, 0,0,0, SIZE(uint32 BE)]`
- `GET /containers/{id}/stats?stream=1`: 초당 JSON 1개. CPU% = `(cpu_delta / system_cpu_delta) × online_cpus × 100`, used_memory = `usage - inactive_file`(cgroup v2)

## 결정

### 1. 전송 형태 — 끝까지 SSE

- Agent 가 Docker socket chunked stream 을 읽어 **정규화된 JSON 을 SSE(`text/event-stream`)로 방출**하고, API 는 인증 후 **byte 그대로 pipe** 한다. (exec WS 브리지와 같은 pass-through 원칙)
- Agent 가 15초 간격 SSE comment heartbeat 를 방출한다. nginx `proxy_read_timeout` 기본 60초를 heartbeat 로 통과하므로 **런타임 Nginx config 변경이 필요 없다.** (`proxy_buffering off` 는 이미 적용됨)

### 2. Agent 경계 (HMAC `/v1/*` 유지)

- `GET /v1/streams/events`, `GET /v1/streams/containers/:id/logs?tail=`, `GET /v1/streams/containers/:id/stats`
- 신규 chunked 헬퍼가 Node `IncomingMessage` 를 그대로 반환한다 (기존 헬퍼는 전량 버퍼링이라 재사용 불가).
- incremental parser 를 신설한다: multiplex frame parser(잔여 buffer 유지, frame 1MiB 상한 truncate), NDJSON line parser.
- 민감정보: events 의 `Actor.Attributes` 는 **name 만** 노출한다 (label 값 제거 정책과 동일). stats·logs 는 원래 민감 필드 없음(로그 내용 자체는 기존 bounded logs 와 동일 등급).
- 한도: 동시 stream 20개(초과 429), stream 당 최대 30분(SSE 종료 후 클라이언트 재연결), heartbeat 15초.

### 3. API 경계

- `GET /api/stream/events`, `GET /api/stream/containers/:id/logs`, `GET /api/stream/containers/:id/stats`
- session role 인증은 기존 engine 조회와 동일 등급. 15초 간격 세션 재검사 실패 시 즉시 종료 (exec proxy 의 revoke 패턴 이식).
- 클라이언트 disconnect → upstream abort, upstream 종료 → 응답 종료 (양방향 전파). Agent stream 호출은 timeout 없는 외부 AbortController 기반.
- 응답 헤더: `content-type: text/event-stream`, `cache-control: no-store`, `x-accel-buffering: no`.

### 4. Web

- 컨테이너 제어 위젯에 EventSource 기반 실시간 로그 follow 를 추가한다 (동일 origin cookie 인증). 표시 line 은 최근 500개로 bound.
- events dashboard feed·stats 차트 UI 는 이번 단계 범위 밖 (API 는 3종 모두 제공).

### 5. 이번 단계에서 하지 않는 것

- Nginx config 변경, stats/events UI, traffic live SSE, log export
- SSE 재연결 시 이어받기(`Last-Event-ID`) — 로그는 tail 재요청으로 충분

## 파일

- `packages/contracts/src/engine-stream.ts`
- `apps/engine-agent/src/docker/create-docker-engine-client.ts` (stream 헬퍼·메서드 추가)
- `apps/engine-agent/src/service/create-engine-stream-service.ts`, `apps/engine-agent/src/route/create-engine-stream-route.ts`
- `apps/api/src/agent/create-engine-agent-client.ts` (openStream), `apps/api/src/route/stream/create-engine-stream-proxy-route.ts`
- `apps/web/src/widgets/container-control/container-control-widget.tsx`
