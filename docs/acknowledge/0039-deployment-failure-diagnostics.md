# 0039 — 배포 실패 진단을 job event 에 남긴다

- 날짜: 2026-08-06
- 상태: 채택
- 관련: [PLAN-UX-REMEDIATION.md](../PLAN-UX-REMEDIATION.md) 2.2, [quality-assurance/2026-08-05-panel-ux-audit.md](../quality-assurance/2026-08-05-panel-ux-audit.md) §13, [SECURITY.md](../SECURITY.md) §9·§19

## 1. 문제

blue-green 릴리스가 실패하면 패널에 남는 것은 실패 코드 하나였다.

```
job events:  {"code": "DEPLOYMENT_HEALTHCHECK_FAILED"}
release:     failureCode=DEPLOYMENT_HEALTHCHECK_FAILED, containerName=demo-a-1.0.0-...
```

원인은 컨테이너 안에 명확히 찍혀 있었다(`mkdir(...) failed (30: Read-only file system)`, `chown(...) failed (1: Operation not permitted)`). 그런데 패널은 `containerName` 을 저장만 하고 그것으로 무엇을 볼 수 있는 경로를 주지 않아, 원인 파악에 호스트의 `docker logs` 가 필요했다. 릴리스 job 은 `maxAttempts` 1 이라 첫 실패가 유일한 증거인데 그 증거가 버려졌다.

## 2. 결정

실패 시점에 대상 컨테이너의 상태와 로그 꼬리를 수집해 **durable job event `detail` 한 곳에만** 남기고, 배포 화면의 실패 릴리스에서 펼쳐 보게 한다.

- 수집은 릴리스 서비스가 한다. 어느 단계에서 죽었는지(`probe`·`route`·`observation`)는 서비스만 알기 때문이다.
- 서비스는 job 을 모른다. `run(id, { reportDiagnostics })` 로 콜백을 받고, job handler 가 그것을 `reportProgress` 에 연결한다.
- 수집 시점은 컨테이너를 중지하기 전이다. `running` 값이 의미를 갖게 하려면 그래야 한다.
- 수집이 실패해도 릴리스 실패 처리는 그대로 진행한다.

## 3. 저장 위치를 job event 로 한정한 이유

`SECURITY.md` §9 는 "원본 Docker log 를 영구 DB 에 복제하지 않는 것을 기본으로 한다"고 정한다. 20줄 저장은 그 기본의 **명시적 예외**이므로 범위를 좁혔다.

- 줄 수 상한 20(stdout·stderr 를 이어붙인 뒤의 마지막 20줄), 줄당 512자에서 절단 + 말줄임(최대 513자), 빈 줄 제거.
- 저장 전 `redactSecretLines`(`packages/config/src/redact-log.ts`) 통과.
- `deployment_release` 행에도, API 오류 응답 `details` 에도 넣지 않는다.

권한 경계가 결정적이었다. `GET /api/deployment-releases` 는 전 역할이 볼 수 있고 job event 조회는 owner·admin(또는 `job:read`)이다. 진단을 release 계약에 넣으면 컨테이너 로그가 viewer 에게 열린다. 그래서 release 계약을 넓히지 않고 job event 를 읽는 쪽을 택했다.

## 4. 기각한 대안

| 대안                                                | 기각 이유                                                                                  |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `deploymentReleaseSchema` 에 진단 필드 추가         | 화면은 단순해지지만 로그가 전 역할에 열린다. 권한 경계가 job event 보다 넓다               |
| job handler 가 실패 후 직접 수집                    | 서비스 변경은 없지만 실패 단계를 모른 채 항상 같은 진단을 붙인다                           |
| `GET /api/deployment-releases/:id/diagnostics` 신설 | 같은 권한 확대 문제 + 진단을 두 곳에서 관리하게 된다                                       |
| 로그를 통째로 저장                                  | §9 의 기본 정책을 정면으로 깬다. 시크릿 노출면도 커진다                                    |
| 리댁션 없이 저장                                    | 기동 실패 로그에는 env 덤프가 흔히 섞인다. 저장은 곧 영속화이므로 리댁션 없이 넣을 수 없다 |

## 5. 함께 정리한 것

- **`DEPLOYMENT_RELEASE_FAILED` 가 `ERROR_CODE` 에 없었다.** 릴리스 서비스(`create-deployment-release-service.ts` catch 폴백)와 job handler 양쪽이 쓰는 문자열인데 미등록이라, 이 값이 응답 경로에서 `createAppError` 를 타면 `resolveErrorCode` 폴백으로 **500 INTERNAL_ERROR** 가 됐다. 3파일(`error-code`·`error-message`·`error.ts` STATUS_MAP)에 400 으로 등록했다.
- **시크릿 리댁션 유틸이 코드에 없었다.** `SECURITY.md` §9·`NGINX-TRAFFIC.md` §9·`IMPLEMENTATION-PLAN.md`(체크 완료 표시)가 있다고 기술했지만 저장소 전체에 구현이 없었다. 이번에 만들었고, 적용 범위가 배포 실패 진단 한 곳뿐이라는 사실을 `SECURITY.md` §9 에 명시했다.

## 6. 한계

- **수동 롤백 실패(`runRollback`)에는 진단이 붙지 않는다.** 이번 범위는 릴리스 실패다. 같은 헬퍼를 재사용하면 되지만 UI 가 `deploy.rollback` job 을 따로 조회해야 해서 분리했다.
- **로그 조회 API 와 SSE stream 은 여전히 원문이다.** 영속화가 없고 호출자가 이미 `engine:read` 를 가진 경로라 이번 범위에서 제외했다.
- 웹은 실패한 릴리스에 한해 `deploy.release` job 목록을 조회해 `payload.releaseId` 로 매칭하고, 그 job 의 event 중 **마지막 진단 1건**만 보여준다(`findLast`). 클라이언트도 `JOB_VIEWER_ROLES = ['owner','admin']` 로 먼저 가리므로 그 외 역할에는 실패 코드만 보인다.
- **컨테이너 생성 이전 실패에는 진단이 없다.** 수집이 `containerId` 존재를 전제한다.
- `failureCode` 자체의 가공 규칙은 이 변경 범위 밖이다: 예외 메시지를 512자로 자르고, 라우트 전환 후 롤백까지 실패하면 `ROLLBACK_FAILED:` 접두가 붙는다. 성공(healthy)인데 `PREVIOUS_CONTAINER_STOP_WARNING` 이 채워지는 경로도 있다.
- 공개 심볼: `deploymentFailureDiagnosticsSchema`·`DEPLOYMENT_FAILURE_DIAGNOSTICS_STEP`·타입 `DeploymentFailureDiagnostics`(contracts `deployment`), `DeploymentReleaseRunOptions`(릴리스 서비스).
