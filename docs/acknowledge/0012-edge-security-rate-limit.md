# 0012 — Edge security header와 다층 rate limit

## 상태

구현·런타임 검증 완료.

## 결정

- Cloudflare Tunnel이 전달하는 `CF-Connecting-IP`를 우선 client key로 사용하고, 헤더가 없을 때 direct peer 주소로 대체한다.
- Nginx에서 로그인과 일반 API를 별도 shared-memory zone으로 제한하고 초과 상태를 `429`로 고정한다.
- API 경계에서도 source별 로그인 제한을 유지하고, API key 인증은 key ID별 독립 minute window를 적용한다.
- 패널과 외부 API hostname에 서로 다른 최소 보안 header 집합을 적용한다.
- raw Nginx 설정의 보호 계약에 rate zone, `429`, CSP와 clickjacking 방어 token을 포함한다.

## 구현상 주의

Nginx upstream zone과 limit request zone은 같은 shared-memory namespace를 사용한다. 따라서 upstream `containers_api`와 충돌하지 않도록 rate zone은 `containers_api_rate`, `containers_auth_rate`라는 고유 이름을 사용한다.

패널 CSP는 현재 Next.js SSR와 hydration 요구 때문에 script/style의 inline 실행을 허용한다. `object-src 'none'`, `frame-ancestors 'none'`, same-origin 연결·form 제한으로 나머지 표면을 좁혔으며 nonce 기반 CSP는 후속 강화 항목이다.

## 검증 증거

- 후보 설정은 실제 `nginx -t`를 통과한 뒤 SHA 기반 원자 교체와 HUP으로 적용됐다.
- 적용 SHA: `ccbe28ce36ba39e7b241950bc810f8b8477ea9a3c8814670594baf7b1e2f7d11`.
- 실제 패널·외부 API 응답에서 설정한 보안 header를 확인했다.
- 12회의 연속 무효 로그인 중 최초 6회는 인증 응답, 이후 6회는 `429`였다.
- Chromium에서 인증된 SSR dashboard 전체 렌더링과 client button event를 확인했다.
- Nginx 보호 계약, application 로그인 제한, API key 제한 단위 테스트가 통과했다.

## 운영 한계

origin이 localhost에만 bind되고 Cloudflare Tunnel을 통해서만 원격 접근된다는 전제가 `CF-Connecting-IP` 신뢰를 성립시킨다. macOS 로컬 프로세스의 header 위조를 별도로 막는 경계는 아니며, Tunnel 구성 시 origin 공개 port를 추가하면 안 된다.
