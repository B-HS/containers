# 낡은 current.conf 가 보호 계약을 만족하지 못해 프록시 라우트를 만들 수 없다

- 발견일: 2026-08-18
- 심각도: high — 패널에서 프록시 라우트를 한 건도 추가할 수 없다. 화면에는 원인을 알 수 없는 409 만 뜬다
- 발견 경로: apex 도메인을 워크로드 컨테이너로 보내려고 라우트를 추가하다 확인

## 증상

패널의 프록시 라우트 화면에서 라우트를 저장하면 아래 오류로 거부된다.

```
관리 plane에서 보호하는 Nginx 계약을 변경할 수 없습니다.
```

입력값에는 문제가 없다. hostname·대상 컨테이너·port 가 모두 유효하고, 대상 컨테이너는 `containers_edge` 에 붙어 running 상태이며 nginx 에서 내부 도달도 된다. 그런데도 저장이 되지 않는다.

## 원인

`apps/engine-agent/src/service/domain/create-nginx-config-service.ts` 의 `verifyProtectedContract` 는 **적용하려는 설정 전체**가 관리 plane 계약을 만족하는지 검사한다. 라우트 추가는 기존 설정에 server 블록을 끼워 넣어 다시 적용하는 동작이므로, 추가되는 블록이 아니라 **기존 설정이 계약을 어기고 있어도** 여기서 걸린다.

계약 중 하나가 catch-all 서버다.

```
server { listen 8080 default_server; server_name _; return 444; }
```

그런데 관리 볼륨의 `current.conf` 는 2026-08-02 에 만들어진 세대라 이 블록이 없었다. `default_server` 가 패널 블록(`server_name panel.containers.local`)에 붙어 있고 `return 444` 는 파일 전체에 한 번도 나오지 않았다.

```
$ grep -c "return 444" current.conf
0
```

`hasCatchAllServer` 가 false 를 반환하면서 `NGINX_PROTECTED_CONTRACT`(409)가 던져진다. 라우트 입력과는 아무 상관이 없어 화면만 봐서는 원인을 짐작할 수 없다.

nginx 설정의 정본은 저장소의 `infra/nginx/nginx.conf` 가 아니라 **관리 볼륨의 `current.conf`** 다. 그래서 이미지를 재빌드해 최신 템플릿이 들어와도, 볼륨에 옛 파일이 있는 한 그것이 계속 쓰인다. `infra/nginx/entrypoint.sh` 는 `current.conf` 가 **없을 때만** 템플릿을 복사한다.

```sh
if [ ! -f /etc/nginx/managed/current.conf ]; then
    cp /opt/containers/default-nginx.conf /etc/nginx/managed/current.conf
```

즉 스택을 오래 운영할수록 관리 설정과 코드가 요구하는 계약의 세대 차이가 벌어지고, 어느 순간 계약을 건드리는 기능(프록시 라우트·패널 hostname 등록)이 통째로 막힌다.

## 조치

### 즉시 복구

옛 `current.conf` 를 치우고 nginx 를 재시작하면 entrypoint 가 최신 템플릿을 복사한다. 등록된 라우트가 있으면 먼저 확인한다 — 이 사고 시점에는 `nginx_route` 가 0건이라 잃을 것이 없었다.

```bash
docker run --rm -v containers_nginx-config:/managed alpine mv /managed/current.conf /managed/current.conf.old
docker compose restart nginx
```

### 교체 직후 공개 hostname 이 끊긴다

최신 템플릿의 패널 블록은 `server_name panel.containers.local localhost 127.0.0.1` 이다. 공개 hostname(예: `panel.example.com`)은 여기에 없으므로 catch-all `444` 로 끊긴다. Cloudflare 를 거치면 502 로 보인다.

복구 순서는 이렇다.

1. loopback 주소(`http://127.0.0.1:18080`)로 패널에 접속한다. 이 주소는 템플릿의 `server_name` 에 있어 계속 열려 있다
2. 패널 설정에서 공개 주소를 저장한다. `applyPanelHostname` 이 패널 블록 `server_name` 에 공개 hostname 을 넣는다
3. 그 다음 프록시 라우트를 추가한다

loopback 이 신뢰 origin 하한선으로 항상 남아 있는 이유가 여기서 드러난다([acknowledge/0034](../acknowledge/0034-panel-public-origin-setting.md)). 공개 경로가 막혀도 들어갈 길이 있어야 복구가 가능하다.

## 배운 것

**계약 위반은 위반한 시점이 아니라 계약을 건드리는 다음 동작에서 드러난다.** 설정이 낡았다는 사실 자체는 아무 오류도 내지 않는다. 몇 달 뒤 프록시 라우트를 처음 추가할 때 관계없어 보이는 409 로 나타난다.

오류 메시지가 "무엇이" 계약을 어겼는지 알려주지 않는 것도 진단을 늦췄다. `verifyProtectedContract` 는 8개 검사 지점이 모두 같은 코드를 던진다. 어느 검사에서 걸렸는지 알려면 소스를 열어 현재 설정과 하나씩 대조해야 했다.
