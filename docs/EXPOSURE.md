# 외부 노출과 TLS

관리 패널과 외부 API를 호스트 밖으로 노출하는 방법을 정리한다. 기본 스택은 노출하지 않는다. 노출은 두 경로 중 하나를 골라 opt-in 으로 켠다.

| 경로            | 사용 시점                                  | TLS 종단            | 켜는 방법                                       |
| --------------- | ------------------------------------------ | ------------------- | ----------------------------------------------- |
| 로컬 전용(기본) | 단일 호스트에서 브라우저로만 접속          | 없음(평문 loopback) | 아무것도 하지 않는다                            |
| Cloudflare 터널 | 공인 IP·포트 개방 없이 도메인으로 노출     | Cloudflare edge     | `--profile cloudflared`                         |
| 직접 TLS 종단   | 터널을 쓸 수 없고 443을 직접 열 수 있을 때 | 이 스택의 nginx     | `infra/nginx/compose.tls.example.yaml` override |

## 1. 기본값 — 로컬 전용

`compose.yaml`의 유일한 publish는 `${PANEL_BIND_ADDRESS:-127.0.0.1}:${PANEL_PORT:-8080}:8080`이다. 인증서도 443 listener도 없고, 인증 origin은 `http://127.0.0.1:18080`으로 고정돼 있다. 이 상태에서 접속은 `http://127.0.0.1:18080` 또는 `http://localhost:18080`만 동작한다.

nginx는 알 수 없는 Host로 온 요청을 catch-all `default_server`에서 `444`로 끊는다. 즉 `server_name`에 등록된 이름(`panel.containers.local`, `localhost`, `127.0.0.1`)이 아닌 Host로는 패널도 `/api/*`도 응답하지 않는다. 새 도메인을 붙일 때는 반드시 `server_name`에 그 도메인을 추가해야 한다(3절·5절).

**하지 말 것**: `PANEL_BIND_ADDRESS=0.0.0.0`으로 바꿔 평문 8080을 인터넷에 여는 것. 세션 쿠키와 API 키가 그대로 평문으로 흐른다. 노출이 필요하면 아래 두 경로 중 하나를 쓴다.

## 2. 노출 경로 A — Cloudflare 터널 (권장)

호스트에 inbound 포트를 열지 않고 outbound 연결만으로 노출한다.

### 2.1 준비

1. Cloudflare 대시보드에서 remotely-managed named tunnel을 만들고 tunnel token을 발급한다.
2. public hostname 두 개를 tunnel에 연결한다.
    - `panel.example.com` → service `http://nginx:8080`
    - `api.example.com` → service `http://nginx:8080`
    - 두 경로 모두 origin으로 원본 Host 헤더를 그대로 전달해야 한다. Host를 덮어쓰면 catch-all이 `444`로 끊는다.
3. 패널 hostname은 Cloudflare Access로 한 번 더 감싸는 것을 권장한다.

### 2.2 토큰 주입

토큰은 저장소에 넣지 않는다. `CLOUDFLARE_TUNNEL_TOKEN`을 compose를 실행하는 셸 환경 또는 호스트의 secret store에서만 주입한다. 이 값은 tunnel의 전체 제어 권한이므로 로그·문서·이슈에 붙여넣지 않는다.

```sh
export CLOUDFLARE_TUNNEL_TOKEN=<대시보드에서 발급한 토큰>
docker compose --profile cloudflared up -d
```

### 2.3 스택 설정

`cloudflared` 서비스는 `profiles: [cloudflared]`라 기본 `docker compose up`에는 포함되지 않는다.

- `edge` 네트워크에만 붙는다. `control`·`ingress`·`probe`는 `internal: true`라 Cloudflare로 나가는 outbound 연결을 만들 수 없어 쓸 수 없다.
- Docker socket을 마운트하지 않는다. `cap_drop: ALL`, `read_only: true`, `no-new-privileges`로 실행한다.
- `edge` 네트워크 안의 고정 IP(`${CLOUDFLARED_ADDRESS:-10.89.0.10}`)를 받는다. 이 IP가 nginx real_ip의 유일한 신뢰 대역이다(4절).
- nginx가 healthy가 된 뒤에 기동한다.

터널을 쓰는 동안 호스트 publish는 loopback으로 유지한다(`PANEL_BIND_ADDRESS=127.0.0.1`). 외부 진입은 터널 하나로 좁힌다.

### 2.4 함께 바꿔야 하는 값

| 변수                   | 값 예시                                                              |
| ---------------------- | -------------------------------------------------------------------- |
| `PANEL_PUBLIC_ORIGIN`  | `https://panel.example.com`                                          |
| `AUTH_TRUSTED_ORIGINS` | `https://panel.example.com`                                          |
| `PANEL_BIND_ADDRESS`   | `127.0.0.1` (유지)                                                   |
| nginx `server_name`    | 패널 server 블록에 `panel.example.com`, api 블록에 `api.example.com` |

## 3. 노출 경로 B — 직접 TLS 종단

터널을 쓸 수 없을 때만 선택한다. 인증서 갱신과 443 개방을 직접 책임져야 한다.

1. 인증서를 호스트 디렉터리에 둔다. 파일명은 `fullchain.pem`, `privkey.pem`이며 컨테이너에 read-only로 마운트된다.
2. 패널의 nginx 전체 설정 편집 화면에서 `infra/nginx/nginx-tls.conf.example` 내용을 붙여넣고, `server_name`의 `panel.example.com`·`api.example.com`을 실제 도메인으로 바꿔 적용한다. 적용은 `nginx -t`와 post-reload probe를 통과해야 반영된다.
3. override를 얹어 443을 publish한다.

```sh
export PANEL_TLS_CERT_DIR=/etc/containers/certs
docker compose -f compose.yaml -f infra/nginx/compose.tls.example.yaml up -d
```

기본 `infra/nginx/nginx.conf`에는 `listen 443 ssl`을 넣지 않는다. 인증서 파일이 없으면 nginx가 기동 자체를 실패해 패널까지 함께 죽기 때문이다. TLS listener는 인증서를 준비한 뒤 설정 적용으로만 켠다.

순서를 지킨다. override를 먼저 올리면 8443 listener가 없어 443 연결이 거부되고, 설정만 먼저 적용하면 인증서 마운트가 없어 reload가 실패해 이전 revision으로 롤백된다.

| 변수                     | 값 예시                                                             |
| ------------------------ | ------------------------------------------------------------------- |
| `PANEL_TLS_CERT_DIR`     | `/etc/containers/certs` (`fullchain.pem`·`privkey.pem` 포함)        |
| `PANEL_TLS_BIND_ADDRESS` | `0.0.0.0`                                                           |
| `PANEL_TLS_PORT`         | `443`                                                               |
| `PANEL_PUBLIC_ORIGIN`    | `https://panel.example.com`                                         |
| `AUTH_TRUSTED_ORIGINS`   | `https://panel.example.com`                                         |
| `PANEL_BIND_ADDRESS`     | `127.0.0.1` (평문 8080은 loopback 유지, healthcheck·로컬 접속 전용) |

이 경로에서는 nginx가 직접 TLS를 종단하므로 앞단 프록시가 없다. `$remote_addr`이 이미 원본 client IP이며 real_ip 치환은 개입하지 않는다.

## 4. real_ip 신뢰 경계

`nginx.conf`는 다음 세 줄로 프록시 뒤 원본 IP를 복구한다.

```nginx
set_real_ip_from 10.89.0.10/32;
real_ip_header CF-Connecting-IP;
real_ip_recursive on;
```

- 신뢰 대역은 `edge` 네트워크의 cloudflared 고정 IP **하나**다. 게이트웨이(`10.89.0.1`)도, 다른 컨테이너도 포함하지 않는다. 이 대역 밖에서 온 요청의 `CF-Connecting-IP`는 무시되므로 헤더 위조로 rate limit 키를 바꿀 수 없다.
- real_ip 모듈은 `$remote_addr` 자체를 치환한다. 따라서 `map $remote_addr $containers_client_ip`, `limit_req_zone $containers_client_ip`(로그인 5r/m, API 300r/m), access log `client_ip`, upstream으로 나가는 `X-Real-IP`가 모두 자동으로 원본 IP 기준이 된다.
- Cloudflare가 아닌 다른 reverse proxy를 앞에 둔다면 `real_ip_header`를 `X-Forwarded-For`로 바꾸고 `set_real_ip_from`을 그 프록시 주소로 좁힌다.
- `EDGE_SUBNET`이나 `CLOUDFLARED_ADDRESS`를 바꾸면 `nginx.conf`의 `set_real_ip_from`도 같이 바꿔야 한다. 바꾸지 않으면 모든 요청이 다시 게이트웨이 IP 하나로 수렴한다.

`infra/nginx/nginx.conf`는 `/etc/nginx/managed/current.conf`가 없을 때만 복사되는 기본값이다. 이미 기동한 적이 있는 호스트는 관리 볼륨의 기존 설정이 계속 쓰이므로, real_ip와 catch-all을 반영하려면 패널의 nginx 전체 설정 편집 화면에서 새 내용을 적용해야 한다.

engine-agent의 보호 계약은 `set_real_ip_from`과 `real_ip_header`가 존재하는지 검사하고, `0.0.0.0/0`·`::/0`·`any` 같은 전체 대역 신뢰를 거부한다. 대역을 다른 CIDR로 좁히거나 옮기는 변경은 허용된다.

## 5. 도메인 전환 체크리스트

- [ ] DNS 또는 tunnel public hostname이 패널·API 도메인을 이 스택으로 보낸다.
- [ ] nginx 패널 server 블록 `server_name`에 패널 도메인을 추가했다. (누락 시 catch-all `444`)
- [ ] nginx api server 블록 `server_name`에 API 도메인을 추가했다.
- [ ] `PANEL_PUBLIC_ORIGIN`을 `https://<패널 도메인>`으로 바꿨다. (`AUTH_BASE_URL`·`PANEL_PUBLIC_URL`이 이 값을 쓴다)
- [ ] `AUTH_TRUSTED_ORIGINS`에 그 origin을 넣었다. 누락하면 로그인이 `403 INVALID_ORIGIN`으로 막힌다.
- [ ] origin이 `https`인지 확인했다. `http`로 두면 세션 쿠키에 `Secure`·`__Secure-` 접두사가 붙지 않고, 나중에 `https`로 고치면 쿠키 이름이 바뀌어 기존 세션이 전부 끊긴다.
- [ ] real_ip 신뢰 대역이 실제 앞단 프록시 주소와 일치한다(4절).
- [ ] 전환 후 access log의 `client_ip`가 게이트웨이 IP가 아니라 원본 IP인지 확인했다.
- [ ] 등록하지 않은 임의 Host로 요청했을 때 응답이 끊기는지 확인했다.
- [ ] 로그인·`/api/health`·SSE·WebSocket이 새 도메인에서 동작하는지 확인했다.

## 6. 하지 말아야 할 것

- 평문 `0.0.0.0:8080` 노출. 패널 세션 쿠키와 API 키가 그대로 흐른다.
- tunnel token·인증서 개인키를 저장소나 이미지에 넣는 것.
- `set_real_ip_from`을 `0.0.0.0/0`으로 넓히는 것. 누구나 client IP를 위조해 rate limit과 감사 로그를 무력화할 수 있다. 보호 계약이 거부한다.
- catch-all `default_server`를 지우거나 패널 server 블록으로 되돌리는 것. 임의 Host와 아직 라우트가 없는 워크로드 도메인이 관리 패널을 그대로 노출하게 된다. 보호 계약이 거부한다.
- cloudflared에 Docker socket이나 `control`·`probe` 네트워크를 붙이는 것.
