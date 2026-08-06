# 0042 — 스택 릴리스 오케스트레이션과 되돌리기

- 날짜: 2026-08-06
- 상태: 채택 (3.3 범위)
- 관련: [0040](./0040-compose-stack-contract.md), [0041](./0041-deployment-stack-persistence.md), [PLAN-UX-REMEDIATION.md](../PLAN-UX-REMEDIATION.md) §3.x

## 1. 기존 blue-green 릴리스를 그대로 쓴다

스택 배포는 서비스마다 **기존 `deploymentReleaseService.create` + `run`** 을 순서대로 호출한다. 스택 전용 배포 경로를 새로 만들지 않았다.

이유: 릴리스 서비스가 이미 probe·라우트 전환·관찰·자동 롤백·실패 진단·중단 복구를 전부 갖고 있다. 스택용으로 복제하면 두 벌을 같은 수준으로 유지해야 한다. 스택 서비스는 **순서와 되돌리기만** 책임진다.

기각한 대안: 스택 전용 릴리스 구현(중복), 서비스 병렬 배포(`depends_on` 의미를 잃고 실패 시 되돌릴 범위가 불명확해진다).

## 2. 되돌리기는 이전 버전 유무로 갈린다

실패 시 **이미 healthy 인 서비스만 역순으로** 되돌린다. 실패한 서비스 자신은 릴리스 서비스의 catch 가 이미 정리했다.

| 상황                       | 방법                              | 결과                                          |
| -------------------------- | --------------------------------- | --------------------------------------------- |
| 이전 healthy 릴리스가 있다 | `prepareRollback` + `runRollback` | 이전 컨테이너를 다시 띄우고 라우트를 되돌린다 |
| 첫 배포라 이전 버전이 없다 | `revert`(신설)                    | 라우트를 지우고 컨테이너를 멈춘다             |

`revert` 는 이번에 릴리스 서비스에 추가했다. 기존 롤백 2경로(자동 catch·수동 `runRollback`)는 **되돌아갈 이전 릴리스가 있다고 전제**하기 때문에, 첫 배포한 서비스를 원상복구할 방법이 없었다. `failureCode` 는 `RELEASE_REVERTED` 다.

## 3. 되돌리기 실패는 `failed` 다

되돌리기가 하나라도 실패하면 스택 배포 상태를 `rolled-back` 이 아니라 **`failed`** 로 남긴다. `rolled-back` 은 "배포 전 상태로 안전하게 돌아갔다"는 뜻이고, `failed` 는 "사람 손이 필요하다"는 뜻이다. 두 상태를 뭉개면 운영자가 확인해야 할 상황을 놓친다.

## 4. 동시성은 DB 와 서비스 두 겹

- `deployment_stack_release` 의 부분 unique index(`status='releasing'`) — 3.2 에서 미리 넣었다.
- 서비스 `create` 의 `findActiveByStack` 사전 검사 → `DEPLOYMENT_STACK_RELEASE_IN_PROGRESS`(409).

사전 검사만 두면 경합에서 새어 나가고, index 만 두면 SQLite 제약 오류가 그대로 500 이 된다. 둘 다 둔다.

## 5. 중단 복구는 스택과 릴리스가 따로 수렴한다

API 재기동 시 `releasing` 으로 남은 스택 배포는 `DEPLOYMENT_STACK_RELEASE_INTERRUPTED` 로 `failed` 처리한다(`server.ts` 의 startup task). 개별 릴리스는 기존 `deploymentReleaseService.reconcileInterrupted` 가 자기 규칙대로 수렴시킨다.

스택 쪽에서 개별 릴리스까지 되돌리지 않는 이유: 릴리스 복구는 컨테이너·라우트 실제 상태를 봐야 하고 그 판단은 릴리스 서비스가 이미 갖고 있다. 스택은 자기 행만 정리하고 사실을 남긴다.

## 6. job kind 추가

`deploy.stack-release` 를 5곳에 등록했다 — contracts 상수·z.enum, db-schema kind enum, job handler 맵, 알림 event 매핑(`DEPLOY_FAILED`), `docs/llm.txt`. drizzle `text({ enum })` 은 CHECK 제약을 만들지 않으므로 **마이그레이션은 생기지 않는다**(generate 로 확인).

`maxAttempts` 는 1 이다. 배포 재시도는 컨테이너·라우트 부수효과를 반복하므로 기존 `deploy.release` 와 같은 정책을 따른다.
