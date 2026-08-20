# 프로브 단계의 네트워크 격리가 DB 의존 배포를 전부 실패시킨다

## 증상

Forgejo 스택 릴리스가 `DEPLOYMENT_HEALTHCHECK_FAILED` 로 실패한다. 진단 로그: `dial tcp: lookup forgejo-mysql on 127.0.0.11:53: server misbehaving` — 같은 edge 네트워크에 있는 MySQL 컨테이너를 DNS 로 찾지 못한다.

## 원인

릴리스 러너가 컨테이너를 **probe 전용 internal 네트워크에만** 붙인 채 헬스 프로브를 돌리고, `manifest.network`(edge) 접속은 프로브 **통과 후**에만 수행했다. 프로브 단계에서 외부 의존(다른 네트워크의 DB 등)에 닿을 수 없으므로, 기동 시 DB 연결이 필요한 앱은 헬스체크를 영원히 통과할 수 없다. 지금까지의 배포가 전부 자기완결형(SQLite 내장) 워크로드라 드러나지 않았다.

## 해결

`create-deployment-release-service.ts` — 컨테이너 생성 직후 `manifest.network` 를 먼저 붙이고 나서 프로브를 돌린다. 프로브 자체는 여전히 probe 네트워크를 통해 수행되고, **nginx 라우트(트래픽 유입)는 변함없이 프로브 통과 후에만 생기므로** staging 격리의 목적(검증 전 트래픽 차단)은 유지된다. 검증 전 컨테이너가 edge 에 미리 붙는 것은 직접 생성 컨테이너와 동일한 노출 수준이다.

롤백 경로는 이전 컨테이너가 이미 실네트워크에 붙어 있어 변경이 필요 없다.

## 검증

- `create-deployment-release-service.test.ts` — health 실패 경로의 operation 순서를 `create → connect-edge → stop → disconnect-probe` 로 갱신, 전체 게이트 통과.
- 실측: forge.hyuns.uk Forgejo 스택 릴리스가 이 수정 배포 후 healthy 로 완주해야 한다.
