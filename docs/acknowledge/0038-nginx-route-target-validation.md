# 0038 — 라우트 대상 컨테이너를 서버에서 검증한다

- 작성일: 2026-08-05
- 상태: 결정 확정 (구현 완료)
- 대응 커밋: `027e08b`, `e76fb67`
- 근거: [quality-assurance/2026-08-05-panel-ux-audit.md](../quality-assurance/2026-08-05-panel-ux-audit.md) P0-1·P0-2

## 1. 배경

프록시 라우트의 대상이 **세 겹 모두에서 검증되지 않았다.**

1. 웹 — `nginx-route-create-form.tsx` 가 `<Input list="route-container-options">` + `<datalist>`. 같은 폼의 protocol 은 진짜 `<Select>` 라, 디자인시스템이 없어서가 아니라 선택하지 않은 것이었다.
2. 계약 — `packages/contracts/src/nginx.ts` 가 이름 형식만 봤다.
3. 서버 — `create-nginx-proxy-route-service.ts` 는 보호 hostname·보호 대상·경로 충돌만 봤다. **서비스 의존성에 컨테이너 조회 수단 자체가 없었다.**

여기에 렌더된 설정이 변수 `proxy_pass` 를 쓴다.

```nginx
set $containers_route_upstream "http://<container>:<port>";
proxy_pass $containers_route_upstream;
```

변수 형태라 nginx 가 기동 시점에 upstream 을 해석하지 않는다. 그래서 **`nginx -t` 도 리로드도 성공**하고, 라우트 테이블에도 정상으로 보이며, 도메인에 접속해야 502 로만 드러난다. 감사에서 흐름 4단계 실패의 최빈 경로로 지목됐다.

포트도 문제였다. 컨테이너 요약 계약에 포트가 없어서, 사용자가 포트를 알려면 `/containers` → 상세 → raw JSON 덤프에서 눈으로 찾아 외운 뒤 `/nginx/routes` 로 돌아가야 했다.

## 2. 결정

### 2.1 요약 계약에 포트와 네트워크를 싣는다

`containerSummarySchema` 에 `exposedPorts`·`networks` 를 추가한다. Docker `/containers/json` 응답의 `Ports`·`NetworkSettings.Networks` 를 파싱한다. 이 하나의 변경이 "포트를 알 수 없다"와 "도달 가능한지 알 수 없다"를 동시에 푼다.

관리 plane 필터(`isManagementPlaneResource`)는 그대로 둔다. 감사에서 "관리 plane 컨테이너가 후보에 노출된다"는 발견이 반증 검증까지 통과했지만 **실제로는 이미 걸러지고 있었다** — 오탐이었다.

### 2.2 서버가 대상을 검증한다

`create`·`upsert` 양쪽에서 확인한다.

- 대상 컨테이너가 없으면 `NGINX_ROUTE_TARGET_NOT_FOUND` (400)
- **실행 중인데** nginx 와 공유하는 네트워크가 없으면 `NGINX_ROUTE_TARGET_UNREACHABLE` (400)

**서버 검증이 본체다.** API key 경로로도 같은 실수가 가능하므로 웹 Select 는 편의일 뿐이다.

**중지된 컨테이너는 허용한다.** 라우트를 미리 만들어 두는 것은 정당한 사용이고, 중지 상태에서는 네트워크 목록이 비어 있어 도달 가능성을 판단할 수 없다.

도달 가능한 네트워크는 `ROUTABLE_NETWORK_NAMES` 환경변수로 받는다(기본 `containers_edge`, compose 가 명시). 기존 `PROBE_NETWORK_NAME`·`CONTROL_NETWORK_NAME` 과 같은 방식이라 값이 두 곳에 박히지 않는다.

- **기각한 대안** — nginx 컨테이너의 네트워크를 조회해 자동 판별: `getContainers` 가 관리 plane 을 필터하므로 nginx 자신이 목록에 없다. 조회용 엔드포인트를 새로 여는 것은 범위 초과다.
- **기각한 대안** — 실행 중이 아니면 거부: 위의 정당한 사용을 막는다.

### 2.3 웹은 목록에서 고르게 한다

`Input+datalist` → `Select`. 후보는 SSR 스냅샷 `string[]` prop 대신 `useGetContainerList()` 로 구독해 **같은 세션에서 만든 컨테이너도 바로 나타난다.** 옵션에 상태·노출 포트·도달 불가 표시를 함께 보이고, 고르면 첫 노출 포트로 포트를 채운다.

## 3. 검증 (2026-08-05)

단위 4건 추가(총 14건) + 라이브 실측.

| 대상                                          | 결과                                 |
| --------------------------------------------- | ------------------------------------ |
| 없는 컨테이너                                 | 400 `NGINX_ROUTE_TARGET_NOT_FOUND`   |
| `bridge` 네트워크의 실행 중 컨테이너(`poc1d`) | 400 `NGINX_ROUTE_TARGET_UNREACHABLE` |
| `containers_edge` 의 실행 중 컨테이너         | 201 생성                             |
| 중지된 컨테이너 (단위)                        | 생성 허용                            |
| 배포 경로 `upsert` (단위)                     | 같은 검증 적용                       |

배포 릴리스는 컨테이너를 `manifest.network` 에 연결한 **뒤** 라우트를 upsert 하므로(`create-deployment-release-service.ts`) 이 검증이 배포를 막지 않는다. 실측에서 순정 nginx 배포가 정상 완주했다.
