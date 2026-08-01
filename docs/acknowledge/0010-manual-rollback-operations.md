# ADR 0010 — 수동 rollback과 중단 작업 복구

- 상태: 구현 완료
- 날짜: 2026-08-01

## 결정

- Next.js SSR dashboard가 manifest와 release를 초기 렌더링하고 Client Component는 생성·배포·rollback과 진행 중 상태 polling만 담당한다.
- 같은 application의 active release만 중복 실행을 차단하고 서로 다른 application은 독립적으로 배포할 수 있다.
- 수동 rollback은 현재 healthy release의 `previousReleaseId`만 대상으로 허용한다.
- 이전 container는 control network에 임시 연결해 start와 bounded health probe를 통과한 뒤 Nginx route를 전환한다.
- 공개 route probe 성공 후 control network를 분리하고 현재 container를 stop한다. 실패 시 현재 route를 복원하고 이전 container를 다시 stop한다.
- API 시작 시 active release를 SQLite에서 조회한다. create·probe 중단은 신규 container를 stop하고 failed로, switch·observation 중단은 이전 route를 복원하고 rolled-back으로 수렴시킨다. rollback 중단은 현재 route를 복원한다.
- rollback retention이 만료된 이전 container는 시작 시와 1시간 주기로 삭제한다. cleanup 실패는 다음 주기에 재시도하며 named volume은 유지한다.
- Docker stop·restart의 Engine·Agent·API timeout은 요청의 graceful timeout보다 각각 5초·8초 길게 설정한다.

## 실제 검증

- 한국어 Owner SSR 화면에서 manifest form 제출과 즉시 card 반영, 접근 가능한 label, 1280px horizontal overflow 0을 확인했다.
- Node image로 `rollback-e2e` v1과 v2를 실제 생성했다.
- v1 공개 응답 `ROLLBACK_V1`, v2 전환 후 `ROLLBACK_V2`를 확인했다.
- v2 수동 rollback이 `rolling-back → rolled-back`으로 종료되고 공개 응답이 `ROLLBACK_V1`으로 복원됨을 확인했다.
- rollback 뒤 v2 container가 exited 상태임을 확인했다.
- 10초 graceful stop이 약 10초 후 성공 응답하며 timeout 오탐이 없음을 확인했다.
- 합성 route 1개, container 2개, release 2개, manifest 2개와 임시 cookie를 정리하고 잔존 항목 0개를 확인했다.
- API, Engine Agent, Nginx, Web, Traffic Worker 다섯 service가 모두 healthy임을 확인했다.

## 남은 범위

- 상세 단계·로그·소요시간을 저장하는 deployment event timeline
- 단계 중간부터 재개하는 durable queue와 lease
- traffic error-rate observation
- 일반 orphan container와 미참조 image cleanup
