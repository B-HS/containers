# Docker Engine 제어 지시서

## 1. 설계 원칙

웹과 공개 API는 Docker Engine을 직접 호출하지 않는다. `engine-agent`가 유일한 Docker 어댑터이며 API는 도메인 operation만 전달한다. Agent는 Docker 응답을 외부 DTO로 그대로 노출하지 않고 Zod schema로 필요한 필드를 정규화한다.

Docker CLI 명령어 이름은 UI의 사용자 언어로만 사용한다. 구현은 Docker Engine API의 typed operation으로만 제공한다. raw Docker CLI, host shell, 임의 Engine request endpoint는 만들지 않는다. Compose bundle과 build도 제한된 manifest·DTO를 Docker API 호출로 변환한다.

## 2. 상태 동기화

- 첫 연결 시 version negotiation, info, ping을 확인한다.
- Engine API 최소·최대 지원 버전을 startup에서 검증하고 호환되지 않으면 변경 작업을 막는다.
- list 화면은 Engine list API를 직접 조회한다.
- detail 화면은 inspect를 직접 조회한다.
- events stream은 query invalidation과 job 보조 신호로 사용한다.
- 주기 reconciliation이 list·inspect와 DB metadata를 대조한다.
- Engine 연결이 끊기면 오래된 snapshot을 현재 상태처럼 보이지 않고 `연결 끊김`과 마지막 관측 시각을 표시한다.

## 3. operation 카탈로그

### 3.1 컨테이너

| 구분     | operation                                                                  |
| -------- | -------------------------------------------------------------------------- |
| 조회     | list, inspect, stats once/stream, logs, top, changes, port, wait           |
| 생명주기 | create, start, stop, restart, pause, unpause, kill, rename, update, remove |
| 파일     | archive download, archive upload, path stat                                |
| exec     | create, attach/start, resize, inspect, detach                              |
| 복제     | commit은 전문가 기능으로만 제공                                            |

remove는 running container 강제 삭제를 기본 거부한다. 먼저 stop 영향과 연결된 route, volume, network, deployment를 보여준다. `force`, `removeVolumes`, timeout은 별도 필드다.

### 3.2 이미지

| 구분      | operation                                        |
| --------- | ------------------------------------------------ |
| 조회      | list, inspect, history, distribution metadata    |
| 획득      | pull, load archive, import rootfs, build context |
| 관리      | tag, remove, prune                               |
| 배포 보조 | platform 확인, digest 고정, scanner 결과 연결    |

`rmi`는 해당 이미지를 쓰는 running·stopped container와 deployment를 먼저 계산한다. force 삭제는 owner 전용이다.

### 3.3 network·volume

- network: list, inspect, create, connect, disconnect, remove, prune
- volume: list, inspect, create, remove, prune
- plugin, swarm, secret, config는 첫 버전 범위 밖이며 Engine capability 화면에는 미지원으로 명시한다.
- volume browse·download는 별도 helper container가 필요하고 root-equivalent 위험이 있으므로 초기 범위에서 제외한다.

### 3.4 system

- ping, version, info, disk usage, events
- container·image·network·volume prune dry-run preview
- system prune는 owner 전용 job이며 항상 보존 label과 관리 plane 리소스를 제외한다.
- private registry credential은 Engine Agent 전용 volume에 AES-256-GCM으로 저장하고 API·job에는 metadata와 credential ID만 전달한다.
- 인증 pull은 image reference의 registry host와 credential의 `serverAddress`가 정확히 일치할 때만 `X-Registry-Auth`를 생성한다.

### 3.5 Docker Desktop disk

- `/system/df`로 image, container, local volume, build cache의 active·reclaimable bytes를 수집한다.
- Agent가 제품 volume과 upload filesystem의 `statfs` total·available bytes를 수집한다.
- Docker Desktop UI에서 설정한 384GB limit은 운영자가 확인한 구성값과 확인 시각으로 별도 저장한다.
- macOS host 전체 free disk를 Engine 값으로 오인해 표시하지 않는다.
- soft·hard watermark는 비율과 절대 여유 공간을 함께 사용하고 예약 중 upload·build bytes도 차감한다.

## 4. 컨테이너 create 정책

외부 DTO는 Docker HostConfig 전체를 받지 않는다. 다음 필드를 명시적으로 정의한다.

- name, image digest 또는 허용된 tag
- cmd string array, entrypoint string array
- environment key-value list
- workingDir, user
- exposedPorts와 publish policy
- restartPolicy allowlist
- healthcheck
- CPU, memory, pids 제한
- managed network 연결
- named volume mount
- labels allowlist
- readOnlyRootfs, tmpfs

기본 금지 필드:

- privileged
- bind mount와 propagation
- devices와 device requests
- cap add
- host network·PID·IPC·UTS·cgroup namespace
- security-opt 완화
- Docker socket 또는 host root mount
- sysctl allowlist 밖 값

break-glass가 활성화된 경우에도 raw JSON을 받지 않고 각 위험 필드를 명시적으로 승인한다.

## 5. exec 프로토콜

### 5.1 비대화형

API는 `containerId`, `cmd: string[]`, `workingDir`, `user`, `env`, `timeoutMs`, `maxOutputBytes`를 받는다. Agent가 exec create와 start를 수행하고 stdout·stderr와 exit code를 반환한다. Docker의 multiplexed stream header를 정확히 분리한다.

### 5.2 대화형 TTY

1. API가 capability와 최근 재인증을 확인하고 짧은 수명의 exec ticket을 발급한다.
2. 브라우저가 Hono WebSocket endpoint에 ticket으로 연결한다.
3. API가 Agent의 attach stream과 양방향 중계한다.
4. 입력, resize, heartbeat, detach를 명시 JSON message type으로 구분한다.
5. 정상 종료 시 exec inspect의 exit code를 전달하고 detach·timeout·오류 시 hijack socket과 브라우저 terminal 자원을 정리한다.

현재 런타임은 `input`, `resize`, `heartbeat`, `detach`, `ready`, `pong`, `output`, `error`, `exit` JSON frame을 사용한다. idle 5분, 최대 연결 30분, 동시 terminal 10개, 연결 전 입력 64KiB, browser 방향 buffered output 1MiB를 상한으로 둔다. 연결 중 역할과 session을 15초마다 다시 검증한다. terminal output과 stdin은 audit에 저장하지 않는다. 누가 어느 컨테이너에서 어떤 executable과 argument 개수로 ticket을 시작했는지만 기록한다.

## 6. logs·stats·events

- logs는 `since`, `until`, `tail`, `timestamps`, stdout, stderr를 typed query로 제공한다.
- 과도한 과거 전체 로그 요청을 막고 pagination 또는 bounded stream을 사용한다.
- follow는 SSE 또는 WebSocket으로 중계하고 backpressure와 느린 client disconnect 정책을 둔다.
- stats는 화면 활성 시에만 stream하고 background tab에서는 주기를 낮춘다.
- Docker event는 내부 단일 subscriber가 받고 API SSE와 TanStack Query invalidation event로 fan-out한다.
- reconnect 시 last event time과 reconciliation을 함께 사용한다.

## 7. 관리 plane 자기 보호

Compose project name 또는 고정 label `managed-by=containers-control-plane`으로 관리 plane 리소스를 식별한다.

- 현재 Compose의 nginx, api, web, engine-agent, traffic-worker는 project label로 보호한다. backup-worker, watchdog, cloudflared를 추가하면 같은 보호 집합에 포함한다.
- 기본 operator는 이 보호 집합을 remove·pause·kill·rename할 수 없다.
- owner maintenance mode에서만 순서가 정해진 upgrade·restart를 실행한다.
- Nginx와 Agent를 동시에 중지하는 bulk operation은 거부한다.
- prune은 관리 plane image·volume·network를 항상 제외한다.
- 자기 자신을 upgrade하는 작업은 새 stack 검증, Nginx 전환, health, 구 stack 정리 순서의 별도 runbook을 따른다.

## 8. 오류와 idempotency

- Engine 오류를 `DOCKER_NOT_FOUND`, `DOCKER_CONFLICT`, `DOCKER_UNAVAILABLE`, `DOCKER_TIMEOUT`, `DOCKER_PERMISSION_DENIED`, `DOCKER_STREAM_FAILED` 등 중앙 코드로 변환한다.
- client가 임의 재시도하면 안 되는 작업은 `Idempotency-Key`를 요구한다.
- create·deployment는 요청 key와 생성된 resource ID를 transactionally 기록한다.
- 이미 원하는 상태인 start·stop·pause 계열은 멱등 성공으로 정규화할지 operation별로 문서화한다.
- timeout 후 결과가 불명확하면 failed로 단정하지 않고 `unknown` 상태에서 inspect로 reconciliation한다.

## 9. 구현 선행 spike

- Bun에서 Unix socket list·inspect 호출
- hijacked exec stream의 stdout·stderr multiplex 해석
- TTY attach와 resize
- image load의 progress JSON stream과 취소
- large logs backpressure
- M1 Max Docker Desktop의 Unix socket, disk, event, exec, load, build 동작
- `linux/arm64` native와 `linux/amd64` emulation의 platform 판정·성능·실패 동작
- 100 containers, 동시 terminal 10, 동시 upload 2에서 Agent backpressure

spike가 끝나기 전 Docker client 라이브러리를 확정하지 않는다. 결과와 채택 이유를 `docs/acknowledge/` ADR로 남긴다.
