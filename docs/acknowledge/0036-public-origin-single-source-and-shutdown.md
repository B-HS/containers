# 0036 — 공개 주소를 단일 출처로 만들고 종료를 드레인한다

- 작성일: 2026-08-05
- 상태: 결정 확정 (구현 완료)
- 선행: [0034](./0034-panel-public-origin-setting.md), [0035](./0035-trusted-proxy-approval.md)
- 범위: 실운영 점검에서 확인된 6건(쿠키 Secure, owner 제거 불가, 보호 hostname, 초대 링크, 세션 토큰 노출, graceful shutdown)

## 1. 배경

[0035](./0035-trusted-proxy-approval.md) 이후 실제 도메인(`hyuns.uk`)으로 외부 접속을 열고 점검한 결과, 공개 주소를 패널에서 저장해도 **부팅 시점에 고정된 값들이 따라오지 않는** 문제가 남아 있었다. 실측으로 확인한 것들이다.

- 외부 HTTPS 로그인 응답의 세션 쿠키에 `Secure` 가 없었다. `useSecureCookies` 가 부팅 `AUTH_BASE_URL`(`http://127.0.0.1:18080`)로 결정되기 때문이다. 패널이 "재시작 필요"라고 안내하지만 **재시작해도 안 고쳐진다** — env 를 손으로 고쳐야 했다.
- 초대 링크가 `http://127.0.0.1:18080/accept-invitation?...` 로 나갔다. 외부 초대자가 열 수 없다.
- `protectedHostnames` 가 부팅 배열이라 공개 주소가 빠져 있었다. 패널 자신의 도메인으로 프록시 라우트를 만드는 것이 API 에서 안 막혔다.
- `GET /api/session` 이 세션 토큰 원문을 반환했다. 쿠키를 HttpOnly 로 둔 이유를 무효화한다.
- owner 계정은 삭제도 비활성화도 불가능했다(`OWNER_IMMUTABLE` 409). 자격증명이 유출돼도 지원되는 대응 경로가 없었다.
- `SIGTERM` 핸들러가 없었다.

## 2. 결정

### 2.1 부팅 시 DB 의 공개 주소가 env 를 대체한다

`AUTH_BASE_URL`·`PANEL_PUBLIC_URL` 은 **fallback 으로 강등**한다. api 는 부팅 시 `panel_setting.publicOrigin` 을 먼저 읽어 auth baseURL·초대 링크·보호 hostname 초기값으로 쓴다. 이제 `restartRequired` 가 실제로 의미를 갖는다.

환경변수 origin 은 [0034](./0034-panel-public-origin-setting.md) 대로 신뢰 목록의 하한선으로 계속 남아, 공개 주소를 잘못 저장해도 loopback 로그인이 잠기지 않는다.

### 2.2 쿠키 Secure 는 요청마다 결정한다

Better Auth 는 `useSecureCookies` 를 **생성 시 한 번** 계산한다(`dist/cookies/index.mjs` 의 `createCookieGetter`). `true` 로 두면 loopback http 로그인이 죽고, `false` 면 공개 https 가 취약하다. 둘 다 지원할 방법이 옵션에 없다.

그래서 `useSecureCookies: false` 로 고정하고, **응답 미들웨어가 `x-forwarded-proto` 가 https 일 때 `Secure` 를 덧붙인다**(`apps/api/src/lib/secure-cookie.ts`). 쿠키 **이름은 바꾸지 않는다** — better-auth 의 `__Secure-` prefix 를 붙이면 읽는 쪽 이름이 어긋나 기존 세션이 끊긴다.

`$scheme` 은 nginx 기준이라 TLS 가 앞단에서 끝나면 항상 `http` 다. 그래서 nginx 가 앞단 프록시의 `X-Forwarded-Proto` 를 map 으로 받아 넘긴다.

```
map $http_x_forwarded_proto $containers_forwarded_proto {
    default $scheme;
    https https;
}
```

값을 위조해 `https` 로 만들면 쿠키가 **더 엄격해질 뿐**이라 안전한 방향이다. `http` 로 떨어뜨리려면 이미 경로상의 프록시여야 하고, 그 위치면 쿠키를 직접 본다. HSTS 에 `includeSubDomains` 를 더해 최초 방문 이후 평문 요청 자체를 막는다.

- **기각한 대안** — 공개 주소가 https 면 `useSecureCookies: true`: loopback http 로그인이 죽는다. 터널이 끊기면 운영자가 들어갈 길이 없어진다.
- **기각한 대안** — nginx `proxy_cookie_flags`: 플래그에 변수를 못 써서 요청별 분기가 안 된다.

### 2.3 자기 자신만 불변이다

`OWNER_IMMUTABLE`(owner 전체 보호)을 `SELF_MODIFICATION_FORBIDDEN`(행위자 자신만)으로 바꾸고, `DELETE /api/users/:id` 를 추가했다. 세션·account·역할을 함께 지우고 API key 를 폐기한다.

"활성 owner 가 마지막 한 명이면 막는다"는 별도 가드는 **넣었다가 뺐다.** owner 만 이 API 를 호출할 수 있고 자기 자신은 대상이 될 수 없으므로, 대상이 owner 라면 행위자 owner 가 항상 남는다. 도달 불가능한 분기라 죽은 코드다. 마지막 owner 는 이 두 규칙만으로 보존된다.

**`z.uuid()` 제약도 함께 걷어냈다.** better-auth 가 sign-up 으로 만든 계정은 UUID 가 아닌 자체 형식 id 를 쓴다(`0ZMUeMrrT53V6iFTgYVOn8BhpylXpqfG`). 그래서 **bootstrap owner 는 PATCH·DELETE 가 400 으로 튕겨** 애초에 관리 대상이 아니었다. `z.string().trim().min(1)` 로 바꿨다.

### 2.4 세션 응답은 요약만 준다

`GET /api/session` 은 `expiresAt`·`role`·`user(id/email/name)` 만 반환한다(`sessionSummarySchema`). 웹은 `role` 과 `user` 만 쓰므로 영향이 없다.

### 2.5 종료는 상한 있는 드레인이다

`Bun.serve` 핸들을 잡고 `SIGINT`/`SIGTERM` 에서 job worker → 주기 작업 → HTTP 드레인 → DB 닫기 순으로 정리한다. 각 단계는 실패해도 다음을 막지 않는다.

드레인은 **상한이 필요하다.** 처음엔 `server.stop(false)` 만 썼는데, 실측에서 SSE 스트림 하나가 드레인을 **22초** 붙잡았다. compose 기본 grace 10초면 SIGKILL 이다. 그래서 8초까지 기다린 뒤 `server.stop(true)` 로 강제 종료하고, `stop_grace_period: 20s` 를 명시했다. 실측 재확인: SSE 를 문 상태로 `docker compose stop` → **12초, exit 0**.

## 3. 검증 (2026-08-05)

단위 407건 통과. 라이브 실측은 전부 실제 도메인·실행 스택 기준이다.

| 항목                          | 실측                                                                                                     |
| ----------------------------- | -------------------------------------------------------------------------------------------------------- |
| 외부 HTTPS 로그인 쿠키        | `...; HttpOnly; SameSite=Lax; Secure` + `strict-transport-security: max-age=31536000; includeSubDomains` |
| 로컬 HTTP 로그인              | 200, `Secure` 없음(그대로 동작)                                                                          |
| `GET /api/session`            | `{expiresAt, role, user{id,email,name}}` — token 없음                                                    |
| `hyuns.uk` 프록시 라우트 생성 | 409 `NGINX_ROUTE_PROTECTED_HOSTNAME`                                                                     |
| 초대 링크                     | `https://hyuns.uk/accept-invitation`                                                                     |
| owner 삭제                    | 200, 목록에서 제거                                                                                       |
| 자기 자신 삭제                | 409 `SELF_MODIFICATION_FORBIDDEN`                                                                        |
| SSE 물린 채 SIGTERM           | 12초, exit 0                                                                                             |
| 패널 화면                     | `/ko`·`/ko/panel-settings`·`/ko/trusted-proxies`·`/ko/users` 200, 외부 `https://hyuns.uk/ko` 200         |
| `audit:runtime`               | 5/5                                                                                                      |

## 4. 함께 고친 것 — seed 스크립트가 손상시킨 timestamp

점검 중 `GET /api/users` 가 500 이었다. `scripts/seed-e2e.ts` 가 `Date.now()`(밀리초)를 `mode: 'timestamp'`(초) 컬럼에 써서, drizzle 이 그 값을 초로 읽어 서기 58000년대 `Date` 가 되고 `z.iso.datetime()` 파싱이 실패했다. `user`·`account`·`user_role` 18개 값이 손상돼 있었다.

migration `0017` 로 임계값(`> 100000000000`) 초과 값을 초로 되돌리고, 스크립트를 고치고, 단위가 다시 어긋나면 실패하는 테스트를 넣었다. 이 결함은 **정적 검사를 전부 통과한 상태**였고 실제 API 호출로만 드러났다.

## 5. 남은 것

- Cloudflare Access 미적용. 패널이 공개 인터넷에 열려 있다 → [EXPOSURE.md](../EXPOSURE.md) §2.1.
- 터널이 아직 `--token` 인자로 실행 중이라 `ps` 에 노출된다. `cloudflared service install` 로 옮기는 것은 운영자 작업이다.
- HSTS `preload` 는 넣지 않았다. 등재는 되돌리기 어려워 운영자 판단이 필요하다.
