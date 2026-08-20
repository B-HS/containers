# egress 부재로 레지스트리 DNS 검증과 webhook 실전송이 사문화됐다

## 증상

- `POST /api/images/pull` 에 레지스트리 호스트가 붙은 참조(`codeberg.org/forgejo/forgejo:16`)를 넣으면 durable job 이 항상 `REGISTRY_RESOLVE_FAILED` 로 실패한다. `mysql:9` 처럼 호스트 없는 Docker Hub 참조만 성공한다.
- Discord webhook 알림은 검증 단계(`assertPublicWebhookTarget` 의 DNS lookup)를 통과할 수 없고, 통과하더라도 api 컨테이너에서 discord.com 으로 나가는 경로가 없어 실전송이 불가능하다.

## 원인

`2bdcc61`(2026-08-04 보안 하드닝 12라운드)이 관리 plane 격리를 위해 api 를 edge 네트워크에서 제거해 api·engine-agent 가 전부 internal 네트워크(ingress·control)만 갖게 됐다. 같은 커밋이 추가한 SSRF DNS 사전검증(레지스트리 호스트·webhook 대상)은 internal 네트워크에서 외부 DNS 를 해석할 수 없으므로 **어떤 입력으로도 통과할 수 없는 사문 코드**가 됐다. 실제 pull 은 호스트의 Docker 데몬이 수행하므로 egress 자체는 문제가 아니고 검증 단계만 죽어 있었다. Phase 17 의 webhook 실전송은 api 가 edge 에 있던 시점(acknowledge 0022)의 설계였고, 하드닝 이후 실전송 검증이 한 번도 수행되지 않아 회귀가 발견되지 않았다.

## 해결 (feat/api-key-parity)

acknowledge [0044](../acknowledge/0044-api-key-parity-and-egress-broker.md) 의 결정대로 egress-broker 를 신설했다.

- `apps/egress-broker` — control·edge 에 걸친 소형 내부 서비스. shared-secret(HMAC) 인증으로 DNS 해석 대행(`/v1/egress/resolve`)과 webhook 발송 대행(`/v1/egress/webhook`)을 제공한다. api·agent 는 internal 격리를 유지한다.
- 레지스트리 참조 검증은 두 겹이다: `@containers/contracts/net-guard` 의 정적 검증(사설 IP 리터럴·localhost·`.local`/`.internal`·단일 라벨 거부)을 api·agent 양쪽에 두고, api 는 추가로 broker 해석 결과가 사설 대역이면 거부한다. agent 의 DNS 의존 코드는 제거했다.
- notification delivery 는 직접 fetch 대신 broker 의 webhook 대행을 쓴다. 상태 코드·retry-after 분류는 기존과 동일하다.

이식 과정에서 agent 의 IPv4-embedded IPv6 파싱이 16비트 값 2개를 바이트 배열에 넣던 결함(사설 판정 위치가 틀어짐)도 net-guard 에서 바로잡았다.

## 남은 한계

- resolve 후 fetch/pull 시점의 DNS rebinding 은 이전 구현과 동일하게 막지 못한다(데몬·broker 가 각자 다시 해석). 호출자가 recent admin/owner 또는 해당 write scope 키로 제한되는 것을 전제로 수용한다.
- webhook 실전송의 실측 검증은 실제 Discord webhook 제공 시에만 가능하다(0022 와 동일한 조건).
