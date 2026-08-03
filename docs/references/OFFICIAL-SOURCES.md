# 공식 문서 근거

- 확인일: 2026-07-31
- 구현 시작 전 최신 안정 버전과 문서 변경을 다시 확인한다.
- 기술 API는 기억이 아니라 아래 공식 문서를 우선한다.

## Next.js

- App Router: <https://nextjs.org/docs/app>
- 설치와 Bun package manager 선택: <https://nextjs.org/docs/app/getting-started/installation>
- Server·Client Components: <https://nextjs.org/docs/app/getting-started/server-and-client-components>
- 자체 호스팅·Nginx reverse proxy·streaming: <https://nextjs.org/docs/app/guides/self-hosting>
- 인증·인가와 server-side 재검증: <https://nextjs.org/docs/app/guides/authentication>

## Bun

- Runtime과 workspaces: <https://bun.sh/docs/runtime>
- Next.js를 Bun runtime으로 실행: <https://bun.sh/docs/guides/ecosystem/nextjs>
- Bun 애플리케이션 Docker 배치: <https://bun.sh/docs/guides/ecosystem/docker>
- Node.js 호환 현황: <https://bun.sh/docs/runtime/nodejs-compat>

## Hono

- Bun runtime: <https://hono.dev/docs/getting-started/bun>
- RPC와 monorepo·route chaining·version 일치: <https://hono.dev/docs/guides/rpc>
- WebSocket helper와 RPC mode: <https://hono.dev/docs/helpers/websocket>

## Docker

- Docker Engine API: <https://docs.docker.com/reference/api/engine/>
- Engine security와 웹 API 입력 위험: <https://docs.docker.com/engine/security/>
- daemon socket·SSH·mutual TLS 보호: <https://docs.docker.com/engine/security/protect-access/>
- 원격 daemon 접근 경고: <https://docs.docker.com/engine/daemon/remote-access/>
- image archive load와 지원 압축: <https://docs.docker.com/reference/cli/docker/image/load/>
- Engine API version history의 exec·archive·image load: <https://docs.docker.com/reference/api/engine/version-history/>
- Engine API v1.52 OpenAPI — events NDJSON·logs multiplexed stream·stats 계산식 (2026-08-01 확인): <https://docs.docker.com/reference/api/engine/version/v1.52.yaml>
- Engine API v1.52 registry authentication·`POST /images/create`의 `X-Registry-Auth` (2026-08-01 확인): <https://docs.docker.com/reference/api/engine/version/v1.52/>
- Engine API 인증 image pull 예제와 credential 전송 주의 (2026-08-01 확인): <https://docs.docker.com/reference/api/engine/sdk/examples/>
- Docker Desktop Mac 설치와 Apple Silicon 요구조건: <https://docs.docker.com/desktop/setup/install/mac-install/>
- Docker Desktop Mac 권한과 Linux VM 보안 경계: <https://docs.docker.com/desktop/setup/install/mac-permission-requirements/>
- Docker Desktop resource와 disk usage limit 설정: <https://docs.docker.com/desktop/settings-and-maintenance/settings/>

## Nginx

- access log와 JSON escaping: <https://nginx.org/en/docs/http/ngx_http_log_module.html>
- upstream과 timing 변수: <https://nginx.org/en/docs/http/ngx_http_upstream_module.html>
- signal, reload, rollback 동작: <https://nginx.org/en/docs/control.html>

## Cloudflare

- Tunnel 연결 특성과 outbound-only: <https://developers.cloudflare.com/cloudflare-one/networks/connectivity-options/>
- locally-managed ingress config와 catch-all 검증: <https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/local-management/configuration-file/>
- CF-Connecting-IP와 request headers: <https://developers.cloudflare.com/fundamentals/reference/http-headers/>
- Access policy와 Service Auth: <https://developers.cloudflare.com/cloudflare-one/access-controls/policies/>
- Service token: <https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/>
- remotely-managed Tunnel 권장과 관리 방식: <https://developers.cloudflare.com/tunnel/advanced/local-management/>
- Tunnel의 plan 가용성과 outbound 연결: <https://developers.cloudflare.com/tunnel/>
- Free plan HTTP request body 한도: <https://developers.cloudflare.com/workers/platform/limits/>
- R2 S3-compatible API: <https://developers.cloudflare.com/r2/get-started/s3/>
- R2 API token: <https://developers.cloudflare.com/r2/api/tokens/>

## Drizzle·Better Auth

- Drizzle SQLite: <https://orm.drizzle.team/docs/sqlite/get-started-sqlite>
- Drizzle SQLite column types: <https://orm.drizzle.team/docs/sqlite/column-types>
- Better Auth 설치: <https://better-auth.com/docs/installation>
- Better Auth Drizzle adapter: <https://better-auth.com/docs/adapters/drizzle>
- Better Auth database schema·migration: <https://better-auth.com/docs/concepts/database>
- Better Auth API key plugin: <https://better-auth.com/docs/plugins/api-key/reference>

## shadcn/ui

- 공식 전체 컴포넌트 목록: <https://ui.shadcn.com/docs/components>
- monorepo: <https://ui.shadcn.com/docs/monorepo>
- theming: <https://ui.shadcn.com/docs/theming>
- React Hook Form: <https://ui.shadcn.com/docs/forms/react-hook-form>

## 프로젝트 로컬 기준

- 코딩 규칙: `/Users/gkn/.config/opencode/llm-rules/`
- 디자인·Hono RPC·모노레포 레퍼런스: `/Users/gkn/flunti-otel`
- 레퍼런스 디자인 ADR: `/Users/gkn/flunti-otel/docs/acknowledge/0018-dashboard-spa-monorepo.md`
- 레퍼런스 3단 셸 ADR: `/Users/gkn/flunti-otel/docs/acknowledge/0021-three-column-shell.md`
- 레퍼런스 UI 수치 검증: `/Users/gkn/flunti-otel/docs/quality-assurance/spa-ui-consistency.md`
