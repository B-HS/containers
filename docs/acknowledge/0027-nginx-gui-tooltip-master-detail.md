# 0027 — Nginx GUI 지시어 툴팁·upstream 옵션 툴팁·server 탭 MasterDetail

## 배경

- 0026 Nginx 설정 GUI 고도화 후 사용자 요청 ①: "nginx 지시어 각 항목에 설명 툴팁 추가"
- 사용자 요청 ②: "server 탭의 location을 sidebar로 둬야 편집이 편하지 않을까?" — 서버가 여러 개일 때
  각 location을 세로로 늘어놓아 편집이 어려운 문제를 해결하기 위한 레이아웃 개선 요청

## 요구사항 정리 (사용자 원문 요지)

1. nginx 지시어 항목에 툴팁(설명) 표시 — ko/en/ja 3개 언어
2. upstream 옵션(weight/max_conns 등)에도 툴팁 표시
3. server block 탭을 MasterDetail로 — 좌측에 server + location 계층 사이드바, 우측에 선택된 항목 편집기

## 설계 결정

### 툴팁 (요청 ①)

- **컴포넌트**: `shared/ui/tooltip.tsx` 신규 — radix-ui 통합 패키지(`radix-ui`, `^1.6.7`)의
  Tooltip(TooltipProvider/Tooltip/TooltipTrigger/TooltipContent)을 재래핑해 named export 4종
- **배선 위치**: `nginx-directive-editor.tsx`에서 지시어 라벨 4브랜치(① multiple+추가 버튼 ② boolean 체크 ③ options 셀렉트
  ④ 기본 텍스트) 전부 `DirectiveTooltip`으로 감쌈 — 라벨 1곳에서만 렌더해 중복 방지
- **upstream 옵션**: `nginx-upstream-editor.tsx`에서 옵션 라벨 8개(serverAddress/weight/maxConns/maxFails/
  failTimeout/backup/down/resolve)에 `UpstreamOptionTooltip` 배선
- **i18n 키**: `nginxGui.directive.<이름>`(156개) + `nginxGui.upstreamOption.<이름>`(8개)
    - ko 원본 작성 후 en/ja를 백그라운드 에이전트 2개로 병렬 번역, 키 집합·순서가 3개 언어 모두 동일한지 검증
    - `useTranslations('Dashboard')` + `t.has(key)`로 존재 여부 가드 (누락 시 툴팁만 미표시, 폼은 정상 동작)
- **툴팁 미사용 키 처리**: 카탈로그 지시어 중 일부는 메시지 키가 없어 툴팁 없이 기존처럼 라벨만 표시

### server 탭 MasterDetail (요청 ②)

- **레이아웃**: 기존 `MasterDetail`(shared/common/master-detail) 재사용 — 좌측 사이드바에
  server(들여쓰기 없음)와 해당 server의 location들(들여쓰기)을 계층으로 표시, 우측에 선택 항목 편집기
- **`MasterDetailItem.indent?: boolean`** 추가 — 선택 필드라 기존 호출부 15곳 영향 없음
  (exactOptionalPropertyTypes 주의: badge는 조건부 스프레드로 처리)
- **`NginxBlockEditor.hideLocations?: boolean`** 추가 — server 편집기에서는 location 섹션을 숨기고
  (location은 사이드바에서 관리), location 자체를 선택했을 때만 해당 location 편집기 표시
- **선택 상태**: `useMasterDetailSelection` — server + location 이중 선택(serverIndex/locationIndex)
    - location 선택/변경/삭제/추가 후 선택은 해당 server(`server-${i}`)로 복귀
    - 사이드바 항목은 `serverTitle()`(server_name 또는 listen 8080 등 요약) + `flatMap`으로 server→location 순서 유지
- **location 경로 수정**: location 선택 시 편집기 헤더에 경로 Input + 삭제 버튼, 경로 수정 시
  head 재생성(`location ${path} {`) + 사이드바 즉시 반영

## 파일

- `apps/web/src/shared/ui/tooltip.tsx` — radix-ui Tooltip 래퍼 (신규)
- `apps/web/src/widgets/nginx/nginx-directive-editor.tsx` — `DirectiveTooltip` 라벨 4브랜치 배선
- `apps/web/src/widgets/nginx/nginx-upstream-editor.tsx` — `UpstreamOptionTooltip` 옵션 라벨 8개 배선
- `apps/web/src/widgets/nginx/nginx-config-widget.tsx` — server 탭 MasterDetail 전환 + 선택 로직
- `apps/web/src/widgets/nginx/nginx-block-editor.tsx` — `hideLocations` prop 추가
- `apps/web/src/shared/common/master-detail/master-detail.tsx` — `indent?: boolean` 추가
- `apps/web/messages/{ko,en,ja}.json` — `nginxGui.directive`(156) + `nginxGui.upstreamOption`(8) 병합

## 검증

- [x] 메시지 병합 후 JSON.parse 검증 — 3개 언어 모두 `nginxGui` 48키, directive 156 + upstreamOption 8, 키 집합·순서 일치
- [x] typecheck(tsc --noEmit) — noUncheckedIndexedAccess·exactOptionalPropertyTypes 대응(선택 항목 const 로컬 내로잉,
      badge 조건부 스프레드)
- [x] ESLint·Prettier(format:check) 통과
- [x] 기존 테스트 159개 통과
- [x] compose web 재빌드 healthy

## E2E 검증 (2026-08-03, owner 브라우저, console error 0건)

- [x] upstream 탭 — `weight` 라벨 hover 시 툴팁 "로드 밸런싱 가중치를 지정합니다. 기본값은 1입니다." 표시
- [x] server block 탭 — 좌측 사이드바에 server 3개(`_` 2개 location, `panel.containers.local` 3개, `api.containers.local` 2개) + 들여쓰기 location 표시, 우측에 선택 server의 지시어만 표시(location 섹션 숨김 확인)
- [x] location `/api/`(panel.containers.local) 선택 — 편집기 헤더 "location 경로" Input + 삭제 버튼, 지시어 편집 컨텍스트 전환
- [x] location 경로 수정(`/api/` → `/api/v2/`) — 사이드바 즉시 반영, 새로고침 후 원복(미저장) 확인
- [x] 지시어 툴팁 — `server_name` hover 시 "이 server 블록이 응답할 도메인 이름을 지정합니다..." 표시
- [x] 콘솔 에러 0건
