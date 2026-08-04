# 2026-08-04 실운영·CI API 운용 준비도 전면 검토

사용자 질문: "이제 실운영 + api로 github action으로 api운용까지 전부 다 가능한지 전면검토".
5개 영역 병렬 read-only 검토 후 종합했다. 근거는 `파일:라인` 또는 실행한 명령·결과이며, blocker 중 핵심 4건은 메인 세션에서 코드로 재확인했다.

## 1. 판정

| 질문                                          | 판정                   |
| --------------------------------------------- | ---------------------- |
| 실운영 가능한가                               | **no-go**              |
| GitHub Actions에서 API만으로 전 운용 가능한가 | **partially-possible** |

코어 엔지니어링 품질은 낮지 않습니다. nginx 설정 적용이 nginx -t 검증·원자 rename·HUP·post-reload probe·실패 시 이전 revision 자동 롤백까지 완결돼 있고, durable job queue는 heartbeat·stall sweep·부팅 시 보상 복구를 갖췄으며, API key 인증(ctk_ prefix·sha256 해시 저장·scope·만료·rate limit)과 업로드의 idempotency-key·청크 sha256 검증도 잘 만들어져 있습니다. 그럼에도 지금 상태로 실운영을 시작하면 곧바로 사고가 납니다. 첫째, compose.yaml에 restart 정책이 하나도 없어(실측 5개 컨테이너 전부 restart=no) 호스트 재부팅 한 번에 패널과 ingress가 함께 영구 정지하고, 알림 발송기가 죽는 대상(api 프로세스) 안에 있어 아무도 통지받지 못합니다. 둘째, 외부 노출 수단이 스택에 아예 없습니다. 유일한 publish가 127.0.0.1:8080이고 443 리스너·인증서 볼륨·cloudflared가 전부 부재하며, 앞단에 프록시를 붙여도 AUTH_TRUSTED_ORIGINS 하드코딩 때문에 실도메인 로그인이 403 INVALID_ORIGIN으로 막힙니다(실측 확인). 셋째, real_ip를 해석하지 않아 프록시 뒤에서는 client IP가 하나로 수렴해 로그인 5r/m·API 300r/m 제한이 전 사용자 공유가 되고, 외부 노출과 동시에 자기 DoS가 됩니다. 넷째, 백업이 재해복구가 아닙니다. 세트는 control.sqlite·traffic.sqlite·manifest.json 3개뿐인데 AES-256-GCM 마스터 키 3종(/data)·artifact 실파일·nginx current.conf가 빠져 있고 호스트 밖으로 꺼내는 경로도 없어, 볼륨을 잃으면 백업까지 함께 사라지고 키 없이 복원해도 모든 배포 secret이 영구 복호화 불가입니다. 다섯째, restore 자체가 21개 테이블 중 16개를 보존하고 5개만 되돌리는데, 되돌리는 deployment가 보존 대상 artifact를 onDelete restrict로 참조하므로(schema.ts:216-218) 새 호스트 복구는 foreign_key_check에서 반드시 실패합니다. 여섯째, __drizzle_migrations가 보존 목록에 없어 복원 시 migration 기록이 과거로 돌아가고, IF NOT EXISTS 없는 0011 CREATE INDEX가 재실행되면 무보호 top-level migrate가 던져 api가 기동 불가가 되며 restart 정책이 없어 그대로 멈춥니다. 즉 복구 수단이 복구 불능을 유발할 수 있습니다. 일곱째, 문서가 코드와 반대로 서술돼(BACKUP-RESTORE.md '모든 user table 교체', CONTROL-PLANE-UPGRADE.md의 백업 복원 롤백) 운영자가 잘못된 안전감을 갖습니다. 이 조합(자동 재기동 없음 + 조용한 실패 + 복구 불가)이 no-go 근거이며, 개인 단일 호스트 도구라는 성격을 감안해도 완화할 수 없습니다.

CI/API 질문은 부분 가능입니다. 단계별로 보면 0단계 도달성부터 막힙니다. API가 루프백에만 바인딩돼 GitHub 호스티드 러너는 접속 자체가 불가하고, 셀프호스티드 러너를 같은 호스트에 두는 우회만 남으며 그마저 평문 HTTP라 ctk_ 키가 노출됩니다. 1단계 업로드는 됩니다 — artifact:upload scope로 세션 생성(idempotency-key)→청크 PUT→finalize까지 호출이 성립합니다. 2단계 이미지 load도 image:load scope로 호출됩니다. 3단계 manifest 생성은 되지만 멱등하지 않아 워크플로 재실행 시 409 DEPLOYMENT_MANIFEST_VERSION_EXISTS로 죽습니다. 4단계 release·rollback도 API key로 호출 가능합니다. 막히는 지점은 판정과 검증입니다. 배포 계열이 전부 202 + job id만 돌려주는데 GET /api/jobs, /jobs/:id, /jobs/:id/events가 전부 requireRole 세션 전용이고 API_KEY_SCOPE 9종에 job 계열 scope가 아예 없습니다(소스 실측). release만 deployment:read로 우회 폴링이 되고, image load는 상태를 읽을 API key 경로가 전무해 실패 시 재요청이 조용히 새 job을 무한 재큐잉합니다. 배포 후 확인 경로(control-plane status·containers·logs·images·nginx)도 전부 세션 전용이라 결과 확인이 불가하고, job cancel이 recent-auth 전용이라 교착된 release를 CI가 풀 수도 없습니다. 첫 키 발급과 회전도 브라우저 전용이라 최대 1년마다 사람이 개입해야 합니다. 정리하면 '시작'은 API key로 되지만 '성패 판정·검증·롤백 판단·교착 해소'가 안 되므로 무인 배포로는 쓸 수 없습니다. 다만 원인이 인증 분기 부재라는 좁은 문제라, job:read scope 추가와 route 3~4곳 분기만으로 대부분 해소됩니다.

## 2. 실운영 개시를 막는 blocker

### restart 정책 부재 — 재부팅·데몬 재시작 후 패널과 ingress가 영구 정지

- 영역: 설치·부팅·복구
- 왜 막히는가: compose.yaml 전체에 restart 키가 없고 실측 docker inspect 결과 5개 컨테이너 모두 restart=no. nginx가 배포 워크로드의 ingress이므로 사용자 트래픽까지 함께 죽는다. 배포 컨테이너만 unless-stopped(contracts/deployment.ts:39)라 라우팅 없이 떠 있는 비대칭 상태가 되고, 알림 발송기가 죽은 api 안에 있어 통지도 못 간다. RTO가 사람 가용성에 무한 종속된다.
- 수정 방향: compose 5개 서비스에 restart: unless-stopped 추가. Docker Desktop 로그인 시 자동 시작(또는 Linux docker.service enable)을 설치 점검 항목에 포함. 작업 크기: 작음.

### 외부 노출 경로가 스택에 없다 — 127.0.0.1 전용, TLS 종단 수단 부재

- 영역: 외부 노출·HTTPS
- 왜 막히는가: compose.yaml:36의 127.0.0.1:8080:8080이 유일한 publish이고 infra/nginx/nginx.conf에 listen 443·ssl_certificate가 없으며 인증서 볼륨도 없다. cloudflared는 ARCHITECTURE.md:16 기준 미구현이고 설치 runbook도 없다. 급히 0.0.0.0으로 바꾸면 관리 패널이 평문 HTTP로 인터넷에 노출돼 세션 쿠키가 그대로 유출된다.
- 수정 방향: cloudflared 컨테이너 프로필 + tunnel token secret 주입, 또는 nginx에 listen 443 ssl + 인증서 볼륨 + 갱신 경로 추가(보호 계약이 listen 8080 존재만 요구하므로 8080 유지한 채 443 추가 가능). 도메인 전환 runbook 동반. 작업 크기: 중간.

### AUTH_BASE_URL·AUTH_TRUSTED_ORIGINS·PANEL_PUBLIC_URL 하드코딩 — 포트나 도메인을 바꾸면 로그인이 전부 403

- 영역: 외부 노출·인증 경계
- 왜 막히는가: compose.yaml:85·87·93이 http://127.0.0.1:8080 고정이고 create-auth.ts:14-25가 그대로 betterAuth에 주입한다. 실측: Origin을 9090 또는 실도메인으로 주면 sign-in이 403 INVALID_ORIGIN, 8080이면 401까지 도달. setup-macos.sh의 override 생성 블록은 이 3개를 건드리지 않아 포트를 바꾼 설치는 healthy로 뜨고 스모크도 통과하지만 첫 로그인에서 사용 불가가 된다. 추가로 baseURL이 http라 HTTPS 전환 시 세션 쿠키에 Secure·__Secure- 접두사가 붙지 않는다.
- 수정 방향: 3개 값을 ${PANEL_PUBLIC_ORIGIN} 보간으로 빼고 setup override 템플릿에 함께 기록. create-auth.ts에 advanced.useSecureCookies를 프로토콜 기준으로 명시. 스모크 테스트에 실제 Origin 헤더를 붙인 auth 호출 추가. 작업 크기: 작음.

### 프록시 뒤 client IP 미해석 — rate limit이 전체 공유되어 자기 DoS가 된다

- 영역: 외부 노출·인증 경계
- 왜 막히는가: nginx.conf:24-26의 map이 default $remote_addr뿐이고 real_ip 설정(set_real_ip_from/real_ip_header)이 없다. 이 변수가 limit_req_zone 키(auth 5r/m, api 300r/m)와 traffic client_ip에 그대로 쓰인다. 어떤 reverse proxy를 앞에 두든 모든 요청이 게이트웨이 IP 하나로 수렴해 한 명의 로그인 실패가 전 사용자를 429로 만들고, 감사 로그 sourceIp와 트래픽 분석이 전부 동일 IP가 된다. SECURITY.md:81의 서술과도 불일치한다.
- 수정 방향: http 블록에 set_real_ip_from <신뢰 CIDR>; real_ip_header CF-Connecting-IP; real_ip_recursive on; 추가. $remote_addr 자체가 치환되므로 engine-agent 보호 계약을 깨지 않는다. 신뢰 CIDR을 좁게 지정해 헤더 위조를 차단. 작업 크기: 작음.

### 백업이 재해복구가 아니다 — 암호화 키·artifact·nginx conf 미포함, 오프사이트 반출 경로 없음

- 영역: 데이터 안전성·복구
- 왜 막히는가: 백업 세트는 control.sqlite·traffic.sqlite·manifest.json 3개뿐(create-backup-service.ts:46-48, 실측 ls 확인). deployment secret을 푸는 마스터 키 3종은 /data 볼륨에만 있고(server.ts:33-35,73-75) 백업 대상이 아니다. artifact 실파일과 nginx current.conf도 빠져 있다. 백업 파일 자체가 같은 호스트의 named volume에만 있고 download endpoint는 의도적으로 미제공이라, 디스크 고장·volume prune 사고 한 번에 원본과 백업이 함께 사라진다. 키가 없으면 복원해도 모든 배포 secret이 영구 복호화 불가이며, 실패는 복원 시점이 아니라 다음 배포 시점에 드러난다.
- 수정 방향: 키 3종을 운영자 passphrase 기반 envelope 암호화로 백업에 포함하고, artifact 목록·digest와 nginx current.conf를 세트에 넣는다. 최소한 호스트에서 볼륨을 tar로 오프사이트 복사하는 절차를 BACKUP-RESTORE.md runbook에 추가하고 owner 전용 download endpoint를 뒤이어 구현한다. 작업 크기: 큼(runbook만은 작음).

### restore가 새 호스트에서 반드시 FK 실패하고, __drizzle_migrations 역행으로 api를 영구 기동 불가로 만들 수 있다

- 영역: 데이터 안전성·복구
- 왜 막히는가: compose-backup.ts:15-32의 PRESERVED_TABLES 16개 때문에 실제 복원 대상은 __drizzle_migrations·deployment·deployment_manifest·deployment_release·nginx_route 5개뿐이다. 그런데 schema.ts:216-218에서 deployment.artifactId가 artifact(보존 대상)를 onDelete restrict로 참조하므로, 빈 artifact 위에 deployment를 넣으면 :76-79의 foreign_key_check가 위반을 잡아 복원이 통째로 ROLLBACK된다. 즉 새 호스트 복구가 코드상 불가능하다. 동시에 __drizzle_migrations가 보존되지 않아 migration 기록이 과거로 돌아가고, IF NOT EXISTS 없는 0011 CREATE INDEX가 재실행되면 database.ts:20의 무보호 top-level migrate가 던져 api가 기동 불가가 된다. restart 정책이 없어 그대로 멈추고 nginx depends_on 때문에 전체가 서지 않아, 복구 수단인 패널 자체에 접근할 수 없다. 문서(BACKUP-RESTORE.md 4절 '모든 user table 교체')는 코드와 정반대로 서술돼 운영자를 오도한다.
- 수정 방향: 즉시: __drizzle_migrations를 PRESERVED_TABLES에 추가(1줄). 이어서 restore의 의도를 확정한다 — '같은 호스트 배포 상태 롤백'이면 문서·UI 표기를 5개 테이블 범위로 정정하고, 재해복구가 목표면 PRESERVED_TABLES를 걷어내고 artifact 파일 복원·세션 무효화를 함께 설계한다. migration SQL은 IF NOT EXISTS로, migrate는 try/catch로 감싼다. 작업 크기: 즉시 조치 작음, 설계 확정 중간~큼.

### GET /api/jobs/:id가 세션 전용 — CI가 비동기 job의 성패를 판정할 수 없다

- 영역: CI·API 운용
- 왜 막히는가: create-job-route.ts의 5개 job 엔드포인트가 전부 authService.requireRole 단독이고 다른 route에 있는 authorization 헤더 분기가 없다(소스 실측). packages/contracts/src/api-key.ts의 API_KEY_SCOPE 9종에 job 관련 scope가 아예 없다. upload finalize·image load·release·rollback이 모두 202 + job id만 반환하므로 CI는 배포를 시작만 할 수 있고 성패를 알 수 없다. 특히 image load는 실패 상태를 읽을 API key 경로가 전무해 재요청이 조용히 새 job을 무한 재큐잉한다.
- 수정 방향: API_KEY_SCOPE에 job:read 추가 후 /jobs, /jobs/:id, /jobs/:id/events에 backup route와 동일한 authorization 분기를 넣는다. 교착 해소가 필요하면 job:write로 cancel도 연다. 작업 크기: 작음(route 3곳 + contract 1곳).

### 장애 알림이 backup 실패 1종뿐이고 control plane을 감시할 dead-man's switch가 없다

- 영역: 관측·장애 대응
- 왜 막히는가: contracts/notification.ts:20의 이벤트 타입이 BACKUP_FAILED·TEST 둘뿐이고 produce()가 그 외 job 종료를 조기 반환한다. 배포·롤백·복원·prune·업로드 실패가 전부 무음이다. 게다가 알림 전달이 api 프로세스 내부 job queue라 api가 죽으면 'api가 죽었다'를 알릴 수 없다. /api/health는 프로세스만 살아 있으면 항상 ok를 반환해 downstream(engine-agent·DB·백업 신선도)을 확인하지 않으므로 외부 uptime 모니터를 붙여도 degraded를 감지하지 못한다. 사용자가 먼저 장애를 발견하는 구조다.
- 수정 방향: NOTIFICATION_EVENT_TYPE에 DEPLOY_FAILED·RESTORE_FAILED·JOB_FAILED를 추가하고 produce()를 실패 종료 job 전체로 확장(기존 delivery·재시도 인프라 재사용). /api/readyz 같은 deep-health에 engine-agent·traffic-worker·DB integrity·마지막 백업 경과시간을 담고 외부 모니터로 감시하는 절차를 문서화. 작업 크기: 중간.

### README의 Linux 지원 주장이 코드와 어긋나 잘못된 호스트 선택을 유도한다

- 영역: 설치·호스트 이식성
- 왜 막히는가: README.md:12는 macOS 또는 Linux를 지원한다고 적지만, engine-agent는 group_add ['0']만 부여하고 USER bun(uid 1000)으로 돈다. 실측 결과 Docker Desktop VM의 socket이 root:root 0660이라 gid 0으로 열리는 것이고, 일반 Linux의 socket은 root:docker(gid 999 등)라 접근할 수 없다. ARCHITECTURE.md:107은 macOS Docker Desktop 전용이라고 반대로 명시하고 setup 스크립트는 Darwin이 아니면 즉시 fail한다. engine-agent healthcheck가 자체 HTTP라 socket 접근 실패에도 healthy로 떠, 실운영 호스트로 가장 자연스러운 Linux VPS에서 조용히 전 기능이 깨진다.
- 수정 방향: (A) README를 macOS Docker Desktop 전용으로 정정해 아키텍처 문서와 일치시키거나, (B) group_add를 ${DOCKER_GID}로 주입하고 setup.sh를 일반화해 stat으로 GID를 탐지하며 socket 접근 가능 여부를 healthcheck에 포함시킨다. 작업 크기: (A) 작음, (B) 중간.

## 3. 착수 로드맵

### 1단계 — 실운영 개시 전 필수 — 자동 복구·외부 노출·복구 가능성 (중간~~큼 (약 1~~2주))

- compose 5개 서비스에 restart: unless-stopped 추가 + 호스트 자동 시작 설정 문서화
- __drizzle_migrations를 PRESERVED_TABLES에 추가하고 migration을 IF NOT EXISTS로, database.ts의 migrate를 try/catch로 보호
- AUTH_BASE_URL·AUTH_TRUSTED_ORIGINS·PANEL_PUBLIC_URL을 환경변수 보간으로 전환하고 setup override 템플릿·스모크 테스트(Origin 헤더 포함)에 반영
- nginx TLS 종단(443 + 인증서) 또는 cloudflared 프로필 중 하나를 정본으로 구현하고 도메인 전환 runbook 작성(가상 hostname 병기 제약 명시)
- nginx real_ip 설정(set_real_ip_from/real_ip_header) 추가 — 외부 노출과 동시에 적용
- 백업에 마스터 키 3종(envelope 암호화)·nginx current.conf 포함, 호스트 볼륨 오프사이트 복사 runbook 작성
- restore 의도 확정 후 문서·UI 표기 정정(현행 5개 테이블 범위) 또는 전체 복원으로 전환하고, '새 호스트 복구' E2E를 실제 1회 수행해 증거 기록
- CONTROL-PLANE-UPGRADE.md 롤백 절차를 사실에 맞게 정정(migration 포함 릴리스는 백업 복원 불가) + 업그레이드 전 볼륨 스냅샷 절차 추가
- README의 Linux 지원 주장 정정 또는 DOCKER_GID 주입으로 실제 지원
- api 부팅 시퀀스의 무보호 top-level await를 개별 try/catch로 격리

### 2단계 — 실운영 개시 직후 — 무인 운용과 무음 실패 제거 (중간 (약 1~2주))

- API_KEY_SCOPE에 job:read 추가하고 /jobs·/jobs/:id·/jobs/:id/events에 API key 분기 부여
- control-plane status·containers·containers/:id/logs에 읽기 scope 분기 추가(CI 배포 후 검증 경로 확보)
- manifest 생성 멱등화(동일 payload면 기존 반환) 또는 name+version 조회 파라미터 추가
- 알림 이벤트를 실패 종료 job 전체로 확장 + deep-health endpoint와 외부 uptime 감시 도입
- docs/ci-examples에 API key 기반 실제 배포 워크플로 1개 추가, /api/openapi 스펙 서빙(비프로덕션)
- docs/RUNBOOK.md 신설 — engine-agent 다운·디스크 full·중단된 restore·재부팅 복구 등 최소 6개 시나리오를 drill 후 기록
- compose에 로그 로테이션(json-file max-size/max-file)과 서비스별 메모리 상한 지정
- 백업 생성 전 디스크 여유 검사(watermark) + 총 백업 용량 상한
- maintenance 상태를 control DB에 영속화하고 부팅 시 복원
- 패널 catch-all server 블록 추가(임의 Host 응답 차단) 및 실도메인 API hostname을 protectedHostnames에 포함

### 3단계 — 장기 운영 안정화 — 확장 한계·비용·감사 (큼 (수 주~수 개월, 트래픽 성장에 맞춰 순차))

- traffic access_event의 raw_json 제거(실측 용량의 약 70%)와 행수/바이트 상한, 정기 VACUUM 또는 auto_vacuum 전환
- traffic 분석 쿼리에 복합 인덱스·시간 범위 상한 적용, 무거운 쿼리를 별도 연결/스레드로 분리해 healthcheck 보호
- 백업 스냅샷을 serialize() 대신 VACUUM INTO 또는 SQLite backup API로 전환(메모리 상주 제거)
- traffic export와 upload chunk를 스트리밍 처리로 전환
- 암호화 마스터 키 keyring화 + keyVersion 컬럼 + owner 전용 재암호화 rotate job
- artifact 삭제 API와 retention GC, UPLOAD_TOTAL_QUOTA 기본값을 실제 디스크에 맞게 조정
- API 단일 인스턴스 전제를 문서화한 뒤 worker instance id 기반 job 회수와 원자적 claim·유니크 인덱스로 다중 인스턴스 안전성 확보
- audit_log 보존 정책 결정·아카이브 경로, timestamp 해상도 통일 및 rowid tie-break
- nginx revision 파일 정리, SSE·exec 동시 세션 상한, traffic ingestion 이상 지표를 패널에 노출

## 4. 영역별 상세

### 설치·부팅·재부팅 복구·업그레이드·호스트 이식성 — 판정 `not-ready`

현재 스택은 "한 대의 macOS Docker Desktop 호스트에서, 8080 포트로, 사람이 터미널 앞에 있는 상태"라는 좁은 전제에서만 동작한다. 잘 되어 있는 부분은 인정할 만하다. 시크릿 자동 생성(loadOrCreateSecret 의 wx flag + EEXIST 재읽기)은 다중 컨테이너 동시 부팅 경합에서도 안전하고, traffic-worker 의 ingest checkpoint 는 device/inode 기반에 tmp+rename 원자 저장이라 재시작·로그 로테이션에 강하다. api 부팅 시 deployment release·operation job·notification reconcile 이 실제로 구현돼 있어 중단된 작업이 좀비로 남지 않는다. 그럼에도 실운영 개시를 막는 것이 네 가지다. 첫째, restart 정책이 전혀 없어 호스트 재부팅이나 Docker Desktop 재시작 한 번이면 패널이 영구히 내려간다. 둘째, 유일하게 문서화된 커스터마이즈인 패널 포트 변경이 인증을 통째로 깨뜨린다(실측 403 INVALID_ORIGIN). 셋째, README 의 Linux 지원 주장은 코드 근거가 없고 오히려 자체 아키텍처 문서가 macOS 전용이라고 명시한다. 넷째, backup restore 가 __drizzle_migrations 를 덮어써서 특정 조건에서 api 를 영구 기동 불가 상태로 만든다. 여기에 upgrade runbook 의 사전 점검(migrations.pending)이 구조적으로 항상 통과하고, rollback 경로인 백업 복원이 schema 변경 upgrade 에서는 검증에 막혀 실행 불가라는 점이 겹친다. 즉 업그레이드는 시작할 수 있지만 되돌릴 수 없다.

#### [blocker] restart 정책 부재 — 호스트 재부팅·Docker 재시작 시 패널이 영구 다운된다

- 근거: compose.yaml 전체에 restart: 키가 없음. 실행 확인: `docker inspect --format '{{.Name}} restart={{.HostConfig.RestartPolicy.Name}}' $(docker compose ps -q)` → 5개 컨테이너 모두 `restart=no`. docs/*.md 를 `재부팅|reboot|자동 시작|autostart` 로 grep 한 결과 0건 — 운영 문서 어디에도 재부팅 후 복구 절차가 없다.
- 영향: macOS 재부팅, Docker Desktop 종료·업데이트, 컨테이너 OOM kill, api 프로세스 크래시 중 어느 하나라도 발생하면 컨테이너가 stopped 로 남는다. nginx 가 api·web 의 service_healthy 에 depends_on 이므로 api 하나만 죽어도 다음 기동 때 전체 체인이 서지 않는다. 사람이 호스트에 접속해 `docker compose up -d` 를 다시 치기 전까지 패널·API·프록시가 전부 무응답이며, 이 상태에서는 GitHub Actions 배포도 전부 실패한다. 자동 백업 스케줄러도 api 프로세스 안에 있으므로 함께 멈춘다.
- 수정: compose.yaml 의 5개 서비스에 `restart: unless-stopped` 를 추가한다(nginx·web·api·engine-agent·traffic-worker). 추가로 Docker Desktop 의 로그인 시 자동 시작 또는 Linux 의 docker.service enable 을 설치 문서·setup 스크립트 점검 항목에 넣는다. 작업 크기: compose 5줄 + 문서 한 절.

#### [blocker] 패널 포트를 바꾸면 인증이 전부 403 으로 막힌다 — setup 스크립트가 만드는 override 가 곧 고장난 설정

- 근거: compose.yaml:85 `AUTH_BASE_URL: http://127.0.0.1:8080`, :87 `AUTH_TRUSTED_ORIGINS: http://127.0.0.1:8080,http://localhost:8080`, :93 `PANEL_PUBLIC_URL: http://127.0.0.1:8080` 하드코딩. scripts/setup-macos.sh:160-178 의 override 생성 블록은 nginx.ports 와 BACKUP__·TRAFFIC__ 만 쓰고 위 3개 변수는 건드리지 않는다. apps/api/src/auth/create-auth.ts:14,23 이 이 값을 그대로 betterAuth 의 baseURL·trustedOrigins 로 넘긴다. 실측: `curl -X POST http://127.0.0.1:8080/api/auth/sign-in/email -H 'Origin: http://127.0.0.1:9090'` → 403 {"message":"Invalid origin","code":"INVALID_ORIGIN"}, 같은 요청에 Origin 8080 → 401(정상 자격증명 오류).
- 영향: setup-macos.sh 에서 포트를 9090 등으로 바꾸면 스택은 healthy 로 뜨고 스모크 테스트(/api/health, /ko, 미인증 401)도 통과하지만, 브라우저에서 로그인·owner bootstrap 이 전부 403 으로 막혀 사용 자체가 불가능하다. 실패가 부팅이 아니라 첫 로그인 시점에 나타나 원인 추적이 어렵다. 동일한 이유로 리버스 프록시 뒤에 도메인으로 외부 노출하는 것도 compose.yaml 을 직접 고치지 않는 한 불가능하다.
- 수정: 세 변수를 `${PANEL_PUBLIC_ORIGIN:-http://127.0.0.1:8080}` 형태 보간으로 바꾸고 포트/호스트를 하나의 입력에서 파생시킨다. setup-macos.sh 의 override 템플릿에 api.environment 로 AUTH_BASE_URL·AUTH_TRUSTED_ORIGINS·PANEL_PUBLIC_URL 을 함께 써 넣고, 스모크 테스트에 실제 Origin 헤더를 붙인 auth 엔드포인트 호출을 추가해 이 회귀를 잡는다. compose 3줄 + 스크립트 10줄 + README 표 수정.

#### [blocker] README 의 Linux 지원 주장에 근거가 없다 — Docker socket 권한이 Docker Desktop 전제

- 근거: README.md:12 "macOS (Apple Silicon) or Linux". 그러나 compose.yaml:118-119 engine-agent 는 `group_add: ['0']` 만 부여하고 apps/engine-agent/Dockerfile:29 `USER bun`(uid/gid 1000)으로 실행된다. 실측: `docker compose exec -T engine-agent id` → `uid=1000(bun) gid=1000(bun) groups=0(root),1000(bun)`, `ls -ln /var/run/docker.sock` → `srw-rw---- 1 0 0` (root:root 0660) — Docker Desktop VM 이라 gid 0 으로 접근된다. 일반 Linux 의 /var/run/docker.sock 은 root:docker(gid 999 등) 0660 이라 gid 0 으로 열 수 없다. 자체 문서도 반대로 말한다 — docs/ARCHITECTURE.md:107 "지원 host는 M1 Max Apple Silicon macOS와 Docker Desktop이다", docs/OPEN-DECISIONS.md:14 "M1 Max macOS와 Docker Desktop 전용 production". scripts/setup-macos.sh:85-89 는 `uname -s != Darwin` 이면 곧바로 fail 하고 Linux 설치 문서는 없다.
- 영향: README 를 믿고 Linux 서버에 설치하면 engine-agent 가 Docker Engine 에 붙지 못한다. 컨테이너 목록·배포·nginx 설정 적용 등 핵심 기능이 전부 실패하는데, engine-agent 의 healthcheck 는 자체 HTTP /health 라 healthy 로 뜨기 때문에 `up -d --wait` 는 성공한 것처럼 보인다. 실운영 호스트로 가장 자연스러운 선택지(Linux VPS)가 사실상 막혀 있고 문서와 코드가 서로 다른 말을 한다.
- 수정: 둘 중 하나를 택한다. (A) README 를 macOS Docker Desktop 전용으로 정정해 아키텍처 문서와 일치시킨다(수 줄). (B) Linux 를 실제로 지원한다 — `group_add: ['${DOCKER_GID:-0}']` 로 호스트 docker 그룹 GID 를 주입하고, setup 스크립트를 setup.sh 로 일반화해 `stat -c '%g' /var/run/docker.sock` 로 GID 를 탐지, 부팅 시 socket 접근 가능 여부를 engine-agent 헬스체크에 포함시킨다. (B)는 반나절 규모.

#### [blocker] backup restore 가 __drizzle_migrations 를 덮어써 api 를 영구 기동 불가로 만들 수 있다

- 근거: apps/api/src/compose/compose-backup.ts:15-32 의 PRESERVED_TABLES 에 `__drizzle_migrations` 가 없다. restoreControlSnapshot(:62-88)은 preserved 가 아닌 모든 테이블을 DELETE 후 백업본으로 INSERT 하므로 migration 기록이 백업 시점으로 되돌아간다. 실측: control.sqlite 의 sqlite_master 에 `__drizzle_migrations` 존재, 현재 12행. 검증(:46-55)은 테이블명·컬럼명만 비교하므로 인덱스만 추가하는 migration 은 검증을 통과한다 — packages/db-schema/drizzle/0011_magical_doctor_octopus.sql 은 `CREATE INDEX audit_operation_created_at_idx ON audit_log (...)` 4줄뿐이고 IF NOT EXISTS 가 없다. packages/db-schema/src/database.ts:20 `migrate(db, { migrationsFolder })` 는 try/catch 없이 모듈 로드 중 실행된다.
- 영향: 0011 적용 이전에 만든 백업을 복원하면 검증은 통과하고 restore 도 성공한다. 그러나 __drizzle_migrations 에서 0011 행이 사라진 상태로 api 를 재시작하면 drizzle 이 0011 을 재실행해 index already exists 로 실패한다. migrate 가 top-level 에서 던지므로 api 프로세스가 즉시 종료되고, restart 정책이 no 이므로 컨테이너는 그대로 멈춘다. nginx 가 api healthy 에 의존하니 패널 전체가 죽는다. 복구 수단인 패널·API 자체가 접근 불가라 SQLite 를 손으로 열어 migration 행을 되살리는 것 외에 출구가 없다.
- 수정: `__drizzle_migrations` 를 PRESERVED_TABLES 에 추가한다(1줄, 즉효). 병행으로 validateControlSnapshot 에 인덱스 목록 비교를 추가하거나 migration SQL 을 CREATE INDEX IF NOT EXISTS 로 생성하도록 조정해 재실행 내성을 준다. database.ts 의 migrate 도 try/catch 로 감싸 실패 사유를 명시적으로 로깅한다.

#### [high] 문서화된 rollback 경로(백업 복원)가 schema 변경 upgrade 에서는 실행 불가

- 근거: docs/CONTROL-PLANE-UPGRADE.md rollback 3항 "control DB schema 가 이전 코드와 호환되지 않으면 downgrade 없이 backup 에서 복원한다". 그러나 apps/api/src/compose/compose-backup.ts:46 은 sourceTables.join(',') !== currentTables.join(',') 이면 BACKUP_CONTROL_INVALID, :50-54 는 테이블별 컬럼명 목록이 다르면 BACKUP_SCHEMA_MISMATCH 를 던진다. rollback 시 git checkout 후 재기동해도 이미 적용된 migration 은 되돌아가지 않으므로(문서 스스로 downgrade 미지원 명시) live DB 는 새 schema 로 남는다. docs/BACKUP-RESTORE.md §6 도 "schema가 정확히 같아야 복구된다. upgrade 전 backup, migration dry-run, forward restore, rollback matrix는 아직 없다"고 인정한다.
- 영향: 테이블·컬럼을 바꾸는 upgrade(0002·0004·0010 유형)에서 문제가 터지면 rollback 이 불가능하다. 코드를 되돌리면 구버전 코드가 신버전 schema 위에서 돌고, 백업을 복원하려 하면 스키마 검증에 막힌다. 즉 upgrade 는 사실상 편도이며 실운영 중 문제가 생겼을 때 되돌릴 수단이 없다.
- 수정: 단기: CONTROL-PLANE-UPGRADE.md rollback 절에 "schema 변경이 포함된 upgrade 는 backup 복원으로 되돌릴 수 없다"를 명시하고, upgrade 직전 control-data 볼륨 자체를 파일 레벨로 복사하는 절차를 추가한다(`docker run --rm -v containers_control-data:/d -v $PWD:/out alpine tar czf /out/control-data.tgz -C /d .`). 중기: 각 migration 에 down SQL 을 두거나 restore 시 backup schema 로 DB 파일을 통째 교체하는 경로를 추가한다. 단기는 문서 한 절, 중기는 며칠 규모.

#### [high] upgrade runbook 의 사전 점검 migrations.pending 이 구조적으로 항상 비어 있어 무의미하다

- 근거: apps/api/src/service/domain/control-plane/create-control-plane-status-service.ts:57-84 의 resolveMigrations 는 migrationsFolder(compose.yaml:88 `CONTROL_MIGRATIONS_PATH: /app/drizzle`, 실행 중인 api 이미지 안의 폴더)를 읽어 DB 의 __drizzle_migrations 해시와 비교한다. 그런데 packages/db-schema/src/database.ts:20 이 같은 폴더로 부팅 시 migrate 를 이미 끝낸다. 즉 api 가 healthy 라는 사실 자체가 pending=0 을 보장한다. docs/CONTROL-PLANE-UPGRADE.md 표는 이 값을 "upgrade 전 반드시 비어 있어야 함"으로 제시한다.
- 영향: 운영자가 upgrade 전에 확인하도록 지시받은 유일한 스키마 지표가 항상 초록불이다. 새 릴리스가 어떤 migration 을 가져오는지, 그것이 되돌릴 수 없는 변경인지 upgrade 전에 알 방법이 없다. 위 rollback 불가 문제와 결합되면 운영자는 위험을 인지하지 못한 채 편도 업그레이드를 시작한다.
- 수정: pending 판정을 실행 중 이미지 기준이 아니라 배포 대상 기준으로 바꾼다. 실무적으로는 upgrade 절차 앞단에 호스트에서 도는 dry-run 스크립트(체크아웃된 새 코드의 drizzle 폴더 해시 vs live DB __drizzle_migrations 비교)를 추가하고 runbook 표의 해당 항목을 그 결과로 교체한다. 동시에 status 응답의 의미(현재 이미지 기준 적용 완료 확인)를 문서에 정확히 적는다. 스크립트 한 개 + 문서 수정.

#### [high] nginx 기본 설정이 첫 부팅 이후 영구 고정된다 — 보안 헤더·rate limit 수정이 기존 설치에 반영되지 않는다

- 근거: infra/nginx/entrypoint.sh:9-13 `if [ ! -f /etc/nginx/managed/current.conf ]; then cp /opt/containers/default-nginx.conf ...` — 볼륨에 파일이 있으면 이미지의 새 default 를 절대 반영하지 않는다. current.conf 는 nginx-config named volume 에 있어 up/down/rebuild 를 넘어 존속한다. 실측: `docker compose exec -T nginx md5sum /etc/nginx/managed/current.conf /opt/containers/default-nginx.conf` → 33074271... vs 99de4a0e... 로 이미 상이하며 diff 는 런타임 추가된 `# containers-routes:start/end` 마커뿐이었다(즉 이미지 default 갱신분은 영영 흡수되지 않는다). infra/nginx/nginx.conf:29-30 에 rate limit zone, :65-71 에 CSP·HSTS·X-Frame-Options 등 보안 계약이 들어 있다.
- 영향: nginx.conf 의 보안 헤더·rate limit·log_format 을 수정하는 릴리스를 배포해도 이미 운영 중인 설치는 옛 설정으로 계속 돈다. docs/SECURITY.md 가 방어선으로 지목한 계약이 upgrade 로 강화되지 않는다. 반대로 log_format 스키마가 바뀌면 traffic-worker 는 새 파서인데 nginx 는 옛 포맷을 써 트래픽 수집이 조용히 깨질 수도 있다. CONTROL-PLANE-UPGRADE.md 에 이 사실이 전혀 언급돼 있지 않다.
- 수정: 이미지 default 의 해시를 볼륨에 함께 기록하고(/etc/nginx/managed/.default-sha256), 부팅 시 해시가 달라지면 route 마커 구간만 보존한 채 base 를 재생성하도록 entrypoint 를 고친다. 즉시 조치로는 upgrade runbook 에 "nginx.conf 변경이 포함된 릴리스는 current.conf 수동 재생성이 필요하다"는 단계와 명령을 추가한다. entrypoint 20줄 + 문서 한 절.

#### [medium] README 가 안내하는 PANEL_PORT 환경변수는 실제로 존재하지 않는다

- 근거: README.md:36-38 표에 `PANEL_PORT` / 기본 8080 / Panel host port 기재. 그러나 compose.yaml:36 은 `- 127.0.0.1:8080:8080` 리터럴이며 ${PANEL_PORT} 보간이 없다. `grep -rn PANEL_PORT` 결과 PANEL_PORT 는 README.md 와 scripts/setup-macos.sh 의 셸 변수에만 등장하고 compose·앱 코드에는 없다. BACKUP_INTERVAL_HOURS·BACKUP_RETENTION_COUNT·TRAFFIC_RAW_RETENTION_DAYS 는 apps/api/src/server.ts:20-21 및 traffic-worker server.ts:21 에 실제 존재하나 compose.yaml 에 선언이 없어 셸 환경변수로도 전달되지 않고 override 파일로만 설정 가능하다.
- 영향: `PANEL_PORT=9090 docker compose up -d` 를 실행하면 아무 일도 일어나지 않고 8080 으로 뜬다. 운영자는 설정이 먹은 줄 알고 잘못된 포트로 방화벽·프록시를 구성한다. 표의 나머지 3개도 environment 로 안내되지만 실제로는 override 파일 경로만 유효해 절반만 맞는 문서다.
- 수정: compose.yaml 의 ports 를 `- 127.0.0.1:${PANEL_PORT:-8080}:8080` 으로, api·traffic-worker 의 3개 값을 `${BACKUP_INTERVAL_HOURS:-24}` 형태로 바꿔 README 와 일치시킨다(포트는 AUTH_* 항목과 함께 고쳐야 의미가 있다). 또는 README 표에서 environment 언급을 빼고 override 전용으로 명시한다. compose 4줄 또는 문서 3줄.

#### [medium] api 부팅 시퀀스가 전부 무보호 top-level await 이고 전역 크래시 핸들러가 없다

- 근거: apps/api/src/server.ts:119-128 — `await deploymentReleaseService.reconcileInterrupted()`, `await operationJobService.reconcileInterrupted()`, `await notificationDeliveryService.reconcileQueued()`, `await backupScheduleService.enqueueIfDue()` 가 try/catch 없이 호출된다(같은 시퀀스에서 nginxProxyRouteService.reconcileRoutes 만 :125 에서 .catch 처리). create-deployment-release-service.ts:229 `const manifest = await deploymentManifestService.get(release.manifestId)` 는 루프 안 try 블록 바깥에 있어 조회 실패가 그대로 전파된다. 또한 `grep -rn "uncaughtException|unhandledRejection|process.on(" apps/*/src` 결과 0건 — 어떤 앱에도 전역 크래시 핸들러가 없다.
- 영향: 중단된 배포 릴리스가 남은 상태로 재시작했는데 그 manifest 조회가 실패하면(또는 이 시퀀스의 다른 단계가 던지면) api 모듈 로드가 실패해 프로세스가 종료된다. restart 정책이 no 이므로 컨테이너가 그대로 멈추고 nginx 의 depends_on 때문에 패널 전체가 뜨지 않는다. 즉 배포 중 재부팅이라는 흔한 시나리오가 전면 장애로 번질 수 있고 자기 복구 경로가 없다.
- 수정: 부팅 시퀀스의 각 reconcile 을 개별 try/catch(또는 .catch 로깅)로 감싸 하나가 실패해도 서버가 뜨게 하고 실패는 로그·audit 으로 남긴다. reconcileInterrupted 루프 안의 manifest 조회도 try 블록 안으로 옮겨 릴리스 단위로 격리한다. restart 정책 추가를 병행한다. 반나절 미만.

#### [medium] restore 가 16개 테이블을 복원하지 않는데 문서는 '모든 user table 교체'라고 설명한다

- 근거: apps/api/src/compose/compose-backup.ts:15-32 PRESERVED_TABLES = account, api_key, artifact, audit_log, deployment_secret, invitation, notification_delivery, notification_destination, operation_job, operation_job_event, session, upload_chunk, upload_session, user, user_role, verification. restoreControlSnapshot(:67-75)은 이 집합을 DELETE·INSERT 대상에서 제외한다. 실측 sqlite_master 조회 결과 control DB 테이블 21개 중 실제 복원되는 것은 __drizzle_migrations, deployment, deployment_manifest, deployment_release, nginx_route 5개뿐이다. 반면 docs/BACKUP-RESTORE.md §4-6 은 "API가 FK를 잠시 끄고 control DB의 모든 user table을 단일 BEGIN IMMEDIATE transaction으로 교체한다"고 기술한다.
- 영향: 운영자가 문서를 근거로 백업이 있으니 사용자·API key·감사 로그·업로드 아티팩트 메타데이터가 복구된다고 판단하지만 실제로는 복구되지 않는다. 계정 데이터 손상이나 잘못된 대량 삭제 사고에서 백업이 무력하다는 사실을 사고 시점에야 알게 된다. upgrade rollback 을 백업 복원에 의존하는 runbook 도 같은 오해 위에 서 있다.
- 수정: 둘 중 하나로 정합을 맞춘다. (A) 설계가 의도라면 BACKUP-RESTORE.md §4 와 CONTROL-PLANE-UPGRADE.md 에 "restore 는 배포·라우트 상태만 되돌리며 사용자·키·감사 로그는 보존한다"를 명시하고 §1 백업 구성 설명도 수정한다(문서 작업). (B) 전체 복원이 필요하면 PRESERVED_TABLES 를 옵션화해 restore 요청에 mode(full/partial)를 두고 full 일 때 세션 무효화·재로그인 안내를 함께 처리한다(수일 규모).

#### [low] 신규 호스트 설치 경로가 macOS 대화형 스크립트 하나뿐이고 비대화형·Linux 설치 문서가 없다

- 근거: scripts/setup-macos.sh 만 존재하며 :85-89 에서 `uname -s != Darwin` 이면 fail, :91-93 은 arm64 가 아니면 warn. 스크립트는 :74-79 의 ask/ask_yn 으로 stdin 을 요구해 CI·원격 프로비저닝에서 쓸 수 없고 :198-215 의 빌드·기동 선택도 대화형이다. README.md:24-32 의 수동 경로(docker compose build && up -d --wait)는 있으나 그 뒤 owner bootstrap·검증 절차는 README.md:34 의 "open http://127.0.0.1:8080" 한 줄뿐이다.
- 영향: 새 호스트를 세우려면 사람이 터미널 앞에 앉아 프롬프트에 답해야 한다. 자동 프로비저닝(Ansible·cloud-init·self-hosted runner 셋업)이 불가능하고, 재해로 호스트를 새로 세울 때 복구 시간이 사람 가용성에 묶인다. 설치 절차가 문서로 재현 가능하게 남아 있지 않다.
- 수정: setup-macos.sh 를 setup.sh 로 일반화하면서 --non-interactive 플래그와 환경변수 입력(PANEL_PORT 등)을 지원하게 하고 프롬프트는 기본값으로 대체한다. README 에 수동 설치 전 과정(빌드 → 기동 → healthy 확인 → owner bootstrap API 호출 → 검증 curl)을 순서대로 명시한다. 반나절 규모.

### 외부 노출, 도메인·HTTPS, 인증 경계 — 판정 `not-ready`

인증 경계 자체의 코어는 견고합니다. better-auth의 Origin/CSRF 검증이 실제로 동작하고(실측 403 INVALID_ORIGIN), CORS 헤더를 일절 내보내지 않아 교차출처 브라우저 접근이 기본 차단되며, engine-agent는 HMAC 서명·nonce·시간창 기반 내부 인증으로 보호되고 Docker socket은 engine-agent에만 마운트됩니다. 워크로드가 붙을 수 있는 네트워크에서 control/ingress/probe는 차단되고, nginx 라우트의 보호 컨테이너·보호 hostname·보호 계약 검사도 실제로 구현돼 있습니다. 웹 앱은 호스트 비의존(상대 경로 fetch + 쿠키 패스스루)이라 도메인 변경에 영향이 없습니다. 그러나 "실제 도메인으로 외부 노출"이라는 질문에 대해서는 아직 아닙니다. AUTH_TRUSTED_ORIGINS 하드코딩 때문에 실도메인에서 로그인이 곧바로 403으로 막히고, 스택 안에 TLS 종단 수단이 전혀 없으며(443 리스너·인증서 볼륨·cloudflared 서비스 모두 부재), 프록시 뒤에서 client IP를 해석하지 않아 로그인 rate limit(5r/m)이 전체 사용자에게 공유되는 자기 DoS 상태가 됩니다. 또한 패널 server 블록이 default_server라 임의 Host로도 패널과 /api가 200으로 응답하는 것을 실측했습니다. 도메인 전환에 필요한 변경 목록과 Cloudflare Tunnel 설치 runbook이 문서에 없어(IMPLEMENTATION-PLAN.md:199 미체크) 운영자가 스스로 도달하기 어렵습니다.

#### [blocker] 실도메인으로 노출하면 로그인이 403 INVALID_ORIGIN으로 즉시 막힌다 (AUTH_TRUSTED_ORIGINS 하드코딩)

- 근거: compose.yaml:85-93 (AUTH_BASE_URL/AUTH_TRUSTED_ORIGINS/PANEL_PUBLIC_URL 모두 http://127.0.0.1:8080 고정). 실측: curl -X POST -H 'Host: panel.example.com' -H 'Origin: https://panel.example.com' -H 'Cookie: x=y' .../api/auth/sign-in/email → HTTP 403 {"code":"INVALID_ORIGIN"}. 대조 실측: Origin을 http://127.0.0.1:8080으로 바꾸면 동일 요청이 401(자격증명 오류)까지 도달. 코드 경로: node_modules/.bun/better-auth@1.6.25/.../dist/api/middlewares/origin-check.mjs validateOrigin() → trustedOrigins 미일치 시 FORBIDDEN, apps/api/src/auth/create-auth.ts:14-25가 trustedOrigins를 그대로 주입.
- 영향: panel.example.com 등 실도메인에 붙이는 순간 브라우저 로그인·모든 auth mutation이 403으로 실패한다. 패널을 아예 쓸 수 없어 외부 노출 자체가 불가능하다. 서버 로그에만 힌트가 남고 UI에는 원인이 드러나지 않아 진단도 어렵다.
- 수정: compose.yaml의 3개 값을 .env 기반 변수(${PANEL_ORIGIN} 등)로 빼고 AUTH_BASE_URL=https://panel.example.com, AUTH_TRUSTED_ORIGINS=https://panel.example.com, PANEL_PUBLIC_URL=https://panel.example.com로 주입되게 한다. 도메인 전환 시 수정 대상 전체 목록(이 3개 env + nginx server_name 병기 + 필요 시 api 도메인)을 runbook 문서로 남긴다. 작업 크기: 소(compose+env 배선) + 문서.

#### [blocker] 스택 안에 HTTPS/TLS 종단 수단이 하나도 없고 노출 경로도 127.0.0.1 고정

- 근거: compose.yaml:38-39 ports: '127.0.0.1:8080:8080' (유일한 publish). infra/nginx/nginx.conf 전체에 listen 443/ssl_certificate/ssl_protocols 없음(listen은 8080·8081뿐, :62·:110). compose.yaml volumes에 인증서용 볼륨 없음. docs/ARCHITECTURE.md:16 cloudflared = '호스트 배치 계획, 미구현', docs/IMPLEMENTATION-PLAN.md:199 'Cloudflare Tunnel·Access 설치 문서' 미체크, docs/HANDOFF-STATUS.md:282 동일 서술.
- 영향: 실제 도메인으로 서비스하려면 (a) cloudflared를 호스트에 직접 설치하거나 (b) 앞단 reverse proxy를 별도 구축해야 하는데, 어느 쪽도 레포·문서에 절차가 없다. 운영자가 급하게 ports를 0.0.0.0:8080으로 바꾸면 관리 패널이 평문 HTTP로 인터넷에 노출되어 세션 쿠키가 그대로 유출된다.
- 수정: 둘 중 하나를 정본으로 정한다. (a) cloudflared 컨테이너를 edge 네트워크에 추가하고 tunnel token을 secret으로 주입하는 compose 프로필 + 설치·토큰 회전 runbook, 또는 (b) nginx에 listen 443 ssl + 인증서 볼륨 + certbot 갱신 경로를 추가하고 80→443 리다이렉트. (b)는 보호 계약이 listen 8080 존재만 요구하므로 8080 유지한 채 443 추가가 가능하다(create-nginx-config-service.ts:160). 작업 크기: 중.

#### [blocker] 프록시 뒤에서 client IP를 해석하지 않아 rate limit이 전체 사용자에게 공유되고 traffic client_ip가 무의미해진다

- 근거: infra/nginx/nginx.conf:24-26 map $remote_addr $containers_client_ip { default $remote_addr; } — CF-Connecting-IP를 읽는 곳이 없고 real_ip 모듈(set_real_ip_from/real_ip_header)도 없다. nginx.conf:28-29에서 이 변수를 limit_req_zone 키로 사용(auth 5r/m, api 300r/m). apps/api/src/compose/create-app.ts:147 isLoginRateLimited도 x-real-ip = $remote_addr 기반. 실측 access log: docker compose exec -T nginx tail /var/log/nginx/access.jsonl → "client_ip":"127.0.0.1","cf_ray":"","country":"". 문서 대조: docs/SECURITY.md:81 'Nginx는 CF-Connecting-IP가 있으면 이를 ... rate key와 traffic client_ip로 사용한다' — 구현과 불일치.
- 영향: Cloudflare Tunnel(또는 어떤 reverse proxy)을 앞에 두면 모든 요청의 $remote_addr이 cloudflared 컨테이너/게이트웨이 IP 하나로 수렴한다. 로그인 zone은 5r/m + burst 5이므로 한 명이 로그인 몇 번만 실패해도 전 사용자가 429가 되고, API zone 300r/m도 전체가 공유해 정상 패널 사용 중에 429가 터진다. 동시에 traffic 분석·감사(sourceIp)의 client_ip가 전부 동일해져 PRODUCT-REQUIREMENTS.md:61의 '원본 client IP 기록' 요건이 무너진다.
- 수정: nginx http 블록에 set_real_ip_from <cloudflared/게이트웨이 CIDR>; real_ip_header CF-Connecting-IP; real_ip_recursive on; 을 추가한다. real_ip는 $remote_addr 자체를 치환하므로 engine-agent 보호 계약(hasClientIpMap이 map 소스로 $remote_addr을 요구, create-nginx-config-service.ts:34-35·181-184)을 깨지 않고 적용 가능하다. 신뢰 CIDR을 반드시 좁게 지정해 헤더 위조를 막는다. 작업 크기: 소(설정) + 기본 conf 반영.

#### [high] 패널 server 블록이 default_server라 임의 Host로도 패널과 /api가 응답한다

- 근거: infra/nginx/nginx.conf:62 'listen 8080 default_server; server_name panel.containers.local;'. 실측: curl -H 'Host: panel.example.com' http://127.0.0.1:8080/ko → 200, curl -H 'Host: whatever.example.com' .../api/health → 200. 404로 떨어지는 catch-all server 블록이 없다.
- 영향: 실도메인 운영 시 라우트가 아직 없는 워크로드 도메인·와일드카드 DNS·잘못 연결된 tunnel hostname 전부가 관리 패널 로그인 화면과 /api/* 를 그대로 내보낸다. 관리면이 의도치 않은 도메인에 노출되고, api 프로필 전용 헤더 정책(no-referrer 등)도 우회된다.
- 수정: listen 8080 default_server를 명시적 catch-all server(server_name _; return 444;)로 옮기고 패널 블록은 자기 hostname에만 매칭시킨다. 보호 계약은 panel 서버에 listen 8080만 요구하므로 default_server 이동은 계약을 깨지 않는다. 작업 크기: 소.

#### [high] 실도메인의 API hostname이 보호 hostname 목록에 들어가지 않아 워크로드 라우트로 하이재킹 가능

- 근거: apps/api/src/server.ts:91 protectedHostnames: ['api.containers.local', 'panel.containers.local', new URL(env.PANEL_PUBLIC_URL).hostname] — 패널 도메인만 env에서 파생되고 API 도메인은 실도메인 버전이 없다. packages/contracts/src/nginx.ts:36·46-48의 차단은 '*.containers.local' 접미사 기준이라 실도메인에 적용되지 않는다. 차단 로직: apps/api/src/service/domain/nginx/create-nginx-proxy-route-service.ts:181·234.
- 영향: api.example.com 같은 외부 API 도메인을 노출한 뒤, admin 권한자가 그 hostname으로 프록시 라우트를 만들면 렌더된 server 블록이 default_server보다 우선해 CI가 보내는 배포 트래픽이 임의 컨테이너로 흘러간다. SECURITY.md가 전제한 관리 hostname 충돌 차단이 실도메인에서만 조용히 무력화된다.
- 수정: API 공개 도메인을 env(API_PUBLIC_URL 등)로 받아 protectedHostnames에 함께 넣고, 값이 없으면 패널 도메인의 api 서브도메인을 기본 보호하도록 한다. 작업 크기: 소.

#### [high] 세션 쿠키가 Secure 없이 발급된다(baseURL이 http로 고정돼 있어 HTTPS로 올려도 env를 안 바꾸면 그대로)

- 근거: apps/api/src/auth/create-auth.ts:14-25는 advanced.useSecureCookies를 설정하지 않는다. better-auth 1.6.25 dist/cookies/index.mjs:21 — useSecureCookies 미지정 시 baseURL이 https로 시작할 때만 secure prefix를 켜고, 같은 파일 createCookie()의 attributes가 secure: !!secureCookiePrefix. compose.yaml:85 AUTH_BASE_URL=http://127.0.0.1:8080. 한편 nginx는 HTTP 응답에도 HSTS를 붙인다(infra/nginx/nginx.conf:69).
- 영향: HTTPS 도메인으로 노출하면서 AUTH_BASE_URL을 http로 남겨두면 세션 쿠키에 Secure 플래그와 __Secure- 접두사가 붙지 않는다. 브라우저가 로그인 자체는 허용하므로 문제가 드러나지 않은 채로, 평문 경로가 하나라도 생기면 세션 토큰이 그대로 노출된다. 반대로 나중에 https로 고치면 쿠키 이름(__Secure- 접두사)이 바뀌어 기존 세션이 전부 무효화된다.
- 수정: AUTH_BASE_URL을 실제 https 오리진으로 주입하는 것을 기본으로 하고, 추가로 create-auth.ts에 advanced.useSecureCookies를 명시적 옵션(예: PANEL_PUBLIC_URL의 프로토콜 기준)으로 넘겨 env 하나만 어긋나도 조용히 non-Secure로 떨어지지 않게 한다. 작업 크기: 소.

#### [medium] 보호 계약이 panel.containers.local/api.containers.local 문자열을 강제해 server_name을 실도메인으로 교체할 수 없다

- 근거: apps/engine-agent/src/service/domain/create-nginx-config-service.ts:19-20 PANEL_SERVER_NAME='panel.containers.local', API_SERVER_NAME='api.containers.local'; :226·:233 findServersByName(http, PANEL_SERVER_NAME/API_SERVER_NAME) 결과가 0개면 NGINX_PROTECTED_CONTRACT로 apply 거부. compose.yaml:29-33 nginx healthcheck도 '--header=Host: panel.containers.local'을 사용.
- 영향: 운영자가 nginx.conf에서 가상 hostname을 실도메인으로 '바꾸면' 설정 적용이 통째로 거부된다. 반드시 병기(server_name panel.containers.local panel.example.com;)해야 한다는 제약이 코드에만 있고 문서에 없어, 도메인 전환 시도가 원인 불명의 적용 실패로 끝나기 쉽다.
- 수정: 단기: 도메인 전환 runbook에 '가상 hostname은 제거하지 말고 실도메인을 추가로 병기한다'를 명시한다. 중기: 보호 계약이 검사할 hostname을 engine-agent env로 주입받게 바꾼다. 작업 크기: 문서 소 / 코드 중.

#### [medium] api hostname에서 브라우저 auth endpoint가 그대로 노출된다 (SECURITY.md §6과 불일치)

- 근거: infra/nginx/nginx.conf:120-150 api.containers.local server 블록의 location /api/ 가 예외 없이 전량 프록시. 실측: curl -H 'Host: api.containers.local' -X POST .../api/auth/sign-in/email → 401(better-auth에 도달, 차단 아님). 문서: docs/SECURITY.md:69 '외부 api hostname에서는 session cookie를 인증 수단으로 사용하지 않고 브라우저 인증 endpoint도 노출하지 않는다'.
- 영향: 외부 API 도메인을 노출하면 그 도메인에서도 로그인·세션 endpoint가 살아 있다. 머신 전용으로 좁힌다는 설계 전제가 깨지고, API 도메인 쪽 rate limit·헤더 정책만 적용된 상태로 로그인 브루트포스 표면이 하나 더 생긴다.
- 수정: api server 블록에 location ^~ /api/auth/ { return 404; } 를 추가한다. 다만 보호 계약이 api 서버에도 sign-in location + auth rate limit 존재를 요구하므로(create-nginx-config-service.ts:170-172, :233), 계약 쪽 요구도 함께 조정해야 한다. 작업 크기: 소~중.

#### [medium] 프록시 라우트 target에 IP 리터럴이 허용돼 보호 컨테이너 이름 차단을 우회할 수 있다

- 근거: packages/contracts/src/nginx.ts:38 containerTargetPattern=/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/ 는 '172.23.0.4' 같은 IP를 통과시킨다. apps/api/src/service/domain/nginx/create-nginx-proxy-route-service.ts:137-141 assertProtectedTarget은 이름 문자열 목록(apps/api/src/compose/compose.ts:76-87)만 비교하고 존재/네트워크 검증이 없다. nginx는 control 네트워크에 속해 있어(compose.yaml:44-47) api:3001·engine-agent:3002에 실제로 도달 가능하다.
- 영향: admin 권한자가 컨테이너 이름 대신 내부 IP를 넣어 관리면 서비스로 향하는 외부 라우트를 만들 수 있다. 'nginx 라우트는 Agent에 연결할 수 없다'(SECURITY.md:11)는 절대 불변식이 이름 기반 차단만으로는 보장되지 않는다. 완화 요소로 렌더된 라우트가 Cookie/Authorization 헤더를 비우고(create-nginx-proxy-route-service.ts:59) engine-agent가 HMAC 서명을 요구하므로 즉시 탈취로 이어지지는 않는다.
- 수정: targetContainer 스키마에서 IPv4/IPv6 리터럴을 거부하거나(정규식 refine), 라우트 생성 시 engine-agent로 컨테이너를 조회해 관리면 라벨(com.docker.compose.project=containers)이 붙은 대상을 거부한다. 작업 크기: 소.

#### [medium] 쿠키 인증 mutating API에 Origin 검증이 없다(better-auth 경로 밖)

- 근거: apps/api/src/compose/create-app.ts:167-200 — /api/* 미들웨어는 requestId와 maintenance 게이트뿐이고 Origin/Host 검증이 없다. Origin 검증은 /api/auth/* 를 처리하는 better-auth originCheck에만 존재(dist/api/middlewares/origin-check.mjs). CORS 헤더는 어디에도 없어(grep 'access-control|cors' → 0건) 응답 읽기는 막히지만 요청 자체는 막지 않는다. 동일 지적이 docs/quality-assurance/2026-08-04-ui-backend-audit.md:832에 이미 기록돼 있다.
- 영향: 세션 쿠키의 SameSite=Lax 기본값이 교차 사이트 POST를 막아주므로 현재 실위험은 제한적이다. 다만 방어가 브라우저 기본값 하나에만 의존한다. 향후 SameSite=None이 필요해지거나 서브도메인 XSS가 생기면 컨테이너 삭제 같은 파괴적 mutation이 CSRF 표면이 된다.
- 수정: /api/* mutating 요청에 대해 AUTH_TRUSTED_ORIGINS 기반 Origin 검증 미들웨어를 추가하고, Origin이 없는 머신 클라이언트는 Authorization(API key) 경로만 허용한다. 작업 크기: 소.

#### [low] Cloudflare 헤더(CF-IPCountry·CF-Ray)를 검증 없이 로그에 기록한다

- 근거: infra/nginx/nginx.conf:12 로그 포맷이 "cf_ray":"$http_cf_ray", "country":"$http_cf_ipcountry" 로 요청 헤더를 그대로 기록. 검증 로직 없음(grep -i 'cf-connecting-ip|cf_ray' → nginx.conf 로그 포맷 외 구현 없음). 문서: docs/NGINX-TRAFFIC.md:96 '검증된 Cloudflare country header'.
- 영향: origin에 직접 도달할 수 있는 주체가 임의 country/ray 값을 넣어 트래픽 분석 지표를 오염시킬 수 있다. origin 비공개가 유지되는 동안 실피해는 낮지만, 문서가 '검증된'이라고 서술해 신뢰 수준을 실제보다 높게 표현하고 있다.
- 수정: 신뢰 CIDR에서 온 요청에만 CF 헤더를 채우도록 map으로 게이트하거나(real_ip 도입과 함께), 문서 서술을 '미검증 기록'으로 정정한다. 작업 크기: 소.

#### [low] HSTS를 평문 HTTP 응답에 송출하고 includeSubDomains/preload가 없다

- 근거: infra/nginx/nginx.conf:69·125 add_header Strict-Transport-Security "max-age=31536000" always; 인데 listen은 8080 평문뿐이고 실측 응답에 그대로 포함됨(위 sign-in 403 응답 헤더에 Strict-Transport-Security: max-age=31536000). 로그의 scheme도 항상 http($scheme, nginx.conf:12).
- 영향: 브라우저는 평문 응답의 HSTS를 무시하므로 지금은 무해하지만, HTTPS 전환 후에도 서브도메인이 보호되지 않는다. 워크로드 라우트가 같은 상위 도메인의 서브도메인을 쓰는 구성에서 다운그레이드 여지가 남는다.
- 수정: HTTPS 종단을 붙이는 시점에 includeSubDomains 추가 여부를 명시적으로 결정하고(워크로드 서브도메인 영향 검토 필요), 로그 scheme은 X-Forwarded-Proto를 반영하도록 map을 둔다. 작업 크기: 소.

### GitHub Actions에서 API key만으로 전 운용 가능 여부 (CI 배포 파이프라인) — 판정 `not-ready`

API key 인증 자체는 잘 만들어져 있다. `apps/api/src/service/domain/api-key/create-api-key-service.ts`가 `ctk_` prefix + sha256 해시 저장, 9종 scope 검사, 만료/폐기, 분당 rate limit, `lastUsedAt` 갱신을 모두 구현했고, route 쪽은 `headers.has('authorization')`이면 API key + scope, 아니면 session + recent-auth로 분기하는 일관된 패턴을 쓴다. 즉 **API key는 정의상 recent-auth를 우회하도록 설계돼 있어서, recent-auth가 CI를 막는 지점은 없다.** 업로드 세션의 `idempotency-key` 헤더, sha256 기반 artifact 중복 제거, `uniqueResourceKey` 기반 job 중복 방지, `errorResponse(code, message, requestId, details)`의 안정적인 오류 계약(429/409/503/507까지 상태코드 매핑 완비)도 CI 친화적으로 잘 돼 있다. 그런데 **파이프라인 완주는 불가능하다.** 첫째, `compose.yaml:36`이 `127.0.0.1:8080:8080` 루프백 전용이라 GitHub 호스티드 러너는 애초에 API에 도달할 수 없다(셀프호스티드 러너 전제여야 함). 둘째, 그걸 해결해도 **`GET /api/jobs/:id`가 session 전용**이다(`create-job-route.ts:63`, API key 분기 없음, `API_KEY_SCOPE`에 `job:*` scope 자체가 없음). 배포 관련 엔드포인트는 전부 202 + job id를 돌려주는데 CI가 그 job을 조회할 수단이 없다. release는 `GET /deployment-releases/:id`(deployment:read)로 우회 폴링이 되지만, **image load는 상태를 읽을 API-key 경로가 전무**하고 실패 시 재요청이 조용히 새 job을 다시 큐잉해 무한 재시도가 된다. 셋째, 배포 후 검증(control-plane status, containers, images, nginx)이 전부 session 전용이라 CI가 결과를 확인할 수 없다. 넷째, 첫 키 발급과 회전이 브라우저 전용이다. 결론적으로 지금은 "업로드 → 이미지 load 요청 → manifest 생성 → release 요청"까지 호출은 되지만, **완료·실패 판정과 검증이 안 되므로 무인 배포로는 쓸 수 없다.**

#### [blocker] GET /api/jobs/:id 가 session 전용 — CI가 비동기 job 완료를 판정할 수 없다

- 근거: apps/api/src/route/job/create-job-route.ts:37,50,63,77 — 5개 job 엔드포인트 전부 `await authService.requireRole(context.req.raw.headers, JOB_ROLES)` 단독이고 다른 route들에 있는 `if (headers.has('authorization')) apiKeyService.authenticate(...)` 분기가 없다. packages/contracts/src/api-key.ts:3-12 — API_KEY_SCOPE 9종에 job 관련 scope가 존재하지 않는다. apps/api/src/service/domain/auth/create-auth-service.ts:112-124 `requireRole`은 better-auth 세션 쿠키만 검사한다. 실측: `curl -H "Authorization: Bearer ctk_fake" http://127.0.0.1:8080/api/jobs/<uuid>` → 401 AUTH_REQUIRED.
- 영향: upload finalize·image load·release·rollback이 전부 202 + `{job}`을 반환하는데(create-upload-route.ts:117, create-deployment-route.ts:79, create-deployment-release-route.ts:118,155), CI가 그 job의 status/failureCode를 조회할 수 없다. 워크플로는 배포를 "시작"만 할 수 있고 성공했는지 실패했는지 알 수 없어, 롤백 판단도 불가능하다. 무인 배포의 근본 전제가 깨진다.
- 수정: API_KEY_SCOPE에 `job:read` 추가 후 `GET /jobs`, `GET /jobs/:id`, `GET /jobs/:id/events` 세 곳에 다른 route와 동일한 `headers.has('authorization')` 분기를 넣는다. 취소까지 필요하면 `job:write`로 `POST /jobs/:id/cancel`도 열되 이건 선택. route 3곳 + contract 1곳 수정으로 반나절 규모.

#### [blocker] API가 127.0.0.1 루프백에만 바인딩 — GitHub 호스티드 러너가 도달 불가

- 근거: compose.yaml:36 `- 127.0.0.1:8080:8080` (nginx가 유일한 외부 노출 지점). compose.yaml:85,87,93 AUTH_BASE_URL·AUTH_TRUSTED_ORIGINS·PANEL_PUBLIC_URL 전부 `http://127.0.0.1:8080` 평문 HTTP. infra/nginx/nginx.conf에 TLS(443/ssl) 서버 블록 없음.
- 영향: GitHub Actions의 ubuntu-latest 러너에서 `curl https://panel.example.com/api/...`를 호출할 대상이 존재하지 않는다. 셀프호스티드 러너를 같은 호스트에 두는 것 외에 방법이 없고, 그마저도 평문 HTTP라 `ctk_` 키가 네트워크를 타는 순간 노출된다. 시나리오 1단계(업로드)조차 시작할 수 없다.
- 수정: nginx에 TLS 서버 블록(ACME/인증서 마운트) 추가 + compose 포트 바인딩을 `0.0.0.0:443`으로, AUTH_BASE_URL/TRUSTED_ORIGINS/PANEL_PUBLIC_URL을 환경변수화(`${PANEL_PUBLIC_URL}`)한다. 담당1 영역과 공통 작업.

#### [high] image load 결과를 API key로 읽을 수 없고, 실패 시 재요청이 무한 재큐잉된다

- 근거: apps/api/src/route/deployment/create-deployment-route.ts:35-85 — `POST /artifacts/:artifactId/load`가 유일한 image:load 엔드포인트이고 GET이 없다. apps/api/src/service/domain/deployment/create-deployment-service.ts:49-56 `getLoaded`는 `findLoadedDeployment` 결과가 없으면 null. apps/api/src/compose/compose-deployment.ts:21 `eq(deployment.status, 'loaded')` — 'failed'/'loading' 은 조회되지 않는다. apps/api/src/route/control/create-control-route.ts:95,101 `GET /images`는 `requireRole(ALL_ROLES)` session 전용.
- 영향: load job이 실패하면 `getLoaded`가 null을 반환하므로 CI가 폴링 삼아 다시 POST할 때마다 새 DEPLOY_LOAD job이 큐잉된다. CI는 영원히 202만 받으며 실패를 인지하지 못하고, 워크플로는 타임아웃까지 무의미한 job을 계속 만든다. `GET /images`도 세션 전용이라 이미지가 실제로 들어왔는지 확인할 대체 수단도 없다.
- 수정: 위 job:read scope가 들어가면 자연히 해소된다. 별도로 `GET /api/artifacts/:id/deployment`(image:load 또는 artifact:read)를 추가해 status(loading/loaded/failed)와 messages를 노출하면 더 명확하다. 엔드포인트 1개 추가 수준.

#### [high] 배포 후 검증 경로가 전부 session 전용 — CI가 결과를 확인할 수 없다

- 근거: apps/api/src/route/control-plane/create-control-plane-route.ts:36 `requireRole(CONTROL_PLANE_READ_ROLES)`. apps/api/src/route/engine/create-engine-route.ts:44,58,72,89 — `/system/engine`, `/containers`, `/containers/:id`, `/containers/:id/logs` 전부 `requireRole(ALL_ROLES)`. apps/api/src/route/nginx/create-nginx-route.ts:38,50,62 — nginx status/config/routes 전부 session. 이 4개 파일 어디에도 `apiKeyService` 의존성 자체가 없다(create-app.ts:110,113,119에서 apiKeyService를 넘기지 않음).
- 영향: CI가 release 성공 이후 컨테이너가 실제로 떠 있는지, nginx 라우트가 붙었는지, 로그에 에러가 없는지 확인할 방법이 없다. 검증을 생략하고 "202 받았으니 성공"으로 처리하거나, 공개 hostname을 외부에서 curl하는 우회만 남는다. 후자는 패널이 외부 노출돼야 가능하고 실패 원인 진단이 불가능하다.
- 수정: 최소한 `GET /api/control-plane/status`와 `GET /api/containers/:id/logs`에 읽기 scope(예: 기존 `deployment:read` 재사용 또는 신설 `system:read`) 분기를 추가한다. route 2~3곳.

#### [high] API key 발급·회전이 브라우저 전용 — 부트스트랩과 만료 대응을 자동화할 수 없다

- 근거: apps/api/src/route/api-key/create-api-key-route.ts:32,47,60 — GET은 `requireRole(ADMIN_ROLES)`, POST/DELETE는 `requireRecentRole(..., RECENT_AUTH_MAX_AGE_MS)`(15분). API key 분기 없음. packages/contracts/src/api-key.ts:28 `expiresInDays: z.number().int().min(1).max(365).nullable()` — 최대 365일. apps/api/src/service/domain/api-key/create-api-key-service.ts:6 OWNER_ONLY_API_KEY_SCOPES = [backup:write, secret:write] — 이 scope를 담은 키는 owner 세션으로만 만들 수 있다.
- 영향: 첫 키는 반드시 사람이 브라우저로 로그인해 만들어야 한다(부트스트랩 문제, 1회성이라 감수 가능). 문제는 회전이다. 만료 키를 새 키로 갈아끼우는 절차가 API로 불가능해 최대 1년마다 사람이 개입해야 하고, 그걸 피하려면 `expiresInDays: null`로 무기한 키를 쓰게 되어 보안이 나빠진다. 만료 임박 알림도 없어 어느 날 CI가 401로 조용히 죽는다.
- 수정: 단기: 키 만료 임박을 notification destination으로 알리는 잡을 추가하고 운영 문서에 회전 절차를 명시. 중기: `apikey:manage` scope를 신설해 기존 키로 후속 키를 발급/폐기할 수 있게 한다(단 owner-only scope 승격은 계속 금지). scope 신설 + route 분기 1곳.

#### [high] manifest 생성이 멱등하지 않아 워크플로 재실행이 409로 실패한다

- 근거: apps/api/src/service/domain/deployment/create-deployment-manifest-service.ts:169-172 — `findVersionCollision(payload.name, payload.version)`가 있으면 `DEPLOYMENT_MANIFEST_VERSION_EXISTS` throw. apps/api/src/lib/error.ts DEPLOYMENT_MANIFEST_VERSION_EXISTS: 409. 업로드 세션과 달리(create-upload-route.ts:68 `idempotency-key` 헤더 필수) manifest 생성에는 idempotency 키가 없다.
- 영향: GitHub Actions의 "Re-run failed jobs"나 동일 커밋 중복 push로 워크플로가 다시 돌면, manifest는 이미 만들어져 있어 409로 죽는다. 그런데 release는 아직 안 만들어졌을 수 있어서, CI는 파이프라인 중간에서 복구 불가 상태로 멈춘다. version에 run_id를 섞어 매번 새 버전을 만드는 우회는 manifest를 무한 증식시킨다.
- 수정: `POST /deployment-manifests`가 name+version 충돌 시 payload가 완전히 동일하면 기존 manifest를 200으로 반환하도록(upload createSession의 IDEMPOTENCY_CONFLICT 패턴과 동일하게) 바꾸거나, `GET /deployment-manifests?name=&version=` 조회 파라미터를 추가해 CI가 선조회할 수 있게 한다. service 1곳 + route 1곳.

#### [medium] 분당 120회 rate limit이 대용량 아티팩트 청크 업로드에 부족하고 retry-after가 없다

- 근거: apps/api/src/service/domain/api-key/create-api-key-service.ts:66 `rateLimitPerMinute = 120` (compose.yaml에 API_KEY_RATE_LIMIT_PER_MINUTE 미설정 → 기본값). 같은 파일 93-100행: 키 단위 고정 윈도우, 초과 시 `createAppError('API_KEY_RATE_LIMITED')`. apps/api/src/lib/error.ts API_KEY_RATE_LIMITED: 429. 로그인 rate limit(create-app.ts:190)은 `context.header('retry-after','60')`을 붙이는데 API key 경로는 붙이지 않는다. apps/api/src/service/domain/upload/create-upload-service.ts:16 MAX_CHUNK_BYTES=67_108_864(64MB), packages/contracts/src/upload.ts:11 expectedSizeBytes 최대 10_737_418_240(10GB) → 최대 160청크.
- 영향: 1GB 이미지도 16청크 + 세션생성 + finalize + 폴링이라 여유롭지만, 5~~10GB 이미지는 80~~160개의 PUT이 연속으로 나가 로컬 네트워크에서 1분 내에 120회를 넘긴다. 429가 나면 retry-after 헤더가 없어 CI 쪽이 backoff 간격을 알 수 없고, 단순 재시도 로직은 윈도우가 리셋될 때까지 429를 반복 소비한다.
- 수정: 429 응답에 `retry-after` 헤더 부착(로그인 경로와 동일 패턴, 1줄). compose.yaml에 API_KEY_RATE_LIMIT_PER_MINUTE를 600 등으로 명시하거나, chunk 업로드 경로를 rate limit 카운트에서 제외한다.

#### [medium] upload finalize가 artifactId를 반환하지 않아 sha256 역조회에 의존하고 실패는 무증상이다

- 근거: apps/api/src/route/upload/create-upload-route.ts:117 — finalize는 `successResponse({ job })` 202만 반환. apps/api/src/service/domain/upload/create-upload-service.ts:298-321 — artifact row는 finalize job이 성공했을 때 `status: 'ready'`로만 insert된다(112-121 `toArtifact`도 status를 'ready' 하드코딩). 즉 실패한 finalize는 `GET /artifacts`에 아무 흔적도 남기지 않는다.
- 영향: CI는 다음 단계(`POST /artifacts/:artifactId/load`)에 쓸 artifactId를 알 수 없어 `GET /artifacts`를 폴링해 자기 sha256과 매칭해야 한다. 그마저도 검증 실패(ARCHIVE_INVALID, ARTIFACT_DIGEST_MISMATCH 등)면 artifact가 영원히 나타나지 않아 CI는 원인 없이 타임아웃만 본다. job 조회가 안 되니 실패 코드를 얻을 경로가 없다.
- 수정: job:read가 열리면 finalize job의 failureCode로 해결된다. 추가로 `GET /artifacts?sha256=` 필터를 넣으면 폴링이 깔끔해진다.

#### [medium] backup restore가 API key를 명시적으로 거부 — 재해 복구는 반드시 사람이 브라우저로

- 근거: apps/api/src/route/backup/create-backup-route.ts:40-46 `authenticateRestore` — `if (headers.has('authorization')) { throw createAppError('FORBIDDEN') }` 후 `requireRecentRole` 강제. 백업 생성/삭제/목록은 API key로 가능한 것과 대조적이다(32-38, 57-61행).
- 영향: "API로 전부 운용" 시나리오에서 복구만 구멍이 난다. 배포가 DB를 망가뜨린 상황에서 자동 복구 워크플로를 만들 수 없고, 사람이 패널에 로그인해 15분 이내 재인증을 거쳐야 한다. 의도된 안전장치로 보이지만 무인 운용 목표와는 정면으로 충돌하므로 명시적 합의가 필요하다.
- 수정: 의도된 정책이라면 운영 문서에 "restore는 수동 전용"으로 못박고, CI 워크플로 설계에서 복구를 범위 밖으로 뺀다. 자동화하려면 별도 owner-only scope(`backup:restore`) + 별도 확인 토큰 조합을 신설한다. 정책 결정 사안.

#### [medium] job cancel이 session+recent-auth 전용 — 멈춘 배포를 CI가 정리할 수 없다

- 근거: apps/api/src/route/job/create-job-route.ts:99 `await authService.requireRecentRole(context.req.raw.headers, JOB_ROLES, RECENT_AUTH_MAX_AGE_MS)`. apps/api/src/service/domain/job/create-operation-job-service.ts:190-195 — `uniqueResourceKey`가 있으면 활성 job이 있는 한 새 job을 만들지 않고 기존 job을 반환한다.
- 영향: release job이 stall되면(같은 파일 STALL_THRESHOLD_MS = 90초 heartbeat 기준 sweep은 있으나) 해당 releaseId에 대한 후속 요청이 계속 기존 job으로 흡수된다. CI가 워크플로를 취소해도 서버 쪽 job은 남고, 다음 배포는 `DEPLOYMENT_RELEASE_IN_PROGRESS`(409, create-deployment-release-service.ts:346)로 막힌다. 사람이 브라우저로 들어가 취소해야 파이프라인이 다시 흐른다.
- 수정: job:write scope로 cancel을 여는 것이 가장 단순하다. 위험하다고 보면 최소한 `POST /deployment-releases/:id/rollback`이 이미 API key로 열려 있으니, 교착 상황 복구 절차를 문서화한다.

#### [low] secret:write / backup:write scope는 owner가 만든 키만 보유 가능

- 근거: apps/api/src/service/domain/api-key/create-api-key-service.ts:6-8 `OWNER_ONLY_API_KEY_SCOPES = [API_KEY_SCOPE.BACKUP_WRITE, API_KEY_SCOPE.SECRET_WRITE]`, 89-91행 authenticate 시점에 조인된 `user_role.role !== 'owner'`면 FORBIDDEN, 118-120행 create 시점에도 동일 검사.
- 영향: admin이 만든 키는 배포 secret을 등록할 수 없다. 더 중요한 건 authenticate 시점 검사라서, 키 발급 후 그 owner 계정을 강등하거나 비활성화하면 기존 CI 키가 조용히 403으로 죽는다. 인사 변동이 CI를 깨뜨리는 경로다.
- 수정: 현 동작은 보안상 타당하다. 운영 문서에 "CI 키는 owner 계정으로 발급하고, 그 계정을 강등/삭제하면 CI가 중단된다"를 명시하는 것으로 충분하다.

#### [low] OpenAPI 스펙이 서빙되지 않고 API key 기반 배포 레시피 문서가 없다

- 근거: 모든 route가 `describeRoute({...})`로 주석을 달지만 `openAPISpecs` 마운트가 어디에도 없다(create-app.ts 전문 확인). 실측: `curl -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/api/openapi` → 404. docs/ci-examples/{github-actions,gitlab-ci,gitea-actions}.yml 3개 모두 typecheck/lint/test/build + compose 헬스체크만 있고 패널 API 호출이 없다. `grep -rn 'Bearer|ctk_' docs/UPLOAD-DEPLOYMENT.md docs/API-DATA-AUTH.md` → API-DATA-AUTH.md:174에 "외부 자동화 문서는 ...를 포함한다"는 계획 문장만 존재.
- 영향: 워크플로를 작성하려는 사람이 참고할 정본이 없다. 청크 업로드 프로토콜(offset·x-chunk-sha256·idempotency-key), scope↔엔드포인트 매핑, 202 이후 판정 방법을 전부 소스에서 역공학해야 한다. describeRoute 주석 수백 줄이 아무 산출물도 만들지 않는 상태이기도 하다.
- 수정: hono-openapi의 `openAPISpecs`를 비프로덕션 한정으로 `/api/openapi`에 마운트(수 줄). 그리고 위 blocker/high 항목이 해소된 뒤 docs/ci-examples에 실제 배포 워크플로 1개를 추가한다.

### 운영 관측 · 장애 대응 · 복구 — 판정 `not-ready`

잘 만들어진 부분은 분명히 있다. nginx config 적용은 `nginx -t` 검증 → atomic rename → HUP → post-reload probe → 실패 시 이전 revision 자동 롤백까지 완결돼 있고(create-nginx-config-service.ts:279-330), durable job queue는 heartbeat·stall sweep·interrupted requeue·retry backoff를 갖췄으며(create-operation-job-service.ts:364-386), 배포 release는 switching/observing/rolling-back 상태별 부팅 시 보상 복구가 구현돼 있다(create-deployment-release-service.ts:225-290). backup은 SHA-256·byte 검증, schema/FK 사전 검증, pre-restore recovery snapshot, maintenance drain 하 실행까지 갖춘 견고한 설계다. 패널 대시보드도 API·engine·nginx·traffic 도달성을 보여준다. 문제는 "사람이 패널을 열어봐야만 알 수 있다"는 점이다. push 알림은 backup 생성 실패 단 1종뿐이고(contracts/notification.ts:20), 배포·롤백·복원·prune·업로드 실패와 서비스 다운은 전부 무음이다. 게다가 알림 전달 자체가 API 프로세스 내부 job queue라 API가 죽으면 "API가 죽었다"는 알림이 나갈 수 없다 — dead-man's switch가 없다. `restart:` 정책이 하나도 없어 호스트/데몬 재시작 후 nginx까지 전부 멈춘 채 방치되고(배포 워크로드만 unless-stopped라 비대칭), 그 사실을 알려줄 경로도 없어 RTO가 사실상 무한이다. 복구 쪽도 백업이 로컬 볼륨에만 있고 export endpoint가 의도적으로 미제공이며, 암호화 키 파일(`/data/deployment-secret-key` 등)과 artifacts·nginx-config 볼륨이 백업에 포함되지 않아 호스트 유실 시 전손이다. upgrade 문서의 롤백 절차(migration 적용 후 백업 복원)는 코드상 `BACKUP_SCHEMA_MISMATCH`로 막혀 실제로 동작하지 않는다. 이 영역만 놓고 보면 실운영 개시 불가다.

#### [blocker] restart 정책 부재 — 호스트/Docker 재시작 후 nginx 포함 전체가 자동 복구되지 않고, 알려줄 경로도 없다

- 근거: compose.yaml 전체에 `restart:` 키가 없음(grep 결과 없음). `docker inspect containers-api-1 --format '{{.HostConfig.RestartPolicy.Name}}'` → `no`, nginx도 동일 `no`. 반면 배포 워크로드는 `restartPolicy: z.enum([...]).default('unless-stopped')`(packages/contracts/src/deployment.ts:39)로 자동 재기동된다.
- 영향: Docker Desktop/데몬 재시작이나 호스트 재부팅 후 control plane 5개 서비스가 전부 stopped로 남는다. nginx가 배포 앱의 ingress이므로 사용자 트래픽까지 함께 죽는다. 배포된 컨테이너만 unless-stopped로 살아나 라우팅 없이 떠 있는 비대칭 상태가 된다. 알림 시스템이 API 안에 있어 이 사실을 아무도 통지받지 못하고, 복구는 사람이 SSH로 `docker compose up -d`를 칠 때까지 지연된다 → RTO 무한.
- 수정: compose 5개 서비스 전부에 `restart: unless-stopped` 추가. 부팅 순서 경합 대비로 api → engine-agent `depends_on: service_healthy` 를 함께 검토. 작업량 소(compose 편집 + 재기동 검증).

#### [blocker] 알림 이벤트가 backup 실패 1종뿐 — 배포·복원·prune·업로드 실패와 서비스 다운은 전부 무음

- 근거: packages/contracts/src/notification.ts:20 `notificationEventTypeSchema = z.enum([BACKUP_FAILED, TEST])`. create-notification-delivery-service.ts `produce()`(파일 내 produce 정의)에서 `if (job.kind !== OPERATION_JOB_KIND.BACKUP_CREATE || job.status !== 'failed' ...) return` 로 backup 생성 실패 외 모든 job 종료를 조기 반환. DEPLOY_RELEASE/DEPLOY_ROLLBACK/BACKUP_RESTORE/SYSTEM_PRUNE/UPLOAD_FINALIZE/TRAFFIC_EXPORT 실패에 대한 분기 없음.
- 영향: 야간 배포가 실패하거나 롤백이 반쯤 깨져도, restore job이 JOB_INTERRUPTED로 확정돼도 운영자는 다음에 패널을 열 때까지 모른다. 사용자가 먼저 장애를 발견하는 구조다. self-hosted 단일 운영자 제품에서 이건 관측 수단이 사실상 없는 것과 같다.
- 수정: NOTIFICATION_EVENT_TYPE에 DEPLOY_FAILED/RESTORE_FAILED/JOB_FAILED(kind 필터) 추가하고 `produce()`를 '실패 종료한 모든 job kind'를 대상으로 확장 + destination의 eventTypes로 구독 제어. 기존 delivery/재시도/중복방지 인프라를 그대로 재사용하므로 작업량 중(계약 enum·produce 분기·embed 템플릿·UI 체크박스).

#### [blocker] control plane 자체를 감시할 dead-man's switch가 없다 — 알림 경로가 죽는 대상 안에 있다

- 근거: 알림 전달은 OPERATION_JOB_KIND.NOTIFICATION_DELIVER job으로, API 프로세스 내부 워커(server.ts:125 `operationJobService.start()`)가 실행한다. 외부에서 주기적으로 상태를 확인하는 컴포넌트는 코드베이스에 없다(cron·watchdog·uptime probe 없음). `GET /api/health`는 `healthSchema.parse({ service:'api', status: SERVICE_STATUS.OK, ... })`(create-health-service.ts)로 항상 ok만 반환한다 — DB·engine-agent·traffic-worker를 확인하지 않는다.
- 영향: API가 죽거나 컨테이너가 안 뜨거나 DB가 손상돼도 알림은 구조적으로 발송 불가능하다. 외부 uptime 모니터를 붙여도 `/api/health`는 프로세스만 살아 있으면 200 ok를 주므로 degraded 상태(engine-agent 다운, control DB integrity 실패, backup 3일째 실패)를 감지하지 못한다.
- 수정: ① `/api/health`에 downstream(engine-agent·traffic-worker health, control DB integrity, 마지막 backup 경과시간) 요약을 담은 deep-health(`/api/health?deep=1` 또는 `/api/readyz`)를 무인증 또는 전용 토큰으로 제공. ② 외부 모니터(호스트 cron + curl, 또는 무료 uptime 서비스)에서 이 endpoint를 감시하도록 문서화. 작업량 중.

#### [blocker] 백업에 암호화 키 파일과 artifacts·nginx-config 볼륨이 빠져 있어, 새 호스트 복구 시 deployment secret이 복호화 불가

- 근거: backup set은 control.sqlite + traffic.sqlite + manifest.json 뿐(create-backup-service.ts:46-48, docs/BACKUP-RESTORE.md:5-9). 그런데 deployment secret은 `createHash('sha256').update(masterSecret)` 키로 AES-256-GCM 암호화되며(create-deployment-secret-service.ts:71-84), masterSecret은 `/data/deployment-secret-key`(server.ts:33 기본값, `docker compose exec api ls -la /data` 로 실재 확인: auth-secret·deployment-secret-key·notification-secret-key 각 64B)이다. 이 파일들은 backups 볼륨이 아니라 control-data 볼륨에 있고 백업 대상이 아니다. `loadOrCreateSecret`은 파일이 없으면 새 키를 생성한다.
- 영향: 호스트가 유실돼 새 호스트에 백업을 복원하면 control.sqlite의 deployment_secret·notification_destination ciphertext는 그대로인데 키는 새로 생성돼, 모든 secret이 복호화 불가가 된다. 실패는 복원 시점이 아니라 다음 배포 시점에 드러난다. artifacts 볼륨도 백업되지 않아 복원된 artifact 메타데이터가 존재하지 않는 파일을 가리키고, nginx-config(current.conf·revision) 역시 유실된다.
- 수정: 백업 set에 `/data`의 키 파일 3종(봉투 암호화 또는 별도 안전 보관 안내)과 artifacts·nginx-config 스냅샷을 포함하거나, 최소한 '이 파일들을 별도 백업하지 않으면 복원이 무의미하다'를 BACKUP-RESTORE.md에 명시하고 백업 생성 시 경고를 반환한다. 작업량 중~대.

#### [blocker] 백업이 로컬 Docker 볼륨에만 존재하고 반출 경로가 없다 — 호스트 유실 = 전손

- 근거: backupRoot는 `/backups` = `containers_backups` named volume(compose.yaml api/traffic-worker volumes). `docker system df -v` → containers_backups 12.37MB, 컨테이너 내 `/backups`에 UUID 디렉터리 2개(Aug 2·Aug 3 22:22). docs/BACKUP-RESTORE.md:80 "backup export/download endpoint는 의도적으로 아직 제공하지 않는다", :79 R2 replication 미구현. 백업 파일을 꺼내는 API는 존재하지 않는다(route/backup에 download 핸들러 없음).
- 영향: 디스크 고장·볼륨 삭제·`docker volume prune` 사고 한 번에 7세대 백업이 원본과 함께 통째로 사라진다. 백업의 존재 의의인 '원본과 독립된 매체'가 성립하지 않는다. 반출 endpoint도 없어 운영자가 정기적으로 오프사이트 복사본을 만들려면 호스트 셸에서 직접 볼륨을 tar로 뜨는 수밖에 없고, 그 절차조차 문서에 없다.
- 수정: 최소선: 호스트에서 `docker run --rm -v containers_backups:/b -v $PWD:/out alpine tar czf /out/backup.tgz /b` 형태의 오프사이트 복사 절차를 BACKUP-RESTORE.md에 runbook으로 추가(작업량 소). 본선: owner 전용 download endpoint 또는 문서에 예고된 R2 replication job 구현(작업량 대).

#### [high] upgrade 문서의 롤백 절차가 코드상 동작하지 않는다 (migration 적용 후 이전 백업 복원 불가)

- 근거: docs/CONTROL-PLANE-UPGRADE.md:75 "control DB schema가 이전 코드와 호환되지 않으면 (새 migration이 적용된 경우) downgrade 없이 backup에서 복원한다". 그러나 compose-backup.ts:46 `sourceTables.join(',') !== currentTables.join(',')` → `BACKUP_CONTROL_INVALID`, :52-54 컬럼 집합 불일치 → `BACKUP_SCHEMA_MISMATCH`. 그리고 동 문서 :58 "적용된 migration을 되돌리는 downgrade는 지원하지 않는다" — 코드를 롤백해도 DB는 새 schema로 남는다.
- 영향: 새 migration이 포함된 업그레이드가 실패했을 때 문서가 지시하는 유일한 탈출구가 API에서 거부된다. 실제로 롤백이 필요한 순간(=migration이 들어간 릴리스)에만 정확히 막히는 구조다. 운영자는 장애 상황에서 문서를 따라갔다가 막히고, 남는 선택지는 호스트에서 sqlite 파일을 수동 교체하는 비문서화·비검증 절차뿐이다.
- 수정: ① 문서를 사실에 맞게 정정하고(migration 포함 릴리스는 backup 복원으로 롤백 불가), ② 대안 절차 제공: upgrade 직전 백업 + '컨테이너 정지 후 control-data 볼륨의 control.sqlite를 백업 파일로 직접 교체' runbook을 검증해 문서화. 작업량 중(절차 정의 + 실제 drill 1회).

#### [high] restore 중 API 종료 시 control/traffic 불일치 상태로 maintenance가 풀리고 mutation이 재개된다

- 근거: maintenance 상태는 in-memory(`let enabledState`, create-maintenance-service.ts:12)이며 영속화되지 않는다. restore job은 maxAttempts 1(route/backup restore enqueue), 중단 시 recoverAbandoned가 `attempt >= maxAttempts`로 failed 확정(create-operation-job-service.ts:372-379). backup restore는 traffic worker 복원 → control 복원 순서(create-backup-service.ts:165-169)라 두 프로세스 사이에서 끊길 수 있다. 프로세스 어디에도 SIGTERM 핸들러가 없다(`grep -rn 'SIGTERM|SIGINT' apps/*/src` → 결과 없음).
- 영향: restore 중 컨테이너가 재시작되면 traffic DB만 과거로 돌아간 불일치 상태에서 API가 정상 부팅하고, maintenance가 해제돼 mutation을 다시 받는다. 실패 알림도 없다(위 finding 2). docs/BACKUP-RESTORE.md:76이 이 상황을 한 문장으로 인정하고 있지만 '수동 복구' 절차 본문은 존재하지 않는다.
- 수정: ① maintenance 상태를 control DB에 영속화해 부팅 시 복원, ② 부팅 시 최근 BACKUP_RESTORE job이 미완결이면 maintenance를 유지한 채 경고 상태로 시작, ③ pre-restore recovery snapshot으로 되돌리는 구체 절차를 BACKUP-RESTORE.md에 단계별로 추가. 작업량 중.

#### [high] control plane 상태와 job 결과를 세션 없이 읽을 수 없다 — 자동 감시·CI 확인 불가

- 근거: create-control-plane-route.ts는 `authService.requireRole`만 사용하고 apiKeyService 의존이 없다. 실측: `curl -H 'Host: panel.containers.local' http://127.0.0.1:8080/api/control-plane/status` → 401. route/job/create-job-route.ts의 `/jobs`, `/jobs/:id`, `/jobs/:id/events`, `/jobs/backup-schedule` 전부 `authService.requireRole`만 사용. API_KEY_SCOPE(packages/contracts/src/api-key.ts:3-13)에 job/status 계열 scope가 없다.
- 영향: 외부 모니터링 스크립트나 CI가 DB integrity·pending migration·activeJobCount·job 실패를 기계적으로 확인할 방법이 없다. 브라우저 세션 쿠키 없이는 어떤 자동화도 control plane 상태를 관측할 수 없어, 관측이 전적으로 사람의 수동 확인에 묶인다. (백업 신선도만 `backup:read`로 `GET /api/backups`를 통해 확인 가능하다.)
- 수정: `job:read`(및 `status:read`) scope를 추가하고 `/jobs*`·`/control-plane/status`에 API key 인증 분기를 붙인다. 기존 backup route의 `authorization 헤더 유무로 분기` 패턴을 그대로 복사하면 된다. 작업량 소~중.

#### [medium] 컨테이너 로그가 유일한 서버 로그 보존처인데 무제한이고 회수 정책이 없다

- 근거: `docker inspect containers-api-1` → `logdriver=json-file opts=map[]` (max-size·max-file 미설정), compose.yaml에 `logging:` 섹션 없음. API/agent/worker의 로그는 전부 console.error로 stdout/stderr에 나간다(with-error-handling.ts:35,43 등). nginx error_log는 `/var/log/nginx/error.log -> /dev/stderr` 심볼릭 링크(컨테이너 내 `ls -la /var/log/nginx` 실측)로 역시 Docker 로그로 흘러간다. access.jsonl만 entrypoint.sh:15-43이 128MB×3세대로 회전한다.
- 영향: 장기 운영 시 `/var/lib/docker/containers/*/*-json.log`가 무제한 증가해 디스크를 잠식한다. 특히 nginx error_log는 프록시 대상이 죽으면 요청마다 한 줄씩 쌓이므로 장애 중에 가장 빠르게 커진다. 반대로 사고 후 조사 시점에는 보존 기간·용량 보장이 없어 필요한 구간이 이미 없을 수도 있다.
- 수정: compose 각 서비스에 `logging: { driver: json-file, options: { max-size: '10m', max-file: '5' } }` 추가. 작업량 소.

#### [medium] 컨테이너 리소스 제한이 전무하고 backup이 DB 전체를 메모리에 올린다 — OOM 시 restart:no와 결합해 영구 다운

- 근거: `docker inspect containers-api-1` → `mem=0 nanocpu=0` (제한 없음), compose.yaml에 `deploy:`/`mem_limit`/`cpus` 없음. backup은 `sqlite.serialize()`(compose-backup.ts:98)와 traffic 측 `database.serializeSnapshot()`(create-traffic-backup-service.ts) 로 DB 전체를 메모리 버퍼로 만든 뒤 SHA-256을 계산한다. docs/BACKUP-RESTORE.md:73이 이 한계를 인정한다. traffic DB는 TRAFFIC_RAW_RETENTION_DAYS=14 동안 무제한 증가(행/용량 상한 없음, compose.yaml traffic-worker env).
- 영향: 트래픽이 늘어 traffic.sqlite가 수 GB가 되면 24시간마다 도는 자동 backup이 API/worker 메모리를 크게 잡아 OOM kill을 유발할 수 있다. restart 정책이 없으므로 OOM 한 번이 곧 영구 다운이다. CPU/메모리 제한이 없어 폭주한 한 서비스가 호스트 전체를 끌어내릴 수도 있다.
- 수정: ① 각 서비스에 보수적 `mem_limit`/`cpus` 지정, ② SQLite backup API 기반 스트리밍 스냅샷으로 전환(문서의 후속 작업 4번), ③ traffic DB 용량 상한 또는 retention 자동 축소. 작업량 중~대.

#### [medium] traffic ingest 이상 상태가 API·패널 어디에도 노출되지 않아 로그 유실이 조용히 진행된다

- 근거: traffic-worker는 `checkpointInodeMissing`·`checkpointInodeMissingCount`·`invalidLineCount`·`duplicateLineCount`를 집계해 `GET /traffic/ingestion`으로 노출한다(create-traffic-route.ts `/ingestion`, create-traffic-ingestion-service.ts:254-265). 그러나 API 측 `apps/api/src/route/traffic/create-traffic-route.ts`에는 analytics·live·summary·exports만 있고 ingestion 프록시가 없다. `grep -rn 'ingestion' apps/web/src apps/api/src` → 결과 없음.
- 영향: worker가 멈췄다가 재개하는 사이 access.jsonl이 3세대를 넘겨 회전하면 checkpoint의 inode가 사라져 offset 0으로 리셋되며(create-traffic-ingestion-service.ts:186-200) 그 구간 트래픽 데이터가 영구 유실된다. 유실 사실은 카운터로만 남고 운영자에게 도달할 경로가 없다. 파싱 실패 급증(포맷 변경 등)도 마찬가지로 무음이다.
- 수정: API에 `/api/traffic/ingestion` 프록시(admin 이상)를 추가하고 패널 트래픽 화면에 checkpoint 상태·유실 카운터 배지를 노출. 작업량 소.

#### [medium] 디스크 watermark가 업로드 경로에만 적용되고 backup·traffic·로그에는 없다

- 근거: `UPLOAD_DISK_HARD/SOFT_AVAILABLE_BYTES`는 upload service에서만 소비된다(create-upload-service.ts:135,156-159,181-182). backup 생성 경로(create-backup-service.ts createSnapshot)에는 여유 공간 확인이 전혀 없다. docs/BACKUP-RESTORE.md:87이 'disk watermark를 backup에도 적용한다'를 후속 작업으로 남겨 둠. 현재 호스트 여유: `df -h /backups` → 93.9G 중 56.6G available.
- 영향: 디스크가 차오르면 업로드만 DISK_HARD_WATERMARK로 막히고, backup·traffic ingest·컨테이너 로그는 계속 쓴다. 결국 backup 생성이 도중에 실패해 디렉터리가 rm되고(create-backup-service.ts:105-108) SQLite 쓰기가 실패하기 시작하는데, 그 시점에 남는 신호는 backup 실패 알림 하나뿐이다. 디스크 사용량 자체를 패널에서 보여주는 위젯이나 임계 알림이 없다.
- 수정: engine overview의 `disk.availableBytes`를 backup 생성 전 사전 검사에 재사용하고, soft watermark 도달 시 알림 이벤트(DISK_LOW) 발송 + 패널 배너. 작업량 중.

#### [medium] job 워커 동시성이 1이라 긴 작업이 알림 전달까지 포함해 큐 전체를 막는다

- 근거: create-operation-job-service.ts:312-329 — `processing` 플래그 + `while(true) { const job = await claimNext(); await runClaimed(job) }` 로 단일 프로세스가 한 번에 한 job만 순차 실행. 알림 전달도 같은 큐의 NOTIFICATION_DELIVER job이다(create-job-handlers.ts:208).
- 영향: 대용량 backup(전체 DB 직렬화)이나 SYSTEM_PRUNE이 수 분간 도는 동안 배포 job이 대기하고, 그동안 발생한 실패 알림 전달도 함께 지연된다. 장애가 났을 때 알림이 가장 늦게 나가는 배치가 된다. 또한 stall sweep 임계값이 90초(HEARTBEAT 30s × 3)라 heartbeat가 30초 간격으로만 갱신되는 구조상, 이벤트 루프를 오래 붙잡는 동기 작업(serialize 등)이 자기 자신을 stalled로 오판시킬 여지가 있다.
- 수정: job kind별 우선순위 또는 알림 전용 레인 분리(최소한 NOTIFICATION_DELIVER를 큐 밖 즉시 전송으로). 작업량 중.

#### [medium] SSE·exec 동시 세션 상한이 없다

- 근거: create-engine-stream-proxy-route.ts에 세션 수 제한 코드 없음(limit/max grep 무결과). 각 스트림은 upstream Docker 연결 + 15초 주기 세션 재검증 인터벌을 유지한다(:11,:34-36). exec은 세션당 idle 5분·최대 30분·버퍼 상한은 있으나(create-interactive-exec-route.ts:10-13) 동시 세션 수 제한은 없다. 상한이 있는 곳은 traffic live SSE의 `MAX_SUBSCRIBERS = 64`(create-traffic-ingestion-service.ts:15)뿐이다.
- 영향: 인증된 사용자(또는 재연결을 반복하는 브라우저 탭)가 스트림을 무제한 열면 API·engine-agent의 파일 디스크립터와 메모리, Docker 데몬 연결이 누적된다. 컨테이너 메모리 제한이 없으므로 호스트까지 영향이 간다. 15초마다 스트림 수만큼 세션 조회가 control DB에 발생하는 증폭도 있다.
- 수정: 사용자당·전체 동시 스트림 수 상한(traffic live의 MAX_SUBSCRIBERS 패턴 재사용)과 초과 시 429 반환. 작업량 소.

#### [medium] 사고 대응 runbook이 없다 — 기존 문서는 개발 세션 재개용이거나 upgrade 전용이다

- 근거: docs/RESUME-CHECKLIST.md는 첫 줄부터 '새 Codex 세션, 다른 작업자에서 프로젝트를 안전하게 재개하기 위한 단일 실행 진입점'으로 정의된 개발 재개 문서다(:1-3). docs/CONTROL-PLANE-UPGRADE.md는 upgrade/rollback만 다룬다. docs/BACKUP-RESTORE.md는 backup/restore API 절차만 다루고, :76의 중단된 restore 수동 복구는 한 문장 언급뿐 절차가 없다. docs/ 하위에 INCIDENT/RUNBOOK/TROUBLESHOOTING 류 문서 없음(ls docs/ 확인).
- 영향: engine-agent 다운, 디스크 full, control DB 손상, 호스트 재부팅 후 복구, nginx 설정 적용 실패 후 수동 롤백, 중단된 restore 수습 — 어느 것도 따라갈 절차가 없다. 장애 당시에 코드를 읽어가며 판단해야 한다. HANDOFF-STATUS.md:303도 'disk-full·daemon restart chaos test가 없다'고 인정한다.
- 수정: docs/RUNBOOK.md 신설: 증상 → 확인 명령 → 조치 순으로 최소 6개 시나리오(위 목록) 작성하고, 각 절차를 실제로 1회씩 drill 해 결과를 기록. 작업량 중.

#### [low] 에러 로그에 requestId가 포함되지 않아 사용자 신고와 서버 로그를 연결할 수 없다

- 근거: with-error-handling.ts:32에서 `const requestId = context.get('requestId')`를 읽어 :37,:45의 응답 body에는 넣지만, :35 `console.error(\`[api] request failed: code=${error.code} message=${error.message}\`)` 와 :43 로그 라인에는 requestId가 없다.
- 영향: 클라이언트가 받은 requestId를 들고 와도 Docker 로그에서 해당 요청을 특정할 수 없다. 동일 code의 에러가 다수 발생한 상황에서 조사 대상 요청을 좁히지 못한다.
- 수정: 두 console.error 문자열에 requestId를 포함(가능하면 JSON 한 줄 구조화 로그로). 작업량 극소.

#### [low] 부팅 시퀀스의 top-level await가 보호되지 않아 일시적 실패가 부팅 실패로 이어진다

- 근거: server.ts에서 `.catch()`가 붙은 것은 :122 uploadService.cleanupExpiredSessions와 :127 nginxProxyRouteService.reconcileRoutes뿐이다. :119 deploymentReleaseService.reconcileInterrupted, :120 cleanupExpiredContainers, :124 operationJobService.reconcileInterrupted, :126 notificationDeliveryService.reconcileQueued, :130 backupScheduleService.enqueueIfDue는 무방비 top-level await다. compose.yaml에서 api는 engine-agent에 대한 depends_on이 없어 기동 순서가 보장되지 않는다.
- 영향: 이들 중 하나가 예외를 던지면 Bun 프로세스가 부팅 중 종료된다. restart 정책이 없으므로 컨테이너는 그대로 죽은 채 남고, nginx는 `depends_on: api service_healthy`라 함께 뜨지 않아 전체 서비스가 올라오지 않는다. 부팅 실패는 알림 대상도 아니다.
- 수정: 각 부팅 스텝을 개별 try/catch로 감싸 실패를 로그+degraded 표시로 처리하고 서버는 기동시킨다(복구 job은 재시도 가능한 형태로). 작업량 소.

#### [low] audit_log에 보존 정책이 없어 control DB가 단조 증가하고 백업 메모리 사용량을 함께 키운다

- 근거: operation_job/operation_job_event는 14일 보존 후 삭제된다(create-operation-job-service.ts:17 FINISHED_RETENTION_MS, :388-391 cleanupFinished, server.ts:132 1시간 주기). audit_log에 대한 삭제·retention 코드는 없다(audit service·compose에 delete grep 무결과). 현재 행 수는 10건(실측)이라 즉시 문제는 아니다.
- 영향: 장기 운영 시 audit_log가 control DB의 대부분을 차지하게 되고, 24시간마다 도는 backup이 이를 통째로 메모리에 직렬화하므로 위의 OOM 리스크를 함께 키운다. 감사 로그 특성상 무기한 보존이 정책일 수 있으나, 그 결정이 문서화돼 있지 않다.
- 수정: 보존 기간 정책을 결정해 docs/acknowledge에 기록하고, 무기한 보존이면 아카이브(export) 경로를, 아니면 cleanupFinished와 동일 패턴의 주기 삭제를 추가. 작업량 소.

### 데이터 안전성과 확장 한계 (SQLite 운영 적합성 · 무결성 · 장기 운영 · 암호화 자산 · 시간) — 판정 `not-ready`

잘 되어 있는 부분부터 인정하면: 두 DB 모두 WAL + busy_timeout 5000 을 켜고 있고(packages/db-schema/src/database.ts:14-17, apps/traffic-worker/src/db/database.ts:46-49), control DB 는 foreign_keys=ON 에 11개 migration 이 전부 가산적(ADD COLUMN/CREATE)이라 파괴적 변경이 없다. 백업 manifest 는 byte 수 + SHA-256 을 담고 원자 rename 으로 쓰며, 복원 전에 integrity_check·foreign_key_check·schema 대조를 하고 pre-restore recovery snapshot 으로 보상 복구까지 한다. serialize() 가 WAL 내용을 포함하는 것도 실측으로 확인했다(live control.sqlite 본체는 4096 B 인데 백업본은 368,640 B). 시간은 전 구간 epoch integer 저장이고 스케줄이 전부 상대 간격(interval/backoff)이라 DST·타임존 이슈는 없다 — 코드 전체에 TZ·toLocale·Asia/Seoul 참조가 0건이다. 그러나 실운영 판정은 not-ready 다. 결정적인 이유는 백업이 재해복구가 아니기 때문이다. 백업 세트는 control.sqlite·traffic.sqlite·manifest.json 뿐이고(create-backup-service.ts:46-48, 실측 ls 로 확인), AES-256-GCM 마스터 키 3종은 백업에 없는 별도 볼륨에만 있으며 호스트 밖으로 백업을 꺼내는 경로 자체가 없다. 게다가 restore 는 21개 테이블 중 16개를 '보존'하고 5개만 되돌리는데, 그중 deployment 는 artifact(보존 대상)를 FK restrict 로 참조하므로 새 호스트에서는 foreign_key_check 로 반드시 실패한다. 확장 면에서는 API 가 단일 프로세스 전제로 하드코딩돼 있고(부팅 시 running job 전수 requeue, in-memory maintenance/rate-limit/processing 플래그) 이 제약이 어떤 문서에도 적혀 있지 않다. 장기 운영은 traffic DB 가 실측 840 B/event 로 무제한 증가(그중 70%가 어디서도 읽지 않는 raw_json)하고 VACUUM·크기 상한이 없으며, 백업 생성에는 디스크 watermark 가드가 아예 없어 자동 백업이 호스트 디스크를 채울 수 있다.

#### [blocker] 백업이 재해복구가 아니다 — 암호화 마스터 키·artifact 파일·nginx current.conf 가 백업에 없고 호스트 밖으로 내보낼 경로도 없다

- 근거: apps/api/src/service/domain/backup/create-backup-service.ts:46-48 이 백업 세트를 manifest.json/control.sqlite/traffic.sqlite 3개로 한정한다. 실측: `docker compose exec -T api ls -la /backups/0bb633bb-.../` → control.sqlite, manifest.json, traffic.sqlite 3개뿐. 반면 키는 apps/api/src/server.ts:73-74 의 loadOrCreateSecret 로 /data 에 생성되며 `docker compose exec -T api ls -la /data` → auth-secret, deployment-secret-key, notification-secret-key (모두 백업 대상 아님). engine-agent 의 registry-credential-key 는 또 다른 볼륨(compose.yaml registry-credentials). 수동 편집 가능한 nginx 설정은 `docker compose exec -T engine-agent wc -l /nginx-config/current.conf` → 159줄이 nginx-config 볼륨에만 존재. docs/BACKUP-RESTORE.md 6절 "backup export/download endpoint는 의도적으로 아직 제공하지 않는다".
- 영향: 호스트/Docker 볼륨을 잃으면(디스크 고장, VM 손실, `docker volume rm`, Docker Desktop 초기화) 복구 수단이 0이다. 백업 파일 자체가 같은 호스트의 named volume 에만 있어 함께 사라진다. 설령 control.sqlite 를 다른 경로로 빼내 두었더라도 deployment_secret 은 AES-256-GCM ciphertext 이고 키는 유실됐으므로 모든 배포 secret(레지스트리 자격증명, 앱 환경변수)이 영구 복호화 불가다. artifact 실파일(/artifacts)도 백업에 없어 과거 릴리스로 되돌릴 수 없다. 즉 지금 백업은 '같은 호스트에서의 되돌리기' 도구일 뿐인데 UI·문서는 이를 백업이라 부르고 있어 운영자에게 잘못된 안전감을 준다.
- 수정: ① 백업 세트에 keys.json(3종 키)을 넣되 파일 자체를 운영자 passphrase 기반 envelope encryption 으로 감싼다. ② artifact 파일 목록·digest 를 manifest 에 넣고 별도 아카이브로 포함하거나, 최소한 '이 백업으로는 artifact 를 복원할 수 없다'를 API 응답·UI 에 명시한다. ③ nginx current.conf 를 백업에 포함한다(reconcileRoutes 로 재생성되는 managed 블록 외의 수동 편집분이 유실되므로). ④ owner 전용 백업 download endpoint 또는 오프사이트 복제(R2 adapter, 이미 docs/RESUME-CHECKLIST.md:140 에 계획됨)를 실운영 전제 조건으로 올린다. 작업 크기: 키 포함+암호화 1~~2일, artifact 포함 2~~3일, download/오프사이트 3~5일.

#### [blocker] restore 는 21개 테이블 중 16개를 보존해 사실상 5개만 되돌리며, 새 호스트에서는 FK 위반으로 반드시 실패한다 (문서와도 불일치)

- 근거: apps/api/src/compose/compose-backup.ts:15-32 의 PRESERVED_TABLES 는 account·api_key·artifact·audit_log·deployment_secret·invitation·notification__·operation_job_·session·upload_*·user·user_role·verification 16개를 삭제/재삽입 대상에서 제외한다(:68, :73). 실제 테이블 목록은 `docker compose exec -T api bun -e "...sqlite_master..."` → 21개(__drizzle_migrations, account, api_key, artifact, audit_log, deployment, deployment_manifest, deployment_release, deployment_secret, invitation, nginx_route, notification_delivery, notification_destination, operation_job, operation_job_event, session, upload_chunk, upload_session, user, user_role, verification). 따라서 실제 복원되는 것은 __drizzle_migrations, deployment, deployment_manifest, deployment_release, nginx_route 5개뿐이다. packages/db-schema/src/schema.ts:218 `deployment.artifactId ... references(artifact.id, { onDelete: 'restrict' })` 이고 compose-backup.ts:77-79 가 복원 직후 PRAGMA foreign_key_check 로 BACKUP_FOREIGN_KEY_INVALID 를 던진다. docs/BACKUP-RESTORE.md 4절 6번은 "control DB의 모든 user table을 단일 BEGIN IMMEDIATE transaction으로 교체한다"고 적혀 있어 코드와 정반대다.
- 영향: 새 호스트에 스택을 올리고 백업을 복원하는 시나리오에서, artifact 테이블은 보존(=빈 상태)인데 deployment 행은 백업에서 삽입되므로 foreign_key_check 가 위반을 잡아 트랜잭션이 ROLLBACK 되고 복원이 통째로 실패한다. 즉 '백업 → 새 호스트 복구'가 코드상 불가능하다. 같은 호스트 롤백에서도 사용자·API key·audit·artifact·job 은 되돌아가지 않는데 운영자는 문서를 근거로 전체가 되돌아간다고 믿게 된다. 또 deployment_manifest 는 복원되지만 그것이 참조하는 deployment_secret 은 보존되므로, 스냅샷 이후 삭제된 secret 을 참조하는 manifest 가 되살아나 배포가 런타임에 실패한다.
- 수정: 먼저 이 설계가 의도인지 결정한다. (A) '같은 호스트 배포 상태 롤백' 이 의도라면 API 응답·UI·docs/BACKUP-RESTORE.md 4절을 되돌아가는 5개 테이블만 명시하도록 고치고 기능명을 restore 가 아닌 rollback 계열로 바꾼다. (B) 재해복구가 목표라면 PRESERVED_TABLES 를 없애 전체 교체로 가되, artifact 파일 복원(위 finding)과 세션 무효화·재로그인 처리를 함께 설계한다. 어느 쪽이든 '새 호스트 복구' E2E 를 docs/RESUME-CHECKLIST.md:119 항목으로 실제 수행해 증거를 남겨야 한다. 작업 크기: (A) 문서·표기 정정 반나절, (B) 2~4일.

#### [high] schema 가 바뀌면 이전 백업이 전부 복원 불가 — 문서화된 upgrade rollback 절차가 실제로 동작하지 않는다

- 근거: apps/api/src/compose/compose-backup.ts:46-56 의 validateControlSnapshot 이 snapshot 의 테이블 목록과 모든 테이블의 컬럼 이름 목록을 현재 live DB 와 문자열 완전 일치로 비교하고 다르면 BACKUP_CONTROL_INVALID / BACKUP_SCHEMA_MISMATCH 를 던진다. 반면 docs/CONTROL-PLANE-UPGRADE.md:58 "적용된 migration 을 되돌리는 downgrade 는 지원하지 않는다. schema 를 이전 버전으로 되돌려야 하면 아래 rollback 의 'DB 복원' 단계로 control DB 를 backup 에서 복원한다", :75 "control DB schema 가 이전 코드와 호환되지 않으면 ... downgrade 없이 backup 에서 복원한다". 실제 migration 은 packages/db-schema/drizzle/0002·0004·0010 처럼 ADD COLUMN 을 포함하므로 upgrade 직후 live 컬럼 집합이 늘어나고, upgrade 이전 백업은 항상 컬럼 불일치가 된다.
- 영향: 업그레이드 실패 시의 공식 롤백 경로가 막힌다. 새 버전으로 올리고 migration 이 적용된 뒤 문제가 발견돼 코드를 되돌리면, live DB 는 새 컬럼을 가진 상태이므로 upgrade 직전에 만든 백업조차 BACKUP_SCHEMA_MISMATCH 로 거부된다. 운영자는 '백업이 있다'고 믿고 업그레이드를 진행했다가 롤백 시점에 아무 백업도 쓸 수 없다는 것을 발견한다. docs/BACKUP-RESTORE.md 6절이 이 한계를 알고 있다고 적어 두었지만 CONTROL-PLANE-UPGRADE.md 는 여전히 백업 복원을 롤백 수단으로 제시하고 있어 두 문서가 충돌한다.
- 수정: ① manifest 에 schemaVersion 대신 실제 migration hash 목록을 기록하고, 복원 시 'snapshot 의 migration 집합이 현재의 부분집합이면 복원 후 forward migration 을 재적용' 하는 경로를 만든다(가산적 migration 만 지원한다고 제약을 명시). ② 그전까지는 CONTROL-PLANE-UPGRADE.md:58,75 를 '이전 백업으로의 복원은 schema 가 동일할 때만 가능하며, migration 이 적용된 뒤에는 볼륨 스냅샷 수준의 호스트 백업이 유일한 롤백 수단' 으로 정정하고, 업그레이드 전 `docker volume` 레벨 스냅샷 절차를 runbook 에 추가한다. 작업 크기: ② 반나절, ① 2~3일.

#### [high] 백업 생성에 디스크 가드가 전혀 없다 — 자동 백업 7세트가 업로드와 같은 파일시스템을 채워 호스트를 정지시킬 수 있다

- 근거: apps/api/src/service/domain/upload/create-upload-service.ts:138-159 의 reserveStorage 는 diskHardAvailableBytes/diskSoftAvailableBytes watermark 를 검사하지만, apps/api/src/service/domain/backup/create-backup-service.ts:76-105 의 createSnapshot 에는 디스크 관련 검사가 전혀 없다(`grep -n "diskHard|availableBytes" create-backup-service.ts` → 결과 없음). 백업은 60초 주기 due-check 로 자동 enqueue 되고(apps/api/src/server.ts:128-129), BACKUP_RETENTION_COUNT 기본값 7(server.ts:21)이다. 그리고 세 저장소가 같은 파일시스템이다: `docker compose exec -T api df -h /data /backups /artifacts` → 세 줄 모두 /dev/vda1 93.9G, Available 56.6G. docs/BACKUP-RESTORE.md 7절 3번이 "disk watermark를 backup에도 적용한다"를 미구현 항목으로 남겨 두었다.
- 영향: traffic DB 가 커질수록 백업 1세트 크기가 그대로 곱해진다. 현재 실측으로도 backups/0bb633bb-.../traffic.sqlite 가 11.6 MB 인데, 실트래픽에서 traffic DB 가 수 GB~~수십 GB 가 되면 7세트 보관은 수십~~수백 GB 다. 백업이 디스크를 채우면 같은 파일시스템의 control.sqlite WAL 쓰기와 artifact 업로드가 동시에 실패하고, SQLite 는 디스크 풀 상태에서 쓰기 오류를 내며 API 가 전면 장애가 된다. 업로드 hard watermark(16 GiB)는 업로드만 막을 뿐 백업은 못 막는다.
- 수정: createSnapshot 진입 시 engineAgentClient.getOverview().disk.availableBytes 를 읽어 (직전 백업 크기 × 1.2) 만큼의 여유가 없으면 DISK_HARD_WATERMARK 로 실패시키고 job 이벤트·알림으로 노출한다. 동시에 retentionCount 뿐 아니라 '총 백업 용량 상한(BACKUP_MAX_TOTAL_BYTES)' 을 추가해 오래된 세트를 먼저 회수한다. 작업 크기: 반나절~1일.

#### [high] API 가 단일 프로세스 전제로 하드코딩돼 있고 그 제약이 어디에도 문서화돼 있지 않다

- 근거: ① apps/api/src/server.ts:124 `await operationJobService.reconcileInterrupted()` 가 부팅 시 status in ('running','cancelling') 인 모든 job 을 조건 없이 조회(apps/api/src/compose/compose-operation-job.ts:75-79 listInterrupted)해 requeue/실패 처리한다 — 소유 프로세스를 구분하는 worker id 가 없다. ② apps/api/src/service/domain/job/create-operation-job-service.ts:312 `let processing = false` 가 tick 동시실행 방지의 전부다. ③ enqueue 의 중복 방지는 findActiveByKind select 후 insert 라 원자적이지 않다(create-operation-job-service.ts:184-190, compose-operation-job.ts:42-54). ④ apps/api/src/service/domain/maintenance/create-maintenance-service.ts:12-13 `let enabledState` / `let inflightMutations` 가 프로세스 메모리다. ⑤ apps/api/src/service/domain/api-key/create-api-key-service.ts:69 `const rateWindows = new Map(...)` 도 프로세스 메모리다. ⑥ server.ts:120,123,128-130 의 정리·스케줄 setInterval 도 전부 프로세스 로컬. compose.yaml 에 replicas 지정이 없고, `grep -rn "replica|단일 인스턴스|수평 확장" docs/*.md` → 관련 언급 0건.
- 영향: 수평 확장이 불가능한 것을 넘어서, 운영 중 실수로 API 를 2개 띄우면(무중단 업그레이드를 시도하며 새 컨테이너를 먼저 올리는 흔한 패턴) 두 번째 인스턴스의 부팅 reconcileInterrupted 가 첫 인스턴스가 지금 실행 중인 배포/백업/복원 job 을 JOB_INTERRUPTED 로 requeue 하거나 failed 로 확정한다. 실행 중인 handler 는 그대로 돌고 있으므로 같은 릴리스가 이중 실행되어 컨테이너·nginx 설정 경합이 난다. maintenance 가 프로세스 로컬이므로 한쪽에서 켠 유지보수 모드가 다른 쪽 mutation 을 막지 못하고, API key rate limit 은 인스턴스 수만큼 곱해진다. 또 API 단독 재시작만으로도 켜져 있던 maintenance 가 조용히 해제된다.
- 수정: ① 최소 조치로 '이 컨트롤 플레인은 API 단일 인스턴스 전제' 를 docs/ARCHITECTURE.md·llm.txt·CONTROL-PLANE-UPGRADE.md 에 명시하고, 업그레이드 절차를 stop-then-start 로 못박는다(반나절). ② 그 다음 reconcileInterrupted 에 worker instance id 를 도입해 자기 소유 job 만 회수하도록 바꾸고, claimNext 를 단일 `UPDATE ... WHERE status='queued' AND scheduled_at<=? RETURNING` 으로 원자화, (kind, resource_key) 활성 부분 유니크 인덱스 추가(2~3일). ③ maintenance 상태를 control DB 에 영속화한다(반나절).

#### [high] traffic DB 가 시간 기준 retention 만 있고 크기 상한·VACUUM 이 없다 — 그중 70%가 아무도 읽지 않는 raw_json 이다

- 근거: 실측(`docker compose exec -T traffic-worker bun -e ...`): access_event 17,438행, 파일 14.6 MB + WAL 4.1 MB, `sum(length(raw_json))` = 10,170,130 B → 전체의 약 70%. 이벤트당 약 840 B. 데이터 구간은 32시간(min 1785709379000 ~ max 1785824953000)이므로 이 테스트 호스트 기준으로도 하루 약 13k 건이다. raw_json 은 apps/traffic-worker/src/db/database.ts:74 에서 쓰기만 하고 `grep -rn rawJson apps packages` 결과 소비처가 schema 정의(db/schema.ts:17)와 이 insert 뿐이다. 정리는 apps/traffic-worker/src/service/domain/create-traffic-ingestion-service.ts:230,247 의 deleteBefore(now - retentionMs) 뿐이고(TRAFFIC_RAW_RETENTION_DAYS 기본 14), 레포 전체에 VACUUM 은 0건.
- 영향: retention 이 14일 '기간' 만 제한하므로 트래픽이 늘면 DB 크기는 선형으로 무한히 커진다. 초당 100 요청이면 14일치가 약 1.2억 행 × 840 B ≈ 100 GB 로, 93.9 GB 짜리 호스트 디스크를 혼자 넘긴다. 게다가 DELETE 는 파일을 줄이지 않으므로(VACUUM 없음) 트래픽 급증이 한 번 지나가면 파일은 최고 수위에 영구히 머문다. 그 크기가 백업 7세트에 그대로 복제되고, serialize() 기반 백업은 DB 전체를 메모리에 올리므로(docs/BACKUP-RESTORE.md 6절이 인정) 일정 크기를 넘으면 백업 자체가 OOM 으로 실패한다. raw_json 을 제거하는 것만으로 즉시 70%를 줄일 수 있는데 아무 소비처가 없다.
- 수정: ① raw_json 컬럼을 드롭하거나(마이그레이션) 최소한 저장을 중단한다 — 즉시 70% 절감, 반나절. ② 시간 retention 에 더해 행 수/바이트 상한(TRAFFIC_MAX_ROWS 또는 MAX_BYTES)을 두고 초과분을 오래된 것부터 삭제한다. ③ auto_vacuum=INCREMENTAL 로 전환하거나 정기 VACUUM job 을 둔다. ④ 분/시간 단위 롤업 테이블을 만들고 원시 이벤트 보관 기간을 짧게(예: 2일) 줄이는 것이 근본 해법이다. 작업 크기: ①② 1일, ③ 반나절, ④ 3~5일.

#### [medium] traffic 분석 요청 1건이 동기 full-scan 4회 + full-sort 3회를 유발해 traffic-worker 이벤트 루프를 통째로 막는다

- 근거: apps/traffic-worker/src/service/domain/create-traffic-query-service.ts:45(getAnalyticsSummary), :67-69(getPercentile ×3), 그리고 getStatusCounts·getTopPaths·getRecentEvents 까지 한 요청에서 호출된다. apps/traffic-worker/src/db/database.ts:33-35 의 filterCondition 은 `instr(uri_path, ?) = 1` 을 쓰므로 uri_path 인덱스를 탈 수 없고, 실제 인덱스는 occurred_at·status 뿐이다(`SELECT name FROM sqlite_master WHERE type='index'` → access_event_occurred_at_idx, access_event_status_idx). getPercentile 은 `ORDER BY request_time_ms LIMIT 1 OFFSET n` 이라 매 호출이 조건 일치 전체를 정렬한다. bun:sqlite 는 동기 API 라 이 작업이 전부 이벤트 루프를 점유한다. 실측: 17,438행 전체 스캔 11 ms, percentile 쿼리 9 ms → 행당 약 0.6 µs.
- 영향: 행 수에 선형으로 늘어난다. 1,000만 행이면 스캔 1회 약 6초, 한 요청의 7개 쿼리가 30초 이상 이벤트 루프를 잡는다. 그동안 traffic-worker 의 /health 가 응답하지 못하는데 compose.yaml traffic-worker healthcheck 는 timeout 3s / retries 5 라 컨테이너가 unhealthy 로 떨어지고, 동시에 nginx 액세스 로그 ingestion poll 과 백업 요청도 전부 멈춘다. 즉 운영자가 대시보드를 한 번 여는 것만으로 트래픽 수집이 중단되는 자기 유발 장애가 된다.
- 수정: ① 분석 쿼리에 시간 범위 상한을 강제하고, (occurred_at, status) 복합 인덱스와 uri_path prefix 인덱스를 추가한다. ② percentile 을 3회 개별 정렬 대신 한 번의 정렬 결과에서 3개 offset 을 뽑도록 바꾸거나 근사 히스토그램 테이블을 쓴다. ③ 근본적으로는 롤업 테이블에서 조회하도록 바꾼다. ④ 최소한 무거운 쿼리를 별도 SQLite 읽기 연결 + worker thread 로 옮겨 이벤트 루프와 healthcheck 를 보호한다. 작업 크기: ①② 1~2일, ④ 1일.

#### [medium] 암호화 마스터 키의 회전·재암호화 경로가 없다 — 키를 바꾸면 기존 secret 이 전부 복호화 불가가 된다

- 근거: apps/api/src/server.ts:73-74 가 loadOrCreateSecret 으로 키를 읽거나 없으면 생성한다(packages/config/src/secret.ts:20-30, randomBytes(48)). apps/api/src/service/domain/deployment/create-deployment-secret-service.ts:69 `const key = createHash('sha256').update(masterSecret).digest()` 로 프로세스 시작 시 1회 파생하고, 저장된 ciphertext 를 새 키로 다시 암호화하는 루틴이 없다(`grep -rn "rotate|reencrypt|re-encrypt" apps/api/src` → deployment secret 관련 0건, registry-credential.rotate 는 자격증명 값 교체이지 키 회전이 아니다). notification 도 동일 패턴(NOTIFICATION_SECRET_KEY_FILE).
- 영향: 키가 유출됐다고 판단되어도 교체할 수단이 없다. 키 파일을 지우고 재시작하면 새 키가 생성되면서 deployment_secret 의 모든 행이 AES-GCM auth tag 검증 실패로 영구 복호화 불가가 되고, 그 secret 을 바인딩한 모든 manifest 의 배포가 실패한다. 복구는 운영자가 모든 secret 값을 다시 입력하는 것뿐이며, 원본 값을 모르면(레지스트리 토큰 등) 발급처에서 재발급해야 한다. 보안 사고 대응 시 '키 회전' 이라는 표준 조치를 취할 수 없다.
- 수정: 키 파일을 버전 있는 keyring(예: {version, key}[] JSON)으로 바꾸고, deployment_secret 행에 keyVersion 컬럼을 추가한다. 복호화는 행의 keyVersion 으로, 암호화는 항상 최신 버전으로 하고, owner 전용 rotate 엔드포인트가 전체 행을 새 키로 재암호화하는 durable job 을 돌린다. 작업 크기: 2~3일.

#### [medium] maintenance mode 가 프로세스 메모리에만 있어 restore 도중 API 재시작이면 mutation 차단이 조용히 풀린다

- 근거: apps/api/src/service/domain/maintenance/create-maintenance-service.ts:12-13 이 enabledState 와 inflightMutations 를 모듈 지역 변수로 둔다. control DB 테이블 목록(실측 21개)에 maintenance 관련 테이블이 없다. docs/BACKUP-RESTORE.md 6절이 "API 재시작 시 maintenance 는 in-memory 라 해제되며, 중단된 restore job 은 자동 재개되지 않고 JOB_INTERRUPTED 실패로 확정된다"고 스스로 인정한다. restore job 은 maxAttempts 1 이라 재시도되지 않는다.
- 영향: 복원은 control DB 트랜잭션과 traffic DB 트랜잭션 2단계인데(create-backup-service.ts:160-166), 그 사이에 API 가 죽으면 두 DB 가 서로 다른 시점을 가리키는 상태로 남는다. 재시작 시 maintenance 가 꺼진 채로 부팅되므로 운영자와 CI 가 이 불일치 상태에 그대로 쓰기를 시작한다. 유지보수 목적으로 수동으로 켠 maintenance 도 API 재시작만으로 해제되므로, 컨테이너가 OOM·헬스체크 실패로 재기동되면 의도한 차단이 사라진다.
- 수정: maintenance 상태(enabled, reason, startedAt, ownerJobId)를 control DB 테이블에 영속화하고 부팅 시 복원한다. 부팅 시 '중단된 restore job' 이 있으면 maintenance 를 유지한 채 운영자에게 pre-restore recovery 스냅샷 ID 를 노출하고 수동 확인 전까지 mutation 을 계속 차단한다. 작업 크기: 1일.

#### [medium] audit_log 가 무한 증가하고, 매 백업이 control DB 전체를 메모리에 직렬화한다

- 근거: packages/db-schema/src/schema.ts:105-127 의 audit_log 에는 retention 이 없고, apps/api/src/service/domain/audit/create-audit-service.ts 의 AuditServiceDb 는 list·record 두 메서드뿐이라 삭제 경로가 없다(append-only 자체는 잘 지켜지고 있다). 반면 apps/api/src/server.ts:130 은 operation_job 만 cleanupFinished(14일)로 정리한다. 백업은 apps/api/src/compose/compose-backup.ts:88 `snapshot: () => sqlite.serialize()` 로 DB 전체를 메모리 Uint8Array 로 만들고, create-backup-service.ts:84-87 이 그것을 통째로 쓴다. 현재 control DB 는 page_count 94 × page_size 4096 = 385 KB, audit 10행이라 아직 문제가 드러나지 않는다.
- 영향: audit_log 는 인덱스 6개(schema.ts:122-127)를 달고 있어 행당 저장 비용이 크다. API 호출량이 많은 CI 운용에서는 감사 로그가 control DB 의 지배적 비중이 되고, 그 전체가 24시간마다 메모리에 직렬화되어 7세트로 복제된다. audit 는 append-only 를 보장해야 하므로 단순 삭제도 곤란해, 지금 구조로는 '지우면 안 되는데 무한히 커지는' 데이터가 백업 비용을 끌어올린다. 또 serialize() 가 동기라 DB 가 커질수록 백업 중 API 이벤트 루프가 그만큼 멈춘다.
- 수정: ① audit 를 별도 파일(audit.sqlite) 또는 월별 파티션으로 분리해 control 백업과 수명주기를 분리하고, 오래된 파티션은 해시 체인과 함께 아카이브로 내보낸다. ② serialize() 대신 SQLite Online Backup API 또는 `VACUUM INTO` 로 파일에 직접 쓰도록 바꿔 메모리 상주를 없앤다(docs/RESUME-CHECKLIST.md:145 에 이미 계획 항목으로 존재). 작업 크기: ② 1일, ① 2~3일.

#### [medium] artifact 를 삭제하는 API 가 없어 300 GiB 쿼터를 소진하면 API 로 회수할 방법이 없고, 그 기본 쿼터가 실제 디스크보다 크다

- 근거: apps/api/src/route/upload/create-upload-route.ts 에는 DELETE 라우트가 없다(GET /artifacts, POST /uploads/sessions, PUT chunks, POST finalize 뿐). `grep -rn "'/artifacts" apps/api/src` → deployment 의 load 와 upload 의 목록 조회뿐. apps/api/src/service/domain/upload/create-upload-service.ts:328-368 의 cleanupExpiredSessions 는 DB 에서 참조되지 않는 고아 파일만 지우고 artifact 행 자체는 지우지 않는다. UPLOAD_TOTAL_QUOTA_BYTES 기본값은 322,122,547,200 (300 GiB, apps/api/src/server.ts:43) 인데 실제 디스크는 `df -h` 기준 93.9 GB(Available 56.6 GB) 다.
- 영향: artifact 는 한 번 올리면 영구히 남는다. CI 가 커밋마다 이미지 tarball 을 올리는 운용에서는 몇 주 만에 디스크를 잠식하고, 그때 운영자가 패널·API 로 할 수 있는 조치가 없어 호스트에 직접 접속해 docker volume 을 만져야 한다(그러면 DB 의 artifact 행과 어긋난다). 또 기본 쿼터 300 GiB 는 이 호스트에서 도달 불가능한 값이라 실효 가드는 UPLOAD_DISK_HARD_AVAILABLE_BYTES(16 GiB) 뿐이며, 쿼터 숫자가 운영자에게 잘못된 용량 감각을 준다.
- 수정: ① 어떤 deployment 도 참조하지 않는 artifact 에 대한 owner/admin DELETE 엔드포인트를 추가한다(FK restrict 가 참조 중인 것을 이미 막아 준다). ② artifact retention 정책(개수 또는 일수)과 주기 GC job 을 둔다. ③ UPLOAD_TOTAL_QUOTA_BYTES 기본값을 실제 디스크 대비 현실적인 값으로 낮추거나, 부팅 시 디스크 총량과 비교해 초과하면 경고 로그를 남긴다. 작업 크기: ①② 1~2일, ③ 1시간.

#### [medium] traffic export 가 최대 24시간분 전체를 메모리에 3중으로 적재한다

- 근거: apps/traffic-worker/src/service/domain/create-traffic-export-service.ts:58 `const rows = database.getExportEvents(...)` 가 범위 내 전 행을 배열로 받고, :59-69 가 그것을 records 로 한 번 더 map 하며, :71-90 이 다시 전체를 하나의 문자열 content 로 join 한 뒤 writeFile 한다. 범위 상한은 packages/contracts/src/operation-job.ts:65 의 24시간뿐이고 행 수 제한은 없다. apps/traffic-worker/src/db/database.ts:122-137 의 getExportEvents 도 `.all()` 이라 스트리밍이 아니다.
- 영향: 초당 100 요청이면 24시간이 약 860만 행이다. rows 배열 + records 배열 + 최종 문자열이 동시에 살아 있어 수 GB 의 힙을 요구하고, traffic-worker 는 메모리 제한이 없는 컨테이너에서 호스트 메모리를 먹거나 OOM 으로 죽는다. 죽으면 compose.yaml 에 restart 정책이 없어 트래픽 수집이 영구 중단된다. 또 이 작업 전체가 동기 SQLite 조회 + 대형 문자열 생성이라 그동안 ingestion·백업·health 가 멈춘다.
- 수정: getExportEvents 를 커서/청크 기반(occurred_at, request_id 기준 keyset 페이지네이션)으로 바꾸고 파일 writable stream 에 append 하도록 고친다. 동시에 export 결과 행 수 상한과 파일 크기 상한을 두고 초과 시 여러 파일로 분할한다. 작업 크기: 1일.

#### [medium] upload chunk 를 크기 검증 전에 전량 메모리로 읽어 들이며, 유일한 상한이 nginx client_max_body_size 다

- 근거: apps/api/src/route/upload/create-upload-route.ts:93 `const bytes = new Uint8Array(await context.req.arrayBuffer())` 로 본문 전체를 버퍼링한 뒤, apps/api/src/service/domain/upload/create-upload-service.ts:169-171 에서야 MAX_CHUNK_BYTES(67,108,864 = 64 MiB) 초과를 검사한다. 실질적 방어선은 infra/nginx/nginx.conf:88,139 의 `client_max_body_size 65m` 뿐이다. compose.yaml 의 api 서비스에는 mem_limit·deploy.resources 설정이 없다.
- 영향: 요청 1건당 최대 65 MiB 가 힙에 상주하며, sha256 계산 시 추가 사본이 생긴다. 사용자당 동시 업로드는 2건으로 제한되지만(upload-service.ts:216-218) 액터 수 제한이 없어 API key 5개면 300 MiB 이상이 동시에 뜬다. 메모리 상한이 없는 컨테이너라 API 가 OOM 으로 죽으면 restart 정책이 없어 그대로 멈추고, 진행 중이던 durable job 은 재기동 전까지 방치된다. nginx 를 우회해 API 에 직접 도달하는 경로가 생기면 상한 자체가 사라진다.
- 수정: chunk 라우트를 Content-Length 선검사 후 거부하도록 바꾸고(초과 시 본문을 읽지 않고 413), 본문은 request stream 을 그대로 파일 offset 에 append 하면서 해시를 증분 계산하도록 전환한다. 동시에 compose.yaml 의 api·traffic-worker 에 메모리 상한을 지정한다. 작업 크기: 1~2일.

#### [low] 모든 timestamp 가 초 단위로 저장돼 동일 초 내 정렬·페이지네이션이 불안정하다

- 근거: packages/db-schema/src/schema.ts 전반이 drizzle 의 `integer('created_at', { mode: 'timestamp' })` 를 쓴다(초 단위 저장). 실측: `SELECT min(created_at), max(created_at) FROM audit_log` → 1785723505 / 1785824152 (10자리 = 초). 반면 traffic DB 는 apps/traffic-worker/src/db/database.ts:64 에서 `new Date(...).getTime()` 밀리초로 저장해 두 DB 의 시간 해상도가 다르다. 정렬은 apps/api/src/compose/compose-audit.ts:55 `orderBy(desc(createdAt), desc(id))` 처럼 id 로 tie-break 하지만 id 는 랜덤 UUID 라 시간 순서를 담지 않는다.
- 영향: 같은 초에 여러 감사 이벤트나 job 이 생기면(CI 가 API 를 연속 호출하는 상황에서 흔하다) 목록의 시간 순서가 UUID 랜덤 순서로 뒤바뀐다. 감사 로그를 사고 조사에 쓸 때 동일 초 내 인과 순서를 신뢰할 수 없고, offset 페이지네이션에서 같은 행이 중복 노출되거나 누락될 수 있다. control 과 traffic 의 해상도가 달라 두 화면의 시각을 대조할 때도 혼선이 생긴다.
- 수정: 신규 컬럼은 `mode: 'timestamp_ms'` 로 통일하고, 정렬 tie-break 를 UUID 대신 rowid(또는 단조 증가 시퀀스)로 바꾼다. 기존 컬럼 전환은 migration 비용이 있으므로, 우선 tie-break 만 rowid 로 고쳐도 대부분의 증상이 사라진다. 작업 크기: tie-break 수정 2시간, 해상도 전환 1일.

#### [low] nginx 설정 revision 파일이 무제한 누적된다

- 근거: apps/engine-agent/src/service/domain/create-nginx-config-service.ts:307-312 가 적용 때마다 이전 설정을 `<sha256>.revision` 으로 복사해 두지만, 개수·기간 기준 정리 코드가 없다(:335-350 의 getState 는 목록만 읽는다). 실측: `docker compose exec -T engine-agent ls -la /nginx-config` → 아직 개발 중인 호스트인데도 revision 파일이 이미 5개.
- 영향: 라우트 추가·삭제와 GUI 편집이 잦은 운영에서는 revision 파일이 무한히 쌓인다. 파일 하나는 6 KB 수준이라 디스크 압박은 작지만, getState 가 매 호출마다 디렉터리 전체를 readdir 하고 각 파일에 stat 을 걸므로(:337-347) 수천 개가 되면 nginx 설정 화면 응답이 눈에 띄게 느려진다.
- 수정: 적용 성공 후 revision 을 mtime 기준 최신 N개(예: 20)만 남기고 나머지를 삭제하는 정리 루틴을 applyNginxConfig 마지막 단계에 추가한다. 작업 크기: 2시간.
