# ADR 0006 — 업로드·Nginx·트래픽·Docker 인프라 런타임

- 상태: 점진 구현 기준선
- 날짜: 2026-07-31

## 결정

- artifact upload는 최대 10GiB, 64MiB chunk, 순차 offset, chunk·전체 SHA-256, idempotency key를 사용한다.
- 업로드 파일은 서버 생성 ID로 quarantine에 저장하고 archive 정책 검사를 통과한 파일만 ready로 원자 이동한다.
- Docker save와 OCI archive는 path traversal, symlink·special entry, 참조 파일·blob digest, entry 수와 expansion 상한을 검사한다.
- API key는 원문을 한 번만 표시하고 SHA-256 hash와 scope만 저장하며 upload·artifact read·image load 범위를 분리한다.
- Nginx 전체 config 적용은 현재 SHA optimistic lock, 보호 endpoint·access log 계약 검사, 실제 `nginx -t`, revision snapshot, atomic 교체, HUP, 관리 probe, 실패 rollback 순서로 수행한다.
- 트래픽 일반 API와 UI는 raw client IP를 반환하지 않고 IPv4 마지막 octet 또는 IPv6 suffix를 마스킹한다.
- raw retention 안의 percentile은 정렬된 원시 지연시간에서 정확히 계산하며 p50·p95·p99를 제공한다.
- Docker inspect·목록은 환경변수, label, volume option의 값 대신 key만 공개한다.
- network container count는 목록 응답이 아니라 각 network inspect 결과로 계산한다.
- network·volume 삭제는 owner/admin의 최근 로그인, 대상명 재입력, attempt·success·failure audit을 요구한다.
- container 생성은 memory·CPU·PID limit, `CapDrop=ALL`, `no-new-privileges`, read-only root filesystem, 격리 network를 기본값으로 사용한다.
- owner/admin은 이메일·역할·만료시간을 지정한 단회 초대를 발행하며 공개 가입은 계속 차단한다.
- owner/admin/viewer/auditor는 감사 기록을 조회할 수 있고 일반 응답은 source IP를 마스킹한다.
- 구조화 프록시 라우트는 관리 hostname을 금지하고 결정적 renderer와 동일한 config 검증·reload 경로를 사용한다.

## 검증 결과

- format, TypeScript, ESLint, unit·integration test 45개와 production image build 통과
- 4.5KiB ARM64 Docker archive를 session/API key 경로로 upload·inspect·load하고 `containers-e2e:latest` 확인
- revoked API key가 즉시 401을 반환하는 실제 요청 확인
- valid Nginx config apply·HUP·panel 200과 invalid directive 400·기존 SHA 유지 확인
- 실제 60분 traffic 416건에서 p50 6ms, p95 281ms, p99 3007ms 계산
- 실제 4xx filter는 400·401·404·499만 반환하고 raw loopback IP를 노출하지 않음
- 실제 Docker Desktop network 6개와 volume 8개 조회, network 연결 수 `control 4`, `ingress 3`, `edge 1` 확인
- 실제 network·volume 생성·조회·삭제와 container 보안 HostConfig를 Docker Engine 응답으로 확인
- 실제 단회 초대 수락·operator 로그인·재사용 410을 확인하고 synthetic 계정을 정리
- 감사 API에서 container filter와 `172.20.0.0` IP masking을 확인
- 임시 workload hostname을 `web:3000`에 적용해 HTTP 200 proxy, collision 400, 삭제와 재적용 확인
- 브라우저에서 traffic·image·inspect/log·network·volume·container 생성·초대·감사 UI와 horizontal overflow 0 확인

## 남은 범위

- interactive WebSocket exec ticket, network connect/disconnect 작업
- inode 기반 log rotation, rollup histogram, live SSE, export
- structured Nginx route update·health probe, shadow probe, 독립 watchdog
- OCI 변환, rootfs·Compose·build importer, scanner, blue-green deployment
- disk watermark·quota, backup·R2, Discord, Cloudflare tunnel onboarding
