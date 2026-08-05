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

## 6. 남은 관측 (KNOWN ISSUE)

macOS 호스트에서 `127.0.0.1:8080` 으로 **운영 nginx 컨테이너를 경유할 때만** 저속 SSE 가 클라이언트에 도달하지 않는다. 같은 요청이

- 컨테이너 내부에서 운영 nginx 경유 → 즉시 정상
- **같은 설정을 stock `nginx:1.29-alpine` 으로 띄워 호스트에서 접근 → 즉시 정상(0.07초)**
- 평범한 컨테이너의 published 포트로 저속 스트림 → 즉시 정상

이므로 설정·API·Docker Desktop 이 아니라 **운영 nginx 이미지/entrypoint 경로**로 범위가 좁혀져 있다. 고속 스트림(초당 수 KB)은 호스트에서도 정상 수신된다. 사용자 판단으로 여기서 조사를 중단했고, 필요하면 실시간 화면을 long-polling 또는 수동 새로고침으로 바꾸는 선택지가 있다.
