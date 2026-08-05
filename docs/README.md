# Containers 프로젝트 문서

이 디렉터리는 제품·아키텍처·보안·구현 상태·테스트 지시서의 단일 출처다. 구현은 진행 중이며 새 세션은 반드시 `RESUME-CHECKLIST.md`부터 읽는다.

## 문서 순서

0. [HANDOFF.md](./HANDOFF.md) — **세션 인수인계 단일 진입점.** 새 세션은 이것부터 읽는다(목표·진행 상태·의사결정·다음 TODO)
1. [RESUME-CHECKLIST.md](./RESUME-CHECKLIST.md) — 안전 중단점, 재개 명령, 승인 경계
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
23. [EXPOSURE.md](./EXPOSURE.md) — 외부 노출 경로(로컬 전용·cloudflared·직접 TLS)와 도메인 전환 체크리스트
24. [RUNBOOK.md](./RUNBOOK.md) — 사고 시나리오별 증상·확인·조치 절차
25. [CONTROL-PLANE-UPGRADE.md](./CONTROL-PLANE-UPGRADE.md) — 업그레이드·롤백 runbook과 migration dry-run
26. [quality-assurance/2026-08-04-ui-backend-audit.md](./quality-assurance/2026-08-04-ui-backend-audit.md) — 웹 UI/UX·백엔드 6영역 감사(findings 132건)
27. [quality-assurance/2026-08-04-production-readiness.md](./quality-assurance/2026-08-04-production-readiness.md) — 실운영·CI API 운용 준비도 판정과 3단계 로드맵
28. [quality-assurance/2026-08-05-disaster-recovery-drill.md](./quality-assurance/2026-08-05-disaster-recovery-drill.md) — 새 호스트 재해복구 드릴 실행 기록
29. [PLAN-UX-REMEDIATION.md](./PLAN-UX-REMEDIATION.md) — 진행 중 실행 계획: UX 감사 후속·런타임 개방·compose 스택 (항목별 근거·주의·완료 판정)
30. [quality-assurance/2026-08-05-panel-ux-audit.md](./quality-assurance/2026-08-05-panel-ux-audit.md) — 패널 UX 감사(원본 64건 → 검증 44건 → 원인 12개)와 배포 런타임 제약 실측
31. `ci-examples/` — CI 워크플로 예제(빌드 CI 3종 + API key 기반 배포 워크플로)
32. `acknowledge/` — 번호 순 확정 결정 기록 (최신: 0036 공개 주소 단일 출처·종료 드레인)
33. `history/` — 세션별 작업 이력 (시간순, 현재 상태가 아님)

처음 설치·기동할 때는 저장소 루트의 `scripts/setup.sh` 를 실행한다(환경 확인 → compose 검증·override 생성 → 기동 → 스모크 테스트). macOS(Docker Desktop)와 Linux(rootful Docker Engine)를 모두 지원하며, Linux 에서는 `/var/run/docker.sock` 의 그룹 GID 를 탐지해 override 의 `engine-agent.group_add` 에 기록한다. 패널 포트·호스트를 바꾸면 `AUTH_BASE_URL`·`PANEL_PUBLIC_URL`·`AUTH_TRUSTED_ORIGINS` 를 함께 기록해 인증 origin 검사가 깨지지 않게 한다. `scripts/setup-macos.sh` 는 `setup.sh` 로 위임하는 하위호환 래퍼다. CI·무인 프로비저닝은 `--non-interactive`(stdin 이 TTY 가 아니면 자동 적용)로 질문 없이 실행하며, 모든 프롬프트를 동명 플래그·환경변수로 대체하고 `--start-mode build|up|skip` 으로 기동 방식을 정한다(`scripts/setup.sh --help`).

## 적용 우선순위

1. 사용자의 최신 명시 지시
2. `docs/acknowledge/`에 기록된 확정 결정
3. 이 디렉터리의 설계 문서
4. `/Users/gkn/.config/opencode/llm-rules/` 규칙
5. `/Users/gkn/flunti-otel`의 디자인·구현 패턴

현재 상태는 `RESUME-CHECKLIST.md`와 `HANDOFF-STATUS.md`를 우선한다. 과거 `acknowledge/`·`history/`는 시점 증거이며 현재값으로 읽지 않는다. 문서끼리 충돌하면 실제 코드·테스트·runtime을 확인하고 정합성 감사와 `PROCESS.md`에 해결을 기록한다. 구현 중 설계를 바꿔야 하면 코드를 먼저 바꾸지 않고 `OPEN-DECISIONS.md` 또는 새 ADR을 갱신해 승인을 받는다.
