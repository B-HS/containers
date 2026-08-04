# UI/UX 지시서

## 1. 디자인 방향

`flunti-otel`의 운영 대시보드 규칙을 기준으로 한다. 장식보다 밀도, 상태 판독, 위험 작업의 명확성을 우선한다.

- 좌측 navigation, 중앙 작업 영역, 우측 context panel의 가로 3단 셸
- desktop 기준 좌측 256px, 우측 320px, 중앙 가변
- 헤더 없는 full-height layout
- 콘텐츠 inset 12px, 패널 padding 12px, 블록 간격 1px
- radius 0, 기본 surface shadow 없음, border 최소화
- 배경 명도 3단으로 sidebar, canvas, card 구분
- 모노톤 기본과 semantic warning·destructive·success만 사용
- 아이콘은 Lucide만 사용하고 이모지와 자체 SVG를 사용하지 않음
- route 전환은 짧은 opacity만 적용하고 위치 이동 motion은 사용하지 않음

권장 토큰은 레퍼런스의 다음 값을 출발점으로 한다.

| 토큰        | light              | dark               |
| ----------- | ------------------ | ------------------ |
| sidebar     | `oklch(0.915 0 0)` | `oklch(0.098 0 0)` |
| background  | `oklch(0.955 0 0)` | `oklch(0.162 0 0)` |
| card        | `oklch(1 0 0)`     | `oklch(0.212 0 0)` |
| radius      | `0rem`             | `0rem`             |
| base shadow | `none`             | `none`             |

색상 대비는 실제 구현 후 WCAG 기준으로 다시 측정하고 부족하면 명도만 조정한다.

## 2. 반응형 셸

### 2.1 desktop

- 좌측 Sidebar: 제품명, navigation, 접기, 사용자, theme, logout
- 중앙: route별 Server Component shell과 widget
- 우측 Context Panel: target, 기간, 검색·필터, 선택 resource 요약, job center

### 2.2 tablet

- 좌측은 icon rail로 기본 접힘
- 우측은 Sheet로 전환
- 표는 중요 column을 유지하고 나머지는 column toggle로 숨김

### 2.3 mobile

- navigation과 context를 각각 Sheet 또는 Drawer로 제공
- 주요 action은 sticky action bar에 두되 콘텐츠를 가리지 않음
- terminal은 전용 full-screen route로 전환
- destructive confirm은 작은 popover가 아니라 Dialog 또는 Drawer 사용

## 3. 정보 구조

| route                  | 핵심 내용                                                      | 초기 렌더    | 실시간·상호작용                  |
| ---------------------- | -------------------------------------------------------------- | ------------ | -------------------------------- |
| `/`                    | Engine·Nginx·traffic·disk·job overview                         | SSR          | event·stats 갱신                 |
| `/containers`          | 상태별 목록, resource, health                                  | SSR prefetch | filter, bulk action              |
| `/containers/:id`      | 요약, inspect, stats, processes, logs, files, terminal, events | SSR shell    | stats, logs, exec                |
| `/images`              | 이미지, size, digest, usage, scan                              | SSR          | pull, tag, remove                |
| `/networks`            | network와 연결 container                                       | SSR          | create, connect, remove          |
| `/volumes`             | volume, usage, 연결 container                                  | SSR          | create, remove                   |
| `/deployments`         | app, version, health, route                                    | SSR          | rollout progress                 |
| `/uploads`             | artifact, scan, quota                                          | SSR          | resumable progress               |
| `/nginx`               | status, routes, current revision                               | SSR          | health·error updates             |
| `/nginx/revisions/:id` | 구조화 route·전체 config diff, 검증, apply history             | SSR          | shadow validate, apply, rollback |
| `/traffic`             | RED 지표, chart, top tables                                    | SSR prefetch | live range update                |
| `/traffic/live`        | bounded live access events                                     | shell        | SSE tail                         |
| `/jobs`                | running·history jobs                                           | SSR          | progress SSE                     |
| `/audit`               | actor·operation·target 감사 기록                               | SSR          | filter, export                   |
| `/settings/users`      | 사용자·초대·role                                               | SSR          | forms                            |
| `/settings/api-keys`   | key metadata·scope·revoke                                      | SSR          | key one-time reveal              |
| `/settings/system`     | target·disk·retention·R2·Discord·security                      | SSR          | tests, maintenance               |

## 4. container detail

상단에는 name, short ID, state, health, image digest, created, restart count, CPU·memory를 둔다. action은 상태에 따라 start 또는 stop을 하나의 primary 위치에 두고 restart, pause, kill, remove는 Dropdown Menu에 넣는다.

Tabs:

- Overview: 핵심 inspect와 resource limits
- Logs: 검색, stdout·stderr, since, follow, download
- Metrics: CPU, memory, network, block I/O, process count
- Processes: top 결과
- Terminal: shell preset과 raw cmd, active sessions
- Files: archive upload·download의 제한된 path 작업
- Network: ports, aliases, connected networks
- Inspect: redacted normalized JSON
- Events: 해당 container Docker events와 audit

없는 데이터, 권한 부족, Engine offline, container stopped를 서로 다른 Empty·Alert 상태로 보여준다.

## 5. 위험 작업 UX

- 일반 stop·restart: 예상 영향과 timeout을 작은 confirm dialog로 표시
- remove·rmi·volume delete: 종속 resource 목록과 대상명 재입력
- prune·전체 Nginx config apply·break-glass: dry-run과 shadow probe 결과, 재인증, 명확한 danger summary
- 실행 후 즉시 성공으로 표시하지 않고 job 상태를 추적
- timeout·unknown 결과는 실패 아이콘으로 단정하지 않고 `확인 중` 상태와 reconciliation action 제공
- bulk selection은 선택 수와 포함된 관리 plane resource를 항상 표시

버튼 색만으로 위험도를 전달하지 않고 제목, 설명, 대상, 되돌릴 수 있는지, 필요한 후속 조치를 텍스트로 명시한다.

## 6. form과 validation

- 긴 form은 Field 단위 설명과 section을 사용한다.
- container create와 deployment는 단계형 wizard로 만들되 각 단계에서 draft를 보존한다.
- validation은 입력 옆에 즉시 표시하고 server error는 code별 field 또는 form summary로 연결한다.
- resource limit, port, mount, environment는 반복 가능한 structured field를 사용한다.
- raw JSON·전체 Nginx config 편집은 기본 화면이 아니며 owner 권한·expert toggle·재인증 뒤 노출한다.
- 성공 후 form을 닫기 전에 job 링크를 제공한다.

## 7. 표와 필터

- Table/Data Table을 사용하고 기본 font size와 cell padding을 전 화면에서 통일한다.
- URL query string을 filter의 단일 출처로 사용해 새로고침·공유·뒤로가기를 보장한다.
- text search, state, label, image, target, time range를 Combobox·Select·Date Picker로 제공한다.
- column visibility와 saved view는 사용자별 DB에 저장한다.
- row 전체 클릭에만 의존하지 않고 name Link와 action Button을 제공한다.
- 긴 ID는 monospace, 복사 Button, Tooltip을 함께 제공한다.

## 8. 상태 표현

모든 데이터 화면은 다음 상태를 별도로 구현한다.

- initial loading: 실제 layout과 같은 Skeleton
- background refresh: 기존 데이터를 유지하고 작은 Spinner
- empty: 이유와 다음 action이 있는 Empty
- permission denied: 필요한 capability를 설명하는 Alert
- partial failure: 성공한 영역을 유지하고 실패한 panel만 Alert
- stale·offline: 마지막 관측 시각과 retry
- fatal: request ID가 있는 error boundary

상태값 `running`, `healthy`, `exited`, `paused`, `dead`, `unknown`은 Badge variant와 텍스트를 함께 사용한다.

## 9. 접근성

- semantic heading 순서와 landmark를 유지한다.
- 동작은 Button, 이동은 Link를 사용한다.
- icon-only action은 visible Tooltip과 `aria-label`을 가진다.
- Dialog·Sheet open 후 초점, close 후 복귀, Escape 동작을 검증한다.
- terminal을 제외한 모든 기능은 keyboard만으로 수행 가능해야 한다.
- chart에는 표 또는 textual summary를 함께 제공한다.
- 색상 외 status text, icon, pattern을 제공한다.
- live region은 job 완료·오류 같은 중요한 상태에만 사용해 과도한 알림을 막는다.

## 10. UI 일관성 검증

`flunti-otel` 방식처럼 screenshot 눈대중만 사용하지 않는다. desktop·tablet·mobile, light·dark에서 DOM 좌표와 computed style을 측정한다.

- 좌측 너비, 우측 너비, top alignment
- 콘텐츠 최좌단 = 중앙 시작 + 12px
- block gap = 1px
- panel padding = 12px
- radius = 0, base shadow = none
- 불필요한 horizontal overflow 없음
- sidebar variant border가 실제 0인지 측정
- loading, empty, error, permission, normal 상태 각각 검증

브라우저 실검증은 Playwright와 실제 application route에서 수행한다.

## 11. 국제화 UX

- 첫 release에서 한국어, 영어, 일본어를 언어 선택기에 동등하게 노출한다.
- 기본 locale은 browser preference와 사용자 저장값으로 결정하고 URL·cookie 전략은 SSR과 hydration 결과가 일치해야 한다.
- navigation, validation, empty·error 상태, 위험 확인, chart label, 날짜·숫자·byte 단위를 모두 catalog로 분리한다.
- 한국어·일본어의 줄바꿈과 영문의 긴 label을 desktop·tablet·mobile에서 각각 실렌더한다.
- 번역 누락 시 key 문자열을 production에 노출하지 않고 build를 실패시킨다.
- 새 locale은 registry와 catalog를 추가하면 언어 선택기와 SSR loader에 자동 등록되어야 한다.

## 12. 구현 현황 (2026-08-04, `feat/web-ui-refresh`)

정본 스펙은 [acknowledge/0029](./acknowledge/0029-monotone-design-system.md)다. 이 문서의 설계 목표 중 실제 구현과 다른 부분을 아래에 명시한다.

### 반영된 것

- radius 0, shadow 없음(떠 있는 표면만 예외), 모노톤 + semantic warning·destructive·success 3쌍.
- 배경 명도 3단(sidebar·canvas·card)을 `--surface-1|2|3` 로 토큰화하고, 여기에 **오버레이 4단**(`--overlay-subtle|hover|active|strong`)과 **텍스트 3단**(`--text-strong|muted|subtle`)을 추가했다. border 유틸리티는 앱 코드에서 쓰지 않는다.
- 셸은 shadcn `Sidebar`(`SidebarProvider`/`Sidebar`/`SidebarInset`)로 구현했고 모바일은 내장 Sheet 드로어다.
- 위험 작업은 전부 `AlertDialog` + 대상명 입력 잠금, 일시 피드백은 `sonner` toast, 지속 상태는 `Alert`.
- 로딩 `Skeleton`, 빈 상태 `Empty`, 표 `Table`(row 구분은 border 대신 zebra·hover).

### 설계와 다른 것

- **우측 context panel(3단 셸)은 구현하지 않았다.** 좌측 Sidebar + 중앙 작업 영역의 2단이며, 선택 대상 상세는 화면 안 MasterDetail(목록 240px + 상세)로 표현한다. 3단 셸은 화면당 정보량이 적어 이득이 없다고 판단했다.
- 콘텐츠 밀도는 균질한 12px 대신 목적별로 나눈다 — 목록·표는 `px-3 py-2`, 요약·폼은 `p-4`~`p-6`, 블록 간격은 1px 유지.
- tablet icon rail은 미구현이다(데스크톱 expanded / 모바일 Sheet 2단계).
- 테마 토글은 없다. `prefers-color-scheme` 기반이며 앱 코드에 `dark:` 유틸이 0건이라 토큰 교체만으로 양쪽이 동작한다.
