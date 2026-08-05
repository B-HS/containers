# 0035 — 앞단 프록시를 관측 후 승인으로 신뢰한다

- 작성일: 2026-08-05
- 상태: 결정 확정 (구현 완료)
- 선행: [0034](./0034-panel-public-origin-setting.md)
- 대응 커밋: `47e3675`, `7548e95`, `390ee21`, `22f5abe`, `ad8125a`
- 범위: nginx `set_real_ip_from` 를 DB 로 옮기고, 접근 시도된 source 주소·host 를 후보로 보여준 뒤 승인하게 한다

## 1. 배경

[0034](./0034-panel-public-origin-setting.md) 까지의 설계에는 앞뒤가 바뀐 부분이 있었다.

nginx `set_real_ip_from` 에 `10.89.0.10/32`(compose 의 cloudflared 고정 IP)가 박혀 있었다. 그 주소에서 온 요청만 `CF-Connecting-IP` 를 인정하므로, **그 IP를 맞추려고 터널을 compose 안으로 끌어들이고 → compose 가 터널 토큰을 알아야 하는** 상황이 됐다. 사용자의 지적이 정확했다: "compose가 애초에 tunnel token을 왜 알아야 하는데."

진짜 요구사항은 "cloudflared 를 compose 에 넣는 것"이 아니라 **"nginx 가 어떤 주소에서 온 forwarded IP 를 믿을지 아는 것"** 이다.

같은 값이 `compose.yaml` 과 `infra/nginx/nginx.conf` 두 곳에 박혀 있던 것도 문제였다. 하나만 바꾸면 모든 요청이 게이트웨이 IP 하나로 조용히 수렴해 **rate limit 이 전체 공유**로 되돌아간다. 실패가 눈에 띄지 않는다.

## 2. 결정

### 2.1 신뢰 목록은 관측된 값에서 골라 승인한다

운영자가 주소를 외워 타이핑하는 대신, **실제로 들어온 것을 보고 고르게** 한다.

- traffic-worker 가 nginx access log 를 읽어 아직 신뢰하지 않는 source 주소를 후보로 낸다. 원본 `$remote_addr` 이며, traffic DB 에 마스킹 저장되기 **전** 값이다.
- API 가 역방향 DNS 를 붙이고(2초 타임아웃, 실패는 `null`) 요청 수·요청 host 와 함께 보여준다.
- owner 가 승인하면 `set_real_ip_from` 이 승인 목록으로 교체된다.

사용자 표현 그대로다 — "초기 1회만 외부에서 접근 시도하고 로컬에서 패널 띄워서 앞으로는 이 ip는 허락이다."

- **기각한 대안** — 설정 파일이나 환경변수로 주소를 받는다: 지금까지의 방식이고, 두 곳에 박히는 문제가 재발한다.
- **기각한 대안** — traffic DB 의 `access_event` 를 쓴다: 수집 시 `x.y.z.0` 으로 마스킹되므로 `/32` 승인에 못 쓴다. 마스킹은 유지해야 할 프라이버시 설계라 access log 를 직접 읽는다.

### 2.2 공개 주소도 같은 방식으로 후보를 낸다

접근이 시도된 host 를 요청 수·거부 수(catch-all `444`)와 함께 보여주고, 누르면 공개 주소 입력에 들어간다.

**후보 제외 기준은 nginx `server_name` 이 아니라 신뢰 origin 이다.** 처음에는 `server_name` 기준으로 걸렀는데, 그러면 **nginx 는 응답하지만 인증 origin 에 없어 로그인이 403 으로 막히는 host** 가 화면에서 사라진다. 사용자가 실제로 겪은 상황이 정확히 그 케이스였고, 문제가 있는 host 를 숨기는 필터였다.

### 2.3 승인은 owner + 최근 인증 + 감사, 그리고 두 가지 안전장치

- 전체 대역(`0.0.0.0/0`·`::/0`·`any`)과 CIDR 표기는 거부한다. 단일 호스트만 받고 IPv4 는 `/32`, IPv6 는 `/128` 로 적용한다.
- 마지막 한 개는 삭제할 수 없다. nginx 는 `set_real_ip_from` 이 최소 하나 있어야 하고 engine-agent 보호 계약도 그 지시어의 존재를 검사한다.

**실제 클라이언트 IP 를 승인하면 안 된다** — 승인하면 그 클라이언트가 헤더를 위조해 아무 IP나 주장할 수 있다. 화면에는 후보로 뜨므로(그 자체는 정상 관측이다) 운영자가 구분해야 한다.

### 2.4 compose 는 터널을 모른다

`compose.yaml` 의 cloudflared 프로필과 `scripts/migrate-tunnel-to-compose.sh` 를 제거했다. 터널은 호스트 서비스든 다른 리버스 프록시든 각자 방식으로 돌리고, 스택은 토큰을 보지 않는다.

## 3. 검증 (2026-08-05)

단위 15건(`trusted-proxy` nginx 8 + 서비스 7) + 라이브 실측.

- 후보 조회: `10.89.0.1`(터널 진입 주소, host 목록에 `hyuns.uk` 포함), `127.0.0.1`(`ip6-localhost`), 컨테이너 주소들
- 승인 → nginx 가 `10.89.0.10/32` → `10.89.0.1/32` 로 교체되고 후보에서 제거
- `0.0.0.0/0` 승인 **400**, 마지막 1개 삭제 **400**
- 공개 주소 후보: `hyuns.uk | 요청 131 | 거부 39` 가 최상단(거부 39건이 사용자가 겪은 로그인 실패다)
- 외부 `https://hyuns.uk/` **307**, access log 에 `client_ip=1.235.152.6`(실제 클라이언트) 기록 — real_ip 동작 확인

## 4. 이 과정에서 함께 고친 것

- **사이드바 라벨이 키 그대로 표시**: `layout.tsx` 가 메뉴 키를 하드코딩 배열로 들고 있어 새 항목이 번역을 찾지 못했다. `NAV_SECTIONS` 에서 유도하고, 아이콘 맵 누락·라벨 누락·href 중복을 검사하는 테스트를 추가했다(`apps/web/src/shared/lib/navigation.test.ts`).
- **`successResponse` 가 Promise 를 받으면 컴파일 실패**: `get()` 을 async 로 바꾸며 route 에서 `await` 를 빠뜨려 응답이 조용히 `{"data":{}}` 가 됐다. 타입으로 막았다(`apps/api/src/lib/response.ts`).

## 5. 남은 것

- 공개 주소 후보에 `panel.containers.local` 같은 내장 이름도 섞인다. 걸러내려면 이름 목록을 박아야 해서 하지 않았다. 거부 수·요청 수 정렬로 의미 있는 항목이 위로 온다.
- 공개 노출 시 Cloudflare Access 를 앞에 두는 것을 권장한다([EXPOSURE.md](../EXPOSURE.md) §2.1).
