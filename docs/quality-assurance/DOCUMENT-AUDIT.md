# 문서 단계 검증

- 검증일: 2026-07-31
- 범위: 구현 시작 직전 plan과 `docs/` 지시서 확정

## 1. 입력 확인

- [x] `llm-rules`의 AI 작업 절차 전문 확인
- [x] TypeScript·주석·보안 전문 확인
- [x] frontend·FSD·TanStack Query 전문 확인
- [x] Hono·Drizzle backend 전문 확인
- [x] `flunti-otel` monorepo·Hono RPC·shadcn 구조 확인
- [x] `flunti-otel` 3단 셸·디자인 토큰·UI 좌표 검증 문서 확인
- [x] 관련 공식 문서 URL과 확인일 기록

## 2. 사용자 요구 누락 검사

- [x] 최초 요구 12개와 완전 원격 운영 요구를 추적표에 연결
- [x] 각 요구에 구현 Phase 연결
- [x] 각 요구에 인수 체크리스트 연결
- [x] Docker container 실행과 host Engine 제어를 분리해 정의
- [x] Nginx 앞단과 별도 traffic worker를 분리해 정의
- [x] panel session과 API key upload 경로를 모두 정의
- [x] Next.js SSR과 Hono RPC 사용 경계를 정의
- [x] 22개 사용자 결정과 M1 Max·384GB·Cloudflare Free 운영 정보를 반영
- [x] 패널 Access+session과 외부 API-key-only hostname을 분리
- [x] 한국어·영어·일본어와 language pack 확장 계약을 정의

## 3. 보안 완전성

- [x] Docker socket의 root-equivalent 위험 명시
- [x] socket을 Agent 한 곳에만 mount
- [x] typed Engine operation과 raw shell 금지 기준
- [x] 위험 작업 등급·재인증·영향 미리보기·audit
- [x] upload traversal·bomb·symlink·digest·scanner
- [x] CSRF·CORS·Cloudflare header 신뢰 조건
- [x] management plane 자기 보호
- [x] destructive test의 host Docker 사용 금지

## 4. Nginx·traffic 완전성

- [x] draft·validate·apply·probe·rollback 상태 기계
- [x] atomic config swap과 graceful reload
- [x] versioned JSON log field 계약
- [x] query·secret 미저장과 원본 IP의 제한 저장·열람·purge 정의
- [x] inode·offset·partial line·rotation·replay
- [x] raw·minute·hour rollup과 percentile
- [x] ingest health와 retention

## 5. UI·shadcn 완전성

- [x] 2026-07-31 공식 shadcn 목록 64개 전수 기록
- [x] 64개를 필수·조건부·제외로 모두 분류
- [x] 화면별 shadcn 조합 기록
- [x] custom UI 허용 범위 제한
- [x] `flunti-otel` 3단·12px·1px·radius 0·shadow none 반영
- [x] SSR과 stream·terminal의 Client Component 경계 기록
- [x] responsive·접근성·상태 분기·수치 검증 기록

## 6. 테스트·운영 완전성

- [x] 단위·계약·통합·컴포넌트·E2E·성능·chaos 정의
- [x] Engine·Nginx·traffic·upload 정확성 test 정의
- [x] backup·restore와 control plane 장애 격리 정의
- [x] 완전 원격 운영 E2E 시나리오 정의
- [x] Phase별 완료 조건과 최종 인수 체크리스트 정의

## 7. 남은 차단점

- [x] [OPEN-DECISIONS.md](../OPEN-DECISIONS.md)의 사용자 답변
- [x] 답변을 반영한 최종 ADR과 수치 목표
- [x] Phase 0 호환성·성능 spike 실행 승인

문서 단계는 완료됐다. 2026-07-31 사용자 승인에 따라 Phase 0·1 구현을 시작한다. 실제 검증 전 구현 체크박스는 완료 처리하지 않는다.

## 8. 구현 진행 후 정합성 재감사

2026-08-01 현재 구현·runtime과 문서의 재감사는 [2026-08-01-DOCUMENT-CONSISTENCY-AUDIT.md](./2026-08-01-DOCUMENT-CONSISTENCY-AUDIT.md)에 기록한다. 이 문서의 2026-07-31 체크는 구현 전 설계 완전성에 대한 시점 기록이며 현재 구현 완료율을 뜻하지 않는다.
