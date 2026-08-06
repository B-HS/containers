# 감사 해시 체인이 첫 항목부터 깨진 것으로 나왔다

- 발견일: 2026-08-06
- 심각도: major — 무결성 검증이 항상 실패로 나와 변조 탐지가 무의미해진다
- 발견 경로: A4 구현 직후 라이브 실측. 감사 대상 동작 하나를 일으키고 `GET /api/audit/integrity` 를 다시 부른 것

## 증상

```
기록 전: { anchorSequence: 0, brokenAt: null,  checked: 0, unchained: 85 }
기록 후: { anchorSequence: 0, brokenAt: 1,     checked: 1, unchained: 85 }
```

체인의 **첫 항목**이 곧바로 깨진 것으로 보고됐다. 변조는 없었다.

## 원인

`audit_log.created_at` 은 drizzle `integer('created_at', { mode: 'timestamp' })` 라 **초 단위**로 저장된다. 실제 저장값이 `1785988021` 인 것으로 확인했다.

해시 입력에는 `createdAt.toISOString()` 을 넣었기 때문에 **쓸 때는 밀리초까지, 읽어서 다시 계산할 때는 밀리초가 0** 이 된다. 같은 항목인데 두 해시가 달라진다.

단위 테스트가 이걸 놓친 이유는 테스트 시계가 `new Date('2026-08-05T00:00:00.000Z')` 처럼 **밀리초가 0** 이라 잘림이 아무 일도 하지 않았기 때문이다.

## 수정

- `computeAuditEntryHash` 가 시각을 `Math.floor(getTime() / 1000)` 로 넣는다. 컬럼이 보관하는 정밀도와 해시 입력을 일치시킨다.
- 회귀 테스트 2건:
    - `packages/config/src/audit-chain.test.ts` — 같은 초 안의 밀리초 차이는 해시를 바꾸지 않고, 1초 차이는 바꾼다.
    - `apps/api/src/service/domain/audit/create-audit-service.test.ts` — 체인 기록 테스트의 시계를 `...00.750Z` 로 바꿔 잘림이 실제로 일어나게 했다. 수정을 되돌리면 이 테스트가 깨지는 것을 확인했다.
- 검증 결과에 `brokenEntry`(id·operation·result·createdAt)를 실어 어느 기록에서 끊겼는지 바로 보이게 했다.

## 남은 정리 — 사용자 작업

버그가 살아 있던 동안 기록된 **감사 행 1건**(`traffic.export.create`)이 잘못된 해시를 가진 채 남아 있다. 이 행이 있는 한 검증은 계속 `brokenAt: 1` 을 보고한다.

감사 행을 고치는 것은 에이전트가 하지 않는다(감사 로그 변조와 구분되지 않는다). 아래를 직접 실행해 그 행을 체인 이전 기록으로 되돌린다. 기록 내용은 지우지 않고 hash 3개 컬럼만 비운다.

```
docker compose exec -T api bun -e "
const { Database } = require('bun:sqlite');
const db = new Database('/data/control.sqlite');
const changed = db.run('update audit_log set sequence = null, previous_hash = null, entry_hash = null where entry_hash is not null');
console.log(JSON.stringify(changed));
"
```

실행 뒤 `GET /api/audit/integrity` 가 `brokenAt: null` 이고, 다음 감사 기록부터 다시 체인이 이어지는지 확인한다.

## 교훈

저장 정밀도와 해시 입력 정밀도가 어긋나면 무결성 검증은 **항상 실패**한다. 시각을 해시에 넣을 때는 컬럼이 실제로 보관하는 단위로 정규화하고, 테스트 시계에 0 이 아닌 밀리초를 넣어 잘림이 드러나게 한다.
