# 0018 — prune preview·관리 plane 자기 보호 설계 결정

날짜: 2026-08-01 KST
상태: 구현 완료 (실제 prune 실행 job은 [0019](./0019-durable-system-prune.md)에서 완료)
근거: [DOCKER-CONTROL.md](../DOCKER-CONTROL.md) §7, Docker Engine API v1.52

## 결정

### 1. 관리 plane 식별

- Compose가 자동 부여하는 `com.docker.compose.project=containers`를 기본 식별자로 사용한다.
- 향후 비-Compose 관리 리소스는 `managed-by=containers-control-plane` label로 같은 보호를 적용할 수 있다.
- 관리 container는 stop·restart·pause·unpause·kill·rename·update·remove 일반 경로를 거부한다.
- 관리 container가 참조하는 image와 관리 label이 붙은 network·volume은 force 여부와 관계없이 일반 삭제 경로를 거부한다.
- 관리 container 또는 관리 network의 disconnect도 거부한다. upgrade·restart는 maintenance 전용 별도 오케스트레이션으로만 추가한다.

### 2. prune dry-run preview

- Docker Engine에는 실제 prune과 동일한 dry-run endpoint가 없으므로 Agent가 container·image·network·volume 목록과 `/system/df`를 함께 읽어 후보를 계산한다.
- 기본 후보는 stopped container, container가 참조하지 않는 dangling image, 연결 container가 없는 비기본 network, 사용하지 않는 build cache다.
- volume은 데이터 손실 위험 때문에 `includeVolumes=true`일 때만 후보에 넣는다.
- `bridge`·`host`·`none` network와 모든 관리 plane 리소스는 후보에서 제외한다.
- 응답은 리소스별 ID·이름·예상 회수 byte, 전체 예상 회수 byte, 제외된 관리 리소스 수를 반환한다.
- preview는 read-only다. 실제 삭제는 snapshot stale 여부와 보호 정책을 실행 직전 재검증하는 owner 전용 durable job으로 후속 구현한다.

### 3. image 삭제 영향도

- `GET /api/images/:imageId/removal-impact`는 해당 image를 참조하는 container ID·이름·상태와 관리 plane 여부를 반환한다.
- image force 삭제는 owner 최근 인증으로 강화했다. 관리 plane image는 owner force도 일반 삭제 경로에서 허용하지 않는다.

## API

- `GET /api/system/prune-preview?includeVolumes=false` — owner·admin
- `GET /api/images/:imageId/removal-impact` — owner·admin

## 검증

- 관리 container action·관리 image 삭제 차단
- 관리 network·volume 직접 삭제 차단
- preview의 관리·사용 중 리소스 제외, volume opt-in, 회수 byte 합산
- API 인증 응답 계약
- 전체 105 tests, 333 assertions, 29 files 통과
- API·Agent image 재빌드·재기동 후 5개 Compose service healthy
- 실제 container·network·volume의 `com.docker.compose.project=containers` label 확인
- live `/api/system/prune-preview` 미인증 요청 401 확인
- backend production bundle과 Next.js webpack production build 성공. 같은 시점 Turbopack build는 오류 출력 없이 compile 단계에 정지해 중단했으며 코드 오류로 판정하지 않았다.
