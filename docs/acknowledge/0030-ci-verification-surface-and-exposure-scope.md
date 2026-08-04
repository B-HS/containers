# 0030 — CI 검증 표면 마무리와 노출 범위 확정

- 작성일: 2026-08-05
- 상태: 결정 확정 (구현 완료)
- 선행: [0029](./0029-monotone-design-system.md), [quality-assurance/2026-08-04-production-readiness.md](../quality-assurance/2026-08-04-production-readiness.md) §3
- 범위: 준비도 로드맵 3단계 착수 전 남은 1순위 5건

## 1. 사용자 확정 결정

| 항목                     | 결정                             | 이유                                                                                                                                                                                                           |
| ------------------------ | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 관리 plane 컨테이너 은닉 | **현행 유지(노출)**              | 운영자가 자기 control plane 상태를 패널에서 봐야 한다. 파괴적 작업은 engine-agent 가 이미 차단하므로 실질 위험이 낮고, 은닉하면 "패널에 안 보이는데 포트를 점유한 컨테이너"가 생겨 진단이 어려워진다           |
| `/api/readyz` 노출 범위  | **현행 유지**                    | 무인증은 전체 status + check 별 status 만 반환하고 백업 경과시간·job 수·DB integrity 값은 세션(owner·admin) 또는 `control-plane:read` 가 있어야 나온다. 외부 uptime 모니터 연동과 정보 노출이 이미 분리돼 있다 |
| 착수 순서                | 1→2→3→4 순차, 각 논리 단위 1커밋 | -                                                                                                                                                                                                              |

### `/api/readyz` 관련 기록 정정

[HANDOFF](../HANDOFF.md) §6 질문 2는 "무인증 200이며 백업 경과 시간·job 수·DB integrity를 노출한다"고 적었으나 **사실과 다르다.** `apps/api/src/route/health/create-readiness-route.ts` 는 `isDetailAllowed()` 로 요약/상세를 나누고, 무인증에는 `toReadinessSummary()` 결과만 준다. 결정은 이 사실 위에서 내렸다.

## 2. 구현

### 2.1 `GET /api/images` 에 `engine:read` 분기

- `apps/api/src/route/control/create-control-route.ts` — `apiKeyService` 의존성과 `authenticateEngineRead()` 추가. `authorization` 헤더가 있으면 `engine:read` scope 로 인증하고, 없으면 기존 `requireRole(ALL_ROLES)` 경로를 그대로 탄다(engine 라우트와 동일 패턴).
- 없으면 CI 가 image load 결과를 확인할 방법이 없어 실패한 load 를 조용히 재큐잉하게 된다.
- `docs/ci-examples/github-actions-deploy.yml` 에 load 직후 digest 확인 단계를 추가했다.
- 나머지 `/api/images/*`(tag·remove·pull·removal-impact)는 열지 않았다. 쓰기 계열은 recent 세션 전용을 유지한다.

### 2.2 API key scope UI 하드코딩 제거

- `apps/web/src/widgets/api-key/api-key-widget.tsx` 가 scope 9종을 직접 나열해 2단계에서 신설한 4종을 **패널에서 선택할 수 없었다.** `API_KEY_SCOPE_VALUES` 를 그대로 쓰고 상태 타입도 `ApiKeyScope` 로 좁혔다.

### 2.3 백업 복구 UI 에 복구 범위·암호

- `backup-widget` 이 `mode` 를 `preserve-host` 로 고정 전송하고 `passphrase` 를 아예 보내지 않아, 계약이 지원하는 `full` 복구와 암호화 키 복원을 패널에서 쓸 수 없었다.
- 복구 다이얼로그에 복구 범위 Select(선택에 따라 설명 문구 교체)와 암호 입력을 넣었다. **암호 입력은 해당 백업의 `secretsIncluded` 가 true 일 때만 노출한다** — 시크릿이 없는 백업에 암호를 넣으면 서버가 `BACKUP_SECRET_NOT_INCLUDED` 로 거절하므로 애초에 입력받지 않는다.
- 범위 밖이지만 함께 고쳤다: **생성 폼에도 암호 입력을 추가했다.** 생성에서 암호를 못 받으면 `secretsIncluded` 가 영원히 false 라 복구 쪽 암호 입력이 죽은 UI 가 된다.
- `BackupConfirmDialog` 는 추가 입력을 `children` 으로 받고 `confirmDisabled` 로 확인 버튼을 잠근다. remove 다이얼로그와의 공유 구조는 유지했다.

### 2.4 `scripts/setup.sh` 비대화식 모드

- `--non-interactive`(stdin 이 TTY 가 아니면 자동 적용)에서 모든 프롬프트가 기본값·플래그·동명 환경변수로 대체된다. `ask()`/`ask_yn()` 한 곳만 바꿔 전 프롬프트에 일괄 적용했다.
- `--start-mode build|up|skip`, `--write-override`, `--replace-override`(기존 파일을 `.bak` 으로 백업), 값 플래그 8종, `--help`.
- 기존 override 는 기본적으로 **보존**한다. 무인 실행이 운영자의 설정을 말없이 덮어쓰지 않게 하기 위해서다.

## 3. 검증

- 기계: typecheck 8/8 · lint 0 · format:check · **test 296 pass / 47 files** · build 8/8.
- `GET /api/images` 실측(api 재빌드 후): `engine:read` 키 200 + 목록 반환, scope 없는 키 403, 미인증 401, 키 회수 후 401. 검증용 키 2개는 즉시 회수했다.
- 패널 실측(web 재빌드 후): API key 화면에 scope 13종 전부 표시, 백업 복구 다이얼로그의 복구 범위 Select 2종·설명 교체·확인 버튼 잠금, 생성 폼 암호 길이 미달 시 `aria-invalid` 와 제출 잠금. console error 0건, 500px 폭에서 페이지 가로 스크롤 0.
- setup 실측: `--help`, 잘못된 옵션·값 누락 exit 2, 비대화식 전 구간 진행, `--write-override` 로 생성된 override 내용 확인, 기존 override 보존과 `--replace-override` 백업 동작 확인. 검증용 override 는 삭제했다.

## 4. 검증하지 못한 것

- **복구 다이얼로그의 암호 입력 실렌더**: 현재 호스트의 백업 2건이 모두 `secretsIncluded: false` 이고, 암호를 포함한 백업 생성은 recent 세션(15분 내 재인증)을 요구하는데 이 세션에는 그 자격증명이 없다. 조건부 렌더는 타입체크와 동일 컴포넌트(생성 폼 암호 입력)의 실렌더로만 뒷받침된다.
- 다크 모드는 `prefers-color-scheme` 기반이라 토글이 없어, `globals.css` 의 다크 토큰을 `:root` 에 임시 주입한 **미리보기**로 확인했다. 실제 OS 다크 모드 렌더는 아니다.
