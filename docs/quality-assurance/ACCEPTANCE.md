# 최종 인수 체크리스트

각 항목은 실행 증거, test 이름, screenshot 또는 API 결과 링크를 연결한 뒤 체크한다.

## 1. 설치·진입

- [ ] M1 Max macOS의 새 Docker Desktop 환경에서 문서만으로 설치 가능
- [ ] cloudflared가 outbound-only로 연결되고 origin public port가 열리지 않음
- [ ] Nginx만 최초 애플리케이션 ingress 역할을 함
- [ ] 패널, 외부 API, workload domain이 분리되고 충돌 route가 거부됨
- [ ] 관리 domain Cloudflare Access 정책과 앱 로그인이 함께 동작
- [ ] 외부 API domain은 API 키만 인증하고 session cookie·auth route를 거부

## 2. 인증·권한·API 키

- [ ] 최초 owner bootstrap 후 bootstrap 경로가 영구 잠김
- [ ] 공개 signup이 비활성화됨
- [ ] 초대, role 변경, 사용자 disable, session revoke 동작
- [ ] 단회·만료·회수 가능한 초대 링크로 여러 운영자 등록
- [ ] role·capability matrix의 허용·거부 test 통과
- [ ] API key 원문은 생성 시 한 번만 표시되고 hash만 저장
- [x] scope, expiry, key별 rate limit, revoke 동작
- [ ] API key 무중단 rotate 동작
- [ ] cookie mutation CSRF·Origin·Host 검증 통과

## 3. Docker 조회와 상태

- [ ] Engine ping, version, info, disk usage 표시
- [ ] 384GB 설정값, Engine object 사용량, volume free space, quota가 구분되어 동적 갱신
- [ ] container·image·network·volume 목록과 inspect가 Engine 실제 상태와 일치
- [ ] events 단절 후 reconciliation으로 상태 복구
- [ ] Engine offline에서 stale snapshot을 현재 상태처럼 표시하지 않음
- [ ] Docker socket은 Agent에만 mount됨

## 4. Docker 변경

- [x] create, start, stop, restart, pause, unpause, kill, rename, update, remove (kill·update 는 2026-08-01 agent E2E — SIGKILL exit 137, resource update 200)
- [x] logs, stats, top, changes, wait (top·changes·wait 는 2026-08-01 agent E2E, logs·stats 는 SSE 실수신)
- [x] logs follow·stats·events 실시간 SSE — Agent 경계 실수신(3종 200 text/event-stream, 정규화 데이터)과 parser·정규화·proxy 단위 검증 (2026-08-01)
- [ ] non-TTY exec stdout·stderr·exit code
- [x] TTY terminal stdin·resize·detach·timeout
- [x] image pull, load, tag, remove와 dependency impact — 공개 pull E2E와 registry credential 암호화·host binding·X-Registry-Auth 전달 단위/통합 검증 (0017, 0020)
- [ ] network create·connect·disconnect·remove
- [ ] volume create·사용 중 conflict·remove
- [x] prune dry-run preview와 관리 plane 보호 — container·image·network·volume 후보 제외 단위·API 계약 검증 (2026-08-01, 0018)
- [x] owner 전용 durable prune — stale SHA 거부, 실행 순서·취소 지점·단일 attempt·volume opt-in·감사 계약 검증 (2026-08-01, 0019; live 삭제는 사용자 리소스 보호를 위해 미수행)
- [ ] 모든 변경이 job과 audit에 기록됨

## 5. 위험 통제

- [ ] raw shell·Docker CLI injection endpoint가 없음
- [ ] 위험 HostConfig 기본 거부
- [ ] destructive action 영향 미리보기와 대상명 확인
- [ ] break-glass 재인증·만료·감사
- [ ] API key로 허용되지 않은 root-equivalent 작업 거부
- [x] management plane resource 실수 삭제 방지 — Compose project label 기반 변경·직접 삭제·prune preview 차단 (2026-08-01, 0018)

## 6. Nginx

- [ ] 구조화 route 생성·수정·비활성화
- [ ] draft 저장과 apply가 분리됨
- [ ] revision diff와 validation output 표시
- [x] valid config atomic apply와 graceful reload
- [x] invalid syntax에서 기존 route 응답 유지
- [ ] health probe 실패 시 이전 revision 자동 rollback
- [x] concurrent apply conflict 처리
- [ ] master·worker·checksum·reload history 표시
- [ ] Next.js streaming, SSE, WebSocket이 proxy buffering 없이 동작
- [x] 전체 `nginx.conf`의 보호 계약과 실제 syntax 검증
- [ ] 전체 `nginx.conf`의 shadow 기동·관찰 window 검증
- [ ] 관리 생존 probe 실패 시 독립 watchdog이 last-known-good로 복구

## 7. 트래픽

- [ ] request ID, CF Ray, host, route, container, status, byte, timing 기록
- [ ] secret header, cookie, body, full query가 로그에 없음
- [ ] fixed fixture 요청과 raw event 수가 일치
- [x] worker restart·rotation에서 duplicate 0, missing 0 — inode checkpoint·partial line·restart·rename rotation·DB replay 단위 검증 (0021)
- [x] 2xx·3xx·4xx·5xx와 p50·p95·p99 정확 — 고정 SQLite fixture와 percentile offset 검증
- [ ] slow request와 upstream timing drill-down
- [ ] ingest lag, invalid, dropped, disk 상태 표시
- [ ] 원본 IP 정확성, masking, 제한 열람, 14일 retention 정책 적용
- [ ] 원본 IP가 rollup·일반 export·Discord payload에 포함되지 않음
- [x] live SSE와 export job 동작 — owner pause/resume 실수신, CSV·NDJSON durable job·download·audit·mask E2E (0021)

## 8. 업로드·배포

- [ ] session과 API key 양쪽에서 resumable upload
- [ ] size, digest, magic, archive path, bomb, symlink 검사
- [ ] scanner policy와 owner exception audit
- [ ] image archive 압축 지원 범위 검증
- [ ] OCI archive, rootfs, Compose bundle, Dockerfile build 성공·실패 경로 검증
- [ ] secret·malware·critical vulnerability 차단과 owner 예외 만료
- [ ] upload progress 재접속
- [x] blue-green deploy, health, Nginx route 전환
- [x] health·Nginx 실패 자동 rollback
- [x] 이전 정상 version 수동 rollback과 공개 응답 복원
- [x] cleanup 실패를 배포 실패와 구분
- [ ] 참조 중 artifact·image 삭제 방지

## 9. UI/UX

- [ ] desktop 3단, tablet, mobile layout
- [ ] light·dark token과 contrast
- [ ] inset 12px, gap 1px, radius 0, shadow none 수치 검증
- [ ] shadcn 우선 사용과 직접 primitive 중복 없음
- [ ] loading, refreshing, empty, permission, partial error, offline, unknown 상태
- [ ] keyboard navigation, focus, accessible name
- [ ] 위험 작업이 색 외 텍스트로 영향과 복구 가능성 설명
- [x] SSR 초기 화면과 hydration 동작
- [ ] 한국어·영어·일본어 전 route와 신규 language pack 등록 계약

## 10. 안정성·복구

- [x] API 재시작 후 중단 release를 안전 상태로 reconciliation
- [x] durable job 상태 machine — 성공·재시도 backoff·취소·중단 재큐·보존 GC 단위 검증 (실제 SQLite·migration, 2026-08-01)
- [x] maintenance mode — mutation 503 차단·해제 경로 예외·drain timeout·restore job 오케스트레이션 단위·통합 검증 (2026-08-01, live E2E 는 owner 인증 필요로 잔여)
- [ ] API·Agent·worker crash 후 durable job 단계 재개 (live crash drill 미수행 — 단위 수준 재큐 검증만 완료)
- [ ] Docker daemon restart 후 reconnect
- [x] traffic DB 장애 후 file replay — checkpoint 미진행·재시도와 request ID 중복 제거 단위 검증 (0021)
- [x] disk soft·hard watermark와 총 upload quota 정책
- [x] control·traffic DB backup과 실제 restore drill
- [x] 로컬 retention과 R2 미설정 상태의 독립 동작
- [ ] 선택적 R2 장애·재시도·암호화·retention 검증
- [ ] Discord test 알림·재시도·중복 억제와 민감정보 비노출
- [ ] 기존 workload가 control plane 장애 중 계속 응답
- [ ] control plane upgrade와 rollback runbook 재현

## 11. 품질·성능

- [x] 모든 workspace typecheck
- [x] formatter·lint
- [x] 현재 구현 범위 단위·계약·통합·브라우저·Docker E2E test
- [ ] `linux/arm64` image build와 지원 시 `linux/amd64` emulation 검증
- [ ] 목표 containers·req/s·terminal·upload 부하 통과
- [ ] 1GB 이상 upload에서 memory가 file 크기에 비례하지 않음
- [ ] Nginx reload 중 실패 request 0
- [ ] known limitation과 미지원 Engine 기능 문서화

## 보안 경계 검증 증거

- [x] 로그인 반복 요청이 Nginx·application 경계에서 `429`로 제한됨
- [x] API key별 minute rate limit 단위 테스트 통과
- [x] CSP·COOP·Permissions-Policy·HSTS·nosniff·frame deny 실제 응답 확인
- [x] CSP 적용 상태에서 SSR dashboard와 client interaction 동작

## 12. 완전 원격 운영 데모

- [ ] host SSH·터미널 없이 owner 생성
- [ ] image upload와 container 배포
- [ ] Nginx route 적용
- [ ] traffic 확인
- [ ] logs·stats·exec 수행
- [ ] 새 version 배포와 rollback
- [ ] container·image 정리
- [ ] API key만으로 같은 자동화 시나리오 수행
- [ ] host terminal 없이 초대·backup·restore·Discord·disk 정책 관리
