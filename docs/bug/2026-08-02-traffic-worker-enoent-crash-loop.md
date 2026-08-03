# traffic-worker — access log 부재 시 ENOENT crash loop

날짜: 2026-08-02
상태: 수정 완료

## 증상

`docker compose up` 직후 traffic-worker 컨테이너가 반복 재시작한다. 로그에 `ENOENT: no such file or directory, statx '/var/log/nginx/access.jsonl'` 가 남고 프로세스가 종료된다.

## 원인

- nginx 가 `access.jsonl` 을 아직 만들지 않은 시점(신선한 `nginx-logs` 볼륨, 기동 경합)에 traffic-worker 의 `ingestionService.start()` 가 즉시 `poll()` 을 실행한다.
- `poll()` 내부의 `getIdentity()` 가 `stat(accessLogPath)` 에서 ENOENT 를 던지는데, `start()` 가 `void poll()` fire-and-forget 이라 unhandled rejection 으로 프로세스가 종료되고 Compose 가 재시작을 반복한다.
- 파일이 이미 존재하던 기존 환경에서는 드러나지 않던 기동 순서 결함이다.

## 해결

`apps/traffic-worker/src/service/create-traffic-ingestion-service.ts`

1. `getIdentityIfPresent()` 를 추가하고 `poll()` 시작 시 access log 가 없으면 정상 반환한다(아직 데이터 없음, 다음 주기에 재시도).
2. `start()` 의 poll 호출에 `.catch(console.error)` 를 붙여 예기치 못한 일시 오류가 프로세스를 죽이지 못하게 했다.

재현 테스트: `create-traffic-ingestion-service.test.ts` — "access log 파일이 아직 없으면 poll이 실패하지 않고 파일이 생기면 이어서 수집합니다" (수정 전 ENOENT 로 실패 확인 후 수정).

## 적용

수정 반영에는 이미지 재빌드가 필요하다: `docker compose build traffic-worker && docker compose up -d --wait`
