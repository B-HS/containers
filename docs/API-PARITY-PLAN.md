# API 키 패리티 — 갭분석과 고도화 계획

2026-08-20 Forgejo+MySQL 배포 시도에서 드러난 결함을 근본 수정하고, 웹 세션으로 가능한 모든 조작을 API 키로도 가능하게 만드는 계획이다. 라우트 전수 조사(109개 엔드포인트)를 기반으로 한다.

## 1. 발견된 결함

### 1.1 레지스트리 호스트 DNS 검증이 통과 불가능한 사문 코드다 (P0)

- 증상: `POST /api/images/pull` 에 `codeberg.org/forgejo/forgejo:16` 처럼 레지스트리 호스트가 붙은 참조를 넣으면 항상 `REGISTRY_RESOLVE_FAILED`.
- 원인: `2bdcc61`(2026-08-04 하드닝) 이 api 를 edge 네트워크에서 제거해 api·engine-agent 전부 internal 네트워크만 남았다. 같은 커밋이 추가한 SSRF DNS 사전검증(`assertPublicRegistryReference`)은 internal 네트워크에서 외부 DNS 를 해석할 수 없어 **어떤 호스트 붙은 참조도 통과할 수 없다**. 실제 pull 은 호스트의 데몬이 하므로 egress 는 문제가 아니고, 검증 단계만 죽어 있다.
- 위치: `apps/engine-agent/src/service/domain/create-engine-control-service.ts` `assertPublicRegistryReference` (pull 과 createContainer 양쪽에서 호출).

### 1.2 같은 뿌리 — webhook 실전송도 불가능하다 (기록)

`create-notification-delivery-service.ts` 의 `assertPublicWebhookTarget` 도 DNS lookup 을 요구하고, 통과하더라도 api 컨테이너에 egress 가 없어 Discord 로 fetch 자체가 나갈 수 없다. Phase 17 은 api 가 edge 에 있던 시점(0022)의 설계고, 하드닝 이후 실전송 검증은 한 번도 수행된 적이 없다.

### 1.3 웹에서 가능한 조작 대부분이 API 키로 불가능하다 (P0)

세션 전용(mutating) 엔드포인트 전수:

| 그룹                           | 엔드포인트                                                                | 현재 세션 요구                           |
| ------------------------------ | ------------------------------------------------------------------------- | ---------------------------------------- |
| 컨테이너                       | POST /containers, POST /containers/:id/actions, POST /containers/:id/wait | recent admin (wait 는 operator)          |
| 이미지                         | POST /images/pull, POST /images/:id/tag, DELETE /images/:id               | recent admin (force 삭제는 owner)        |
| 네트워크·볼륨                  | POST·DELETE /networks, /volumes                                           | recent admin                             |
| nginx                          | POST·PUT·DELETE /nginx/routes, POST /nginx/config/apply                   | recent admin                             |
| 레지스트리 자격증명            | POST·DELETE /registry-credentials                                         | recent owner                             |
| prune                          | POST /system/prune                                                        | recent owner                             |
| 백업 복원                      | POST /backups/:id/restore                                                 | recent owner (API 키는 명시적 FORBIDDEN) |
| secret 회전                    | POST /deployment-secrets/rotate                                           | recent owner                             |
| artifact 삭제                  | DELETE /artifacts/:id                                                     | recent admin                             |
| traffic export                 | POST /traffic/exports, GET /traffic/exports/:jobId/download               | admin                                    |
| notification                   | /notification-destinations CUD·test                                       | recent admin                             |
| maintenance                    | POST /maintenance                                                         | recent owner                             |
| panel-settings·trusted-proxies | PUT·POST·DELETE                                                           | recent owner                             |
| 조회 계열                      | nginx·traffic·audit·stream SSE·top/changes·prune-preview 등               | 세션만 (engine:read 급인데 키 불가)      |

### 1.4 웹 UI 결함 (P1)

- 컨테이너 생성 폼에 **environment·volumes 입력이 없다** (API 계약은 지원). MySQL 처럼 env 초기화가 필요한 컨테이너를 UI 로 만들 수 없다.
- API 키 발급 위젯이 role 무관하게 전체 scope 를 기본 선택한다. admin 이 기본값 그대로 제출하면 owner 전용 scope(backup:write·secret:write) 때문에 항상 FORBIDDEN.

## 2. 설계

### 2.1 권한 모델 — "API 키 = 발급자의 비대화형 자격증명"

- `authenticate` 가 키 발급자의 **현재 role** 을 함께 반환하고, 라우트의 role 요구(예: force 삭제=owner)를 키 경로에도 동일하게 적용한다. 발급 후 강등되면 키도 함께 약해진다(기존 owner 전용 scope 동작과 일관).
- 세션의 "recent 15분" 요구는 키 경로에서 **scope 보유로 대체**한다(기존 backup:write 등과 동일한 선례).
- 공통 헬퍼 `authenticateScopeOrRole({ headers, scope, roles, recent })` 를 lib 에 두고 라우트들이 재사용한다. 반환값은 `{ userId, role, authMethod, apiKeyId? }` 로 정규화하고, mutating audit 에 `apiKeyId` 를 기록한다.

### 2.2 신규 scope (도메인별 read/write, 기존 네이밍 유지)

`artifact:write`, `audit:read`, `backup:restore`_, `container:write`, `image:write`, `maintenance:read`, `maintenance:write`_, `network:write`, `nginx:read`, `nginx:write`, `notification:read`, `notification:write`, `panel-setting:read`, `panel-setting:write`_, `registry-credential:read`, `registry-credential:write`_, `system:prune`_, `traffic:read`, `traffic:export`, `trusted-proxy:read`, `trusted-proxy:write`_, `volume:write`

`*` = owner 전용 발급·사용 (기존 `OWNER_ONLY_API_KEY_SCOPES` 확장). 조회 계열(top/changes·prune-preview·stream SSE)은 기존 `engine:read` 로 흡수한다.

### 2.3 세션 전용으로 남기는 것 (제안)

- exec (`POST /containers/:id/exec`, exec-tickets, WS) — 대화형 TTY, 최고 위험.
- API 키 관리 자체 (`/api-keys` CRUD) — 키로 키를 만드는 권한 상승 차단.
- 계정·초대·bootstrap (`/auth`, `/users`, `/invitations`, `/session`) — 신원 결합 조작.

### 2.4 레지스트리 검증 수정 (1.1)

DNS 사전검증을 제거하고 **정적 검증**으로 대체한다: 레지스트리 호스트가 IP 리터럴이면 사설·루프백·링크로컬 대역 거부, `localhost`·`*.local`·`*.internal`·단일 라벨 호스트 거부. 검증 위치는 agent 유지(비 DNS 로직만). pull 실행 주체는 호스트 데몬이고 호출자는 recent admin/owner 또는 `image:write` 키로 제한되므로 잔여 위험(공개 도메인이 사설 IP 로 해석되는 rebinding)은 수용한다. egress-broker 신설(알림 실전송까지 해결)은 별도 결정으로 후속 과제에 둔다.

### 2.5 웹 UI

- 컨테이너 생성 폼: environment(줄당 `KEY=VALUE`)·volumes(줄당 `name:/mount[:ro]`)·entrypoint 입력 추가.
- API 키 위젯: 신규 scope 반영 + 기본 선택을 발급자 role 로 허용되는 것만으로 축소.

## 3. 구현 순서

1. contracts: `API_KEY_SCOPE` 확장, `OWNER_ONLY_API_KEY_SCOPES` 확장
2. api lib: `authenticateScopeOrRole` 헬퍼 + `authenticate` 가 role 반환
3. 라우트 적용: control(컨테이너·이미지·네트워크·볼륨·prune·registry-credential) → nginx → backup restore → secret rotate → artifact delete → traffic → audit → notification → maintenance → panel-setting → trusted-proxy → stream
4. agent: `assertPublicRegistryReference` 정적 검증 교체 (+ webhook 검증도 동일 정적화, 실전송 불가는 bug 문서로 기록)
5. web: 컨테이너 생성 폼 확장, api-key 위젯 수정
6. 테스트: 헬퍼 단위, 라우트 통합(키 성공·scope 부족 403·owner 전용·audit 기록), 정적 검증 단위, 기존 전체 회귀
7. 문서: API-DATA-AUTH.md 인증 표 갱신, acknowledge 결정 기록, bug 3건(레지스트리 DNS·webhook egress·api-key 위젯 UX)

## 4. 검증·완료 기준

- `bun run typecheck` → `lint` → `test` → `build` 전부 통과.
- 실측: 재배포된 패널에서 API 키만으로 이미지 pull(codeberg.org 참조 포함) → env·볼륨 포함 컨테이너 생성 → Forgejo 스택 릴리스까지 완주.
- 실배포는 호스트에서 `git pull` 후 재빌드(CONTROL-PLANE-UPGRADE.md 절차).
