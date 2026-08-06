# 보안 설계

## 1. 최우선 전제

Docker daemon을 제어할 수 있는 주체는 Docker Desktop Linux VM의 root-equivalent 권한을 가진다. macOS host root와 동일하지는 않지만 공유된 host path를 mount할 수 있으므로 웹 입력이 Docker socket에 도달하는 경로를 일반 CRUD API처럼 취급하면 안 된다. 보안 목표는 접근 지점을 하나로 격리하고 모든 작업을 인증·인가·검증·감사 가능한 typed operation으로 제한하는 것이다.

## 2. 절대 불변식

- `/var/run/docker.sock`은 `engine-agent`에만 mount한다.
- Docker daemon TCP 2375를 열지 않는다. 원격 target은 SSH 또는 mutual TLS만 허용한다.
- 외부 Nginx route는 Agent에 연결할 수 없다.
- API가 임의 Docker CLI 문자열이나 호스트 셸 문자열을 받는 endpoint를 만들지 않는다.
- exec 명령은 문자열이 아니라 `cmd: string[]`로 받는다. container 내부 셸 실행은 명시적 exec operation으로만 허용하며 host 셸은 break-glass에서도 금지한다.
- 업로드 파일은 검증 전에 Docker load, build, import, extract하지 않는다.
- host bind mount, privileged, host PID·IPC·network, device mapping, Docker socket 재마운트는 기본 거부한다.
- 클라이언트 UI의 숨김 상태를 권한 판단으로 사용하지 않는다.
- `.env`와 secret 값을 로그, audit payload, API 응답에 넣지 않는다.

## 3. 위험도 등급

| 등급            | 예                                                                              | 요구 절차                                             |
| --------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------- |
| 조회            | list, inspect, stats, logs, events                                              | session 또는 read scope                               |
| 일상 변경       | start, stop, restart, pause, route draft 저장                                   | operator 이상, audit                                  |
| 파괴적          | container rm, image rmi, network·volume rm, prune                               | admin 이상, 영향 미리보기, 대상명 재입력              |
| root-equivalent | privileged create, host bind, device, host namespaces, shell exec, build secret | owner, 최근 재인증, 시간 제한 break-glass, 별도 audit |
| 시스템 전체     | system prune all, 다수 삭제, 전체 `nginx.conf` 적용                             | owner, dry-run 결과, 이중 확인, job 취소 지점         |

API 키에는 root-equivalent scope를 기본 발급하지 않는다. owner가 명시적으로 허용해도 짧은 만료, 낮은 rate limit과 선택적 CIDR을 적용한다. 외부 API에는 Cloudflare Access service token을 요구하지 않는다.

## 4. 인증·세션

- Better Auth email/password를 기본으로 하고 최초 소유자 생성 후 bootstrap endpoint를 영구 잠근다. bootstrap 자체는 인증이 없으므로 로컬 이름에서만 받는다(§16).
- 공개 signup은 비활성화하고 초대 token은 단회·짧은 만료로 둔다.
- 쿠키는 HttpOnly, SameSite=Lax 이며 https 요청에는 `Secure` 가 붙는다. loopback http 도 함께 지원해야 해서 요청별로 결정한다(§16).
- 비밀번호 재설정·로그인·API key 검증은 rate limit과 audit 대상이다.
- destructive와 break-glass 작업은 최근 인증 시각을 확인하고 오래된 session이면 재인증한다.
- Cloudflare Access는 관리 도메인 외곽 방어선으로 권장하되 애플리케이션 인증·인가를 대체하지 않는다.
- 초대 링크는 token hash만 저장하고 단회, 짧은 만료, role 상한, 회수와 사용 audit를 제공한다.

## 5. 권한 모델

권한은 role과 capability를 함께 사용한다.

- role: `owner`, `admin`, `operator`, `viewer`, `auditor`
- resource: `container`, `image`, `network`, `volume`, `nginx`, `traffic`, `deployment`, `user`, `api-key`, `audit`, `system`
- action: `read`, `create`, `update`, `execute`, `delete`, `prune`, `break-glass`

Route 는 `withErrorHandling` 안에서 `authService.requireRole`·`requireRecentRole`(또는 API key `authenticate`)을 직접 호출한다(`withCapability` HOF 는 존재하지 않는다). Service 도 보호 hostname·보호 컨테이너처럼 도메인 정책을 다시 확인한다. Agent는 API의 판정을 맹신하지 않고 operation별 허용 DTO와 internal service credential을 검증한다.

### 5.2 감사 로그 보존과 정렬 (2026-08-05)

- 보존 기간은 `AUDIT_RETENTION_DAYS`(기본 365일)다. 12시간마다 기간이 지난 행을 **먼저 `/backups/audit-archives/audit-<날짜>.jsonl` 로 append 한 뒤 DB 에서 지운다**(1,000행 배치, 파일 모드 `0600`). 백업 volume 안이므로 볼륨 오프사이트 복사 절차가 아카이브도 함께 가져간다. 감사 기록을 조용히 소멸시키지 않는 것이 목적이다.
- 목록 정렬 tie-break 를 UUID 에서 **rowid** 로 바꿨다. `created_at` 이 초 단위라 같은 초에 쌓인 이벤트가 랜덤 UUID 순서로 뒤섞였고, offset 페이지네이션에서 중복·누락이 생길 수 있었다. rowid 는 단조 증가하므로 동일 초 내 삽입 순서가 그대로 복원된다.
- control DB 는 초 단위, traffic DB 는 밀리초 단위 저장이라는 차이는 남아 있다. 전 컬럼 해상도 전환은 migration 비용이 커서 하지 않았고, 실제 증상(동일 초 정렬 불안정)은 rowid tie-break 로 해소했다.

### 5.1 감사 로그 열람 role (구현 기준, 2026-08-04 확정)

`GET /api/audit`은 **`owner`·`admin`·`viewer`·`auditor` 네 role**이 조회할 수 있다(`create-audit-route.ts`). 설계 문서에 한때 owner/admin으로 적혀 있었으나 구현을 정본으로 삼아 문서를 맞춘다 — 감사 로그는 읽기 전용 관측 수단이고 `viewer`·`auditor`는 정의상 읽기 role이기 때문이다.

노출 범위와 통제는 다음과 같다.

- 응답에는 actor 이메일, operation, `targetType`/`targetId`, `detail`, 결과, 요청 ID가 포함된다. 따라서 `viewer`도 누가 무엇을 했는지 전부 볼 수 있다.
- **원본 IP는 노출되지 않는다.** `auditEventSchema`에 `sourceIp` 필드 자체가 없어 Zod가 제거하고 `sourceIpMasked`만 내보낸다. §12의 원본 IP 통제는 이 경로에서도 유지된다.
- 감사 로그는 append-only이며 열람에 쓰기 권한이 필요 없다. 열람 role을 좁혀야 할 요구가 생기면 route의 role 배열 한 곳만 바꾸면 된다.

## 6. API 키

- Better Auth API key plugin 또는 동등한 검증된 구현을 사용한다.
- key 원문은 생성 응답에서 한 번만 노출하고 DB에는 hash만 저장한다.
- prefix, 이름, actor, scopes, expiresAt, revokedAt, lastUsedAt, rate limit, 선택적 CIDR를 저장한다.
- query string으로 키를 받지 않고 `Authorization: Bearer` 또는 고정 전용 header 하나만 사용한다.
- audit에는 key ID와 prefix만 남긴다.
- key rotation은 신규 발급, 소비자 전환, 구키 revoke 순으로 무중단 수행한다.
- 외부 `api` hostname에서는 session cookie를 인증 수단으로 사용하지 않고 브라우저 인증 endpoint도 노출하지 않는다.

## 7. CSRF·CORS·Cloudflare 헤더

- cookie 인증 mutation은 Origin과 Host를 검증하고 CSRF token 또는 Better Auth가 권장하는 방어를 적용한다.
- 패널 API는 same-origin만 허용한다. 외부 API는 기본 CORS 비활성화이며 필요한 machine client origin만 명시적으로 허용한다.
- `CF-Connecting-IP`, `CF-Ray`, `CF-IPCountry`는 요청이 cloudflared가 있는 내부 네트워크에서 들어왔고 예상 host인 경우만 신뢰한다.
- 직접 origin 접근을 방화벽과 Docker network로 차단한다.
- 관리 도메인과 wildcard workload 도메인의 cookie domain을 공유하지 않는다.

### 구현된 edge·application 제한

- Nginx는 `CF-Connecting-IP`가 있으면 이를, 없으면 직접 peer 주소를 rate key와 traffic `client_ip`로 사용한다. origin은 `127.0.0.1:18080`에만 bind하며 Cloudflare Tunnel 외 공개 listener를 두지 않는다.
- 로그인은 Nginx의 `5 request/minute + burst 5`와 API의 source별 `10 request/minute`를 겹쳐 적용한다. 제한 초과 응답은 `429`와 `Retry-After`를 사용한다.
- 일반 API는 Nginx에서 client별 `300 request/minute + burst 100`, API key는 애플리케이션에서 key별 기본 `120 request/minute`를 적용한다. API key 기본값은 환경 설정으로 낮출 수 있다.
- 패널에는 CSP, COOP, Permissions-Policy, Referrer-Policy, HSTS, `nosniff`, frame deny를 모든 응답에 추가한다. 외부 API hostname에는 브라우저 실행 권한 없이 no-referrer, HSTS, `nosniff`, frame deny만 추가한다.
- 전체 `nginx.conf` 편집은 위 rate zone·429·패널 보안 header token을 보호 계약으로 검사하므로 UI나 API에서 제거할 수 없다.
- Cloudflare 헤더의 진위는 origin 비공개라는 배포 불변식에 의존한다. 로컬 listener에 직접 접근 가능한 macOS 프로세스는 헤더를 위조할 수 있으므로 이를 원격 신뢰 경계로 간주하지 않는다.

## 8. 업로드 보안

- Content-Length와 실제 수신 byte를 모두 제한한다.
- 확장자, MIME, magic bytes, archive 구조를 교차 검증한다.
- 경로 순회, absolute path, symlink·hardlink escape, 과도한 파일 수, 압축 비율, 중첩 archive를 거부한다.
- quarantine 파일명은 서버 생성 ID만 사용하고 원본명은 metadata로만 보존한다.
- SHA-256 digest를 계산하고 중복 업로드를 식별한다.
- image load 전 manifest와 layer 개수·총 크기를 검사하고 load 후 image inspect와 scanner를 실행한다.
- build context에서 secret 파일, host path ADD, remote URL ADD, privileged build option을 정책으로 차단한다.

## 9. exec·로그·스트림 보안

- exec는 container ID를 다시 inspect해 존재와 현재 상태를 확인한다.
- 기본 user는 이미지·컨테이너 설정을 따르고 `root`와 `Privileged=true`는 break-glass다.
- 환경변수 주입은 key allowlist와 값 길이 제한을 적용하고 audit에는 key만 남긴다.
- idle timeout, max duration, max buffered output, 동시 session 수를 제한한다.
- WebSocket 연결마다 session과 capability를 재검증하고 session revoke 시 종료한다.
- logs는 secret pattern redaction을 제공하되 원본 Docker log를 영구 DB에 복제하지 않는 것을 기본으로 한다.
- redaction 구현은 `packages/config/src/redact-log.ts`(`redactSecretText`·`redactSecretLines`)다. 민감 key 대입(`*password*`·`*secret*`·`*token*`·`*credential*`·`*authorization*` 등), `Bearer`/`Basic` scheme, JWT, URL 자격증명을 `[REDACTED]`로 바꾸고 한 줄을 512자에서 자른 뒤 말줄임 문자를 붙인다(결과 최대 513자). 프로덕션 진입점은 `redactSecretLines` 하나이고 `redactSecretText` 는 그 내부와 테스트에서만 쓴다.
- **적용 범위는 배포 실패 진단 한 곳이다**(§19). 컨테이너 로그 조회 API(`GET /api/containers/:id/logs`)와 로그 SSE stream은 원문을 그대로 전달한다 — 이 두 경로는 영구 저장이 없고 호출자가 `engine:read` 권한을 이미 가진 상태이기 때문이다. 로그를 새로 **영속화**하는 경로를 만들면 반드시 위 유틸을 태운다.

## 19. 배포 실패 진단 저장

blue-green 릴리스가 실패하면 원인이 컨테이너 안에만 남고 패널에서는 실패 코드 하나만 보였다. 이제 실패 시점에 대상 컨테이너의 상태와 로그 꼬리를 durable job event 로 남긴다.

- 수집 지점: `apps/api/src/service/domain/deployment/create-deployment-release-service.ts` 의 `run` catch. 컨테이너를 중지하기 **전에** 수집한다.
- 수집 내용: `getContainer` 의 `state.exitCode`·`state.error`·`state.running`·`state.finishedAt`, `getContainerLogs` 로 받은 stdout·stderr(각 tail 20). 두 스트림을 이어붙인 뒤 **합친 결과의 마지막 20줄**만 남긴다 — stderr 가 20줄을 넘으면 stdout 은 남지 않는다.
- 수집 조건: 컨테이너가 이미 만들어진 뒤의 실패만 대상이다(`containerId` 가 있어야 한다). 생성 이전 실패는 진단이 없다.
- 저장 위치: `operation_job_event.detail` 한 곳이다. `deployment_release` 행이나 API 오류 응답 `details` 에는 넣지 않는다.
- 리댁션: 저장 전에 `redactSecretLines` 를 태운다. 빈 줄은 버리고 각 줄을 512자에서 자른다(말줄임 포함 513자).
- 노출 범위: job event 조회 권한과 동일하다 — 세션은 owner·admin, API key 는 `job:read`. `GET /api/deployment-releases` 는 전 역할이 볼 수 있으므로 진단을 release 응답에 싣지 않는다.
- 수집이 실패해도 릴리스 실패 처리 자체는 그대로 진행한다. 진단은 부가 정보이지 실패 경로의 전제가 아니다.
- 계약은 `packages/contracts/src/deployment.ts` 의 `deploymentFailureDiagnosticsSchema` 이고 job event `detail.step` 이 `failure-diagnostics` 다.

## 10. Agent·컨테이너 hardening

- Agent root filesystem은 read-only, writable tmpfs 최소화, no-new-privileges를 사용한다.
- Docker socket 외 host path를 mount하지 않는다.
- Agent port는 `internal: true` Docker network에서만 듣는다.
- API와 Agent 사이 credential 은 공유 named volume 의 파일(`/credentials/agent-secret`, mode 0600)로 전달한다. Docker `secrets:` 는 쓰지 않고 정기 rotation 도 자동화돼 있지 않다.
- private registry 비밀번호·access token은 Agent 전용 named volume에서 AES-256-GCM으로 암호화한다. API 응답·control DB·job payload·audit에는 원문을 기록하지 않는다.
- deployment secret 과 notification webhook 의 마스터 키는 **keyring** 이다. v1 은 `/data/deployment-secret-key`·`/data/notification-secret-key`, 이후 버전은 같은 경로에 `.v2`, `.v3` 로 쌓인다(모두 `0600`). 쓰기는 항상 활성(최신) 버전으로, 읽기는 행의 `key_version` 으로 한다.
- 키 교체는 owner 최근 인증이 필요한 `POST /api/deployment-secrets/rotate` 가 `secret.rotate` durable job 을 만들어 수행한다. 새 버전을 keyring 에 추가한 뒤 기존 행을 전부 복호화·재암호화한다. 옛 키를 지우지 않으므로 교체가 중간에 실패해도 어느 버전으로 암호화된 행이든 계속 복호화된다. 현재 버전은 `GET /api/deployment-secrets/key-versions`(owner·admin) 로 확인한다.
- registry credential은 선택한 image reference의 registry host와 정확히 일치할 때만 Docker Engine `X-Registry-Auth`로 사용한다.
- Agent 요청은 request ID, timestamp, nonce, body digest를 서명해 replay를 막는다.
- API, web, worker, nginx는 불필요한 Linux capability를 모두 drop한다.
- production 이미지는 digest로 pin하고 SBOM·취약점 scan을 CI에서 수행한다.
- Agent는 Docker Desktop에 공유된 임의 macOS host path를 받지 않고 제품이 소유한 named volume만 기본 허용한다.

## 11. 감사 무결성

- audit row는 append-only이며 애플리케이션에서 update·delete endpoint를 만들지 않는다.
- actor, authMethod, operation, targetType·targetId, requestId, result, source IP, `detail` JSON, createdAt 을 기록한다. user agent·jobId·before/after·duration 전용 컬럼은 없고 필요한 값만 `detail` 에 넣는다.
- secret, cookie, API key, full env, exec stdin, raw terminal output은 기록하지 않는다.
- 각 row에 이전 row hash를 포함하는 tamper-evident chain을 선택적으로 적용하고 주기적으로 외부 저장소에 checkpoint를 내보낸다.
- root 권한 공격자가 로컬 기록을 모두 바꿀 수 있다는 한계를 문서와 UI에 명시한다.

## 12. 원본 IP 개인정보 통제

- 원본 IP는 traffic raw row와 보안상 필요한 audit event에만 저장하고 rollup에는 원문을 복제하지 않는다.
- traffic live SSE와 일반 CSV/NDJSON export는 Worker 경계에서 IP를 mask하고 user agent를 제외한다. export 생성·download는 owner/admin session과 audit를 요구한다.
- 일반 목록은 mask한다. **재인증 후 원문을 열람하는 경로는 아직 없다** — API 는 `sourceIpMasked` 만 내보낸다.
- 원본 IP 조회와 export 시도 자체를 감사하고 bulk export는 owner 승인과 만료형 job으로 제한한다.
- Discord 알림과 선택적 R2 외부 backup의 알림 metadata에는 원본 IP를 넣지 않는다. R2 backup 자체는 암호화와 retention을 적용한다.
- raw row 14일, audit 1년 만료를 자동 purge하고 삭제 건수·완료 시각을 증거로 남긴다.

## 13. 보안 테스트 게이트

- role·scope 조합에 대한 deny-by-default matrix test
- cookie CSRF, CORS, Host header, Cloudflare header spoofing test
- Docker create 위험 옵션 우회와 Zod unknown field test
- command injection, path traversal, archive bomb, symlink escape test
- WebSocket 인증 만료·재사용·동시 연결 제한 test
- API key hash·rotation·revoke·rate limit test
- 로그와 audit의 secret redaction test
- invalid Nginx config가 현재 서비스를 중단하지 않는 test
- 원본 IP role, 재인증, masking, export, purge, backup·webhook 비노출 test
- Access가 없는 외부 API hostname에서 session cookie가 인증되지 않는 test

## 14. 로컬 백업 보안

- 로컬 백업은 API와 Traffic Worker만 mount한 `backups` named volume에 저장하며 host path를 입력받지 않는다.
- backup ID는 UUID, 복구·삭제 confirmation도 같은 UUID로 검증해 경로 입력 표면을 제거한다.
- 생성 전에 live control DB FK를 검사하고, 복구 전에 control SQLite integrity·FK·table·column과 두 파일 SHA-256·byte 수를 모두 검증한다.
- 복구는 Owner 최근 session 또는 명시적인 `backup:write` API key scope만 허용하고 create·restore·remove를 audit한다.
- 복구 직전에 현재 control·traffic DB를 별도 recovery set으로 만든다. 두 DB 복구 중 실패하면 이 set으로 보상 복구를 시도한다.
- 손상 backup은 복구할 수 없지만 정확한 UUID confirmation으로 삭제할 수 있다.
- 로컬 snapshot 자체는 별도 파일 암호화를 하지 않는다. deployment secret 값은 DB 안에서 AES-256-GCM ciphertext지만 사용자·세션·password hash 등 민감 metadata가 있으므로 named volume 접근을 secret 수준으로 다룬다.
- R2 전송을 구현할 때는 client-side envelope encryption, key rotation, object lock 또는 retention, multipart digest와 민감 metadata 제외가 선행되어야 한다.

## 15. 2026-08-04 보안 감사 반영

전수 감사([quality-assurance/2026-08-04-ui-backend-audit.md](./quality-assurance/2026-08-04-ui-backend-audit.md)) 결과 아래를 수정했다.

### 관리 plane 자기 보호

- `tagImage`에 보호 검사가 전혀 없어(바로 아래 `removeImage`에는 존재) admin이 제어 plane 이미지를 재태그해 다음 기동에서 Docker socket을 가진 컨테이너를 탈취할 수 있었다. 대상 이미지가 관리 plane 컨테이너의 ImageID이거나 요청 repository가 관리 plane repository 집합과 일치·prefix 관계면 `MANAGEMENT_RESOURCE_PROTECTED`로 거부한다.
- 참조 해석의 `endsWith` 매칭을 제거했다. 가드는 digest 꼬리로 대상을 찾고 Docker에는 사용자 원문을 넘겨 **가드 대상과 실제 대상이 갈릴 수 있었다.** 이제 exact → `sha256:` 제거 후 prefix 순으로 유일 매치를 해석해 canonical ID로만 Docker를 호출하고, 다중 매치는 모호성 오류, 미해석은 `DOCKER_NOT_FOUND`로 fail-closed 한다(기존에는 대상 미발견 시 가드를 통과했다).

### API key 권한 상승 차단

- admin이 `backup:write` scope의 API key를 스스로 발급해 **owner 전용** 백업 복원을 수행할 수 있었다(API key 경로가 role 검사와 최근 인증을 동시에 우회). `backup:write`·`secret:write`는 발급 시 owner + 최근 인증을 요구하고, **사용 시에도 발급자의 현재 role이 owner인지 재확인**한다. 정책 도입 이전 발급분과 강등된 계정의 키는 자동으로 무력화된다.
- 백업 복원(`POST /api/backups/:id/restore`)은 **session-only**로 전환했다. `authorization` 헤더가 있으면 거부하고 owner 세션 + 최근 인증만 허용한다. API key는 정의상 "최근 인증된 사람의 의사"를 표현할 수 없기 때문이다. 백업 생성·조회·삭제의 API key 경로는 자동화 용도가 있어 유지한다.

### 안정성 (가용성 측면)

- durable job의 `heartbeatAt`을 읽는 경로가 없어 좀비 running job이 리소스 잠금을 영구화했다. 주기 stall 스윕으로 회수한다.
- 백업 실패가 60초마다 무한 재큐잉되던 것을 지수 백오프로 바꿨다.
- engine-agent 이벤트 스트림이 슬롯 획득 후 실패 시 반납하지 않아 동시 스트림 한도가 영구 소진됐다.
- traffic-worker가 완결 라인 0건 청크에서 예외를 내 체크포인트가 전진하지 못하고 **수집이 영구 정지**했다.

### 보류 (승인 필요)

(해소 2026-08-04) nginx 보호 계약 검증의 substring·first-match 파싱 우회는 아래 §15.1 로 해결했다.

### 15.1 nginx 보호 계약 파서화 (2026-08-04, §15 보류 해소)

기존 검증은 `indexOf` 기반 substring·first-match 파싱이라 **앞쪽에 decoy `server_name panel.containers.local` 블록을 두면 그 블록만 검사받고 실제 요청을 처리하는 뒤쪽 블록은 rate limit·보안 헤더 없이 통과**할 수 있었다. `location /api/` 도 첫 매치만 봤다.

- 웹 GUI 편집기가 쓰던 검증된 파서를 `packages/nginx-config` 공유 패키지로 승격했다. 서버·클라이언트가 **같은 파서**를 쓰므로 두 구현이 갈라져 생기는 우회를 구조적으로 막는다.
- 검증을 AST 기반으로 재작성했다: `server_name` 을 토큰 단위로 분해해 대상 도메인을 포함하는 **모든** server 블록을 수집하고, 각 블록의 `location` 을 재귀로 전부 열거해 `/api/` 를 실제로 커버하는 location 과 sign-in 정규식 location 을 찾아 rate limit zone·burst 상한을 검사한다. 후보가 여러 개면 **전부 만족해야 통과**하고, 후보가 하나도 없어도 거부한다.
- 파싱 무결성도 함께 검사한다: 널바이트 거부, `serialize(parse(x)) === x` 왕복 동일성, 블록 균형, http 블록 정확히 1개.
- 회귀 테스트: 실제 `infra/nginx/nginx.conf` 통과, decoy 블록 거부, rate limit 없는 두 번째 `/api/` 거부, nested location 우회 거부, burst 상한 초과 거부.

구현 중 파서 자체의 결함도 드러났다. `# 주석` 줄 바로 다음의 블록 헤드를 주석 노드가 삼켜 블록 계층이 무너졌고, 같은 파서를 쓰는 **웹 GUI 편집기가 주석 있는 config 를 손상시킬 수 있는 경로**였다. statement 가 주석으로 시작하면 줄 끝에서 종결하도록 고치고 패키지에 회귀 테스트를 추가했다.

## 16. 2026-08-05 실운영 노출 점검 반영

실제 도메인으로 외부 접속을 열고 점검하면서 확인한 것들이다. 결정 근거는 [acknowledge/0035](./acknowledge/0035-trusted-proxy-approval.md)·[0036](./acknowledge/0036-public-origin-single-source-and-shutdown.md)에 있다.

### 앞단 프록시 신뢰를 DB 로 옮김

`set_real_ip_from` 이 설정 파일에 박혀 있었다. 그 값이 어긋나면 모든 요청의 클라이언트 IP 가 게이트웨이 하나로 수렴해 **rate limit 버킷을 외부 전원이 공유**하는데, 실패가 로그에도 드러나지 않는다.

- 기본값은 loopback 하나뿐이고, 실제 신뢰 목록은 `trusted_proxy` 테이블이 정본이다.
- 후보는 nginx access log 의 **원본 source 주소**에서 뽑는다. traffic DB 는 수집 시 `x.y.z.0` 으로 마스킹하므로(§12) `/32` 승인에 쓸 수 없다.
- 전체 대역(`0.0.0.0/0`·`::/0`·`any`)과 CIDR 표기를 거부하고, 마지막 한 개는 지울 수 없다.
- **실제 클라이언트 IP 를 승인하면 안 된다.** 승인하면 그 클라이언트가 forwarded 헤더를 위조해 임의 IP 를 주장할 수 있다. 화면에는 후보로 뜨므로 운영자가 구분해야 한다.

### 최초 owner 생성 경로

bootstrap 은 인증 없이 첫 owner 를 만든다. 계정이 없는 상태에서 패널이 공개 노출돼 있으면 **인터넷 누구나 선점**할 수 있다.

- 공개 주소가 설정되기 전부터 존재하는 이름에서만 허용하고, 그 밖에서는 `BOOTSTRAP_ORIGIN_FORBIDDEN`(403)이다.
- 계정이 생긴 뒤에는 `BOOTSTRAP_COMPLETE`(409)로 영구 잠긴다.
- seed 계정은 배포에 포함되지 않는다. `scripts/seed-e2e.ts` 는 개발 도구이고 공개 주소가 저장된 스택에서 실행을 거부한다.

### 세션 쿠키와 토큰

- `GET /api/session` 이 세션 토큰 원문을 반환했다. HttpOnly 쿠키의 목적을 무효화하므로 요약 응답으로 바꿨다.
- 공개 https 로그인 쿠키에 `Secure` 가 없었다. Better Auth 는 이 값을 생성 시 한 번 정해 loopback http 와 공개 https 를 함께 지원할 수 없으므로, 응답 미들웨어가 `x-forwarded-proto` 가 https 인 요청에만 `Secure` 를 덧붙인다. Nginx 는 그 헤더를 `$scheme`(항상 http)이 아니라 앞단 프록시 값에서 유도한다.
- HSTS 에 `includeSubDomains` 를 더했다. `preload` 는 등재 취소가 어려워 운영자 판단으로 남겼다.

### 관리 plane 자기 보호 (보완)

- 보호 hostname 을 부팅 배열에서 호출 시점 평가로 바꿔 **패널 자신의 공개 주소로 프록시 라우트를 만드는 것**을 막는다. 이전에는 공개 주소가 목록에 없었다.
- owner 계정을 삭제·비활성화할 수 없어 자격증명 유출에 대응할 방법이 없었다. 자기 자신만 불변으로 좁히고 삭제 경로를 열었다. owner 만 호출할 수 있고 자기 자신은 대상이 될 수 없으므로 마지막 owner 는 그대로 남는다.

### 가용성

종료 신호에 job worker·주기 작업을 멈추고 HTTP 를 8초까지 드레인한 뒤 강제 종료하고 DB 를 닫는다. 드레인 상한이 없으면 장수 SSE 하나가 종료를 22초 붙잡아 compose 기본 grace 를 넘기고 SIGKILL 이 된다(실측). `stop_grace_period` 는 20초다.

## 17. 사용자 컨테이너 런타임 자세 (2026-08-05 변경)

**관리 plane 자신의 compose 서비스는 §10 그대로다.** 아래는 패널이 만들고 배포하는 **사용자 컨테이너** 이야기다. 결정 근거는 [acknowledge/0037](./acknowledge/0037-container-runtime-profile.md)에 있다.

이전에는 `CapDrop: ALL` 과 읽기 전용 루트가 코드에 박혀 있어 **공식 이미지 대부분이 기동조차 못 했다**(순정 nginx 는 캐시 디렉터리를 만들지 못하고, 임시 경로를 옮겨도 `chown` 이 막힌다). 어떤 이미지가 올라올지 모르는 제품이 특정 이미지 세팅을 강요할 수 없다.

런타임을 프로필로 나눈다.

| 프로필              | 루트      | capability       | tmpfs                     |
| ------------------- | --------- | ---------------- | ------------------------- |
| `standard` (기본)   | 쓰기 가능 | Docker 기본 집합 | `writablePaths` 지정 시만 |
| `hardened` (옵트인) | 읽기 전용 | 전부 drop        | `/tmp` + `writablePaths`  |

두 프로필 모두 **`no-new-privileges`, 메모리·CPU·PID 상한, 관리 plane 보호, 네트워크 격리를 유지**한다. Docker 기본 capability 집합은 `SYS_ADMIN`·`SYS_PTRACE`·`NET_ADMIN` 같은 위험한 것을 애초에 포함하지 않으므로, 기본을 열어도 `docker run` 기본값보다 엄격하다.

`FORBIDDEN_CONTAINER_CAPABILITIES` 16종은 **계약 단계에서 거부**하며 `CAP_` 접두사 우회도 막는다. `privileged`·host namespace·docker socket·호스트 bind mount 는 어떤 경로로도 노출하지 않는다. 아티팩트는 **이미지 아카이브만** 받는다 — 정적 파일을 올려 bind mount 로 붙이는 안은 기각했다.

기존 manifest 는 migration 기본값 `hardened` 로 남아 동작이 바뀌지 않는다.

## 18. 프록시 라우트 대상 검증 (2026-08-05 추가)

렌더된 설정이 변수 `proxy_pass` 를 쓰기 때문에 대상이 존재하지 않아도 **`nginx -t` 와 리로드가 모두 성공**했다. 이름 오타나 nginx 와 다른 네트워크의 컨테이너를 넣어도 API 가 201 을 주고 라우트 테이블에 정상으로 보이다가 도메인 접속 시 502 로만 드러났다.

서버가 `create`·`upsert` 양쪽에서 대상의 존재와 네트워크 공유를 확인한다(`NGINX_ROUTE_TARGET_NOT_FOUND`·`NGINX_ROUTE_TARGET_UNREACHABLE`, 둘 다 400). **API key 경로로도 같은 실수가 가능하므로 서버 검증이 본체다.** 중지된 컨테이너는 라우트를 미리 준비하는 정당한 사용이라 허용한다. 상세는 [acknowledge/0038](./acknowledge/0038-nginx-route-target-validation.md).
