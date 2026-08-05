# 0031 — 의존성 상향과 타입 안전성 강화

- 작성일: 2026-08-05
- 상태: 결정 확정 (구현 완료)
- 선행: [0030](./0030-ci-verification-surface-and-exposure-scope.md), [0028](./0028-monorepo-convention-alignment.md)
- 대응 커밋: `e286923`, `0424177`, `0e9cec2`, `fec4eab`, `221cd04`
- 범위: `bun audit` 취약점 제거, Next.js 16.3.0 상향, 저장소 전체 `eslint-disable`·`any` 제거

## 1. 배경

준비도 3단계 9건까지 끝난 뒤 사용자가 세 가지를 지시했다.

1. Next.js 16.3.0 및 나머지 의존성 상향
2. `eslint-disable`·`any` 전부 제거
3. Workflow(opus/medium)로 수정 결과를 검증

이 중 3번은 `apps/api/src/lib/with-error-handling.ts` 때문에 필요했다. 이 파일은 이전 세션까지 "손대지 말 것" 목록에 있었고, 그 이유가 "hono RPC 타입 보존"이라는 주석 한 줄로만 남아 있어 실제로 무엇이 깨지는지 아무도 몰랐다.

## 2. 결정

### 2.1 `withErrorHandling` 은 핸들러 반환 타입 `R` 을 유지하고 단언한다

```ts
export const withErrorHandling = <I extends Input, R extends HandlerResponse<unknown>>(
    handler: (context: Context<ApiEnv, string, I>, next: Next) => R,
) =>
    (async (context: Context<ApiEnv, string, I>, next: Next) => {
        /* try → handler, catch → errorResponse */
    }) as unknown as (context: Context<ApiEnv, string, I>, next: Next) => R
```

- **이유**: 에러 분기는 `R` 이 기술하지 않는 응답 형태(`errorResponse`)를 추가한다. 정직한 반환 타입은 `R | Response` 이고, 그 순간 hono 가 라우트의 RPC 응답 스키마 추론을 포기한다. `apps/web` 은 `hc<AppType>` 로 이 스키마를 그대로 소비하므로, 추론이 사라지면 웹 전체가 응답 필드 타입을 잃는다.
- 이 사실은 근거를 남긴다: JSDoc 에 "왜 단언인가"를 명시했다(주석 금지 규칙의 유일한 예외인 JSDoc, 영어).

### 2.2 기각된 대안 — 반환 타입을 `Promise<Response>` 로 정직하게 적기

처음 시도한 안이다. `any` 는 사라지지만 **RPC 응답 타입이 통째로 지워진다.**

- 검증 방법: `git worktree` 로 HEAD 를 따로 체크아웃하고 양쪽에서 동일한 `InferResponseType` 프로브를 돌렸다. HEAD 는 `{ data: {...}, success: true }`, 수정본은 `{}` 였다.
- 이 회귀는 typecheck·lint·테스트를 **전부 통과했다.** Workflow 검증 에이전트가 아니었으면 발견되지 않았다.
- 결론: 기각. 대신 2.1 의 단언 + JSDoc 근거를 채택했다.
- 참고: 요청 인자(`context.req.valid`) 쪽 타입은 HEAD 에서도 이미 비어 있었다. 동일 프로브를 양쪽 트리에서 돌려 확인했으므로 이번 변경의 회귀가 아니다.

### 2.3 `as never` 이중 캐스트 80개는 제네릭 컨텍스트 타입으로 대체한다

```ts
// before
withErrorHandling(async (context) => {
    const body = context.req.valid('json' as never) as z.infer<typeof schema>
})
// after
withErrorHandling(async (context: ApiRouteContext<{ json: z.infer<typeof schema> }>) => {
    const body = context.req.valid('json')
})
```

- 각 앱이 자기 `ApiRouteContext`/`AgentRouteContext`/`TrafficRouteContext` 를 export 한다.
- **이유**: `as never` 는 검증 결과를 무조건 통과시켜, 스키마와 실제 값이 어긋나도 컴파일이 성공한다. 실제로 이 캐스트가 드리프트 하나를 감추고 있었다(§2.4).

### 2.4 `as never` 가 감추고 있던 실제 드리프트 — `operation_job.kind`

`packages/db-schema/src/schema.ts` 의 `operation_job.kind` enum 에 `'secret.rotate'` 가 빠져 있었다. 앞 세션에서 secret rotate job 을 추가하며 계약에만 넣고 스키마에는 넣지 않았다.

- SQLite 의 `text({ enum: [...] })` 는 **TypeScript 전용**이라 CHECK 제약이 생기지 않는다. 그래서 런타임은 정상 동작했고, `drizzle-kit generate` 도 "No schema changes" 를 냈다.
- 스키마에 값을 추가했다. 마이그레이션은 발생하지 않는 것이 정상이다.

### 2.5 `USER_ROLE` 단일 출처를 `packages/contracts` 로 옮긴다

`db-schema` 와 `contracts` 양쪽에 역할 상수가 있었다. `contracts/src/user-management.ts` 를 단일 출처로 삼고 `db-schema` 는 재export 만 한다. 컬럼은 `USER_ROLE_VALUES`·`ASSIGNABLE_USER_ROLE_VALUES` 를 쓴다.

### 2.6 알림 실패 매핑을 `Partial` 에서 전체 `Record` 로 좁힌다

`FAILURE_EVENT_BY_JOB_KIND` 가 `Partial<Record<OperationJobKind, ...>>` 여서 새 job kind 를 추가해도 컴파일러가 알려주지 않았다. 전체 `Record<OperationJobKind, NotificationEventType | null>` 로 바꾸고 "알림 없음"은 `null` 로 명시했다. 이제 job kind 를 추가하면 이 맵이 컴파일 에러를 낸다.

### 2.7 의존성 상향 — 도달 가능성을 확인한 뒤 올린다

`bun audit` 7건(high 3) → 0건. 다만 각 항목이 실제로 도달 가능한지 먼저 확인했다.

| 패키지                    | 실제 도달성                                                      | 조치                                 |
| ------------------------- | ---------------------------------------------------------------- | ------------------------------------ |
| sharp                     | web 런타임 이미지에 포함. `/_next/image` 가 SVG·원격 URL 을 거절 | 상향                                 |
| postcss, esbuild          | 빌드 전용                                                        | 상향 + 루트 `overrides.esbuild` 고정 |
| drizzle-kit               | 빌드/마이그레이션 전용                                           | 상향                                 |
| hono CORS 미들웨어 취약점 | 이 저장소는 CORS 미들웨어를 쓰지 않음                            | 상향(부수 효과로 해소)               |

- **이유**: "audit 0건"을 목표로 무작정 올리면 실제 위험도와 무관한 변경으로 릴리스가 커진다. 도달성을 먼저 판단하고, 결과적으로 전부 올릴 수 있어 올렸다.

## 3. 검증

- Workflow: 에이전트 29개, `model: opus` / `effort: medium`, pipeline + adversarial verify 단계.
- 정적: typecheck / lint / test / build 전부 통과.
- Workflow 가 잡은 실제 회귀 1건(§2.2)은 정적 검사를 통과한 상태였다. **"typecheck 통과 = 안전"이 성립하지 않는 사례**로 기록한다.
- 회귀 판정은 에이전트 보고를 그대로 믿지 않고 `git worktree` 로 HEAD 를 병렬 체크아웃해 동일 프로브를 양쪽에서 돌려 직접 재현했다.

## 4. 남은 사실

- `apps/api`·`apps/engine-agent`·`apps/traffic-worker`·`apps/web`·`packages/*` 전체에 `eslint-disable` 0개, `any` 0개. (`apps/web/.next/types/*` 의 `any` 는 Next.js 가 생성하는 산출물이라 대상이 아니다)
- 남은 `as never` 는 테스트 스텁 2건뿐이다 — `apps/engine-agent/src/service/shared/create-interactive-exec-session.test.ts:54`, `apps/api/src/service/domain/job/create-job-handlers.test.ts:160`. 둘 다 "이 경로에서 이 값은 쓰이지 않는다"를 표현하는 스텁이라 제품 타입 안전성에 영향이 없다.
- 그 밖의 타입 단언은 `with-error-handling.ts` 3개 파일의 `as unknown as`(§2.1) 와 hono 상태 코드 캐스트(`as ContentfulStatusCode`) 뿐이며, 둘 다 근거가 JSDoc/이 문서에 기록돼 있다.
