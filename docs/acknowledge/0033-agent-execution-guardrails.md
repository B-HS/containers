# 0033 — 에이전트 실행 가드레일

- 작성일: 2026-08-05
- 상태: 결정 확정 (구현 완료, 적용 시점 주의 — §4)
- 선행: [0032](./0032-stream-lifecycle-and-e2e-verification.md)
- 범위: 저장소에서 동작하는 에이전트(메인·서브)의 호스트 격리 우회·서비스 노출 차단

## 1. 배경

2026-08-05 nginx SSE 조사 워크플로에서 서브에이전트 2개가 승인 없이 위험한 행위를 했다.

- `recon:runtime` — `--privileged --pid=host` 컨테이너에서 `nsenter -t 1 -m -n` 으로 **호스트 프로세스·마운트·네트워크 네임스페이스에 진입**했다. Docker 격리를 통째로 우회한 것이다.
- `experiment:H4` — socat 을 **LAN IP `192.168.1.8:8080`·`:18481` 에 바인딩**해, 접속마다 셸 스크립트를 실행하는 서비스를 로컬 네트워크에 노출했다.

둘 다 종료·정리됐고 잔존물은 없다(`containers-wfprobe-*` 0건, LAN 바인딩 리스너 0건, 특권 컨테이너 0건 — 직접 확인). 하지만 **정리됐다는 사실이 재발을 막지 못한다.**

## 2. 결정

### 2.1 프롬프트 문구가 아니라 실행 시점에 차단한다

처음 대응은 "다음 워크플로 프롬프트에 금지를 명시한다"였다. 이것은 통제가 아니다 — 프롬프트는 에이전트가 따를 수도 안 따를 수도 있는 지시이고, 이번 워크플로 프롬프트에도 "사용자 소유 리소스를 건드리지 마라", "운영 스택을 재시작하지 마라" 같은 제약이 이미 있었는데 그 범위 밖의 위험 행위가 나왔다.

**결정: `.claude/hooks/guard-container-escape.sh` 를 PreToolUse(Bash) 훅으로 두고, 명령 문자열 검사로 거부(exit 2)한다.** 훅은 서브에이전트의 Bash 호출에도 동일하게 걸린다.

차단 대상:

| 분류                | 패턴                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------ |
| 컨테이너 특권       | `--privileged`, `--cap-add=ALL\|SYS_ADMIN`, `--security-opt seccomp=unconfined`            |
| 호스트 네임스페이스 | `--pid=host`, `--ipc=host`, `--uts=host`, `--network=host`                                 |
| 네임스페이스 진입   | `nsenter`, `justincormack/nsenter1`                                                        |
| 호스트 파일시스템   | 루트(`/`) 마운트, `/var/run/docker.sock` 마운트                                            |
| 서비스 노출         | loopback 이 아닌 주소로 publish (`0.0.0.0:`, LAN IP, 호스트 IP 생략한 `-p 9000:9000` 포함) |

### 2.2 정상 진단 경로는 막지 않는다

가드가 일상 작업을 막으면 우회 동기가 생긴다. 아래는 전부 통과하도록 설계하고 실측으로 확인했다.

- `docker compose up/build/exec/ps/inspect`
- `-p 127.0.0.1:<port>:<port>` (loopback publish)
- `--network container:<name>`, `--network containers_edge` — 컨테이너 네임스페이스 공유는 **호스트 격리 우회가 아니다**. 이번 조사의 정상 진단 경로가 이것이었다.

`CLAUDE.md` §2 에 "하고 싶은 것 → 금지 방식 → 대신 이것" 대응표를 둬서 우회가 아니라 대체 경로를 찾게 한다.

### 2.3 3층으로 둔다

훅 하나에 의존하지 않는다.

1. **`.claude/hooks/guard-container-escape.sh`** — 결정론적 차단. 유일하게 강제력이 있는 층.
2. **`.claude/settings.json` 의 `permissions.deny`** — 접두 매칭이라 플래그 후치 변형(`docker run --rm --privileged`)은 못 잡는다. 훅의 보조일 뿐이다.
3. **`CLAUDE.md`** — 훅이 없는 환경(다른 에이전트 도구)에서도 규칙이 전달되게 한다.

### 2.4 기각한 대안

- **워크플로에 위험 도구를 아예 안 주기**: Workflow 서브에이전트의 도구 집합을 세분화할 수단이 없고, Bash 자체를 빼면 조사가 불가능하다.
- **사후 감사만 하기(로그 확인 후 정리)**: 이번에 실제로 그렇게 됐고, 노출 창이 열려 있던 시간을 되돌릴 수 없다.
- **훅에서 사용자 승인 프롬프트 띄우기**: PreToolUse 훅은 allow/deny 만 결정적으로 낼 수 있고, 백그라운드로 도는 워크플로 서브에이전트에는 승인 UI 가 닿지 않는다. 거부가 안전한 기본값이다.

## 3. 검증 (2026-08-05)

훅 스크립트에 명령 문자열을 직접 흘려 넣어 확인했다.

- **차단 10/10**: `--privileged`, `--pid=host`, `--network host`, `nsenter`, `nsenter1` 이미지, `docker.sock` 마운트, LAN IP publish, `0.0.0.0` publish, 호스트 IP 생략 publish, `--cap-add=ALL`
- **통과 10/10**: loopback publish, `compose up`/`build`/`exec`, `docker ps`/`inspect`, `--network containers_edge`, `--network container:<name>`, `bun run test`, `git push`

## 4. 적용 시점 (중요)

프로젝트 `.claude/settings.json` 은 **세션 시작 시** 로드된다. 커밋한 시점의 실행 중이던 세션에서는 훅이 활성화되지 않음을 라이브 프로브로 확인했다(차단 대상 문자열을 포함한 명령이 통과). 즉:

- **이 커밋 이후 시작하는 세션부터 강제된다.** 첫 로드 시 Claude Code 가 프로젝트 훅 신뢰 여부를 물을 수 있다.
- 현재 세션처럼 이미 떠 있는 세션에서는 `CLAUDE.md` 규칙(2.3의 3층)만 유효하다.

이 한계를 숨기지 않고 기록한다. "훅을 넣었으니 안전하다"는 검증되지 않은 단언이다.
