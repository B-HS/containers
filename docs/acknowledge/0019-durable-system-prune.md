# 0019 — Owner 전용 durable system prune

날짜: 2026-08-01 KST
상태: 구현 완료
근거: [DOCKER-CONTROL.md](../DOCKER-CONTROL.md) §3.4·§7, [SECURITY.md](../SECURITY.md) §3, [0018](./0018-prune-preview-management-protection.md)

## 결정

### 1. 실행 권한과 확인

- prune preview는 owner·admin이 조회하지만 실제 실행은 최근 15분 안에 인증한 owner만 가능하다.
- volume은 기본 제외하고 `includeVolumes=true`를 명시한 preview와 실행에서만 후보로 포함한다.
- 실행 요청은 `DELETE UNUSED RESOURCES` 확인 문구와 preview SHA-256을 함께 제출한다.
- API는 enqueue 전에 preview를 다시 계산해 SHA가 다르면 `PRUNE_PREVIEW_STALE` 409로 거부한다.
- 실행 시도·성공·실패는 system target audit에 기록한다.

### 2. Durable job과 안전 경계

- `system.prune` operation job은 unique, `maxAttempts=1`로 등록한다. 일부 리소스 삭제 후 자동 재시도하면 의도하지 않은 추가 삭제가 생길 수 있으므로 재시도하지 않는다.
- worker는 실행 직전 preview를 다시 계산해 payload SHA와 비교한다.
- 삭제 순서는 stopped container → dangling image → 비사용 network → opt-in volume → build cache다.
- 각 후보는 Agent의 일반 삭제 서비스로 전달해 관리 plane label과 실행 중 참조를 다시 검증한다.
- 각 후보 사이에서 취소 요청을 확인한다. 취소 전에 완료된 삭제는 되돌리지 않으며 job timeline에 진행 상태가 남는다.
- build cache는 preview candidate ID filter로 Docker Engine `/build/prune`를 호출하고 실제 회수 byte를 job 결과에 기록한다.

### 3. UI

- owner·admin 패널은 후보 수, 보호 리소스 수, 예상 회수량과 volume opt-in을 표시한다.
- owner만 정확한 확인 문구를 입력해 작업을 시작할 수 있다.
- volume 선택이 마지막 preview 조건과 다르면 실행 UI를 숨겨 새 preview 계산을 강제한다.

## API

- `GET /api/system/prune-preview?includeVolumes=false` — owner·admin
- `POST /api/system/prune` — 최근 인증 owner, 202 operation job
- `POST /v1/system/prune-build-cache` — 내부 HMAC Agent 경계

## 검증

- stale preview는 enqueue 전과 worker 실행 직전에 모두 거부된다.
- success handler는 container→image→network→volume→build cache 순서와 후보별 취소 지점을 검증한다.
- 관리 plane 직접 삭제·preview 제외 테스트를 함께 유지한다.
- route 통합 테스트는 owner 최근 인증, 정확한 SHA, `maxAttempts=1`, unique enqueue와 409 응답을 검증한다.
- 전체 109 tests, 345 assertions, 29 files, typecheck, ESLint, Prettier를 통과했다.
- 전체 backend bundle과 Next.js webpack production build가 성공했다. 로컬 기본 Turbopack build는 compile 단계에서 정지했지만 동일 소스의 Compose image build에서는 Turbopack이 성공했다.
- API·Agent·Web image 재빌드 후 5개 Compose service가 healthy다.
- 실제 owner 화면에서 초기 859개, 최종 재빌드 후 836개 build cache 후보와 20개 보호 리소스, volume opt-in, 정확 확인 문구와 실행 버튼 비활성 계약을 확인했다. 빌드 사이 후보 변화는 stale SHA가 필요한 실제 사례다.
- SSR과 client의 날짜 표시를 UTC ISO 형식으로 통일해 hydration text mismatch를 제거했고, 새 브라우저 탭의 console error 0건을 확인했다.
- live actual prune은 미리보기에서 약 21.4 GiB의 사용자 소유 가능 build cache가 후보였으므로 실행하지 않았다. 파괴적 실행을 생략한 것은 테스트 누락이 아니라 기존 리소스 보존 결정이다.

## 비원자성

system prune은 여러 Docker 리소스를 순차 삭제하므로 원자적이지 않다. 중간 실패나 취소 시 이미 삭제된 리소스는 복원되지 않는다. 이 때문에 single-attempt, 단계별 progress, stale snapshot 거부, 후보별 보호 재검증을 함께 적용한다.
