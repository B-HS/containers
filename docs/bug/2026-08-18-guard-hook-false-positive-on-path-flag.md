# 가드 훅이 mkdir -p 를 포트 publish 로 오탐해 정상 명령을 막는다

- 발견일: 2026-08-18
- 심각도: medium — 보안 구멍은 아니지만, 훅이 무해한 명령을 막으면 에이전트가 훅을 우회할 방법을 찾게 만든다
- 발견 경로: 테스트용 정적 컨테이너를 띄우려다 차단됨

## 증상

디렉터리를 만들고 컨테이너를 띄우는 한 줄이 차단됐다.

```
mkdir -p "$SP/static-test"
docker run -d --name containers-verify-static --network containers_edge ... -v "$SP/static-test:/usr/share/nginx/html:ro" nginx:alpine
```

```
차단: loopback 이 아닌 주소로 포트 publish ("$SP/static-test")
```

이 명령에는 `-p` 로 publish 하는 포트가 없다. 값으로 보고된 것은 디렉터리 경로다.

## 원인

`.claude/hooks/guard-container-escape.sh` 의 포트 publish 검사가 `-p` 를 **명령과 무관하게** 찾았다.

```sh
published="$(printf '%s' "$cmd" | grep -oE '(^|[[:space:]])(-p|--publish)[[:space:]=]+[^[:space:]]+' || true)"
```

`-p` 는 docker 전용 플래그가 아니다. `mkdir -p`, `cp -p`, `rsync -p` 가 모두 같은 패턴에 걸린다. 잡힌 값이 loopback 접두사로 시작하지 않으면 그대로 차단이었다.

훅은 fail-open 이 아니라 fail-closed 로 동작하는 지점이라 오탐의 대가가 크다. 정상 작업이 막히면 에이전트가 "훅을 피하는 형태"로 명령을 바꾸려는 압력을 받는데, 그것이야말로 이 훅이 막으려던 행동 양식이다.

## 조치

두 단계로 좁혔다. 차단 범위는 그대로 두고 오탐만 없앤다.

1. **컨테이너 런타임 문맥에서만 검사한다.** 명령에 `docker`·`podman`·`nerdctl` 이 등장하지 않으면 publish 검사를 하지 않는다
2. **값에 경로 구분자가 있으면 건너뛴다.** 포트 스펙에 나올 수 있는 슬래시는 `/tcp`·`/udp`·`/sctp` 접미사뿐이다

값이 변수라 형태를 알 수 없는 경우(`-p $LAN:80:80`)는 **차단을 유지**한다. 판단할 수 없는 값을 통과시키면 그 자체가 우회로가 된다.

```sh
if printf '%s' "$cmd" | grep -Eq '(^|[[:space:];|&])(docker|podman|nerdctl)([[:space:]]|$)'; then
    ...
            printf '%s' "$value" | grep -Eq '^[^/]*(/(tcp|udp|sctp))?$' || continue
```

### 검증

20건을 사례로 확인했다. 통과 8건(`mkdir -p` 단독, `mkdir -p` 와 docker 복합, 볼륨 마운트, loopback publish 3종, `cp -p`, 평범한 compose up), 차단 12건(호스트 IP 생략·`0.0.0.0`·LAN IP·변수·롱플래그·프로토콜 접미사 publish, 특권 컨테이너, 호스트 네트워크, 호스트 PID, docker.sock 마운트, 호스트 루트 마운트, nsenter). 전부 기대대로 판정한다.

### 남은 한계

`mkdir -p foo && docker run ...` 처럼 **슬래시 없는 상대 경로**를 docker 명령과 한 줄에 섞으면 여전히 오탐한다. 인자가 어느 명령에 속하는지 알려면 셸 파서가 필요한데, 훅이 감당할 복잡도가 아니다. 오탐을 만나면 우회를 시도하지 말고 **명령을 두 줄로 분리**한다.

## 배운 것

**보안 훅의 오탐은 조용한 비용이 아니다.** 막힌 쪽은 목적을 이루려고 다른 형태를 시도하게 되고, 그 과정에서 훅이 진짜로 막아야 할 경로에 가까워진다. 차단 규칙을 넓게 잡는 것보다 정확하게 잡는 것이 안전하다.

정규식으로 명령줄을 해석하는 훅은 **플래그 이름이 도구마다 겹친다**는 사실을 항상 고려해야 한다. `-p`·`-v`·`-e` 는 docker 밖에서도 흔하다. 이 저장소의 다른 검사들(`--privileged`·`--pid=host`·`--network=host`)은 docker 고유 플래그라 같은 문제가 없다.
