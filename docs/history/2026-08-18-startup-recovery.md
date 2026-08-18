# 2026-08-18 — 기동 실패 복구와 공개 주소 재배치

실운영 스택이 `docker compose up` 단계에서 멈춘 사고를 복구하고, 그 과정에서 드러난 결함 3건을 고쳤다.

## 무엇이 일어났나

사용자가 재기동을 시도하자 아래로 끝났고, 패널이 내려간 채 복구되지 않았다.

```
Error response from daemon: error while removing network: network containers_edge
has active endpoints (name:"containers-api-1" id:"de6cf97acea9")
  [실패] 기동 실패 — docker compose logs 로 원인을 확인하세요.
```

같은 화면에 `Invalid origin: https://hyuns.uk` 경고가 함께 보였지만 **두 문제는 무관했다.** 기동 실패는 네트워크 정의 불일치, origin 경고는 공개 주소 설정 문제였다.

## 복구 절차

### 1. 네트워크 세대 차이

`compose.yaml` 은 edge 에 `subnet: 10.89.0.0/24` 를 요구하는데 실행 중이던 `containers_edge` 는 2026-08-02 생성분이라 `172.19.0.0/16` 이었다. Compose 가 재생성을 시도하다 api 가 붙어 있어 실패했고 `up` 전체가 중단됐다. → [bug/2026-08-18-edge-subnet-mismatch-blocks-startup.md](../bug/2026-08-18-edge-subnet-mismatch-blocks-startup.md)

`docker compose down`(볼륨 보존) → `build` → `up -d --wait` 으로 복구했다. 볼륨 7개 전부 보존됐고 5개 서비스가 healthy 로 올라왔다.

nginx 컨테이너가 edge 에서만 분리된 중간 상태로 남아 재시작조차 받지 않아, 그 컨테이너만 먼저 `docker rm` 으로 지웠다.

### 2. 2주 묵은 이미지

떠 있던 컨테이너들은 2주 전 이미지였다. 컨트롤 DB 의 마이그레이션이 **11/27** 세대라 `panel_setting`·`trusted_proxy` 테이블 자체가 없었다. [acknowledge/0036](../acknowledge/0036-public-origin-single-source-and-shutdown.md) 이 정한 "패널에서 공개 주소를 저장한다"는 경로가 그 이미지에는 존재하지 않았다.

재빌드로 27개 마이그레이션이 적용됐다.

### 3. 공개 주소 재배치

apex `hyuns.uk` 는 Cloudflare **Error 1016** 이었다. 와일드카드 `*.hyuns.uk` 가 apex 를 커버하지 않기 때문이다. 패널을 `panel.hyuns.uk` 로 옮기고 apex 는 워크로드에 넘기기로 했다 — 패널을 apex 에 두면 보호 hostname 이 되어 그 도메인으로 워크로드 라우트를 만들 수 없다. → [acknowledge/0043](../acknowledge/0043-panel-subdomain-and-apex-workload.md)

`compose.override.yaml` 을 `scripts/setup.sh` 가 생성하는 형식에 맞춰 다시 썼다. 이전 8080 설정은 `.env` 가 아니라 셸 환경변수로 들어가 있어 재기동하면 사라질 상태였다. 포트는 기본값 18080 으로 되돌렸다.

검증: `https://panel.hyuns.uk/ko` 200, sign-in origin 검사 401(403 아님), loopback 401.

### 4. 낡은 nginx 설정

apex 를 워크로드로 보내려고 프록시 라우트를 추가하자 `NGINX_PROTECTED_CONTRACT`(409)로 거부됐다. 관리 볼륨의 `current.conf` 가 8월 2일 세대라 catch-all(`server_name _; return 444`)이 없어 보호 계약을 만족하지 못했다. → [bug/2026-08-18-stale-nginx-config-fails-protected-contract.md](../bug/2026-08-18-stale-nginx-config-fails-protected-contract.md)

백업 후 `current.conf` 를 치우고 nginx 를 재시작해 최신 템플릿을 받았다(등록된 라우트 0건이라 손실 없음). 교체 직후 `panel.hyuns.uk` 는 catch-all 로 끊기고 loopback 만 열린 상태가 된다 — 패널 설정에서 공개 주소를 저장하면 복구된다.

### 5. 가드 훅 오탐

테스트 컨테이너를 띄우려는 명령이 `mkdir -p` 의 `-p` 때문에 "포트 publish" 로 오탐돼 차단됐다. 컨테이너 런타임 문맥 + 값 형태 두 단계로 좁혀 고쳤고 사례 20건으로 검증했다. → [bug/2026-08-18-guard-hook-false-positive-on-path-flag.md](../bug/2026-08-18-guard-hook-false-positive-on-path-flag.md)

## 저장소에 남긴 변경

- `.claude/hooks/guard-container-escape.sh` — publish 검사 오탐 수정
- `scripts/setup.sh` — 기동 전 네트워크 subnet 불일치 점검. 어긋나면 원인을 설명하고 동의를 받아 `down` 을 실행한다
- `docs/EXPOSURE.md` — 와일드카드가 apex 를 덮지 않는다는 사실과 apex 등록 방법
- bug 3건, acknowledge 1건

`compose.override.yaml` 은 gitignore 대상이라 커밋되지 않는다. 관리 볼륨의 `current.conf` 도 저장소 밖이다.

## 남은 운영자 작업

1. 패널 설정에서 공개 주소를 `https://panel.hyuns.uk` 로 저장 — 저장 전까지 외부 접근은 catch-all 로 끊긴다
2. apex 를 워크로드로 쓰려면 프록시 라우트 등록
3. `bun run audit:runtime` — 이번 세션의 셸에 bun 이 없어 실행하지 못했다
