# 0013 — Control·Traffic 로컬 백업과 보상 복구

## 상태

구현 및 실제 restore drill 완료.

## 결정

- control DB는 API, traffic DB는 Traffic Worker가 자신의 live SQLite connection으로 snapshot한다.
- shared `backups` named volume에는 UUID 디렉터리와 manifest만 저장한다.
- 두 DB 사이에는 분산 transaction 대신 restore 직전 recovery set과 보상 복구를 사용한다.
- live·snapshot FK, SQLite integrity, schema, byte 수, SHA-256이 모두 통과해야 복구한다.
- 복구·삭제에는 backup UUID 재입력이 필요하며 손상 backup도 삭제할 수 있어야 한다.
- 로컬 backup은 R2 설정과 무관하게 항상 동작한다.

## 검증

- control restore·retention·confirmation·invalid FK·corrupt deletion 단위 테스트
- traffic snapshot create·restore·invalid SQLite 단위 테스트
- 실제 Docker volume에서 control+traffic 생성, 자동 recovery set, restore 성공
- 복구 후 live SQLite integrity `ok`, FK 위반 0
- Owner SSR panel과 API key `backup:read`, `backup:write` scope 연결

## 후속

bounded-memory snapshot, durable backup job, maintenance drain, scheduler observability, R2 envelope encryption, Discord delivery는 별도 단계다.
