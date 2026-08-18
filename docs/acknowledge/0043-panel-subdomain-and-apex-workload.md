# 0043 — 패널은 서브도메인에 두고 apex 는 워크로드에 넘긴다

- 작성일: 2026-08-18
- 상태: 결정 확정 (패널 주소 전환 완료, apex 라우트 등록은 운영자 작업으로 남음)
- 선행: [0034](./0034-panel-public-origin-setting.md), [0036](./0036-public-origin-single-source-and-shutdown.md), [0038](./0038-nginx-route-target-validation.md)
- 범위: 공개 주소 배치, Cloudflare Tunnel 의 와일드카드와 apex 관계

## 1. 배경

패널 공개 주소를 apex(`hyuns.uk`)로 두고 운영하려다 Cloudflare **Error 1016 Origin DNS error** 를 만났다. 터널에는 `*.hyuns.uk` public hostname 이 등록돼 있었고 서브도메인은 정상 동작했다.

원인은 DNS 표준 동작이다. **와일드카드 레코드 `*.example.com` 은 apex `example.com` 을 커버하지 않는다.** 와일드카드는 한 단계 이상의 레이블이 앞에 붙은 이름에만 매칭된다. 권위 네임서버에 직접 물어 확인했다.

```
$ dig @jason.ns.cloudflare.com panel.hyuns.uk A +short
104.21.9.127 / 172.67.130.220        ← 와일드카드가 응답
$ dig @jason.ns.cloudflare.com hyuns.uk A +short
                                      ← 레코드 없음
```

apex 를 열려면 public hostname(또는 DNS CNAME)을 **하나 더** 등록해야 한다. 등록하면 Cloudflare 의 CNAME flattening 으로 apex 에 A 레코드가 생긴다.

## 2. 결정

### 2.1 패널은 서브도메인, apex 는 워크로드

패널 공개 주소를 `https://panel.hyuns.uk` 로 두고, apex 는 사용자 워크로드에 넘긴다.

결정적인 이유는 편의가 아니라 **보호 hostname** 이다. `apps/api/src/server.ts` 는 패널 공개 주소의 hostname 을 보호 목록에 넣는다.

```typescript
protectedHostnames: ['api.containers.local', 'panel.containers.local', new URL(panelPublicUrl).hostname]
```

패널을 apex 에 두면 `hyuns.uk` 가 보호 대상이 되어, 그 도메인으로 워크로드 프록시 라우트를 만들 때 `NGINX_ROUTE_PROTECTED_HOSTNAME`(409)로 막힌다. 패널이 자기 도메인을 남에게 넘기지 못하게 막는 안전장치가 의도대로 동작하는 것이므로, 우회하는 대신 배치를 바꾼다.

부수적으로 서브도메인은 이미 있는 와일드카드로 즉시 동작해 DNS 작업이 필요 없다.

- **기각한 대안** — apex 를 패널로 두고 보호 목록에서 빼기: 안전장치를 목적과 반대로 약화시킨다. 패널 도메인을 임의의 컨테이너로 가로챌 수 있게 된다
- **기각한 대안** — 워크로드마다 서브도메인만 쓰기: apex 로 서비스하고 싶다는 요구 자체를 부정한다. 와일드카드가 이미 있으므로 apex 하나만 추가하면 되는 일이다

### 2.2 환경변수는 하한선, 정본은 패널 설정

[0036](./0036-public-origin-single-source-and-shutdown.md) 의 결정을 유지한다. `compose.override.yaml` 의 값은 fallback 이자 신뢰 origin 하한선이고, 운영 중 정본은 `panel_setting.publicOrigin` 이다.

이번 사고 시점의 스택은 마이그레이션이 11/27 세대라 `panel_setting` 테이블 자체가 없었다. 그래서 패널 화면에서 공개 주소를 저장하는 정식 경로가 존재하지 않았고, env 를 고치는 것 외에 방법이 없었다. **재빌드 없이 오래 운영한 스택에서는 문서에 적힌 정식 경로가 아직 없을 수 있다.**

override 에 넣는 값은 loopback 을 함께 유지한다. 공개 경로가 막혀도 들어갈 길이 필요하다.

```yaml
AUTH_TRUSTED_ORIGINS: https://panel.hyuns.uk,http://127.0.0.1:18080,http://localhost:18080
```

### 2.3 터널은 호스트를 구분하지 않는다

Cloudflare Tunnel 의 public hostname 은 `*.hyuns.uk` 든 `hyuns.uk` 든 전부 같은 `http://127.0.0.1:18080` 으로 보낸다. **어느 컨테이너로 갈지는 패널의 프록시 라우트가 단독으로 결정한다.**

터널에 hostname 을 추가하는 것과 그 hostname 을 여는 것은 별개다. 라우트를 등록하지 않은 hostname 은 catch-all 이 `444` 로 끊는다. 터널 설정만 보고 "열렸다"고 판단하지 않는다.

## 3. 운영 절차

apex 를 워크로드로 보내려면 두 곳을 건드린다.

1. **Cloudflare Zero Trust** — Networks > Tunnels > 터널 > Public Hostname > Add. Subdomain 칸을 **비우고** Domain 을 고른다. Type HTTP, URL 은 패널 publish 주소
2. **패널 프록시 라우트** — 공개 hostname 에 apex, 대상 컨테이너와 내부 port 를 넣는다. 대상은 `containers_edge`(`ROUTABLE_NETWORK_NAMES`)에 붙어 있어야 한다([0038](./0038-nginx-route-target-validation.md))

로컬 리졸버가 이전 NXDOMAIN 을 네거티브 캐싱하고 있으면 레코드가 생겨도 한동안 해석되지 않는다. 권위 네임서버에 직접 묻거나(`dig @<ns> <domain>`) `curl --resolve` 로 우회해 확인하고, macOS 는 `sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder` 로 비운다.
