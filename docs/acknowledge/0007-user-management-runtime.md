# ADR 0007 — 다중 운영자 계정 관리 런타임

- 상태: 구현 기준선
- 날짜: 2026-08-01

## 결정

- 최초 owner는 단일 불변 계정으로 유지하며 패널이나 API에서 역할 변경·비활성화할 수 없다.
- owner만 최근 로그인 세션으로 운영자 역할과 활성 상태를 변경할 수 있다.
- 할당 가능한 역할은 admin, operator, viewer, auditor이며 owner 승격은 제공하지 않는다.
- 비활성화 transaction은 역할 상태 변경과 해당 사용자의 모든 session 삭제를 함께 수행한다.
- 비활성 사용자는 기존 cookie가 있어도 인증되지 않으며 email sign-in 진입점에서 403으로 차단한다.
- 초대 생성·수락, 사용자 역할·활성 상태 변경은 append-only audit에 기록한다.
- 일반 감사 조회에서는 source IP를 마스킹하고 invitation token과 password를 기록하지 않는다.

## 검증 결과

- 빈 SQLite에 disabled column migration 적용 확인
- 단위 테스트에서 role 변경, owner 불변, session 폐기, disabled email 판정 확인
- 실제 단회 invitation으로 operator 생성과 로그인 확인
- owner가 operator를 viewer로 변경하고 비활성화한 뒤 기존 session API 401 확인
- 비활성 계정 재로그인 403 확인
- 실제 audit에서 actor, target, role, disabled 상태와 마스킹 IP 확인
- 한국어 운영자 관리 SSR 패널에서 비활성 상태와 horizontal overflow 0 확인
- 합성 invitation과 사용자 계정은 검증 후 정확한 ID로 삭제하고 owner 단독 상태를 재확인

## 남은 범위

- invitation 목록·회수·재발행
- 사용자 상세 session 목록과 개별 session 폐기
- owner 복구용 break-glass 절차
