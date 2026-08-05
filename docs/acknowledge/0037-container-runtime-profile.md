# 0037 — 컨테이너 런타임을 프로필로 열고 표준 이미지를 기본 지원한다

- 작성일: 2026-08-05
- 상태: 결정 확정 (구현 완료)
- 대응 커밋: `0a94269`
- 범위: 사용자 컨테이너(패널 생성·배포 릴리스)의 런타임 제약. 관리 plane 자신의 compose 서비스는 해당 없음

## 1. 배경

패널로 배포한 컨테이너의 런타임 제약이 코드에 박혀 있었다.

- `apps/engine-agent/src/service/shared/create-docker-engine-client.ts` 가 `CapDrop: ['ALL']` 을 하드코딩. **패널 컨테이너 생성과 배포 릴리스 양쪽에 적용**
- `containerCreateRequestSchema.readOnlyRootFilesystem` 기본값 `true`
- 배포 릴리스는 아예 `readOnlyRootFilesystem: true` 를 하드코딩
- tmpfs 는 `/tmp` 하나뿐이고 늘릴 방법 없음

실측 결과 **공식 이미지 대부분이 뜨지 않았다.**

| 시도 | 이미지                                   | 결과                                                                                   |
| ---- | ---------------------------------------- | -------------------------------------------------------------------------------------- |
| 1    | 순정 `nginx:1.29-alpine`                 | `mkdir("/var/cache/nginx/client_temp") failed (30: Read-only file system)` → 즉시 종료 |
| 2    | temp 경로를 `/tmp` 로 옮긴 nginx         | `chown("/tmp/client_temp", 101) failed (1: Operation not permitted)` — CAP_CHOWN 없음  |
| 3    | busybox httpd, non-root, 8080, 쓰기 없음 | release healthy                                                                        |

공식 이미지의 entrypoint 는 시작할 때 디렉터리를 만들고 소유권을 바꾸고 권한을 낮춘다. 그러려면 `CHOWN`·`SETUID`·`SETGID`·`DAC_OVERRIDE` 가 필요하다. 즉 이 제약을 알고 **전용으로 빌드한 이미지만** 배포됐고, 사용자가 가장 먼저 시도할 정적 웹서버가 정확히 실패했다.

사용자 판단이 결정적이었다 — "표준이미지가 배포가안된다니. 그것도 제대로 표준도 잘 되도록해 **어떤 이미지가 올라올줄알고 특정 이미지 세팅을 강요할 수 없어**".

## 2. 결정

런타임을 **프로필 + 세부 조정**으로 분리한다(`packages/contracts/src/container-runtime.ts`).

```
runtime: {
    profile: 'standard' | 'hardened'   // 기본 standard
    capabilities: string[]             // 추가로 허용할 목록
    writablePaths: string[]            // hardened 에서 tmpfs 로 마운트할 경로
}
```

- **`standard`(기본)** — Docker 기본 capability 집합을 그대로 두고 루트를 쓰기 가능하게 연다. 평범한 이미지가 그대로 뜬다.
- **`hardened`(옵트인)** — 이전 동작 그대로. `CapDrop: ALL` + 읽기 전용 루트 + `/tmp` 와 `writablePaths` 를 tmpfs 로.

어느 프로필이든 **`no-new-privileges`, 메모리·CPU·PID 상한, 관리 plane 보호, 네트워크 격리는 유지**한다.

### 왜 기본을 여는가

기본이 닫혀 있으면 제품이 성립하지 않는다. 열어도 `docker run` 기본값보다 여전히 엄격하다 — Docker 기본 capability 집합은 이미 `SYS_ADMIN`·`SYS_PTRACE`·`NET_ADMIN` 같은 위험한 것을 포함하지 않고, 여기에 `no-new-privileges` 와 자원 상한이 더해진다.

### 절대 열지 않는 것

`FORBIDDEN_CONTAINER_CAPABILITIES` 16종(`ALL`·`SYS_ADMIN`·`SYS_PTRACE`·`SYS_MODULE`·`NET_ADMIN`·`SYS_RAWIO`·`SYS_BOOT`·`SYS_TIME`·`MAC_ADMIN`·`MAC_OVERRIDE`·`DAC_READ_SEARCH`·`BPF`·`PERFMON`·`SYSLOG`·`AUDIT_CONTROL`·`WAKE_ALARM`)은 **계약 단계에서 거부**한다. `CAP_` 접두사를 붙인 우회도 막는다. `privileged`·host namespace·docker socket·호스트 bind mount 는 어떤 경로로도 노출하지 않는다.

- **기각한 대안** — `readOnlyRootFilesystem` 기본값만 `false` 로 뒤집기: `CapDrop: ALL` 이 남아 `chown` 이 계속 막힌다. 실측 2차 시도가 정확히 그 상태였다.
- **기각한 대안** — 읽기 전용을 유지하고 `writablePaths` 만 추가: 사용자가 어떤 경로가 필요한지 미리 알아야 하고, capability 문제는 그대로다. "특정 이미지 세팅을 강요"하는 것과 같다.

### 기존 배포 보호

migration `0018_manifest_runtime` 의 컬럼 기본값을 **`hardened`** 로 둔다. 이미 저장된 manifest 는 동작이 바뀌지 않는다. 새 manifest 만 `standard` 로 만들어진다.

## 3. 검증 (2026-08-05)

단위 6건(`container-runtime.test.ts`) + 라이브 실측.

- 순정 `nginx:1.29-alpine` 을 **아무 설정 없이** 업로드 → load → manifest → release → **healthy**
- 외부 `https://a.hyuns.uk` **200 `A SITE`**
- 컨테이너 실측 `ReadonlyRootfs=false CapDrop=[] CapAdd=[] SecurityOpt=[no-new-privileges:true]`
- `runtime.capabilities: ['SYS_ADMIN']` 요청 **400**
- `bun run audit:runtime` 5/5 통과 (관리 plane 자세 무변경)

## 4. 함께 확정한 것 — 파일 업로드 범위

같은 흐름에서 "raw HTML 같은 파일을 아티팩트로 올려 bind mount 로 붙이자"는 안이 나왔다.

- **호스트 bind mount 는 거부.** `/var/run/docker.sock` 하나로 admin 이 호스트 root 를 얻는다.
- 대안으로 "raw 파일 아카이브 → 제어 plane 이 소유한 named volume 으로 추출" 을 제안했으나, **사용자가 범위를 좁혔다** — "의도적으로 그냥 컨테이너만 업로드해서 묶는게 좋겠다".
- 따라서 **아티팩트는 이미지 아카이브만** 받는다. 정적 파일은 이미지에 구워 올린다.
