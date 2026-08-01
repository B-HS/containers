# ADR 0003 — Phase 0 초기 호환성 기준

- 상태: 진행 중
- 기록일: 2026-07-31
- 대상: 로컬 구현 도구 체인

## 관측 환경

- host: M1 Max macOS
- Bun: 1.3.14
- Docker CLI: 29.6.2
- Docker Desktop Engine: 29.6.2, aarch64

## 초기 버전 결정

- Next.js 16.2.12
- React·React DOM 19.2.8
- Hono 4.12.33
- Zod 4.4.3
- TypeScript 5.9.3
- next-intl 4.13.4
- Tailwind CSS 4.3.3

TypeScript 7.0.2는 레지스트리의 최신 안정판이지만 현재 설치한 ESLint·TypeScript 도구 체인의 peer dependency 범위를 벗어났다. 최신 호환 안정 조합 원칙에 따라 TypeScript 5 계열 최신 안정판 5.9.3으로 내렸다. 경고를 무시하거나 검사기를 비활성화하지 않는다.

## 남은 게이트

- Next.js build와 React Compiler
- Bun production runtime의 SSR·streaming·signal 처리
- Hono RPC의 web type 추론
- Bun의 Docker Unix socket·exec·load stream
- Docker Desktop `linux/arm64`와 `linux/amd64` emulation
- Nginx shadow·reload와 Compose 통합

Docker 관련 항목은 Docker Desktop daemon을 실행한 환경에서 검증한 뒤 이 ADR 상태와 결과를 갱신한다.

## 통과한 초기 게이트

- 전체 workspace TypeScript strict 검사
- Hono `AppType`을 web에서 type-only import한 RPC client build
- Next.js 16.2.12와 React Compiler production build
- Bun 1.3.14에서 Next.js standalone production server 기동
- 한국어 SSR route가 실행 중 Hono API health 결과를 포함해 HTTP 200 반환
- Nginx 1.29.4-alpine과 Bun 1.3.14-alpine의 multi-platform manifest·`linux/arm64` 존재 확인
- Nginx와 Bun base image를 확인한 multi-platform digest로 고정
- Docker Desktop에서 web, api, engine-agent, traffic-worker, nginx image build 성공
- read-only root filesystem, 최소 tmpfs, Agent socket 보조 그룹을 적용한 5개 서비스 모두 healthy
- Engine Agent가 Docker Desktop `/var/run/docker.sock`을 통해 Engine version 조회 성공
- Nginx 패널 SSR과 외부 API hostname 경로가 localhost ingress에서 HTTP 200 반환
- 실제 브라우저 1440px에서 좌측 256px, 우측 320px, main padding 12px, radius 0, shadow 없음 검증
- 실제 브라우저 390px에서 양쪽 aside가 숨겨지고 horizontal overflow가 없으며 console error 0건

SSR streaming, graceful shutdown, 장기 memory, Docker exec·load stream, Nginx reload·rollback은 아직 통과로 처리하지 않는다.
