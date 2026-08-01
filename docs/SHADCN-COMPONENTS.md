# shadcn/ui 컴포넌트 목록과 사용 계획

## 1. 기준

- 확인일: 2026-07-31
- 공식 목록: <https://ui.shadcn.com/docs/components>
- 공식 페이지에 표시된 전체 컴포넌트를 먼저 목록화하고, 직접 UI를 만들기 전에 대응 컴포넌트가 있는지 이 문서에서 확인한다.
- `flunti-otel`에서 검증된 Sidebar, Card, Item, Empty, Table, Chart, Tabs, Toggle Group, Collapsible, Accordion, Dialog, Field 패턴을 우선 재사용한다.

분류:

- 필수: 초기 구현에서 설치·사용
- 조건부: 해당 기능을 구현할 때 설치
- 제외: 현재 제품과 맞지 않거나 다른 shadcn 컴포넌트로 대체

## 2. 공식 전체 목록

| 공식 컴포넌트    | 분류   | 사용 위치·판단                                            |
| ---------------- | ------ | --------------------------------------------------------- |
| Accordion        | 필수   | inspect, error detail, advanced settings                  |
| Alert            | 필수   | offline, permission, partial failure, warning             |
| Alert Dialog     | 필수   | remove, rmi, prune, rollback confirmation                 |
| Aspect Ratio     | 제외   | 고정 비율 미디어가 핵심이 아님                            |
| Attachment       | 조건부 | support bundle 또는 artifact metadata 첨부 기능이 생길 때 |
| Avatar           | 필수   | 사용자 menu와 audit actor                                 |
| Badge            | 필수   | container·job·health·scan 상태                            |
| Breadcrumb       | 필수   | detail과 settings hierarchy                               |
| Bubble           | 제외   | 대화형 메시지 제품이 아님                                 |
| Button           | 필수   | 모든 action                                               |
| Button Group     | 필수   | start·stop 관련 action, log controls                      |
| Calendar         | 필수   | traffic·audit 기간 선택                                   |
| Card             | 필수   | panel surface                                             |
| Carousel         | 제외   | 운영 화면에서 순차 미디어 탐색 불필요                     |
| Chart            | 필수   | traffic, resource stats, disk usage                       |
| Checkbox         | 필수   | bulk selection, boolean policy                            |
| Collapsible      | 필수   | context filter, inspect tree, optional sections           |
| Combobox         | 필수   | image, container, host, label 검색 선택                   |
| Command          | 필수   | command palette와 resource quick jump                     |
| Context Menu     | 조건부 | table row 보조 action, keyboard 동등 경로 필수            |
| Data Table       | 필수   | containers, images, jobs, audit, routes                   |
| Date Picker      | 필수   | traffic·audit absolute range                              |
| Dialog           | 필수   | create·edit form, job detail                              |
| Direction        | 조건부 | RTL locale을 실제 지원할 때                               |
| Drawer           | 필수   | mobile filter와 action flow                               |
| Dropdown Menu    | 필수   | secondary row·resource actions                            |
| Empty            | 필수   | no data, stopped, no permission별 상태                    |
| Field            | 필수   | form label, help, validation                              |
| Hover Card       | 조건부 | image digest, container summary 미리보기                  |
| Input            | 필수   | search와 일반 text field                                  |
| Input Group      | 필수   | search, unit suffix, copyable ID                          |
| Input OTP        | 조건부 | 후속 TOTP·복구 인증을 구현할 때                           |
| Item             | 필수   | stat tile, resource summary, list item                    |
| Kbd              | 필수   | command palette와 shortcut 안내                           |
| Label            | 필수   | 간단 form과 switch label                                  |
| Marker           | 제외   | map·annotation marker 요구 없음                           |
| Menubar          | 제외   | desktop application식 전역 menu보다 Sidebar가 적합        |
| Message          | 제외   | chat message 요구 없음                                    |
| Message Scroller | 제외   | chat message stream 요구 없음                             |
| Native Select    | 조건부 | mobile·간단 filter에서 접근성·성능상 이점이 있을 때       |
| Navigation Menu  | 제외   | public site navigation이 아니라 Sidebar 사용              |
| Pagination       | 필수   | audit, traffic errors, images, jobs                       |
| Popover          | 필수   | filter, date picker, short detail                         |
| Progress         | 필수   | upload, pull, load, build, deployment                     |
| Radio Group      | 필수   | rollout, archive type, policy mode                        |
| Resizable        | 조건부 | terminal·logs split pane을 사용자 조절 가능하게 할 때     |
| Scroll Area      | 필수   | sidebar, context, terminal wrapper, long detail           |
| Select           | 필수   | target, status, role, retention preset                    |
| Separator        | 조건부 | 배경 분리로 부족한 overlay·menu 내부에서만                |
| Sheet            | 필수   | tablet·mobile navigation과 context panel                  |
| Sidebar          | 필수   | desktop primary navigation                                |
| Skeleton         | 필수   | SSR fallback과 query loading                              |
| Slider           | 조건부 | resource limit을 slider로도 편집할 때, number input 병행  |
| Sonner           | 필수   | mutation·job feedback                                     |
| Spinner          | 필수   | background refresh와 button pending                       |
| Switch           | 필수   | enabled, auto-start, route toggle                         |
| Table            | 필수   | 단순 detail table과 Data Table 기반 primitive             |
| Tabs             | 필수   | container detail, Nginx, settings                         |
| Textarea         | 필수   | environment bulk input, Nginx 전체 config, command input  |
| Toast            | 제외   | 공식 legacy toast 대신 Sonner 사용                        |
| Toggle           | 필수   | log follow, wrap, timestamp, single display option        |
| Toggle Group     | 필수   | multi status, log streams, visible columns                |
| Tooltip          | 필수   | icon action, truncated ID, chart point                    |
| Typography       | 조건부 | guide·API key onboarding·empty help content               |

## 3. 화면별 우선 조합

| 화면              | shadcn 조합                                                                       |
| ----------------- | --------------------------------------------------------------------------------- |
| 전체 셸           | Sidebar, Sheet, Scroll Area, Tooltip, Command, Kbd                                |
| overview          | Item, Card, Chart, Badge, Skeleton, Alert                                         |
| resource 목록     | Data Table, Checkbox, Toggle Group, Combobox, Dropdown Menu, Pagination           |
| container detail  | Tabs, Badge, Button Group, Accordion, Collapsible, Table, Scroll Area             |
| terminal·logs     | Card, Button Group, Toggle, Input Group, Resizable 조건부, Sheet                  |
| create·edit       | Dialog 또는 Drawer, Field, Input, Select, Combobox, Switch, Radio Group, Textarea |
| upload·deployment | Progress, Step별 Card, Alert, Badge, Dialog, Sonner                               |
| Nginx revision    | Tabs, Textarea, Accordion, Alert Dialog, Badge, Table, Scroll Area                |
| traffic           | Chart, Date Picker, Popover, Toggle Group, Table, Empty                           |
| 위험 작업         | Alert Dialog, Field 대상명 입력, Alert, Progress                                  |
| API key           | Dialog, Checkbox scope matrix, Input Group, Alert, Sonner                         |
| 언어 선택         | Dropdown Menu 또는 Select, Button, Tooltip                                        |

## 4. 직접 구현 허용 범위

다음은 shadcn에 직접 대응물이 없어 custom feature로 구현할 수 있다.

- xterm.js 기반 terminal canvas와 protocol adapter
- Docker multiplexed log viewer
- Nginx revision diff viewer
- Docker inspect tree
- dependency impact graph
- deployment timeline
- traffic live tail virtualization

custom feature도 Button, Scroll Area, Badge, Tooltip, Empty, Alert 같은 primitive를 조합한다. 자체 modal, select, tooltip, tabs, toast, pagination, checkbox, switch를 만들지 않는다.

## 5. 설치·검증 절차

1. 구현할 화면의 목록에서 필요한 컴포넌트를 선정한다.
2. 해당 컴포넌트의 최신 공식 문서를 읽는다.
3. shadcn CLI를 Bun으로 실행해 `apps/web/src/shared/ui`에 생성한다.
4. 생성 코드의 import alias와 FSD 의존 방향을 확인한다.
5. 레퍼런스 토큰과 radius·shadow·padding을 적용한다.
6. keyboard, focus, disabled, loading, dark mode를 Story 또는 test route에서 검증한다.
7. custom wrapper는 두 화면 이상에서 같은 조합이 반복될 때만 만든다.
