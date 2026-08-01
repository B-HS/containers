# ADR 0004 — 인증·Engine 조회 런타임 기준선

- 상태: 승인된 계획에 따른 구현 완료
- 날짜: 2026-07-31

## 결정

- Control DB는 Bun SQLite와 Drizzle migration으로 `/data/control.sqlite`에 영속한다.
- Better Auth secret은 `/data/auth-secret`에 최초 1회 0600 권한으로 생성한다.
- 공개 email signup endpoint는 차단하고 첫 owner bootstrap과 단회 invitation 수락만 사용자 생성 경로로 허용한다.
- owner와 admin만 invitation을 만들 수 있으며 원문 token은 생성 응답에 한 번만 노출하고 DB에는 SHA-256 hash만 저장한다.
- Docker Engine API 버전은 `/version`으로 협상하고 이후 조회에는 협상된 version prefix를 사용한다.
- Docker 원문은 Agent에서 Zod 검증 후 공유 contract로 정규화한다.
- 디스크 총량·사용량·가용량은 Agent 컨테이너의 Docker Desktop VM filesystem을 매 요청 시 `statfs`로 읽는다.
- Nginx upstream은 Docker DNS를 주기적으로 재해석하여 서비스 컨테이너 재생성 후 stale IP를 유지하지 않는다.
- API root filesystem은 read-only로 유지하되 Bun이 인증 요청 최초 실행 시 만드는 빈 cache directory만 `/home/bun/.bun` tmpfs로 허용한다.

## 검증 결과

- typecheck, ESLint, unit·integration test 14개 통과
- Docker BuildKit에서 API·Agent·Traffic Worker·Next.js production build 통과
- Compose 5개 서비스 healthy
- 실제 Engine 29.6.2 arm64 조회, 컨테이너 목록, 동적 디스크 용량 응답 확인
- 브라우저에서 owner bootstrap, 로그인, SSR dashboard, 로그아웃 확인
- 1440×900 3단 layout과 390×844 mobile layout에서 horizontal overflow 0
- 브라우저 console error 0
