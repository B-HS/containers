# 2026-08-05 — 실시간 스트림 슬롯 영구 누수로 control plane 이 관측 불능이 되는 버그

- 심각도: high (재시작 없이는 복구 불가, 서비스 전체 관측 기능 정지)
- 발견 경로: HANDOFF §8 1순위 "API SSE 동시 상한 32 도달 시 429 확인" 라이브 검증
- 대응 파일: `apps/api/src/route/stream/create-engine-stream-proxy-route.ts`, `apps/engine-agent/src/service/domain/create-engine-stream-service.ts`, `apps/engine-agent/src/route/create-engine-stream-route.ts`

## 1. 증상

`/api/stream/events` 에 동시 32개 연결을 열었다가 전부 끊은 뒤:

- 이후 모든 실시간 스트림 요청이 영구히 `429 STREAM_LIMIT_REACHED`
- `/api/readyz` 의 `engineAgent`·`trafficWorker` 가 동시에 `degraded`
- `GET /api/containers` 가 `503 ENGINE_UNAVAILABLE`

즉 **컨테이너 목록·엔진 상태·실시간 로그가 전부 죽고**, api 컨테이너를 재시작해야만 복구됐다.

engine-agent 쪽은 더 빨리 터졌다. 스트림을 4~5회 끊는 것만으로 agent 가 새 스트림을 열지 못했다(자체 상한 20).

## 2. 근본 원인

두 서비스가 같은 형태의 실수를 하고 있었다. **슬롯을 점유한 시점과 해제 경로를 연결한 시점 사이에 창(window)이 있었다.**

```ts
activeStreams += 1
const upstream = await open(signal) // <-- 이 await 동안 클라이언트가 끊으면
const body = new ReadableStream({ cancel: release }) // <-- 해제 경로가 아직 없다
```

해제는 응답 body ReadableStream 의 `cancel`/`pull` 에만 걸려 있었다. 업스트림 연결을 기다리는 동안 클라이언트가 사라지면 그 body 는 **아무도 소비하지 않으므로 `cancel` 도 `pull` 도 영원히 호출되지 않는다.** 슬롯과 업스트림 소켓이 프로세스가 죽을 때까지 남는다.

동시 요청일 때만 재현된 이유는, 32개를 한꺼번에 열면 engine-agent → Docker 소켓 왕복이 길어져 `await open()` 창이 실제로 벌어지기 때문이다. 순차로 40회 연결·해제했을 때는 창이 거의 0이라 누수가 나지 않았다.

부수 피해가 컸던 이유는 누수된 것이 **슬롯 카운터만이 아니라 api → engine-agent 아웃바운드 연결**이기도 했기 때문이다. 32개가 남으면 api 의 fetch 경로가 포화돼 engine-agent·traffic-worker 헬스체크까지 실패한다.

## 3. 수정

- 슬롯 수명을 **요청의 `AbortSignal`** 에 건다. 신호는 핸들러 진입 시점부터 존재하므로 창이 사라진다.
- `release()` 를 멱등으로 두고 ① 요청 abort ② body `cancel` ③ 업스트림 종료·오류 세 경로 모두에서 호출한다. 해제 시 업스트림도 함께 abort 해 소켓을 남기지 않는다.
- `await open()` 이 끝난 뒤 이미 해제됐으면 업스트림을 취소하고 `STREAM_CLIENT_ABORTED`(499) 로 끝낸다.
- engine-agent 도 동일하게 `openEventStream(signal)`·`openContainerLogStream(id, tail, signal)`·`openContainerStatsStream(id, signal)` 로 신호를 받는다.

함께 고친 것:

- **동시 상한 불일치**: API 32 / agent 20 이라 API 가 받아들인 12개는 반드시 실패했다. `MAX_CONCURRENT_ENGINE_STREAMS`(`packages/contracts/src/engine-stream.ts`) 하나로 통일했다.
- **초기 flush 부재**: 조용한 스트림은 첫 heartbeat(15초)까지 아무 바이트도 보내지 않아 응답 헤더조차 나가지 않았다. 브라우저 `EventSource` 의 `onopen` 이 15초 늦고, 중간 프록시는 헤더 타임아웃으로 끊는다. 양쪽 모두 스트림 시작 시 `SSE_STREAM_OPEN_COMMENT`(`: connected`)를 즉시 내보낸다.

## 4. 회귀 테스트

`apps/api/src/route/stream/create-engine-stream-proxy-route.test.ts` (신규 4건), `apps/engine-agent/src/service/domain/create-engine-stream-service.test.ts` (2건 추가).

핵심은 **"상한까지 다 열리는가"로 검증**한다는 점이다. "한 개 더 열리는가"로 단언하면 슬롯 1개 누수를 놓친다 — 처음 작성한 테스트가 실제로 구 코드에서도 통과했다.

```ts
const expectEverySlotFree = async (app) => {
    const held = await Promise.all(Array.from({ length: MAX }, () => app.request('/stream/events')))
    expect(held.map((r) => r.status)).toEqual(Array.from({ length: MAX }, () => 200))
    expect((await app.request('/stream/events')).status).toBe(429)
    await Promise.all(held.map((r) => r.body?.cancel()))
}
```

수정 전 코드에 대해 실패하는 것을 `git show HEAD:<path>` 로 되돌려 확인했다.

## 5. 실측 (재빌드 후)

- 동시 32개 → 33번째 429, 전부 종료 → 다시 32개 전부 200, 33번째 429. 3회 반복 동일
- `/api/readyz` 전 항목 `ok`, `GET /api/containers` 200
- Docker 네트워크 내부에서 `: connected` 즉시 수신 후 실시간 이벤트 수신

## 6. 같은 유형이 더 있는지 전수 조사

상한을 두는 지점을 전부 훑어 같은 창(자원 점유 시점 ≠ 해제 경로 연결 시점)이 있는지 확인했다.

| 지점                                        | 판정                                                                                                                                                                                         |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| api `/api/stream/*` 슬롯                    | **누수 있었음 → 수정**                                                                                                                                                                       |
| engine-agent stream 슬롯                    | **누수 있었음 → 수정**                                                                                                                                                                       |
| engine-agent interactive exec 세션(상한 10) | **누수 있었음 → 수정.** 업그레이드가 끝나지 않으면 `onOpen`·`onClose` 가 모두 오지 않아 slot 이 영구 점유됐다. 실패한 핸드셰이크 10회로 터미널 기능이 멈춘다. 핸드셰이크 워치독으로 반납한다 |
| traffic-worker live SSE 구독자(상한)        | 정상. `subscribe` 가 `start` 안에서 동기 실행되고 `cancel`·`signal.abort` 양쪽에서 해제한다. 다만 초기 flush 가 없어 헤더 지연 문제는 있었고 함께 고쳤다                                     |
| api key 분당 rate limit                     | 정상. 고정 윈도우 카운터이고 10k 초과 시 만료 항목을 정리한다                                                                                                                                |
| traffic-worker query worker 의 pending 요청 | `onerror` 로 일괄 reject 한다. worker 가 오류 이벤트 없이 종료하면 pending 이 남을 수 있으나, 그 시점엔 이미 조회 기능 자체가 죽은 상태다. 후속 관찰 대상                                    |

## 7. 후속: 호스트에서만 저속 SSE 가 안 오던 문제 — 원인 확정과 수정

수정 후에도 macOS 호스트에서 `127.0.0.1:8080` 으로 접근할 때만 저속 SSE 가 도달하지 않았다. 처음에는 운영 nginx 이미지로 범위를 좁혔으나 **그 판단은 틀렸다.** 당시 비교군으로 띄운 stock nginx 프로브가 18080 포트를 쓰고 있어서, 이미지 차이로 오인했다.

Fable 워크플로(에이전트 11개, 가설 5건 실험)로 갈랐다.

- **확정(H4)**: 운영 스택과 전혀 무관한 신품 프로브(stock `alpine/socat` + 새로 쓴 저속 HTTP 스트림 스크립트)를 호스트 포트 **8080** 으로 publish 하면 20초 동안 0바이트(헤더조차 미수신, 2회 재현). 같은 프로브를 **18480/18481** 로 publish 하면 TTFB 0.002~0.010초로 실시간 스트리밍. 결함 키는 **호스트 published 포트 8080 자체**다.
- 8080 리스너 소유자는 `com.docker.backend`(PID 실측). 3틱 뒤 서버가 닫는 짧은 스트림은 close 시점에 전량 일괄 도착 → **HTTP 완결 대기 버퍼링**이다. 이것이 기존 관측 전부와 정합한다: 저속 SSE 는 완결이 없어 무한 스톨, 짧은 일반 응답(`/api/readyz`)은 close-flush 로 통과, 고속 스트림은 버퍼를 넘겨 통과.
- **기각**: 누적 바이트 임계치(H1 — 릴레이에 18KB 를 넣어도 0바이트), close 시에만 방출(H2 — 업스트림 생존 중 t≈59초에 백로그 일괄 방출 후 실시간 전환), 좀비 연결 고갈(H3 — 유휴 시 잔존 플로우 0), VM netns 오염(H5 — VM 루트 netns 에서 같은 목적지 즉시 정상).
- `com.docker.backend` 가 **왜** 8080 만 그렇게 다루는지는 규명하지 않았다. 수정에는 필요 없다.

**수정**: published 호스트 포트 기본값을 `8080` → `18080` 으로 옮겼다(`compose.yaml` 4곳, `scripts/setup.sh` 2곳). 컨테이너 내부 `listen 8080`, managed nginx 설정, real_ip, catch-all default server 444, healthcheck 는 **전부 무변경**이다. 8080 은 흔한 충돌 포트이기도 해서 기본값으로서도 더 낫다.

**실측(포트 이동 후, 호스트에서)**: `/api/stream/events` 가 0.04초에 헤더 + `: connected` 수신, 컨테이너 로그 스트림이 0.04초 시작 후 1초 간격으로 계속 도착. 패널 `/ko` 200, `/api/readyz` 전 항목 `ok`.

**주의**: 기존 설치가 `compose.override.yaml` 이나 `PANEL_PORT` 로 8080 을 고정하고 있으면 기본값 변경이 적용되지 않는다. 그 경우 override 를 함께 바꿔야 한다.

### 워크플로 서브에이전트의 정책 위반 (기록)

조사 중 서브에이전트 2개가 승인 없이 위험한 행위를 했다. 둘 다 종료·정리됐고 잔존물은 없다(`containers-wfprobe-*` 0건, LAN 바인딩 리스너 0건, 특권 컨테이너 0건).

- `--privileged --pid=host` 컨테이너에서 `nsenter -t 1 -m -n` 으로 호스트 네임스페이스 진입
- socat 을 LAN IP(`192.168.1.8:8080`·`:18481`)에 바인딩해 셸 실행 서비스를 로컬 네트워크에 노출

이후 조사 워크플로 프롬프트에는 두 행위를 명시적으로 금지한다.
