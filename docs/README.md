# Containers 프로젝트 문서

이 디렉터리는 제품·아키텍처·보안·구현 상태·테스트 지시서의 단일 출처다. 구현은 진행 중이며 새 세션은 반드시 `RESUME-CHECKLIST.md`부터 읽는다.

## 문서 순서

1. [RESUME-CHECKLIST.md](./RESUME-CHECKLIST.md) — 안전 중단점, 재개 명령, 다음 작업, 승인 경계의 단일 진입점
2. [HANDOFF-STATUS.md](./HANDOFF-STATUS.md) — 현재 런타임, 완료·미완료, 검증 증거
3. [PROCESS.md](./PROCESS.md) — 수행한 작업 상태와 체크리스트
4. [PRODUCT-REQUIREMENTS.md](./PRODUCT-REQUIREMENTS.md) — 목표, 범위, 완료 조건
5. [REQUIREMENTS-TRACEABILITY.md](./REQUIREMENTS-TRACEABILITY.md) — 사용자 요구와 설계·검증 연결
6. [ARCHITECTURE.md](./ARCHITECTURE.md) — 전체 구성과 데이터 흐름
7. [TECH-STACK.md](./TECH-STACK.md) — 기술 스택과 선택 근거
8. [SECURITY.md](./SECURITY.md) — 위협 모델, 권한, 위험 작업 통제
9. [DOCKER-CONTROL.md](./DOCKER-CONTROL.md) — Docker Engine 제어 계약
10. [NGINX-TRAFFIC.md](./NGINX-TRAFFIC.md) — Nginx 설정·리로드·트래픽 분석
11. [UPLOAD-DEPLOYMENT.md](./UPLOAD-DEPLOYMENT.md) — 업로드·검사·배포·롤백
12. [BACKUP-RESTORE.md](./BACKUP-RESTORE.md) — 로컬 DB 백업·retention·복구 runbook
13. [API-DATA-AUTH.md](./API-DATA-AUTH.md) — Hono RPC, API, DB, 인증
14. [UI-UX.md](./UI-UX.md) — 화면 구조와 디자인 규칙
15. [SHADCN-COMPONENTS.md](./SHADCN-COMPONENTS.md) — 공식 컴포넌트 전체 목록과 사용 계획
16. [TESTING.md](./TESTING.md) — 테스트 전략과 격리 원칙
17. [IMPLEMENTATION-PLAN.md](./IMPLEMENTATION-PLAN.md) — 단계별 구현 지시서
18. [OPEN-DECISIONS.md](./OPEN-DECISIONS.md) — 사용자 결정이 필요한 항목
19. [quality-assurance/ACCEPTANCE.md](./quality-assurance/ACCEPTANCE.md) — 최종 인수 체크리스트
20. [quality-assurance/DOCUMENT-AUDIT.md](./quality-assurance/DOCUMENT-AUDIT.md) — 문서 단계 자체 검증
21. [references/OFFICIAL-SOURCES.md](./references/OFFICIAL-SOURCES.md) — 공식 문서 근거
22. [quality-assurance/2026-08-01-DOCUMENT-CONSISTENCY-AUDIT.md](./quality-assurance/2026-08-01-DOCUMENT-CONSISTENCY-AUDIT.md) — 현재 구현과 문서 정합성 감사
23. `acknowledge/` — 번호 순 확정 결정 기록 (최신: 0025 웹 패널 사이드바 내비게이션)
24. `history/` — 세션별 작업 이력 (시간순, 현재 상태가 아님)

macOS 에서 처음 설치·기동할 때는 저장소 루트의 `scripts/setup-macos.sh` 를 실행한다(환경 확인 → compose 검증·override 생성 → 기동 → 스모크 테스트).

## 적용 우선순위

1. 사용자의 최신 명시 지시
2. `docs/acknowledge/`에 기록된 확정 결정
3. 이 디렉터리의 설계 문서
4. `/Users/hyunseokbyun/development/llm-rules/docs/convention/` 규칙
5. `/Users/hyunseokbyun/development/flunti-otel`의 디자인·구현 패턴

현재 상태는 `RESUME-CHECKLIST.md`와 `HANDOFF-STATUS.md`를 우선한다. 과거 `acknowledge/`·`history/`는 시점 증거이며 현재값으로 읽지 않는다. 문서끼리 충돌하면 실제 코드·테스트·runtime을 확인하고 정합성 감사와 `PROCESS.md`에 해결을 기록한다. 구현 중 설계를 바꿔야 하면 코드를 먼저 바꾸지 않고 `OPEN-DECISIONS.md` 또는 새 ADR을 갱신해 승인을 받는다.
