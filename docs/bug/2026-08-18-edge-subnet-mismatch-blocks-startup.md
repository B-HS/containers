# 기존 네트워크의 subnet 이 compose 정의와 달라 스택 기동이 통째로 멈춘다

- 발견일: 2026-08-18
- 심각도: blocker — `docker compose up` 이 어떤 서비스도 올리지 못하고 중단된다. 패널이 내려간 채 복구되지 않는다
- 발견 경로: 사용자가 `scripts/setup.sh` 로 재기동을 시도하다 실패

## 증상

`docker compose up -d --wait` 이 아래 오류로 끝난다. nginx 만 정지 상태가 되고 나머지 4개 서비스는 예전 컨테이너 그대로 남는다.

```
Error response from daemon: error while removing network: network containers_edge
has active endpoints (name:"containers-api-1" id:"de6cf97acea9")
  [실패] 기동 실패 — docker compose logs 로 원인을 확인하세요.
```

`docker compose logs` 에는 원인이 전혀 나오지 않는다. api 는 healthy 하고 애플리케이션 로그도 정상이라, 로그만 보면 무엇이 실패했는지 알 수 없다. 실제로 이 사고에서 관찰된 로그는 `Invalid origin` 경고뿐이었고 그것은 이 실패와 무관한 별개 문제였다.

중간 상태로 nginx 컨테이너가 `containers_edge` 에서만 분리된 채 남는다. 이 상태에서는 재시작도 불가능하다.

```
Error response from daemon: container 2c8332295a26 is not connected to the network containers_edge
```

## 원인

`compose.yaml` 은 edge 네트워크에 subnet 을 명시한다.

```yaml
edge:
    ipam:
        config:
            - subnet: ${EDGE_SUBNET:-10.89.0.0/24}
```

그런데 실행 중이던 `containers_edge` 는 이 정의가 추가되기 전(2026-08-02)에 만들어져 Docker 기본값 `172.19.0.0/16` 을 쓰고 있었다.

**Compose 는 이미 존재하는 네트워크의 subnet 을 그 자리에서 바꾸지 못한다.** 네트워크 라벨의 `com.docker.compose.config-hash` 가 정의와 어긋나면 삭제 후 재생성을 시도하는데, 그 네트워크에 다른 서비스(api)가 붙어 있으면 삭제가 거부된다. Compose 는 이 지점에서 전체 `up` 을 포기한다.

즉 실패의 원인은 실행 중인 컨테이너가 아니라 **저장소 정의와 런타임 자원의 세대 차이**다. 스택을 오래 띄워 둔 채 `compose.yaml` 만 갱신하면 언제든 재현된다.

## 조치

### 즉시 복구

스택 전체를 내렸다가 다시 올린다. 네트워크는 마지막 컨테이너가 떨어질 때 삭제되고, 다음 `up` 에서 정의대로 새로 만들어진다.

```bash
docker compose down          # -v 를 붙이지 않는다. 볼륨과 DB 는 보존된다
docker compose build
docker compose up -d --wait
```

`down` 은 named 볼륨을 지우지 않는다. 이 사고에서도 볼륨 7개(`control-data`·`nginx-config`·`artifacts`·`backups` 등)가 전부 보존됐다.

nginx 컨테이너가 네트워크에서 분리된 중간 상태로 남아 `up` 조차 받지 않으면, 그 컨테이너만 `docker rm` 으로 지운 뒤 `down` 을 실행한다.

### 재발 방지

`scripts/setup.sh` 가 기동 전에 **compose 정의의 subnet 과 실제 네트워크의 subnet 을 비교**한다. 어긋나면 원인과 해결책을 알려주고, 동의를 받아 `docker compose down` 까지 실행한 뒤 기동으로 넘어간다. subnet 을 명시하지 않은 네트워크는 비교 대상이 아니다.

이 점검은 `docker compose config --format json` 의 `networks[].ipam.config[0].subnet` 과 `docker network inspect` 결과를 대조한다. jq 가 없는 환경에서는 조용히 건너뛴다(기존 동작 유지).

## 배운 것

**`docker compose logs` 는 이 종류의 실패를 설명하지 못한다.** 실패가 애플리케이션이 아니라 Compose 의 자원 조정 단계에서 일어나기 때문이다. 기동 실패를 만나면 로그보다 먼저 `docker compose up` 자체의 stderr 와 `docker network inspect` 를 봐야 한다.

`compose.yaml` 의 인프라 정의(네트워크 subnet·볼륨 드라이버 옵션)를 바꾼 커밋은 **실행 중 스택에 자동으로 반영되지 않는다.** 다음 `up` 때 조용히 반영되는 것이 아니라, 이렇게 기동 자체를 막는 형태로 드러난다.
