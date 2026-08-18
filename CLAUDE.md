# containers — 에이전트 작업 규칙

이 저장소에서 작업하는 모든 에이전트(메인·서브 전부)에 적용된다. 사용자의 개인 규칙과 `docs/` 설계 문서가 우선하고, 이 파일은 **이 저장소에서만 추가로 강제되는 것**을 다룬다.

## 1. 절대 금지 — 호스트 격리 우회와 서비스 노출

아래는 사용자 승인 여부와 무관하게 에이전트가 직접 실행하지 않는다. 필요하면 목적·범위를 설명하고 **사용자가 직접 실행**하게 한다.

- `docker run --privileged`, `--pid=host`, `--ipc=host`, `--uts=host`, `--network=host`, `--cap-add=ALL|SYS_ADMIN`, `--security-opt seccomp=unconfined`
- `nsenter` 및 그 목적의 이미지(`justincormack/nsenter1` 등)로 호스트 네임스페이스 진입
- 호스트 루트(`/`) 마운트, `/var/run/docker.sock` 마운트 (engine-agent 서비스 정의만 예외)
- **loopback 이 아닌 주소로 포트 publish** — `-p 0.0.0.0:...`, `-p <LAN IP>:...`, 호스트 IP 를 생략한 `-p 9000:9000`. 진단용 프로브도 예외가 아니다
- `sudo`

`.claude/hooks/guard-container-escape.sh` 가 PreToolUse 훅으로 위 전부를 차단한다. **훅은 방어선이지 근거가 아니다** — 훅이 없는 환경에서도 이 규칙을 지킨다.

훅이 무해한 명령을 막으면(예: `mkdir -p` 와 docker 명령을 한 줄에 섞은 경우) **표현을 바꿔 통과시키려 하지 말고 명령을 분리해 실행한다.** 훅을 피하는 형태를 찾는 것 자체가 이 훅이 막으려는 행동이다. 오탐이라고 판단되면 사용자에게 알리고 훅을 고친다. → [bug/2026-08-18-guard-hook-false-positive-on-path-flag.md](./docs/bug/2026-08-18-guard-hook-false-positive-on-path-flag.md)

이 규칙이 생긴 이유: 2026-08-05 조사 워크플로에서 서브에이전트가 `--privileged --pid=host` + `nsenter` 로 호스트 네임스페이스에 진입하고, socat 을 LAN IP 에 바인딩해 셸 실행 서비스를 로컬 네트워크에 노출했다. 프롬프트 문구로는 재발을 막지 못한다. → [acknowledge/0033](./docs/acknowledge/0033-agent-execution-guardrails.md)

## 2. 진단은 격리를 지키면서 한다

호스트 격리를 건드리지 않고도 되는 방법을 먼저 쓴다.

| 하고 싶은 것                | 금지 방식                | 대신 이것                                                     |
| --------------------------- | ------------------------ | ------------------------------------------------------------- |
| 컨테이너 내부에서 API 호출  | `--network host`         | `--network container:<name>` 또는 `--network containers_edge` |
| 컨테이너 프로세스·소켓 확인 | `--pid=host` + `nsenter` | `docker exec <name> ps` / `docker inspect` / `docker top`     |
| 호스트에서 프로브 접근      | LAN IP 바인딩            | `-p 127.0.0.1:<빈 포트>:<컨테이너 포트>`                      |
| 호스트 파일 확인            | `/` 마운트               | 호스트에서 직접 Read/Bash                                     |

임시 컨테이너는 `containers-verify-*` 또는 `containers-wfprobe-*` 로 이름 짓고 **작업이 끝나면 반드시 삭제**한다. 사용자 소유 리소스(`poc1*`, `api-proxy*` 등)는 읽기만 한다.

## 3. 운영 스택 취급

- `docker compose down -v`, 광범위 `prune`, 사용자 소유 리소스 추정 삭제 금지.
- 운영 nginx 설정의 정본은 저장소의 `infra/nginx/nginx.conf` 가 아니라 **관리 볼륨의 `current.conf`** 다. 저장소 파일만 고치고 반영됐다고 판단하지 않는다.
- 새 workspace 패키지를 추가하면 `apps/*/Dockerfile` 4개에 `COPY` 2줄씩 추가한다.

## 4. 보안 불변식은 테스트가 강제한다

`packages/config/src/compose-security.ts` 가 배포 compose 의 불변식을 정의하고 테스트 10건이 이를 강제한다. `scripts/audit-runtime-security.ts`(`bun run audit:runtime`)는 **실제 실행 중인 컨테이너**를 같은 기준으로 검사해 위반 시 exit 1 이다.

특권·호스트 네임스페이스·docker socket 범위·loopback publish·`read_only`·`no-new-privileges`·위험 capability·호스트 루트 마운트를 바꾸려면 이 테스트를 먼저 통과시켜야 한다. **테스트를 고쳐서 통과시키지 말 것** — 불변식을 바꿔야 한다고 판단되면 사용자에게 근거와 함께 확인받는다.

## 5. 검증

종료 전 `bun run typecheck` → `lint` → `test` → `build` 를 통과시킨다. 스택을 띄운 상태면 `bun run audit:runtime` 도 돌린다. **정적 검사 통과는 완료가 아니다** — 런타임 동작은 Compose 재빌드 후 실측한다. 이 저장소에서 정적 검사를 전부 통과한 채로 프로덕션 결함이 발견된 사례가 여러 건 있다(`docs/bug/`).

E2E 로그인이 필요하면 사용자에게 계정을 묻지 말고 `bun scripts/seed-e2e.ts` 를 쓴다. 출력된 비밀번호는 저장소·문서에 기록하지 않는다.

**seed 는 개발 전용이다.** 공개 주소가 설정된 스택에서는 스크립트가 스스로 거부한다. 운영 계정은 최초 1회 로컬 주소(`http://127.0.0.1:18080`)에서 bootstrap 으로 만들고 그 다음부터는 초대로 늘린다. 공개 주소에서는 bootstrap 이 403 이다. 계정을 초기 상태로 되돌리는 것은 `bun scripts/reset-accounts.ts --confirm` 이며 **파괴적이라 사용자가 직접 실행한다**.
