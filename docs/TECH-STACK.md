# 기술 스택과 구현 기준

## 1. 스택 표

| 영역          | 선택                                                       | 구현 기준                                                      |
| ------------- | ---------------------------------------------------------- | -------------------------------------------------------------- |
| 모노레포      | Bun workspaces                                             | root `package.json`과 단일 `bun.lock`, workspace별 독립 script |
| 언어          | TypeScript strict                                          | `any`, `enum`, 검증을 대신하는 type assertion 금지             |
| 웹            | 최신 안정 Next.js App Router, React, React Compiler        | Server Component와 SSR 우선, 상호작용만 Client Component       |
| API           | 최신 안정 Hono on Bun                                      | Route → Service → Agent/DB adapter, Hono RPC 타입 공유         |
| Docker Agent  | Bun + Hono internal API                                    | Docker Engine API 어댑터, 외부 비노출                          |
| 트래픽 worker | Bun                                                        | 현재 JSONL tail·Zod parse·batch transaction, 후속 rollup       |
| UI            | Tailwind CSS v4, shadcn/ui, Radix, CVA, Lucide             | `apps/web/src/shared/ui`에 직접 생성, FSD 적용                 |
| 서버 상태     | TanStack Query v5                                          | SSR prefetch와 hydration, 계층형 `QUERY_KEY`                   |
| 폼            | react-hook-form, Zod resolver                              | 간단한 1~2필드는 `useState` 허용                               |
| 알림          | Sonner                                                     | mutation 성공·실패와 job 완료 피드백                           |
| 인증          | Better Auth, Drizzle adapter, API key plugin               | email/password, invite, DB session, hashed API key             |
| DB            | Drizzle ORM + SQLite                                       | control과 traffic DB 분리, WAL, migration만 사용               |
| 프록시        | 공식 Nginx 이미지                                          | digest pin, JSON access log, atomic config reload              |
| tunnel        | 공식 cloudflared 이미지                                    | outbound-only, 관리 도메인은 Access 권장                       |
| 테스트        | `bun:test`, Testing Library, Playwright                    | Docker 파괴 테스트는 격리 daemon에서만                         |
| 관측          | 구조화 로그, Prometheus 형식 자체 metrics, audit log       | 디버그 `console.log` 금지                                      |
| 국제화        | next-intl 호환 catalog 계층                                | `ko`, `en`, `ja` 동시 제공, locale registry로 확장             |
| backup        | SQLite online backup, 로컬 rotation, S3-compatible adapter | R2는 선택, restore 검증 필수                                   |
| 알림          | Discord webhook adapter                                    | SMTP 없음, secret·원본 IP 전송 금지                            |

구현 시작 시 각 패키지의 최신 안정 버전 중 상호 호환되는 조합을 공식 문서와 Phase 0 matrix로 확인한다. 개별 최신 버전이라는 이유만으로 채택하지 않는다. `bun.lock`을 커밋하고 production image는 digest로 pin한다. Hono는 server, agent, web client가 동일 버전을 사용해야 한다.

## 2. 권장 디렉터리

```text
apps/
    web/
        src/app/
        src/widgets/
        src/features/
        src/entities/
        src/shared/
    api/
        src/route/
        src/service/domain/
        src/service/shared/
        src/dto/
        src/db/
        src/compose/
        src/lib/
    engine-agent/
        src/route/
        src/service/
        src/docker/
        src/dto/
        src/lib/
    traffic-worker/
        src/ingest/
        src/rollup/          # 후속 목표
        src/db/
    egress-broker/
        src/route/
        src/service/domain/
        src/middleware/
        src/lib/
packages/
    db-schema/
    contracts/
    config/
    nginx-config/
infra/
    nginx/
    compose/
    cloudflared/
docs/
```

Next.js `app/`은 라우팅과 조립만 담당한다. 도메인 API·query option·type은 `entities`, props 기반 UI는 `features`, 여러 데이터와 화면 블록 조립은 `widgets`, shadcn과 범용 util은 `shared`에 둔다. barrel export는 만들지 않는다.

API와 Agent는 같은 Hono 계층 원칙을 따르되 Docker 구현은 Agent의 `docker/`에만 존재한다. API Service는 Docker client, HTTP Context, Drizzle을 직접 알지 않는다.

## 3. Next.js와 Bun 런타임

Bun을 package manager, workspace runner, API·Agent·worker runtime, test runner로 사용한다. Next.js production runtime은 Phase 0 검증을 통과하면 Bun으로 확정하고 실패하면 `web`만 Node.js로 전환한다.

- Bun 우선안: `bun --bun next build/start`를 사용하고 SSR streaming, image optimization, WebSocket proxy, graceful shutdown, memory 누수를 호환성 테스트한다.
- 보수안: Next.js web 컨테이너만 공식 요구조건의 Node.js runtime을 사용하고 install·workspace·나머지 서비스는 Bun을 유지한다.
- 어느 안이든 Nginx에서 Next.js streaming을 위해 buffering을 비활성화하고 실제 chunk 도착을 테스트한다.
- M1 Max production과 동일한 `linux/arm64` 이미지에서 build, SSR/RSC, image optimization, signal 처리, memory 안정성을 검증한다.

사용자 지시의 "가급적 Bun"은 호환성 검증을 통과한 영역에 Bun을 우선한다는 뜻으로 적용한다. 프레임워크 동작을 깨뜨리면서 강제하지 않는다.

## 4. Hono RPC 타입 안정성

- 각 도메인 route는 메서드를 chain한 Hono 인스턴스를 반환한다.
- top-level router도 `.route()`를 chain하고 그 결과의 `typeof`를 export한다.
- web은 값을 import하지 않고 `import type`으로 AppType을 받고 `hc<AppType>`을 만든다.
- 입력은 Zod validator의 반환 타입에서, 출력은 명시적 HTTP status가 있는 `c.json`에서 추론한다.
- 전역 에러 타입은 Hono의 global response type helper 또는 모든 route의 공통 error response 계약으로 포함한다.
- route 수가 늘어 IDE가 느려지면 도메인별 client로 분리하고 TypeScript project references를 사용한다.
- Next.js Server Component와 Client Component가 같은 RPC wrapper를 재사용하되 cookie·absolute URL 처리는 server adapter에서만 한다.

## 5. SQLite 운용

- API 소유 `control.sqlite`와 traffic worker 소유 `traffic.sqlite`를 분리한다.
- 단일 writer 원칙을 지킨다. API만 control DB를 쓰고 worker만 traffic raw와 향후 rollup을 쓴다.
- WAL, foreign keys, busy timeout을 startup에서 검증한다.
- migration은 Drizzle `generate` 후 생성 SQL을 리뷰하고 `migrate`로만 적용한다. production `push`는 금지한다.
- DB와 WAL·SHM 파일은 같은 persistent volume에 둔다.
- backup은 SQLite online backup 또는 검증된 snapshot 절차를 사용하고 restore drill을 자동화한다.
- traffic retention purge는 작은 batch로 실행해 긴 write lock을 피한다.

## 6. 의존성 도입 기준

- Docker SDK: 공식 Docker SDK가 없는 TypeScript 환경이므로 Docker Engine REST API 직접 호출 또는 `dockerode`를 검토한다. Phase 0에서 Bun Unix socket, hijacked stream, TTY resize, image load stream 호환성을 비교한다. CLI spawn은 typed API로 구현할 수 없는 기능의 최후 수단이며 사용자 입력을 셸 문자열로 만들지 않는다.
- terminal rendering: xterm.js는 브라우저 TTY에만 도입한다. 비대화형 exec에는 필요 없다.
- chart: shadcn Chart가 사용하는 Recharts를 사용한다.
- archive sniffing과 decompression은 Bun·표준 스트림을 우선하고 검증된 형식에만 제한한다.
- 바이러스·취약점 검사는 별도 pinned scanner 컨테이너로 실행해 API 이미지에 무거운 scanner를 포함하지 않는다.

## 7. 국제화 구조

- locale registry가 locale code, 표시 이름, text direction, 날짜·숫자 locale, catalog loader를 가진다.
- `ko`, `en`, `ja`는 동일한 key와 ICU parameter schema를 가져야 하며 누락 key를 build에서 실패시킨다.
- Hono는 번역 문장 대신 안정된 error code와 parameter를 반환한다. 패널과 API 문서는 locale adapter에서 번역한다.
- DB enum·audit operation·metric label에는 번역 문자열을 저장하지 않는다.
- 새 언어팩은 registry metadata와 catalog 추가만으로 활성화하고 domain·feature 코드를 수정하지 않는다.

## 8. 코드 품질 기준

- Prettier는 print width 150, tab 4 spaces, semicolon 없음, single quote, trailing comma를 적용한다.
- 공개 API 외 코드 주석은 작성하지 않고 설계 이유는 `docs/`에 둔다.
- arrow function, async/await, early return, immutable operation을 사용한다.
- 의미 있는 크기·timeout·retention·limit는 상수 또는 구성값으로 둔다.
- 모든 외부 경계는 Zod parse 후 내부 type으로 전달한다.
- 코드 변경 전 관련 공식 문서를 확인하고 종료 전 typecheck, format/lint, test, 실행 검증을 수행한다.
