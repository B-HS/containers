# 0034 — 공개 주소를 패널에서 설정하기

- 작성일: 2026-08-05
- 상태: 결정 확정 (구현 완료)
- 선행: [EXPOSURE.md](../EXPOSURE.md), [0033](./0033-agent-execution-guardrails.md)
- 범위: `AUTH_TRUSTED_ORIGINS`·`AUTH_BASE_URL`·nginx `server_name` 을 DB 로 옮겨 패널에서 바꿀 수 있게 한다

## 1. 배경

사용자가 Cloudflare 터널로 `hyuns.uk` 를 붙였더니 502 였다. 원인은 인증 origin 이 아니라 **nginx catch-all** 이었다 — `hyuns.uk` 가 `server_name` 에 없어 `default_server` 의 `return 444`(응답 없이 종료)에 걸렸고 Cloudflare 가 502 로 표시했다.

즉 도메인 하나를 붙이려면 지금까지 **세 곳**을 손으로 맞춰야 했다.

1. nginx `server_name` (없으면 444 → 502)
2. `AUTH_TRUSTED_ORIGINS` (없으면 로그인 403 `INVALID_ORIGIN`)
3. `AUTH_BASE_URL`·`PANEL_PUBLIC_URL` (쿠키 `Secure` 여부와 생성 링크)

하나라도 빠지면 증상이 전부 다르게 나타나서 원인을 짚기 어렵다.

## 2. 결정

### 2.1 "공개 주소" 설정 하나가 세 곳을 함께 처리한다

`GET/PUT /api/panel-settings`(owner + 최근 인증 + 감사)로 공개 주소와 추가 신뢰 origin 을 관리한다. 저장하면 **nginx `server_name` 도 같은 요청에서 적용**된다. origin 만 바꾸고 nginx 를 안 바꿔 502 가 나는 상황을 구조적으로 없앤다.

- **기각한 대안** — 신뢰 origin 만 DB 화: 이번 502 의 원인이 nginx 쪽이라 실제 문제를 해결하지 못한다.

### 2.2 항목별로 반영 시점이 다르고, 그것을 UI 가 말한다

| 항목                    | 저장 위치       | 반영 시점                                                           |
| ----------------------- | --------------- | ------------------------------------------------------------------- |
| 신뢰 origin             | `panel_setting` | **즉시** (better-auth `trustedOrigins` 가 함수를 받는다)            |
| nginx `server_name`     | 관리 config     | **즉시** (저장 시 apply)                                            |
| 쿠키 `Secure`·생성 링크 | `panel_setting` | **API 재시작 후** (auth 인스턴스가 부팅 시 `baseURL` 로 만들어진다) |

`restartRequired` 를 응답에 넣고 패널이 안내한다. "저장했으니 다 됐다"는 잘못된 인상을 주지 않는다.

- **기각한 대안** — 저장 시 auth 인스턴스를 재생성: 진행 중 요청의 세션 처리와 쿠키 속성이 요청 도중에 바뀌어 예측 불가능해진다. 재시작이 더 정직하다.

### 2.3 환경변수 origin 은 언제나 신뢰 목록에 남는다 (잠금 방지)

신뢰 origin 은 인증 경계라 잘못 넣으면 **패널에 로그인할 수 없어 고칠 수도 없는 잠금**이 생긴다. 그래서 `AUTH_TRUSTED_ORIGINS`·`AUTH_BASE_URL` 에서 온 origin 은 DB 값이 무엇이든 항상 유효 목록에 포함한다. DB 는 "추가"만 할 수 있고 "제거"는 못 한다.

기존 GitHub PAT 패턴(환경변수는 bootstrap fallback, 등록값이 우선)과 방향은 같지만, 여기서는 **fallback 이 아니라 하한선**이다 — 잠금 방지가 목적이기 때문이다.

### 2.4 nginx 수정은 AST 로 최소 변경만 한다

`packages/nginx-config/src/panel-hostname.ts` 가 패널 server 블록(`panel.containers.local` 을 가진 블록)의 `server_name` 만 바꾼다. 문자열 치환이 아니라 파서 AST 를 쓰므로 catch-all·api 블록·주석·들여쓰기가 보존된다. 관리 config 보호 계약(관리 경로·real_ip·catch-all 444)은 engine-agent 가 apply 시점에 그대로 재검증한다.

안전장치: 내장 이름을 전부 지우려는 요청은 `null` 을 돌려 apply 하지 않는다. 바뀔 것이 없으면 nginx reload 도 하지 않는다.

## 3. 검증 (2026-08-05)

단위 17건(`panel-hostname` 7 + 패널 설정 서비스 10) + 실제 도메인 `hyuns.uk` 라이브 실측.

- 저장 → `server_name` 이 `panel.containers.local localhost 127.0.0.1 hyuns.uk panel.hyuns.uk` 로 갱신(컨테이너 안에서 확인)
- **재시작 없이** `Origin: https://ops.hyuns.uk` 로그인 200, 등록하지 않은 `https://evil.example.com` 은 403
- 공개 주소를 비우면 `server_name` 에서 해당 hostname 만 제거되고 내장 이름은 유지
- 환경변수 origin 3개는 어떤 저장값에서도 유효 목록에 남음
- 브라우저에서 저장·토스트·`restartRequired` 안내·유효 origin 뱃지 갱신 확인

## 4. 남은 것

- ~~호스트 cloudflared 를 compose 프로필로 옮겨야 한다~~ — **[0035](./0035-trusted-proxy-approval.md) 로 대체됐다.** 당시에는 rate limit 공유와 토큰 `ps` 노출을 "터널을 compose 안으로 옮긴다"로 풀려 했으나, 그러려면 compose 가 터널 토큰을 알아야 해서 앞뒤가 바뀐 설계였다. 지금은 신뢰 프록시를 패널에서 승인하므로 터널을 어디서 돌리든 동작하고 스택은 토큰을 보지 않는다. compose 의 cloudflared 프로필과 마이그레이션 스크립트는 제거됐다.
- 공개 노출 시 Cloudflare Access 를 앞에 두는 것을 권장한다([EXPOSURE.md](../EXPOSURE.md) §2.1).
