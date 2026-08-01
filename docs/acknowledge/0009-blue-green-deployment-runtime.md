# ADR 0009 — Manifest 기반 blue-green 배포 런타임

- 상태: 구현 기준선
- 날짜: 2026-08-01

## 결정

- image load 실행 기록과 실제 배포 정의를 분리해 `deployment_manifest`와 `deployment_release`를 별도 상태로 저장한다.
- manifest는 immutable name/version과 실제 Docker Engine에 존재하는 `sha256` image digest를 요구한다.
- 같은 application name의 모든 version은 hostname과 route path가 같아야 하며 panel·API hostname과 control·ingress network를 target으로 사용할 수 없다.
- environment와 secret은 key·reference만 manifest에 저장한다. 일반 environment 값은 거부하고 encrypted secret reference는 실행 시 해석한다.
- 신규 container는 read-only root, capability drop, no-new-privileges, CPU·memory·PIDs 제한과 관리 label을 적용한다.
- 신규 container는 먼저 `containers_control`에서 실행하고 Agent가 bounded HTTP health probe를 수행한다.
- health 성공 뒤 목표 edge network에 연결하고 control network에서 분리한 다음 구조화 Nginx route를 전환한다.
- Nginx HUP 직후 이전 worker가 응답하는 전환 구간은 manifest의 retry·interval 정책으로 기다린다.
- route 전환 뒤 즉시 probe와 observation window 이후 probe를 모두 통과해야 healthy가 된다.
- pre-health 실패는 공개 route를 변경하지 않는다. route 이후 실패는 이전 healthy target으로 복원하며 이전 target이 없으면 새 route를 제거한다.
- release API는 `202`와 추적 가능한 release를 반환하고 상태 조회 API를 제공한다.

## 검증 결과

- 빈 SQLite에 manifest와 release migration 적용 확인
- 존재하지 않는 digest, 보호 hostname·network, 중복 version, application route identity 변경 거부 확인
- 단위 테스트에서 정상 healthy, pre-health 실패, observation 실패 rollback, Nginx reload readiness retry 확인
- 실제 M1 Max Docker Desktop에서 Node HTTP image를 control network에 생성하고 health 200 확인
- 실제 target edge 연결과 control 분리, 구조화 Nginx route apply 확인
- 최초 즉시 probe에서 이전 Nginx worker의 307을 관측하고 readiness retry로 수정·회귀 test 추가
- 실제 10초 observation 후 release `healthy`, 공개 Host 경로 `BLUE_GREEN_OK`·200 확인
- 실패 release 두 개는 자동 `rolled-back` 및 신규 container stop 확인
- 합성 route·container·manifest·release를 정확한 ID로 정리하고 0개를 재확인
- format, TypeScript, ESLint, unit·integration test 61개 통과

## 남은 범위

- 단계 중간부터 계속 실행하는 durable job queue
- 일반 Docker orphan·미참조 image sweep
- traffic error-rate 기반 observation과 deployment event timeline
