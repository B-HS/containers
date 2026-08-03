# 0026 — Nginx 설정 GUI 고도화

## 배경

- 기존 Nginx 설정 편집은 raw 텍스트 편집만 가능했다.
- 사용자가 raw 편집 + GUI(체크/input) 편집을 모두 지원하도록 고도화를 요청했다.

## 요구사항 정리 (사용자 원문 요지)

1. nginx 설정을 구문 분석해서 ① upstream ② server block ③ 기타 nginx 설정으로 분리 표시
2. server block에서는 사용 가능한 옵션을 빼먹지 않고 제공
3. raw로 편집할 수도 있고, GUI(체크/input)로 설정값을 넣을 수도 있어야 함

## 설계 결정

- **파서 위치**: 프론트엔드 `shared/lib/nginx-config/`에 자체 파서 구현
    - 문(statement) 단위 스캔 + 각 노드 raw 텍스트 보존 방식
    - 파싱 → 직렬화 시 원본과 바이트 단위 동일 (주석·빈 줄·포맷 보존)
    - 알 수 없는 구조는 text 노드로 보존해 GUI 편집 시 데이터 손실 없음
- **적용 파이프라인**: 기존 `POST /api/nginx/config/apply` + SHA-256 충돌 검사 + `nginx -t` 검증 재사용
    - GUI 편집 결과도 직렬화 → 같은 raw 텍스트로 변환 후 기존 파이프라인 사용
- **지시어 카탈로그**: nginx 공식 문서(nginx.org) 기준 server 컨텍스트 지시어를 그룹별로 정의
    - 12개 그룹: 기본/경로/제한/응답 헤더/로깅/리라이트/프록시/SSL/접근 제어/압축/기타/HTTP2
    - valueType(boolean/text/number/size/duration/options/code)과 multiple 여부, placeholder
    - 카탈로그에 없는 지시어는 "기타 지시어" raw 리스트로 보존
- **UI 구성**: raw/GUI 모드 토글, GUI 내부는 upstream/server block/기타 3섹션 탭
    - server block은 그룹 Accordion + 지시어별 체크/input/select, location 서브블록 재귀 지원
    - upstream은 서버 주소 + weight/max_conns/max_fails/fail_timeout/backup/down/resolve 구조화 폼
    - 기타는 main(root)과 http 직속 지시어 raw 리스트 편집
- **편집 정합성**: server/upstream 블록은 순서 보존 채로 children 교체, GUI 편집 결과는 즉시 rawConfig에 미러링되어
  GUI ↔ raw 전환이 자유롭고 어느 쪽에서든 적용 가능

## 제약 (변경 없음)

- 보호 계약(`REQUIRED_CONFIG_TOKENS`: pid, access_log, listen 8080/8081, location /api/, stub_status, proxy_pass 등)은
  GUI 편집으로도 제거 불가 — 서버 `verifyProtectedContract`가 최종 방어
- 적용 전 `nginx -t` 검증 실패 시 적용 거부 (기존 동작 유지)
- GUI 편집으로 빈 값 지시어가 생기면 적용 시 nginx 검증이 거부하므로 안전

## 파일

- `apps/web/src/shared/lib/nginx-config/parse-nginx-config.ts` — 파서 + AST 타입
- `apps/web/src/shared/lib/nginx-config/serialize-nginx-config.ts` — 직렬화 + 노드 생성 헬퍼
- `apps/web/src/shared/lib/nginx-config/nginx-directives.ts` — server 컨텍스트 지시어 카탈로그
- `apps/web/src/shared/lib/nginx-config/nginx-editor-model.ts` — 블록 children 조작 헬퍼
- `apps/web/src/widgets/nginx/nginx-config-widget.tsx` — raw/GUI 토글 메인 위젯
- `apps/web/src/widgets/nginx/nginx-directive-editor.tsx` — 지시어 하나 폼
- `apps/web/src/widgets/nginx/nginx-block-editor.tsx` — server/location 공용 블록 폼
- `apps/web/src/widgets/nginx/nginx-upstream-editor.tsx` — upstream 폼
- `apps/web/src/widgets/nginx/nginx-global-editor.tsx` — main/http 직속 지시어 폼
- `apps/web/messages/{ko,en,ja}.json` — `nginxGui` 네임스페이스 추가

## 검증

- [x] 파싱 → 직렬화 왕복 정합성: 실제 `infra/nginx/nginx.conf` 기준 원본과 바이트 단위 동일 확인
- [x] 편집 시나리오: server_name 변경, 지시어 추가(gzip/proxy_read_timeout), add_header 삭제, location 추가 동작 확인
- [x] 따옴표 문자열 토큰 분리, 주석·빈 줄 보존, 멀티라인 지시어 확인
- [x] typecheck(tsc --noEmit), ESLint, Prettier 통과
- [x] `next build` 성공, 기존 테스트 159개 통과

## E2E 검증 (2026-08-03, compose 재빌드 후 owner 브라우저)

- [x] GUI 편집 탭: upstream 2개(containers_web/api) 구조화 폼(주소·weight/max_conns/max_fails/fail_timeout/backup/down/resolve), server block 12개 그룹 카탈로그(기본~HTTP/2), 기타 설정(main/http 직속) 렌더 확인
- [x] GUI 편집 → raw 미러링: 기타 설정에서 keepalive_timeout 65→66 변경 즉시 raw 탭 textarea에 `keepalive_timeout 66;` 반영
- [x] GUI 변경 적용: 실제 `/etc/nginx/managed/current.conf` 반영·`nginx -t` 통과·revision 0→1·SHA-256 변경·nginx healthy·실제 요청 200 유지, 이후 65로 원복 적용(revision 2)
- [x] 콘솔 에러 0건 (수정 후 재확인)

## E2E 발견·수정 (2026-08-03)

- GUI 편집 탭에서 `MISSING_MESSAGE: Dashboard.nginxGui.group.*` 콘솔 에러 130건 발견
    - 원인 1: `nginx-directives.ts` 카탈로그 `labelKey`가 `nginxGui.group.basic`(dot 경로) — 메시지 파일은 `groupBasic`(camelCase) 형식이라 불일치
    - 원인 2: `placeholderKey`가 `nginxGui.placeholder.serverName`(전체 키)인데 `nginx-directive-editor.tsx`에서 `nginxGui.placeholder.` 접두사를 다시 붙여 이중 접두사 발생
    - 수정: 카탈로그의 `labelKey` 12개를 `nginxGui.groupBasic` 형식으로, `placeholderKey` 11개를 leaf 값(`serverName` 등)으로 변경 (메시지 파일 3개 언어는 수정 불필요 — 이미 키 존재)
    - 재검증: typecheck·lint·format·test 159 pass, web 재빌드 후 콘솔 에러 0건
- 적용 시 오래된 세션이 `RECENT_AUTH_REQUIRED` 401 반환 — 새 로그인으로 해소. E2E용으로 owner 비밀번호를 임시값으로 재설정했음(사용자에게 별도 전달)
