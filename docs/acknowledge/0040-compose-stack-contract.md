# 0040 — compose 스택 계약과 변환 규칙

- 날짜: 2026-08-06
- 상태: 채택 (3.1 범위. 저장·오케스트레이션·화면은 3.2~3.4 에서 이어진다)
- 관련: [PLAN-UX-REMEDIATION.md](../PLAN-UX-REMEDIATION.md) §3.x, [SECURITY.md](../SECURITY.md) §2

## 1. 배경

사용자가 (b) 본격 지원으로 확정했다 — `compose.yml` 을 올리면 서버가 manifest N개로 바꾸고 스택 단위로 배포·롤백한다. 이 문서는 그 변환 계약을 고정한다.

## 2. 가장 큰 설계 충돌 — manifest 는 공개 라우트를 필수로 요구했다

`deploymentManifestInputSchema.route` 가 필수였다. 그런데 compose 스택의 전형은 `app + db + cache` 이고 **db·cache 는 공개 도메인이 있으면 안 된다**. 라우트를 필수로 두면 DB 를 배포할 방법이 없거나, 있어서는 안 될 공개 라우트를 만들게 된다.

**결정: `route` 를 nullable 로 바꾼다.** `null` 이면 그 서비스는 내부 서비스다.

- 릴리스는 라우트가 없으면 nginx upsert·라우트 probe·관찰 probe 를 건너뛰고, 대신 컨테이너 probe 로 관찰 판정을 한다(`isPublished` 가드).
- 중단 복구(`reconcileInterrupted`)와 롤백도 같은 가드를 탄다. 라우트가 없는 릴리스는 라우트를 복구하지 않는다.
- DB 는 `route_hostname`·`route_path`·`route_strip_prefix` 를 nullable 로 바꿨다(migration `0019`). 기존 행은 값이 그대로 남아 동작이 바뀌지 않는다.

기각한 대안: 모든 서비스에 hostname 을 강제(DB 가 공개된다), 예약 접미사로 내부 hostname 합성(여전히 공개 라우트가 생긴다).

## 3. 패널 전용 label 로 라우팅을 받는다

compose 에는 "이 서비스를 어느 도메인에 붙일지"를 나타내는 표준 키가 없다. 그래서 label 로 받는다.

| label                           | 뜻                              | 기본값        |
| ------------------------------- | ------------------------------- | ------------- |
| `containers.route.hostname`     | 공개 도메인. 없으면 내부 서비스 | 없음          |
| `containers.route.path`         | 라우트 경로                     | `/`           |
| `containers.route.strip-prefix` | 프리픽스 제거                   | `false`       |
| `containers.health-path`        | HTTP health check 경로          | `/`           |
| `containers.internal-port`      | 컨테이너 포트 직접 지정         | `expose` 우선 |

compose `healthcheck` 는 **명령**이고 패널 health check 는 **HTTP 경로**라 서로 대체되지 않는다. 그래서 타이밍(`interval`·`timeout`·`retries`·`start_period`)만 옮기고 경로는 label 에서 읽는다.

## 4. 거부 / 무시 / 변환

**거부(400 `DEPLOYMENT_STACK_REJECTED`)** — 조용히 무시하지 않는다. 위반을 전부 모아 `details.rejections` 로 돌려준다.

`privileged`, host namespace(`pid`·`ipc`·`uts`·`network_mode` 에 host), `devices`, docker socket 마운트, 호스트 bind mount(`/`·`.`·`~` 로 시작하는 source), `FORBIDDEN_CONTAINER_CAPABILITIES` 16종의 `cap_add`, **값이 그대로 적힌 `environment`**.

환경변수는 `KEY: secret:<reference>` 형식만 받아 manifest `secrets` 바인딩으로 옮긴다. compose 파일에 평문 시크릿이 들어오는 걸 받아주지 않는다.

**무시(응답의 `ignored` 에 이유와 함께 명시)** — `build`, `container_name`, `develop`, `env_file`, `extends`, `logging`, `networks`, `ports`, `profiles`, `pull_policy`, `stdin_open`, `tty`.

`ports` 는 특히 중요하다. 이 제품은 호스트 포트를 publish 하지 않고 nginx 라우트로만 노출한다(loopback publish 불변식). 호스트 포트는 버리되 **컨테이너 포트는 살려서** internal port 후보로 쓴다.

**변환** — `image`(→ 로컬 이미지에서 digest 해석), `command`·`entrypoint`(배열만), `volumes`(명명 볼륨만), `restart`(`always` → `unless-stopped`), `deploy.resources.limits.memory`·`cpus`, `depends_on`(위상 정렬 순서).

`command: npm start` 같은 셸 문자열은 거부한다(`DEPLOYMENT_STACK_SHELL_FORM_UNSUPPORTED`). 배열 형식만 받는 기존 컨테이너 생성 계약과 같은 이유다.

## 5. 이름 충돌

manifest `name` 은 사실상 전역 유일 키다(`findByIdentity(name)`). 스택마다 `web`·`api` 같은 이름을 쓰면 서로 충돌한다. 그래서 manifest 이름을 **`<스택이름>-<서비스이름>`** 으로 만든다.

검증은 **결합된 문자열 하나에만** 걸린다 — `deploymentNameSchema`(`^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$`, 최대 63자). 그래서 서비스 이름 단독으로는 무효인 값(`1db`)도 스택 이름과 붙어 규칙을 만족하면 통과하고, 각각 유효해도 합쳐서 63자를 넘으면 거부된다.

## 5.1 상한과 에러 코드

- `COMPOSE_SOURCE_MAX_BYTES` 262,144(256KiB), `COMPOSE_SERVICE_MAX_COUNT` 32 (`packages/contracts/src/deployment-stack.ts`).
- 에러 코드는 `DEPLOYMENT_STACK_*` 14개를 3파일에 등록해 뒀다. 3.1 에서 실제로 던지는 것은 `PARSE_FAILED`·`SERVICES_MISSING`·`SERVICE_LIMIT`·`REJECTED`·`DEPENDENCY_CYCLE`·`DEPENDENCY_MISSING`·`IMAGE_MISSING`·`PORT_MISSING`·`SHELL_FORM_UNSUPPORTED`(전부 400)이고, 나머지 `NOT_FOUND`(404)·`VERSION_EXISTS`(409)·`RELEASE_IN_PROGRESS`(409)·`RELEASE_NOT_FOUND`(404)·`CREATE_FAILED`(400)는 3.2·3.3 용으로 미리 잡아 둔 것이다.
- 스택 릴리스 상태 계약도 이미 고정돼 있다: `DEPLOYMENT_STACK_RELEASE_STATUS` 4종(`releasing`·`healthy`·`failed`·`rolled-back`)과 `deploymentStackReleaseSchema`.
- 이미지는 변환기가 직접 조회하지 않는다. `imageDigestByReference: Map<태그, digest>` 를 주입받고, 못 찾으면 `DEPLOYMENT_IMAGE_DIGEST_NOT_FOUND` 를 던진다. 이 맵을 채우는 것은 3.2 의 몫이다.

## 5.2 KNOWN ISSUE — 구현이 문서 원칙과 어긋나는 지점

3.1 구현을 검증하다 찾은 것이다. **코드는 이번 범위에서 고치지 않았고 3.2 에서 정리한다.**

- ~~**값 없는 환경변수 키가 조용히 사라진다.**~~ **3.2 에서 해소했다.** 값이 없거나 빈 항목은 `environment-value-missing` rule 로 거부한다(거부 규칙이 7종 → 8종). 어느 서비스의 어느 키인지 `details.rejections` 에 실린다 → [0041](./0041-deployment-stack-persistence.md). `environmentKeys` 가 compose 경로에서 항상 빈 배열인 것은 이제 버그가 아니라 계약이다 — 모든 환경변수가 secret 참조여야 하기 때문이다.
- **`internal-port` 결정은 3단계다** — label → `expose` → `ports` 의 컨테이너 포트. §3 표는 2단계까지만 적었다.
- **multi-document YAML 은 첫 문서만 읽는다.**
- **`volumes` long syntax(객체형)는 조용히 무시된다.** 문자열 `name:path[:ro]` 만 파싱한다.

## 6. 남은 것

- ~~3.2 저장·조회 API~~ 완료 → [0041](./0041-deployment-stack-persistence.md)
- 3.3 스택 릴리스 오케스트레이션(순차 배포, 실패 시 역순 롤백, 스택 단위 동시성 잠금 — `deployment_stack_release` 의 부분 unique index 가 DB 쪽 잠금을 이미 강제한다)
- 3.4 웹 화면(compose 업로드·미리보기·스택 배포)
- manifest 폼은 여전히 라우트를 필수로 입력받는다. 내부 서비스를 단일 manifest 로 만들 UI 는 4.7 에서 연다.
