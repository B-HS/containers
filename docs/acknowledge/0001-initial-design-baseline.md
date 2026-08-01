# 0001 — 구현 전 초기 설계 기준

- 작성일: 2026-07-31
- 상태: 사용자 세부 결정 전 추천 baseline

## 확정된 사용자 요구

- Docker container로 동작하며 host Docker를 제어한다.
- 외부 경로는 Cloudflare Tunnel → server다.
- Nginx가 요청의 가장 앞에 있다.
- Nginx와 별개로 traffic을 정확히 logging·분석하고 API·dashboard를 제공한다.
- Nginx 설정 저장·reload·현황을 Next.js SSR 패널로 제공한다.
- API는 Hono, monorepo는 Next.js + Hono + Bun, Hono RPC로 타입을 공유한다.
- image·archive는 panel session 또는 API key로 업로드한다.
- 로그인은 Drizzle + SQLite를 사용한다.
- shadcn 공식 컴포넌트를 먼저 전수 목록화하고 최대한 활용한다.
- Docker 상태와 exec, status, rm, rmi 등 운영 기능을 panel·API에서 제공한다.
- 호스트를 직접 조작하지 않아도 운영이 완결되어야 한다.
- 현재 단계는 구현이 아니라 plan과 `docs/` 지시서 완성이다.

## 추천 baseline

- 단일 조직·단일 Linux Docker host
- Compose 다중 컨테이너 control plane
- Docker socket은 Engine Agent만 접근
- typed Engine operation, raw host shell 금지
- Better Auth email/password·invite·RBAC·hashed API key
- Nginx revision 검증·원자 적용·graceful reload·자동 rollback
- Nginx JSONL 원본 로그 + 별도 traffic worker + SQLite rollup
- blue-green deployment와 health 기반 rollback
- `flunti-otel`의 3단·12px·1px·radius 0·shadow none 디자인

추천 baseline은 [OPEN-DECISIONS.md](../OPEN-DECISIONS.md)에 대한 사용자 답변으로 교체·확정한다.
