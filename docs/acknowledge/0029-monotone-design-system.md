# 0029 — 모노톤 디자인 시스템과 웹 패널 UX 재설계 결정

- 작성일: 2026-08-04
- 상태: 결정 확정 (구현 착수 기준)
- 브랜치: `feat/web-ui-refresh`
- 근거: 사용자 지시 — "웹패널 UIUX가 답답하고 분리가 안 되어 있고 shadcn이 정확히 쓰였는지 애매하다. border/radius 없이 모노톤의 모던·심플·미니멀로 가야 하는데 도중에 구현을 잘못했다. opacity를 이용해 고급스러워야 하는데 주니어 디자이너가 한 느낌이다."
- 선행 감사: [quality-assurance/2026-08-04-ui-backend-audit.md](../quality-assurance/2026-08-04-ui-backend-audit.md) (6영역 병렬 감사 132건 + 교차검증)

## 1. 사용자 확정 결정 (질의 응답)

| 항목             | 결정                                                                                           |
| ---------------- | ---------------------------------------------------------------------------------------------- |
| 요소 구분 방식   | **border 전면 제거 · radius 0.** 배경 elevation 레이어 + 간격 + 타이포 위계 + opacity로만 구분 |
| shadcn 도입 범위 | **필요한 것 전부 공식 소스 기준으로 추가.** 자체 구현 primitive는 공식 기준으로 교체           |
| 브랜치           | `feat/web-ui-refresh` 신규 브랜치에서 단계별 커밋 후 push                                      |
| 백엔드 감사 결과 | 명백한 버그·보안 결함은 즉시 수정(테스트 동반). 애매·파괴적 변경은 문서화 후 승인              |

## 2. 현재 상태 진단 (감사 확정 사실)

근본 원인은 셋이다.

1. **토큰이 shadcn 표준에 미달하고, radius를 전역 셀렉터로 강제한다.** `globals.css:70` 의 `* { border-radius: 0 }` 는 cascade layer 밖 선언이라 `@layer utilities` 의 모든 `rounded-*` 를 무력화한다(빌드 CSS로 확인). 컨벤션이 금지한 우회이며, `--radius`·`--secondary`·`--sidebar-*`·`--chart-*` 부재로 Sidebar·Chart·Badge secondary를 추가하는 순간 조용히 깨진다. `@layer base` 안전망이 없어 색 없는 `border` 가 currentColor(100% 대비 실선)로 렌더된다.
2. **데이터 경로가 두 갈래다.** "서버 props → useState 미러링 → `window.location.reload()`(12~14곳)" 와 "entities `queryOptions`/`useGet*`" 가 공존해, 조회 훅 15개와 `invalidateQueries` 가 사실상 죽은 코드다. reload가 선택 항목·스크롤·폼 입력·열린 터미널 세션을 매번 파기한다.
3. **공식 shadcn primitive를 쓰지 않았다.** button·input·label·card·badge·textarea·inline-alert 7개가 자체 축약 구현이라 focus-visible·aria-invalid·size·variant를 잃었고, 그 결과 호출부에 `h-7 px-2 text-xs`·`bg-red-700`·`bg-red-950` 하드코딩이 20곳 이상 번졌다.

여기에 구조적 버그가 하나 더 있다. `panel-shell.tsx:220,222` 가 `children` 을 모바일·데스크톱 `main` 에 각각 렌더해 **모든 위젯이 2회 마운트**된다(SSE 2중 연결, 2초 폴링 2배, DOM id 중복).

## 3. 디자인 원칙

1. **구분은 표면(surface)으로 한다.** 선이 아니라 면의 밝기 차이로 영역을 나눈다. border 유틸리티는 앱 코드에서 쓰지 않는다.
2. **위계는 opacity로 만든다.** 색을 추가하는 대신 같은 무채색의 투명도 단계로 강조·보조·비활성을 표현한다.
3. **radius는 0이다.** 단 형태가 곧 의미인 요소(Switch 트랙·썸, 상태 dot, Avatar)만 `rounded-full` 을 유지한다.
4. **색은 상태를 보조할 뿐 상태를 정의하지 않는다.** 상태는 라벨 + 타이포 굵기 + dot + 표면 강조로 먼저 표현하고, 유채색은 danger/warning/success 토큰 3쌍으로만 제한한다.
5. **밀도는 화면 목적에 따른다.** 요약 화면은 여백을 넓게, 목록·표는 조밀하게. 모든 화면이 같은 `p-3` 로 균질하지 않게 한다.

## 4. 토큰 체계 (globals.css 재작성)

### 4.1 제거

- `* { border-radius: 0 }` 전역 규칙 (우회). `--radius: 0rem` + `@theme inline` 의 `--radius-sm|md|lg|xl` 매핑으로 대체한다.

### 4.2 표면 · 오버레이 스케일

| 토큰               | 라이트                    | 다크                      | 용도                |
| ------------------ | ------------------------- | ------------------------- | ------------------- |
| `--surface-1`      | `oklch(1 0 0)`            | `oklch(0.212 0 0)`        | 카드·패널 기본 면   |
| `--surface-2`      | `oklch(0.975 0 0)`        | `oklch(0.246 0 0)`        | 강조 블록·헤더      |
| `--surface-3`      | `oklch(0.945 0 0)`        | `oklch(0.285 0 0)`        | 폼·코드·입력 영역   |
| `--overlay-subtle` | `oklch(0.145 0 0 / 0.03)` | `oklch(0.985 0 0 / 0.04)` | 미세 구획·zebra row |
| `--overlay-hover`  | `oklch(0.145 0 0 / 0.06)` | `oklch(0.985 0 0 / 0.07)` | hover               |
| `--overlay-active` | `oklch(0.145 0 0 / 0.10)` | `oklch(0.985 0 0 / 0.11)` | 선택·활성           |

### 4.3 텍스트 위계

`--text-strong`(=foreground) / `--text-muted`(foreground 70%) / `--text-subtle`(foreground 50%). 현재 `text-muted-foreground` 102곳을 muted·subtle로 나눠 배분한다.

### 4.4 shadcn 표준 토큰 보강

`--radius`, `--secondary`/`--secondary-foreground`, `--sidebar-foreground|primary|primary-foreground|accent|accent-foreground|border|ring`, `--chart-1`~`--chart-5`(무채색 명도 5단)를 추가한다. `--input` 은 표면색이 아니라 "입력 요소 채움"으로 재정의한다(라이트 `oklch(0.93 0 0)`, 다크 `oklch(0.28 0 0)`) — 현재 순백이라 라이트 모드에서 Checkbox가 보이지 않는다.

### 4.5 border 토큰의 위치

`--border` 는 삭제하지 않고 **가드 토큰**으로 남긴다(foreground 6% 투명도). `@layer base { *, ::after, ::before { border-color: var(--color-border) } }` 를 두어 CLI로 추가하는 shadcn 컴포넌트가 색 없는 `border` 로 currentColor 실선을 그리는 사고를 원천 차단한다. 앱 코드와 개조한 primitive에서는 border 유틸리티를 쓰지 않는다 — 이 토큰은 디자인 요소가 아니라 안전망이다.

### 4.6 의미색

`--danger`/`--danger-surface`, `--warning`/`--warning-surface`, `--success`/`--success-surface` 3쌍. surface는 채도를 최소화하고, 텍스트 색은 라이트·다크 각각 대비 4.5:1 이상을 만족하는 L 값을 분리 지정한다. 현재 `bg-red-950`·`text-red-400`·`text-emerald-700`·`bg-zinc-950` 등 하드코딩 20곳 이상을 전량 치환한다.

### 4.7 타이포

`font-family: Arial, Helvetica` 를 시스템 UI 스택으로 교체하고, 수치가 흔들리지 않도록 지표·표·ID 표시에 `tabular-nums` 를 적용한다.

## 5. 컴포넌트 정책

### 5.1 기존 primitive 교체 (공식 new-york 기준)

button · input · textarea · label · card · badge 6종을 공식 소스 기준으로 재작성한다. 레포 컨벤션(arrow function, 반환타입 미명시, 주석 금지, named export)에 맞춰 옮기되 **구조(cva variants, size, asChild, focus-visible ring, aria-invalid, data-slot)는 공식을 유지**하고, 시각 표현만 아래 규칙으로 치환한다.

| 공식 표현               | 이 프로젝트 표현                                          |
| ----------------------- | --------------------------------------------------------- |
| `border border-input`   | `bg-overlay-subtle` (필요 시 `hover:bg-overlay-hover`)    |
| `rounded-md`/`-lg`      | `--radius: 0` 매핑으로 자동 0                             |
| `shadow-xs`/`shadow-md` | 인플로우 요소는 제거, 떠 있는 표면(Popover/Dialog)만 유지 |
| 하드코딩 red/emerald    | `--danger`/`--success` 토큰                               |

`inline-alert.tsx` 는 삭제하고 공식 `Alert` + `sonner` 로 나눈다.

### 5.2 신규 도입

`alert`, `alert-dialog`, `dialog`, `sheet`, `sidebar`, `dropdown-menu`, `table`, `skeleton`, `empty`, `spinner`, `separator`, `scroll-area`, `popover`, `sonner`. 모두 공식 소스를 기준선으로 삼고 5.1의 치환 규칙을 동일 적용한다. `@radix-ui/react-slot` 개별 패키지는 제거하고 통합 `radix-ui` 의 `Slot` 을 쓴다.

### 5.3 사용 규칙

- **일시적 피드백은 toast(sonner), 지속 상태는 Alert.** 위젯별 성공/실패 표현 3갈래를 일원화한다.
- **파괴적 작업은 AlertDialog.** 확인 문구는 라벨에 정답을 노출하지 않고, 입력이 정확히 일치할 때만 확인 버튼을 활성화한다. 영향 범위(연결된 컨테이너 수 등)를 본문에 명시한다. backup의 restore·remove는 별도 다이얼로그로 분리한다.
- **로딩은 Skeleton, 빈 상태는 Empty.** 각 (panel) 라우트에 `loading.tsx` 를 둔다.
- **표는 Table.** row 구분은 `border-t` 가 아니라 `odd:bg-overlay-subtle` + `hover:bg-overlay-hover`.

## 6. 정보 구조 재설계

1. **셸**: `panel-shell` 을 shadcn `Sidebar`(`SidebarProvider`/`Sidebar`/`SidebarInset`)로 교체한다. `children` 을 렌더하는 `main` 은 하나뿐이며(이중 마운트 버그 해소), 모바일은 Sidebar 내장 Sheet 모드를 쓴다. 데스크톱·모바일 네비 마크업 중복 2벌이 사라진다.
2. **대시보드**: 요약 전용으로 축소한다. 상태 카드 + 트래픽 KPI + "자세히 보기" 링크까지만 두고, Top path·status 분포·라이브 테일은 `/traffic` 에만 둔다(현재 두 페이지가 동일 위젯을 통째로 중복 렌더).
3. **네비게이션**: 목적지와 액션을 분리한다. `/containers/new`·`/infrastructure/prune` 은 부모 화면의 액션으로 내리고, 사이드바는 목적지만 남긴다.
4. **데이터 경로 단일화**: 위젯이 `useGet*` 훅을 구독하고, mutation은 `QUERY_KEY` 기반 `invalidateQueries` 로 갱신한다. `window.location.reload()` 를 전량 제거한다. 이때 `entities/infrastructure` 등의 리터럴 쿼리 키를 `QUERY_KEY` 로 정합해 "생성했는데 목록에 안 뜨는" 회귀를 막는다.

## 7. 백엔드 즉시 수정 대상 (감사 확정, 메인 세션 재확인 완료)

| #   | 대상           | 내용                                                                                                                                                                                                                         |
| --- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | traffic-worker | 유효 이벤트 0건 청크에서 `insertEvents([])` 가 drizzle 예외를 내 체크포인트가 전진하지 못하고 수집이 영구 정지. 부분 라인만 읽히는 평범한 poll에서도 발생                                                                    |
| 2   | api            | `createAppError` 가 `code`/`statusCode` 없는 순수 `Error` 를 반환해 `isAppError` 분기가 항상 false. `getErrorCode` 에 `:` 분리가 없고 engine-agent 코드가 STATUS_MAP에 없어 nginx 문법 오류·Docker 404가 전부 500으로 뭉개짐 |
| 3   | engine-agent   | `tagImage` 에 관리 plane 보호가 전무(바로 아래 `removeImage` 에는 존재). 제어 plane 이미지 재태그로 하이재킹 가능                                                                                                            |
| 4   | engine-agent   | `removeImage` 의 `endsWith` 매칭으로 가드 대상과 삭제 대상이 갈릴 수 있음. canonical ID로 통일하고 미해석 시 fail-closed                                                                                                     |
| 5   | api            | API key scope별 최소 role 미강제 — admin이 `backup:write` 키를 자기 발급해 owner 전용 restore로 권한 상승                                                                                                                    |
| 6   | api            | durable job의 `heartbeatAt` 을 읽는 쿼리가 없어 좀비 running job이 `uniqueResourceKey` 잠금을 영구화. stall 스윕 필요                                                                                                        |
| 7   | api            | 취소 요청된 job이 핸들러 성공 시 succeeded로 덮어써짐                                                                                                                                                                        |
| 8   | api            | 백업 실패 시 60초마다 무한 재큐잉 — 실패 백오프 필요                                                                                                                                                                         |
| 9   | engine-agent   | 이벤트 스트림 슬롯 획득 후 실패 경로 누락으로 동시 스트림 한도 영구 소진                                                                                                                                                     |
| 10  | engine-agent   | nginx 리로드 probe가 non-2xx에서 지연 없이 5회를 즉시 소진해 오탐 롤백                                                                                                                                                       |

## 8. 보류 (별도 승인 필요)

- **nginx 보호 계약의 substring 파싱을 실제 파서로 교체** — decoy server 블록으로 rate limit·CSP 우회 가능(admin 권한 전제). 이미 GUI 편집기용 파서(`shared/lib/nginx-config/`)가 웹에 있으나 서버 측 재구현이 필요해 변경 폭이 크다.
- **nginx route의 apply-then-persist 순서 역전과 부팅 시 자가치유** — live config와 DB 불일치 가능. 배포 경로를 건드리므로 별도 단계.
- **access log 로테이션 수단 부재** — `access.jsonl` 무한 증가. 인프라(사이드카 logrotate 또는 nginx USR1 재오픈) 결정이 필요.
- **감사 로그 서버 필터·페이지네이션** — 현재 클라이언트 문자열 필터. 백엔드 API 확장이 필요.

## 9. 검증 기준

- 기계: `bun run typecheck`(7 workspace) → `lint` → `format:check` → `bun test`(기준선 166 이상) → `bun run build`.
- 런타임: Compose 5개 healthy, 미인증 401, `/api/health` 200.
- 브라우저: 전 패널 페이지를 라이트·다크 · 데스크톱(1440)·모바일(390)에서 확인, console error 0건.
- 디자인 회귀 방지 grep: 앱 코드에 `border-`·`rounded-`(형태 예외 제외)·Tailwind 기본 팔레트 색(`red-`·`emerald-`·`amber-`·`zinc-`) 0건.

## 10. 구현 결과 (2026-08-04)

### 반영된 결정

- 토큰: `globals.css` 재작성 완료. 전역 `* { border-radius: 0 }` 제거하고 `--radius: 0rem` + `@theme inline` 매핑으로 대체, `@layer base` 의 `border-color` 가드 도입, surface 3단·overlay 4단·텍스트 3단 스케일과 shadcn 표준 토큰(secondary·sidebar-\*·chart-\*) 보강, `--input` 을 입력 채움 토큰으로 재정의, 시스템 폰트 스택 적용.
- 컴포넌트: primitive 6종 공식 교체 + 14종 신규 도입 + 기존 6종 시각 정합. `inline-alert.tsx` 삭제, `@radix-ui/react-slot` 개별 의존성 제거(통합 `radix-ui` 의 Slot 사용).
- 정보구조: 셸을 Sidebar 로 교체해 `children` 이중 렌더 해소, 대시보드를 요약 전용으로 축소, 사이드바에서 액션 경로 제거.
- 데이터 경로: `window.location.reload` 전량 제거, 위젯이 엔티티 쿼리 훅 구독, 리터럴 쿼리 키 제거.
- 백엔드: §7 의 10건 전부 수정하고 테스트를 함께 추가했다(166 → 199 pass).

### 실측에서 추가로 발견해 고친 것

1. **모듈 싱글턴 QueryClient** — `shared/lib/query-provider.tsx` 가 모듈 레벨에서 `new QueryClient()` 를 만들어 **서버에서 모든 요청이 같은 캐시를 공유**했다. 단일 사용자 패널이라 실제 유출로 이어지진 않았지만 요청 간 격리가 없는 것은 명백한 결함이다. 서버는 요청마다 새로 만들고 브라우저만 재사용하도록 바꿨다.
2. **layout ↔ page 이중 프리페치** — 사이드바 `EngineInfo`(layout)와 대시보드 카드(page)가 같은 `ENGINE.OVERVIEW` 키를 서로 다른 시점의 값으로 각각 채워, 클라이언트 하이드레이션 중 값이 교체되며 React #418 이 발생했다. 엔진 상태는 셸이 소유하도록 layout 에서 한 번만 프리페치하고, 페이지는 컨테이너 목록만 채운다(`getEngineDashboard` → `getEngineOverview` + `getContainerList` 분리).

### 검증

- 기계: typecheck 7/7, lint 0, test **199 pass**, format:check, build 7/7.
- 런타임: Compose 5개 healthy, 미인증 401, 전 패널 라우트 200.
- 브라우저: 라이트·다크, 1440·390, console error **0건**. 파괴적 작업 다이얼로그의 확인 문구 잠금·ESC·포커스 복귀, 모바일 Sheet 드로어, 표 zebra, 편집기 내부 가로 스크롤(페이지 가로 스크롤 0) 확인.
- 회귀 방지 grep: 앱 코드의 border 유틸·`rounded-*`(형태 예외 제외)·Tailwind 기본 팔레트 색·`window.location.reload`·템플릿 리터럴 className 전부 0건.

### §8 보류 4건 — 2026-08-04 전부 구현 완료

| 항목                   | 결과                                                                                                                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| nginx 보호 계약 파서화 | 웹의 검증된 파서를 `packages/nginx-config` 공유 패키지로 승격하고 engine-agent 검증을 AST 기반 all-must-pass 로 재작성. decoy server 블록·중복 `/api/` location·nested 우회·burst 상한 초과를 전부 거부 |
| nginx route 순서 역전  | persist-then-apply + 실패 시 보상(생성=delete/수정=이전 값 복원/삭제=재삽입), 서비스 수준 직렬화, 부팅 시 `reconcileRoutes()` 자가치유                                                                  |
| access log 로테이션    | nginx 컨테이너 내부 크기 기반 회전(128 MiB·60초·2세대·무압축) + `USR1` 재오픈, traffic-worker 에 체크포인트 inode 유실 관측 필드                                                                        |
| 감사 로그 서버 필터    | actorEmail·targetId·operation·result·targetType·기간 서버 필터와 페이지네이션(`paginatedResponse`), 인덱스·migration 0011, 웹 서버 필터 UI                                                              |

구현 중 실측으로 드러난 결함 2건을 함께 고쳤다.

1. **공유 파서가 주석 줄 바로 다음의 블록 헤드를 주석에 삼켰다.** `# comment\nserver { ... }` 형태에서 `server {` 까지 주석 노드로 먹어 블록 계층이 무너지고, 그 결과 상위 블록이 조기에 닫혀 왕복 동일성도 깨졌다. **웹 GUI 편집기가 쓰던 파서와 같은 코드라 사용자가 주석이 있는 config 를 GUI 로 편집하면 손상될 수 있는 잠재 경로였다.** `scanStatementEnd` 가 주석으로 시작하는 statement 를 줄 끝에서 종결하도록 고치고 패키지에 회귀 테스트 5건을 추가했다.
2. **새 계약 검증이 닫는 중괄호 앞 주석을 불균형으로 판정했다.** 우리 route 렌더러가 넣는 `# containers-routes:start|end` 마커가 http 블록 tail 에 들어가는데, 이를 거부해 **route 생성이 원천 불가**했고 부팅 reconcile 도 실패했다. tail 에서 주석을 제외하고 균형을 판정하도록 고쳤다.

두 결함 모두 정적 검사(typecheck·테스트)는 통과했고 **Compose 실측에서만 드러났다.**

### 남은 것

§8 의 보류 4건(nginx 보호 계약 파서화, nginx route apply-then-persist 순서, access log 로테이션, 감사 로그 서버 필터)은 그대로 미착수다. 대시보드는 요약 전용으로 줄이면서 여백이 넓어졌으므로, 이후 최근 작업·경고 요약 같은 카드를 추가할지는 별도 판단이 필요하다.

## 11. 보류 4건 구현 실측 (2026-08-04)

- 기계: typecheck 8/8, lint 0, **test 230 pass**, format:check, build 8/8.
- nginx 보호 계약: 실제 `infra/nginx/nginx.conf` 통과, decoy·중복 location·nested·burst 초과 거부를 단위 테스트로 고정. 관리 마커 주석 포함 config 통과 회귀 테스트 추가.
- route: 실제 생성(`e2e-route-check.local` → `poc1d`) → 프록시 응답 확인 → 삭제까지 수행했고 삭제 후 config SHA 가 생성 전 값(`1bf58eaa…`)으로 정확히 복귀했다. 부팅 reconcile 이 live config 를 DB 기준으로 자가치유하는 것도 확인했다.
- 로테이션: 임시 override(64 KiB·5초)로 실제 회전 유도 — `.1`→`.2` 승격, `USR1` 재오픈 후 새 파일에 기록 재개, traffic DB 행 +257(생성 252 + 헬스체크), **중복 request_id 0**, 체크포인트가 새 inode 로 전환. 검증 후 기본값(128 MiB·60초·2세대)으로 복구했다.
- 감사: `limit=3` 기준 `{page,limit,total,totalPages}` 봉투, page 2 offset, `result=success` 필터 일치, `from>to` 400, `limit=500` 400 을 실측했고 total 이 DB 실제 행 수와 일치했다.
- 브라우저: 감사 로그 서버 필터 UI(검색·선택·기간·적용/초기화)와 표 렌더, console error 0건, 페이지 가로 스크롤 0.

### 정책 판단이 필요한 잔여 1건

감사 로그 열람 role 이 문서(`docs/llm.txt` 는 owner/admin)와 구현(owner·admin·viewer·auditor)에서 불일치한다. 이번 작업은 구현을 바꾸지 않고 유지했다. 문서를 구현에 맞출지, 구현을 좁힐지는 사용자 결정이 필요하다.
