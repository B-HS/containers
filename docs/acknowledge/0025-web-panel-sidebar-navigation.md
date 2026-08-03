# 0025 — 웹 패널 사이드바 내비게이션 도입과 단일 페이지 분리 설계 결정

날짜: 2026-08-02 KST (2026-08-03 UI 감사 수정 반영)
상태: **구현 완료 — 2026-08-03 UI 감사·수정 반영**
근거: 사용자 지시 — "프로젝트를 정확하게 읽고 현재 웹패널의 내용들을 왼쪽 사이드바에 메뉴로 해서 하나씩 분류. 지금 한 페이지에 싹 다 들어가 있어서 설정이 매우 불편함. UI/UX 를 완벽하게 고려해서 정확하게 분리해서 구현". 현재 구현: [page.tsx](../../apps/web/src/app/[locale]/page.tsx), [UI-UX.md](../UI-UX.md)

## 배경

현재 웹 패널은 `apps/web/src/app/[locale]/page.tsx` **단일 페이지**에 21개 위젯이 세로로 전부 쏟아져 있다.

| 증상              | 관측                                                                                                                                                                                                                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 스크롤 폭주       | Overview·Traffic·Deployment·Nginx·Artifact·Image·Registry·Infrastructure·Notification·Prune·API key·Backup·Control plane·Job·Invitation·User·Audit·Container create·Container control 까지 한 화면에 세로 배열                                                                        |
| 데이터 과다 fetch | 페이지 진입 시 **전체 API 를 Promise.all 로 한 번에 호출**(engine·traffic·nginx·artifacts·images·infrastructure·deployments·secrets·users·audit·api-keys·backups·jobs·maintenance·control-plane·notifications·prune·registry 18종). 설정 항목 하나를 보려 해도 모든 데이터를 내려받음 |
| 빈 사이드바       | 왼쪽 `<aside className="hidden bg-sidebar p-3 lg:block">` 는 "Containers" 텍스트와 `navigation` 라벨만 있고 실제 메뉴가 없음                                                                                                                                                          |
| 목적지 불명확     | 특정 설정(예: API 키)을 바꾸려면 긴 페이지를 끝까지 스크롤해야 함                                                                                                                                                                                                                     |

## 결정

### 1. 사이드바 메뉴 구조 (8개 섹션 / 21개 항목)

왼쪽 사이드바를 실제 내비게이션으로 만들고, 각 항목을 **전용 라우트 페이지**로 분리한다.

| 섹션            | 메뉴 항목       | 라우트                  | 원 위젯                       |
| --------------- | --------------- | ----------------------- | ----------------------------- |
| 대시보드        | 개요            | `/`                     | OverviewWidget                |
| 대시보드        | 트래픽 분석     | `/traffic`              | TrafficAnalyticsWidget        |
| 컨테이너        | 컨테이너 제어   | `/containers`           | ContainerControlWidget        |
| 컨테이너        | 컨테이너 생성   | `/containers/new`       | ContainerCreateWidget         |
| 이미지·아티팩트 | Docker 이미지   | `/images`               | ImageControlWidget            |
| 이미지·아티팩트 | Artifact 업로드 | `/artifacts`            | ArtifactControlWidget         |
| 배포            | Manifest·배포   | `/deployments`          | DeploymentControlWidget       |
| 배포            | 배포 Secret     | `/deployments/secrets`  | DeploymentSecretControlWidget |
| 배포            | Registry        | `/registry`             | RegistryControlWidget         |
| Nginx           | 설정·Revision   | `/nginx`                | NginxConfigWidget             |
| Nginx           | 프록시 라우트   | `/nginx/routes`         | NginxRouteControlWidget       |
| 인프라          | 네트워크·볼륨   | `/infrastructure`       | InfrastructureControlWidget   |
| 인프라          | 리소스 정리     | `/infrastructure/prune` | PruneControlWidget            |
| 운영            | 작업 큐         | `/jobs`                 | JobControlWidget              |
| 운영            | Control Plane   | `/control-plane`        | ControlPlaneControlWidget     |
| 운영            | 백업            | `/backups`              | BackupControlWidget           |
| 운영            | 알림 대상       | `/notifications`        | NotificationControlWidget     |
| 관리            | API 키          | `/api-keys`             | ApiKeyControlWidget           |
| 관리            | 운영자 초대     | `/invitations`          | InvitationControlWidget       |
| 관리            | 운영자·역할     | `/users`                | UserManagementWidget          |
| 관리            | 감사 로그       | `/audit`                | AuditLogWidget                |

### 2. 페이지별 데이터 fetch (lazy 분리)

기존의 전량 Promise.all 을 버리고, **각 페이지가 자신의 위젯에 필요한 데이터만** fetch 한다.

- `/` (개요): engine·traffic summary·nginx status·api health (6개 status card)
- `/traffic`: traffic analytics (canExport 는 role 에 따라)
- `/containers`: engine dashboard 의 containers
- `/containers/new`: images + networks
- `/images`: images
- `/artifacts`: artifacts
- `/deployments`: images + manifests + releases + networks
- `/deployments/secrets`: deployment secrets (관리자 전용)
- `/registry`: registry credentials (관리자 전용)
- `/nginx`: nginx config
- `/nginx/routes`: nginx routes + container DNS names
- `/infrastructure`: networks + volumes
- `/infrastructure/prune`: prune preview (관리자 전용)
- `/jobs`: jobs + backup schedule + maintenance (관리자 전용)
- `/control-plane`: control plane status (관리자 전용)
- `/backups`: backups (owner 전용)
- `/notifications`: notification destinations (관리자 전용)
- `/api-keys`: api keys (관리자 전용)
- `/invitations`: 데이터 없음 (role 만 필요)
- `/users`: managed users (owner 전용)
- `/audit`: audit events (audit 권한 전용)

권한 게이트는 기존과 동일하게 유지한다(`canManageApiKeys = owner|admin`, `isOwner`, `canViewAudit`). 메뉴 자체를 권한에 따라 숨기고, 권한 없는 URL 접근은 개요(`/`)로 redirect 한다.

### 3. 아키텍처

```
apps/web/src/app/[locale]/
  layout.tsx                        (기존 유지 — locale wrapper)
  accept-invitation/page.tsx        (기존 유지 — 패널 밖)
  (panel)/                          ← route group: URL 에 영향 없음
    layout.tsx                      (신규 — 인증 게이트 + PanelShell)
    page.tsx                        (개요 — 기존 page.tsx 를 이동·축소)
    traffic/page.tsx
    containers/page.tsx
    containers/new/page.tsx
    ... (21개 라우트)
```

- **`src/shared/lib/session.ts`** — `getSession()` 을 React `cache()` 로 래핑. 레이아웃과 페이지가 요청당 authGate+cookie+권한 플래그를 **한 번만** 조회 (duplicate fetch 방지).
- **`src/shared/lib/navigation.ts`** — `NAV_SECTIONS` 메뉴 구조(섹션/항목/href/권한) + 권한 필터 헬퍼. 아이콘은 lucide-react (`layout-dashboard`, `container`, `rocket`, `route`, `key-round`, `database-backup`, `list-todo`, `server-cog`, `bell`, `key`, `user-plus`, `users`, `scroll-text`, `eraser`, `hard-drive`, `archive`, `bar-chart-3` 등 — 전부 v1.28.0 에 존재 확인).
- **`src/i18n/navigation.ts`** — `createNavigation(routing)` 으로 locale 인지 `Link`·`usePathname`·`redirect` 생성 (next-intl 4.13.4, 미사용 API).
- **`src/widgets/panel-shell/panel-shell.tsx`** — 클라이언트 셸. 데스크톱은 좌측 고정 사이드바(256px), 모바일은 햄버거 → 드로어. `usePathname` 으로 활성 메뉴 하이라이트. 상단 브랜드 + 메뉴, 하단 사용자 정보·역할·로그아웃(기존 우측 aside 역할을 사이드바 하단으로 이동).
- **`src/shared/ui/page-header.tsx`** — 페이지 타이틀 + 부제 공용 헤더.
- i18n: `messages/{ko,en,ja}.json` 에 `Nav` 네임스페이스 추가(섹션 라벨 8개, 메뉴 라벨 21개, 페이지 부제 21개). 위젯 라벨은 기존 `Dashboard` 네임스페이스를 그대로 사용.

### 4. UI/UX 규칙

- 기존 디자인 언어 유지 — 날카로운 모서리(`border-radius: 0`), 고대비 단색(oklch), `bg-sidebar`/`bg-card`/`bg-foreground` 반전 활성 스타일.
- 데스크톱(≥lg): 사이드바 고정 + 활성 메뉴 반전 하이라이트.
- 모바일(<lg): 상단 햄버거 → 좌측 드로어 + 배경 오버레이, 메뉴 선택 시 자동 닫힘.
- 각 페이지 상단에 PageHeader(타이틀·부제) → 위젯. 위젯 자체는 기존 그대로 재사용(수정 최소화).
- `accept-invitation` 페이지는 패널 밖(공개)이므로 사이드바 없음.

## 파일

- `apps/web/src/app/[locale]/(panel)/layout.tsx` — 인증 게이트 + PanelShell (신규)
- `apps/web/src/app/[locale]/(panel)/page.tsx` 외 20개 라우트 (신규, 기존 위젯 이동·배치)
- `apps/web/src/app/[locale]/page.tsx` — 삭제 (단일 페이지 → (panel)/page.tsx 로 대체)
- `apps/web/src/shared/lib/session.ts`, `navigation.ts` — session cache + 메뉴 구조 (신규)
- `apps/web/src/i18n/navigation.ts` — createNavigation (신규)
- `apps/web/src/widgets/panel-shell/panel-shell.tsx` — 사이드바 셸 (신규)
- `apps/web/src/shared/ui/page-header.tsx` — 페이지 헤더 (신규)
- `apps/web/messages/{ko,en,ja}.json` — `Nav` 네임스페이스 추가
- `docs/acknowledge/0025-web-panel-sidebar-navigation.md`(본 문서)

## 검증

- 각 페이지가 **자신의 데이터만** fetch 하는지(개요 페이지에서 다른 도메인 API 미호출) 확인.
- 권한별 메뉴 노출/숨김: viewer 는 관리·운영 메뉴 미노출, owner/admin/auditor 대조.
- 모바일 드로어 열기/닫기·활성 하이라이트, 데스크톱 활성 메뉴.
- 전체 gate(typecheck·lint·format·test·build) 통과 후 Compose 재배포 + 브라우저 실측(각 메뉴 이동, 로그아웃).
- i18n 3개 로케일 Nav 키 완전성.

## 2026-08-03 UI 감사·수정 (사용자 지시 반영)

브라우저 E2E(compose 실행 · owner 로그인 · `/ko`·`/ko/containers`·`/ko/traffic`·모바일 390px)와 코드 감사로 발견한 항목을 수정했다.

| 항목                    | 내용                                                                                                                                | 수정                                                                      |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 사이드바 padding        | 데스크톱 aside·모바일 드로어에 `p-3`(12px) — 사용자 지시 "사이드바 padding 없어야 함"                                               | aside·드로어 `p-3` 제거, 드로어 상단/하단 영역에 `px-2` 보정(항목과 정렬) |
| 드로어 폭               | `w-72`(288px) — 데스크톱 256px 과 불일치                                                                                            | `w-64`(256px) 통일                                                        |
| 마스터-디테일 목록 버튼 | `grid min-w-0` 조합이 li 폭을 채우지 못해 버튼 폭이 콘텐츠 크기로 수축(203/188/195px…) — `width:100%` 강제 시 239px 균일 확인       | 버튼에 `w-full` 추가                                                      |
| favicon                 | `/favicon.ico` 404 console error                                                                                                    | `apps/web/src/app/icon.svg` 추가 (Next.js 자동 favicon)                   |
| size-x                  | `h-4 w-4` 쌍 3곳 (panel-shell)                                                                                                      | `size-4`                                                                  |
| arbitrary spacing       | `min-h-[32rem]`·`min-w-[840px]`·`min-w-[760px]` — tailwind v4 spacing scale 로 변환 가능                                            | `min-h-128`·`min-w-210`·`min-w-190`                                       |
| 기타 확인               | radius 0 전 요소, shadow 는 `shadow-none` 1건뿐, 모노톤(lab 무채색), 1px gap grid, 콘텐츠 inset 12px, 트래픽 페이지 무채색 위반 0건 | 위반 없음 — 보고만                                                        |

검증: typecheck 7/7 · lint · test 159 pass · format:check 통과(산출물 정리 후). Compose web 재빌드 후 브라우저 실측 — 사이드바 padding 0 · 목록 버튼 239px 균일 · favicon 200 · 드로어 256px.
