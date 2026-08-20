# PROCESS — 현재 작업 상태

## 기준 문서

- 코딩 규칙: `/Users/gkn/.config/opencode/llm-rules/`
- 디자인·운영 레퍼런스: `/Users/gkn/flunti-otel`
- 공식 문서 근거: [references/OFFICIAL-SOURCES.md](./references/OFFICIAL-SOURCES.md)
- 현재 단계: 승인된 구현 계획에 따라 단계별 구현과 검증을 수행한다.
- 안전 재개 단일 진입점: [RESUME-CHECKLIST.md](./RESUME-CHECKLIST.md)

완료된 2026-07-31 ~ 2026-08-06 작업 섹션은 [history/2026-08-20-process-archive.md](./history/2026-08-20-process-archive.md) 로 옮겼다.

## 작업: 2026-08-18 기동 실패 복구와 재발 방지

실운영 스택이 `docker compose up` 단계에서 통째로 멈춘 사고를 복구하고, 같은 실패가 다시 나지 않도록 스크립트와 문서를 고쳤다. 상세는 [history/2026-08-18-startup-recovery.md](./history/2026-08-18-startup-recovery.md).

- [x] a. edge 네트워크 subnet 불일치로 인한 기동 실패를 `bug/` 에 기록
- [x] b. 낡은 `current.conf` 가 보호 계약을 만족하지 못해 라우트 추가가 409 로 막히는 문제를 `bug/` 에 기록
- [x] c. 가드 훅이 `mkdir -p` 를 포트 publish 로 오탐하던 결함을 고치고 `bug/` 에 기록
- [x] d. `scripts/setup.sh` 에 네트워크 정의 불일치 사전 점검을 추가
- [x] e. 패널 공개 주소를 서브도메인으로 두고 apex 를 워크로드에 넘기는 결정을 `acknowledge/` 에 기록
- [x] f. `EXPOSURE.md` 에 와일드카드가 apex 를 덮지 않는다는 사실을 명시
- [x] g. 검증 후 커밋

## 작업: 2026-08-20 MySQL 9 + Forgejo 배포 (panel.hyuns.uk 원격 운영)

사용자 결정: 호스트네임 `forge.hyuns.uk`, 세션 전용 작업(이미지 pull·MySQL 컨테이너 생성)은 사용자의 Chrome 패널 세션으로 브라우저 자동화. Forgejo 는 API 키(`deployment:*`·`secret:*`)로 deployment-stack 경로 배포. MySQL 계정은 컨테이너 생성 env(`MYSQL_DATABASE`·`MYSQL_USER`·`MYSQL_PASSWORD`)로 초기화해 설치와 묶는다.

- [x] a. 경로 조사 — 이미지 pull·직접 컨테이너 생성은 세션 전용, MySQL 은 HTTP 프로브 불가로 스택 경로 배제, Forgejo 는 스택 경로(내부 nginx 프로브라 외부 DNS 무관), `*.hyuns.uk` 와일드카드 터널 실측 확인
- [x] b. 이미지 준비 — `mysql:9` 는 패널 pull 성공. `codeberg.org/forgejo/forgejo:16` 은 `REGISTRY_RESOLVE_FAILED`(engine-agent 가 internal control 네트워크라 레지스트리 호스트 DNS 해석 불가 — 호스트 붙은 참조는 pull 불가, bug 기록 필요) → 로컬 docker save + artifact upload + image load 로 우회 (digest `sha256:2fdfe28b...`)
- [ ] c. `forgejo-mysql` 컨테이너 생성 — env 로 forgejo DB·계정 초기화, `containers_edge`, 볼륨 `forgejo-mysql-data:/var/lib/mysql`
- [x] c-2. deployment secrets 9개 생성, Forgejo 16 이미지를 로컬 docker save + artifact upload + load 로 원격 엔진에 적재
- [x] d. deployment secrets 생성 + forgejo 스택 preview·생성·릴리스 (route `forge.hyuns.uk`, health `/api/healthz`, `INSTALL_LOCK=true`, SSH 비활성) — 1차 릴리스는 프로브 네트워크 격리 결함으로 실패, 수정 배포 후 재릴리스 healthy
- [x] e. 실측 검증 — 스택 릴리스 healthy, `https://forge.hyuns.uk` 200 + `/api/healthz` pass(DB ping 포함), MySQL 9·Forgejo 컨테이너 running, 실패 릴리스 잔여 컨테이너 정리. 전 과정을 API 키만으로 완주

## 작업: 2026-08-20 API 키 패리티·egress-broker (feat/api-key-parity)

기준 문서: [API-PARITY-PLAN.md](./API-PARITY-PLAN.md), [acknowledge/0044](./acknowledge/0044-api-key-parity-and-egress-broker.md). MySQL 컨테이너 생성이 세션 전용에 막히고 codeberg pull 이 REGISTRY_RESOLVE_FAILED 로 죽는 것을 계기로, 웹 세션 조작 전체의 API 키 패리티와 egress 계층을 근본 수정한다.

- [x] a. 라우트 109개 인증 방식 전수 조사, 갭분석·플랜 작성, 사용자 결정 수신(0044)
- [x] b. contracts — API_KEY_SCOPE 22종 추가, net-guard·egress 계약 신설, OWNER_ONLY_API_KEY_SCOPES 승격
- [x] c. api — authenticate 가 role 반환, authenticateScopeOrRole 헬퍼, OWNER_ONLY 8종 확장, audit 에 apiKeyId 병합
- [x] d. api — 라우트 패리티 적용 (control·nginx·backup·secret·artifact·traffic·audit·notification·maintenance·panel-setting·trusted-proxy·stream) — exec·api-keys·계정은 세션 전용 유지
- [x] e. egress-broker 앱 신설 (resolve·webhook 대행, shared-secret 인증, Dockerfile·compose, egress-credentials 볼륨)
- [x] f. 레지스트리 검증 재설계 — api 측 broker resolve + 정적 검증, agent 는 정적 검증만, webhook 발송 broker 경유 (IPv4-embedded IPv6 파싱 결함도 수정)
- [x] g. web — 컨테이너 생성 폼 env·volumes 입력(3개 언어), api-key 위젯 isOwner 기본값·비활성화
- [x] h. 테스트 — net-guard 12건·egress 서비스 6건·헬퍼 3건·control 이미지 검증 6건 + 기존 스텁 갱신 (총 590 pass)
- [x] i. 문서 — API-DATA-AUTH 인증 표 재작성, bug 2건(egress 사문화·api-key 위젯), llm.txt·ARCHITECTURE 서비스 지도 (compose-security 불변식은 신규 서비스가 기존 규칙을 그대로 만족해 변경 불필요)
- [x] j. 검증 — typecheck(9 workspace)→lint→format:check→test(562+28)→build 전체 통과. 실배포·런타임 실측은 호스트 재빌드 후 별도 진행(0044 결정 4)
- [x] k. 최근 인증(recent auth) 제거 — 사용자 결정([acknowledge/0045](./acknowledge/0045-remove-recent-auth.md)): requireRecentRole·RECENT_AUTH_REQUIRED 삭제, 전 라우트 requireRole 통일, 웹 15분 안내 문구 제거, BREAKING CHANGE 커밋
- [x] l. docs↔코드 정합성 전수 정리 — 라우트·문서 전수 조사 후 현재상태 문서 20여 곳 수정(HANDOFF·HANDOFF-STATUS·RUNBOOK·SECURITY·BACKUP-RESTORE·DOCKER-CONTROL·NGINX-TRAFFIC·TESTING·TECH-STACK·RESUME-CHECKLIST·CONTROL-PLANE-UPGRADE·README 2종·llm.txt·API-DATA-AUTH·API-PARITY-PLAN 상태 헤더). 시점 고정 기록(history·과거 acknowledge·날짜 박힌 QA·PLAN-UX-REMEDIATION·PROCESS 이력)은 관례대로 미수정. 조사 중 발견한 코드 결함 — 보호 볼륨 목록에 egress-credentials 누락(agent·api), setup.sh 기대 healthy 5→6 — 도 함께 수정
- [x] m. README 갱신(API 키 자동화 패리티·scope 표 링크) 후 dev 로 fast-forward 병합
- [x] n. 실배포 검증 중 발견 — 프로브 단계 네트워크 격리로 DB 의존 릴리스가 전부 실패([bug/2026-08-20-probe-network-blocks-db-dependent-releases.md](./bug/2026-08-20-probe-network-blocks-db-dependent-releases.md)). manifest.network 를 프로브 전에 접속하도록 수정, 게이트 통과. 호스트 api 재빌드 후 Forgejo 릴리스 재시도 필요
- [x] o. Forgejo 로그인 세션 유실 조사 — 라우트 템플릿의 Cookie·Authorization 제거가 원인([bug/2026-08-20-route-template-strips-cookie-authorization.md](./bug/2026-08-20-route-template-strips-cookie-authorization.md)). 템플릿 수정 + SECRET_KEY secret 주입(v16.1) + 상태ful 워크로드의 blue-green 충돌(구 컨테이너 선정지) 기록. api 재빌드 후 재릴리스로 라우트 재렌더, 공개 URL 로그인 세션 유지 실측 확인(/user/settings 200) — 해결 완료
