# 0041 — 스택 저장 범위와 값 없는 환경변수 처리

- 날짜: 2026-08-06
- 상태: 채택 (3.2 범위)
- 관련: [0040](./0040-compose-stack-contract.md) §5.2, [PLAN-UX-REMEDIATION.md](../PLAN-UX-REMEDIATION.md) §3.x

3.1 이 남긴 미결 2건을 3.2 착수 전에 확정한다.

## 1. 값 없는 환경변수 키는 유효성 검사 실패다

`environment: [FOO]` 또는 `environment: { FOO: null }` 처럼 값이 없는 항목이 3.1 구현에서는 거부되지도(`value` 가 있을 때만 검사) `ignored` 에 실리지도 않고 그냥 버려졌다. `manifest.environmentKeys` 는 항상 빈 배열이었다.

**결정: 거부한다.** 사용자 판단 — "옮기느니 거부하느니 무시하느니가 아니라, 유효성 검사에서 실패로 명시적으로 보이게 해야 한다."

- `COMPOSE_REJECTION_RULE` 에 값 없는 환경변수용 rule 을 추가하고, 기존 평문 환경변수와 같은 경로(`DEPLOYMENT_STACK_REJECTED` 400 + `details.rejections`)로 돌려준다.
- 위반은 첫 건에서 멈추지 않고 전부 모아 돌려준다. 어느 서비스의 어느 키인지 응답에 남아 화면에서 그대로 읽힌다.
- 미리보기와 저장이 같은 변환기를 타므로 두 경로 모두 같은 실패를 낸다.

기각한 대안

| 대안                           | 기각 이유                                                                                                       |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `environmentKeys` 로 자동 이관 | 값 없는 키의 의도가 "런타임 주입"인지 "쓰다 만 것"인지 파일만으로 알 수 없다. 조용히 통과시키면 오타가 배포된다 |
| `ignored` 에 실어 무시         | 동작은 지금과 같다. 사용자가 응답을 펼쳐 보지 않으면 여전히 조용히 사라진 것과 다르지 않다                      |
| 그대로 둔다                    | §4 의 "조용히 무시하지 않는다" 원칙과 정면으로 충돌한다                                                         |

부수 결과: 모든 환경변수는 `KEY: secret:<reference>` 형식이어야 하므로 `environmentKeys` 는 compose 경로에서 계속 빈 배열이다. 이제는 버그가 아니라 계약이다.

## 2. compose 원문은 보관하지 않는다

**결정: `deployment_stack` 에 compose 원문 컬럼을 두지 않는다.** 3.1 이 고정한 `deploymentStackSchema` 에 `composeSource` 가 없는 상태를 그대로 유지한다.

- 저장 정본은 변환된 manifest 다. 스택은 `manifestIds` + `serviceOrder` 로 그것을 가리키는 정참조다.
- 원문에는 평문 시크릿이 섞여 들어올 여지가 있다. 변환기가 평문 환경변수를 거부하지만, 주석·`x-` 확장 필드·미지원 키에는 검사가 닿지 않는다. 저장은 곧 영속화이므로 검사가 닿지 않는 텍스트를 DB 에 남기지 않는다.
- 재배포·롤백에 필요한 것은 manifest 이지 원문이 아니다.

기각한 대안: 원문 보관(스택 재편집·diff 에 유리하지만 contracts·DB·마이그레이션을 함께 넓혀야 하고 시크릿 노출면을 따로 막아야 한다).

## 3. 영향

- `packages/contracts/src/deployment-stack.ts` — rejection rule 1개 추가
- `apps/api/src/lib/compose-stack.ts` — 값 없는 환경변수 검사, 테스트 추가
- `packages/db-schema/src/schema.ts` — `deployment_stack`·`deployment_stack_release` (원문 컬럼 없음), migration 0020
