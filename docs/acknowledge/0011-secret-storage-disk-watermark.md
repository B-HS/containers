# ADR 0011 — 암호화 Secret과 동적 디스크 보호

- 상태: 구현 완료
- 날짜: 2026-08-01

## 결정

- manifest에는 environment key와 secret reference만 저장한다. 일반 environment 값은 계속 거부한다.
- secret 값은 `deployment_secret`에 AES-256-GCM ciphertext, 96-bit IV, authentication tag로 저장한다.
- 암호화 key는 `/data/deployment-secret-key` 파일의 32자 이상 secret에서 SHA-256으로 파생한다. 파일은 기존 secret loader가 mode 0600으로 생성한다.
- secret 목록과 감사 기록에는 reference, version, timestamp만 제공하고 값과 ciphertext를 반환하지 않는다.
- 같은 reference 저장은 rotation이며 version을 증가시킨다. 새 release는 항상 최신 값을 해석한다.
- 참조 중인 secret은 삭제할 수 없다. Owner·Admin 최근 재인증 또는 `secret:write` API scope가 필요하다.
- upload session은 ready artifact와 활성 session 예약 합계를 기본 300GiB quota와 비교한다.
- Docker Desktop의 실제 available bytes에서 미전송 예약량과 신규 요청량을 차감한 값이 32GiB 미만이면 경고하고 16GiB 미만이면 HTTP 507로 차단한다. chunk 저장 직전에도 hard watermark를 다시 검사한다.

## 검증

- 빈 SQLite에 migration 0007과 `deployment_secret` table 적용을 확인했다.
- ciphertext에 평문이 포함되지 않고 올바른 master key로만 resolve됨을 확인했다.
- rotation version 증가, 최신 값 resolve, 참조 중 삭제 차단을 확인했다.
- release service가 resolve 결과만 Docker environment로 전달하는 단위 테스트를 추가했다.
- 한국어 SSR 패널에서 secret 생성·rotation·삭제를 수행하고 값이 DOM과 입력에 남지 않음을 확인했다.
- 실제 Node container release에서 secret 존재 여부 응답 `SECRET_OK`를 확인했다.
- 실제 container inspect API는 `E2E_SECRET` key만 반환하고 값을 반환하지 않음을 확인했다.
- soft warning, hard block, 총 quota, chunk 중 hard watermark 변화를 테스트했다.
- 합성 secret·manifest·release·route·container와 임시 cookie를 정확히 정리했다.

## 남은 범위

- master key rotation과 기존 ciphertext 재암호화 job
- 외부 KMS 또는 macOS Keychain adapter
- secret 사용 이력과 만료 정책
