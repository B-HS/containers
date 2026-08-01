# ADR 0002 — 제품 구현 결정

- 상태: 승인됨
- 결정일: 2026-07-31
- 범위: 구현 전 제품·아키텍처·보안·테스트 기준
- 선행 기록: [0001-initial-design-baseline.md](./0001-initial-design-baseline.md)

## 결정

1. 제품명과 저장소명은 `Containers`를 유지한다.
2. 첫 production 환경은 M1 Max Apple Silicon macOS의 Docker Desktop 단일 호스트다. Linux Engine과 원격 Docker host는 지원 범위 밖이다.
3. 제품은 Docker Compose 다중 컨테이너로 배치한다.
4. Bun을 workspace, package manager, API, Agent, worker, test runtime으로 사용한다. Next.js production은 Phase 0 호환성 게이트를 모두 통과하면 Bun을 사용하고, 실패하면 `web` 컨테이너만 Node.js로 전환한다.
5. 보유 도메인에서 패널, 외부 API, `*.apps` workload를 분리하고 custom workload domain을 허용한다.
6. Cloudflare Free의 remotely-managed named Tunnel을 사용하고 패널 호스트에 Cloudflare Access를 둔다.
7. 단일 조직에 `owner`, `admin`, `operator`, `viewer`, `auditor` 역할을 제공한다. 최초 owner 이후 공개 가입은 닫고 초대 링크로 여러 운영자를 등록한다.
8. 첫 버전 로그인은 email/password다. 초대 링크는 단회·만료형으로 만들고 MFA는 확장점만 둔다.
9. Docker 제어는 typed Engine operation으로 제공한다. host shell, raw Docker CLI, 임의 Engine HTTP 요청은 제공하지 않는다.
10. privileged, host bind, device, host namespace 같은 root-equivalent 옵션은 기본 거부하고 owner의 시간 제한 break-glass에서만 개별 승인한다.
11. 외부 자동화 API는 애플리케이션 API 키만 요구한다. Cloudflare service token은 요구하지 않는다.
12. 첫 버전부터 Docker image archive와 압축 변형, OCI archive, rootfs archive, 제품 Compose bundle, Dockerfile build context를 지원한다.
13. 업로드 기본 한도는 10GiB, 기본 chunk는 64MiB이며 관리자가 quota를 조정할 수 있다.
14. 배포는 blue-green, health probe, 관찰 window와 자동 rollback을 사용한다.
15. artifact에 secret, malware, critical vulnerability 검사를 수행한다. critical 결과는 차단하되 owner가 근거·만료를 기록하고 예외 승인할 수 있다.
16. 트래픽 분석과 보안 조사를 위해 원본 client IP를 저장한다.
17. 기본 보존은 raw log file 7일, raw traffic row 14일, minute rollup 90일, hour rollup 1년, audit 1년이다.
18. 기준 규모는 컨테이너 100개, 지속 1,000 req/s, burst 5,000 req/s, 동시 terminal 10개, 동시 upload 2개다.
19. 로컬 회전 backup은 필수다. S3-compatible Cloudflare R2 offsite backup은 선택 기능이다.
20. 첫 알림 adapter는 Discord webhook이다. SMTP는 범위 밖이다.
21. 첫 release에서 한국어, 영어, 일본어를 동등하게 제공한다. 이후 catalog와 locale metadata 추가만으로 language pack을 연결할 수 있어야 한다.
22. 구조화 route 편집과 owner 전용 전체 `nginx.conf` 편집을 모두 제공한다. 전체 편집은 단순 `nginx -t`만으로 적용하지 않는다.

## 파생 설계

### 외부 호스트와 인증 경계

- `panel.<domain>`: Cloudflare Access와 애플리케이션 session을 모두 요구한다. 브라우저용 `/api`, `/events`, `/ws`도 이 호스트 아래 둔다.
- `api.<domain>`: 자동화용 애플리케이션 API 키만 받는다. session cookie를 받거나 발급하지 않고 CORS를 기본 비활성화한다.
- `*.apps.<domain>`과 custom domain: workload 전용이며 관리 cookie와 API key를 절대 전달하지 않는다.
- API 호스트에 Cloudflare Access bypass policy를 만드는 대신 호스트 자체를 인증 경계로 분리한다. API 키에는 scope, 만료, rate limit, 선택적 CIDR와 회수 기능을 적용한다.

### Cloudflare Free와 대용량 업로드

Cloudflare Free의 HTTP request body 한도를 넘는 단일 업로드를 설계하지 않는다. 10GiB는 upload session 전체 한도이며 각 64MiB chunk는 독립 요청이다. 서버는 offset, chunk digest, 전체 digest, 만료와 idempotency를 검증한다. 프록시·Cloudflare 한도 변화에 대비해 chunk 크기를 구성값으로 유지하되 Free plan 상한보다 충분히 작게 둔다.

### Docker Desktop 보안 경계

Docker Desktop의 Linux 컨테이너 root는 macOS host root와 동일하지 않지만 Docker socket은 Docker Desktop VM의 Engine 전체를 제어한다. shared host path를 bind mount할 수 있으므로 macOS에서 Docker Desktop에 공유된 파일까지 위험 범위에 포함한다. Agent는 socket 외 host path를 받지 않으며 허용된 named volume과 제품 관리 network만 조작한다.

### Apple Silicon artifact 정책

기본 platform은 `linux/arm64`다. `linux/amd64`는 Docker Desktop의 에뮬레이션 지원을 사전 검사한 경우에만 허용하고 성능 저하를 UI와 API에 표시한다. manifest platform이 없거나 host와 호환되지 않으면 배포 전에 차단한다. arm64와 amd64 경로는 별도 통합·성능 테스트를 가진다.

### 디스크 관측과 보호

384GB는 Docker Desktop에서 설정한 Engine disk usage limit이다. 제품은 다음 값을 구분해 동적으로 표시한다.

- Docker Engine의 image, container, local volume, build cache 사용량과 reclaimable bytes
- Docker VM에서 제품 volume이 실제로 보는 filesystem total, used, available bytes
- upload quarantine, artifact, DB, log, backup별 제품 quota와 사용량
- 운영자가 입력·확인한 Docker Desktop disk limit 384GB와 마지막 확인 시각

Docker Engine API만으로 macOS host 전체의 정확한 free disk를 보장하지 않는다. 지원되는 host metrics 통합을 별도 도입하기 전에는 이를 추정값으로 표시하거나 표시하지 않는다. admission control은 관측 가능한 filesystem available bytes와 quota 중 더 보수적인 값을 사용하며 절대 용량과 비율 watermark를 동시에 적용한다.

### 전체 Nginx 설정 편집

전체 `nginx.conf` 적용은 owner, 최근 재인증, 영향 diff, 대상명 재입력, break-glass 만료를 요구한다. 저장 후 다음을 순서대로 통과해야 한다.

1. 파일 크기, include path, module, listener, resolver, log destination과 관리 upstream 정적 정책 검사
2. 실행 중 인스턴스와 동일한 Nginx image, module, environment의 격리 shadow container에서 `nginx -t`
3. shadow Nginx를 실제로 기동하고 패널 SSR, 브라우저 API, 외부 API, WebSocket, SSE, workload route probe
4. 원자적 활성화와 graceful reload
5. 관찰 window 동안 외부·내부 synthetic probe와 오류율 확인
6. 실패 또는 관리 plane 생존 신호 상실 시 독립 watchdog이 last-known-good 설정으로 자동 복구

raw 설정이 제품 관리 경로, access log JSON 계약, status endpoint 또는 rollback include를 제거하면 문법이 유효해도 거부한다.

### 개인정보와 보존

원본 IP는 traffic raw row와 필요한 audit event에만 저장한다. UI 기본 목록에서는 mask하고 세부 열람은 `auditor` 이상과 사유 입력을 요구한다. export, backup, Discord webhook에는 원본 IP를 포함하지 않는다. 14일 raw retention과 1년 audit retention을 각각 강제하고 purge 증거를 남긴다.

### 버전 선택

모든 패키지를 개별적으로 가장 높은 버전에 맞추는 것은 호환성을 보장하지 않는다. 구현 시작 시점의 최신 **안정 버전 중 상호 호환되는 조합**을 Phase 0 compatibility matrix로 검증한다. `bun.lock`을 커밋하고 production container는 tag뿐 아니라 digest로 고정한다. 자동 업데이트는 하지 않으며 upgrade job이 build, migration, SSR streaming, Hono RPC, Engine stream, Nginx shadow, rollback test를 통과한 뒤 승격한다.

### 언어팩

한국어 `ko`, 영어 `en`, 일본어 `ja` catalog는 동일 key schema와 ICU parameter type을 공유한다. route·API error는 locale-independent code를 반환하고 UI에서 번역한다. locale registry, catalog, 날짜·숫자 formatter, navigation label, 번역 completeness test를 분리하여 새 locale 추가 시 비즈니스 코드 변경이 없도록 한다.

### 선택적 외부 서비스

- R2: S3-compatible adapter로 backup과 restore를 제공하되 미설정 상태가 정상이다. 로컬 backup은 항상 동작해야 한다.
- Discord: webhook URL을 secret으로 저장하고 알림에 secret, 원본 IP, 전체 로그를 넣지 않는다. 재시도·중복 억제·rate limit을 적용한다.
- SMTP: 첫 버전에 구현하지 않는다.

## 구현 진입 조건

이 ADR과 연결 문서의 갱신·감사가 끝난 뒤에도 사용자의 명시적 구현 시작 승인이 있어야 Phase 0 spike와 프로젝트 초기화를 시작한다.
