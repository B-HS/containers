# 0022 — Durable notification destination·delivery

## 결정

- 알림 destination은 `notification_destination` 테이블에 metadata와 함께 저장하고, webhook URL은 API가 보유한 master secret(AES-256-GCM, deployment secret과 같은 체계)으로만 암호화해 보관한다. API·audit·job payload·job event에는 URL 원문이나 ciphertext를 절대 넣지 않는다.
- destination 응답은 metadata-only다: `id, name, type, enabled, eventTypes, version, createdAt, updatedAt, lastDelivery`. 삭제는 destination name 확인 문구와 owner/admin 최근 15분 인증·audit을 요구한다. enable/disable·test delivery도 같은 인증·audit 경계를 사용한다.
- 전송은 `notification.deliver` durable job으로만 실행한다. `notification_delivery` 테이블의 `(destination_id, source_job_id, event_type)` unique index로 같은 실패의 중복 delivery 생성을 막는다. 전송은 at-least-once이며, 전송 직후 프로세스가 죽으면 재시작 reconcile로 같은 job이 재실행되어 중복 메시지가 발생할 수 있다. 이를 문서화된 한계로 받아들인다.
- HTTP 결과 분류: 2xx 성공, 429는 `Retry-After`(초, 1~3600 clamp)를 존중해 커스텀 재시도 지연, 5xx·timeout·네트워크 오류는 표준 backoff 재시도, 4xx는 terminal failure로 즉시 종료한다. 이를 위해 operation job 서비스에 `retryAfterMs`(커스텀 지연)와 `terminal`(재시도 없음) 오류 속성과 `onFinished` 옵저버를 추가한다.
- 첫 producer는 `backup.create` terminal failure다. job이 `failed`로 확정된 경우에만 enabled destination 중 해당 event type을 구독하는 곳에 알림을 준비한다. 취소(`JOB_CANCELLED`·`JOB_INTERRUPTED`)는 알리지 않는다.
- 전송 내용은 event type 템플릿으로만 만든다: `backup.failed`는 failure code·source job id·발생 시각, `test`는 destination name을 포함한다. 민감 정보를 포함하지 않는다.
- runtime egress: api 서비스는 `ingress`·`control`(internal) 네트워크만 가져 외부 전송이 불가능하므로 `edge` 네트워크를 추가한다. host port 노출은 없으며 nginx만 host ingress를 유지한다. webhook 암호화 키는 `/data/notification-secret-key`(`0600`)에 `loadOrCreateSecret`로 생성한다.

## 검증

- destination upsert 스키마: https URL만 허용, event type 1개 이상, metadata 응답에 ciphertext·URL 부재
- delivery 준비 dedupe: 같은 source job 실패를 두 번 produce해도 delivery row·job 1건
- deliver handler: 2xx 성공, 429 Retry-After 커스텀 지연 재시도, 5xx 표준 재시도, 4xx terminal(재시도 없음), timeout 재시도, 취소 시 미전송, restart reconcile requeue
- job 서비스: `onFinished` 호출, `retryAfterMs` 스케줄, `terminal` 즉시 실패 테스트
- producer: `backup.create` failed(비취소)만 알림, 성공·취소는 무시
- route: 미인증 401, 최근 인증 미통과 401, 삭제 확인 불일치 409, audit 기록
- 실제 Discord 전송은 사용자가 승인한 webhook을 제공했을 때만 수행한다. 단위·통합 테스트는 로컬 HTTP 서버로 2xx/429/5xx/4xx/timeout을 재현한다.

## 잔여

- R2·Discord 외 채널(이메일 등) adapter, alert severity·digest, delivery 재시도 UI 고도화는 후속 작업이다.
