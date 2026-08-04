# 2026-08-04 웹 UI/UX·백엔드 정합성·보안 감사 리포트

6개 영역 병렬 감사(read-only) 후 교차검증한 결과다. 근거는 전부 `파일:라인`으로 남겼고, critical 4건은 메인 세션에서 코드로 재확인했다.

## 1. 총평

6개 영역 감사는 서로 크게 어긋나지 않고, 대부분 같은 근본 원인을 각자 다른 각도에서 본 것이었습니다. 핵심 근본 원인은 셋입니다. (1) 디자인 토큰이 shadcn 표준 세트에 미달하고(`--radius`·`--secondary`·`--sidebar-*`·`--chart-*` 부재) 전역 `* { border-radius: 0 }`가 cascade layer 밖에서 유틸리티를 덮는 우회로 radius를 강제하고 있어, 앞으로 도입할 모든 컴포넌트가 같은 방식으로 오염됩니다. (2) 데이터 경로가 "서버 props → useState 미러링 → window.location.reload"와 "entities queryOptions/useGet*" 두 갈래로 쪼개져, 조회 훅 15개와 모든 invalidateQueries가 사실상 죽은 코드입니다. (3) 공식 shadcn primitive를 쓰지 않은 7개 자체 구현(button·input·label·card·badge·textarea·inline-alert)이 focus-visible·aria-invalid·size·variant를 잃으면서 호출부에 `h-7 px-2 text-xs`·`bg-red-700` 같은 하드코딩을 20곳 이상 번지게 했습니다. 실제 버그로는 panel-shell이 children을 데스크톱/모바일 main에 두 번 렌더해 모든 위젯이 이중 마운트(SSE 2중 연결·DOM id 중복)되는 것을 코드로 확인했고, traffic-worker가 유효 이벤트 0건 청크에서 빈 배열 insert로 예외를 내 체크포인트가 전진하지 못하는 경로도 확인했습니다(부분 라인만 읽히는 흔한 상황에서도 발생). 보안은 "개인 머신 로컬 바인딩 + 백엔드 권한 강제" 위협모델을 적용해도 등급이 내려가지 않는 것이 둘 있습니다 — engine-agent `tagImage`에 관리 plane 보호가 전무해 admin이 제어 plane 이미지를 하이재킹할 수 있고(코드 확인: 532-536행에 검사 없음, 바로 아래 removeImage에는 있음), admin이 `backup:write` API key를 스스로 발급해 owner 전용 restore로 권한 상승할 수 있습니다. 반대로 CSP `unsafe-inline`, Origin 검증 부재, viewer 감사 로그 열람, SSE 상한은 로컬 단일 사용자 전제에서 실질 위험이 낮아 medium 이하로 낮췄습니다. api의 `createAppError`가 code/statusCode 없는 순수 `Error`를 반환해 `isAppError` 분기가 항상 false라는 점도 직접 확인했고, 이는 engine-agent 에러가 전부 500으로 뭉개지는 문제와 같은 뿌리입니다. 착수는 토큰·primitive 기반 → 실제 버그·권한 → UX 상태 표현 → 컨벤션 정리 순으로 잡는 것이 낭비가 없습니다.

## 2. 착수 우선순위

| 순위 | 심각도   | 영역          | 항목                                                                                                                                           | 이유                                                                                                                                                                                                                                                                                       |
| ---- | -------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | critical | 디자인 토큰   | 디자인 토큰 재정의 — shadcn 표준 토큰 보강 + 전역 `* { border-radius: 0 }` 제거 + elevation/텍스트 opacity 스케일 도입                         | 이후 모든 UI 작업의 선행조건. 전역 셀렉터가 cascade layer 밖이라 유틸리티를 덮는 우회 상태이고, --radius/--secondary/--sidebar-_/--chart-_ 부재로 Sidebar·Chart·Badge secondary를 추가하는 순간 조용히 깨진다. elevation 3단·텍스트 3단 스케일이 없으면 border를 제거할 밑천 자체가 없다.  |
| 2    | critical | 디자인 토큰   | shadcn base 레이어 추가 + 색 없는 border(currentColor) 제거 + Checkbox/Switch --input 재정의                                                   | @layer base의 `border-color` 안전망이 없어 accordion/select의 색 없는 border가 100% 대비 실선으로 렌더되고, --input이 라이트에서 순백(oklch 1)이라 카드 위 Checkbox가 사실상 보이지 않는다. 둘 다 즉시 눈에 보이는 결함이며 1번과 같은 파일에서 처리된다.                                  |
| 3    | high     | shadcn 정확성 | 공식 shadcn primitive로 교체 — button·input·textarea·label·card·badge (+ focus-visible/aria-invalid/size/variant 복원)                         | focus-visible이 커스텀 Button·목록 버튼·사이드바 Link에 전무해 키보드 포커스가 요소마다 보이거나 사라진다. size variant 부재가 `h-7 px-2 text-xs` 하드코딩 10곳+, variant 부재가 `bg-red-700` 오버라이드를 낳았다. primitive를 먼저 고쳐야 호출부 정리가 의미를 가진다.                    |
| 4    | critical | 백엔드 로직   | traffic-worker 수집 정지 버그 — 빈 이벤트 배열 insert로 체크포인트 미전진                                                                      | 완결 라인이 없는 평범한 poll(로그 기록 중 겹침)만으로도 events=[]가 되고 drizzle insert가 거부해 offset이 전진하지 못한다. 트래픽 수집이 조용히 영구 정지하며 로그는 콘솔 한 줄뿐. 한 줄 가드로 고쳐지는데 영향은 기능 전면 정지.                                                          |
| 5    | critical | 웹 UI 구조    | panel-shell children 이중 렌더 제거 — Sidebar/Sheet 도입으로 단일 main 구조 재구성                                                             | 모든 위젯이 2회 마운트되어 SSE 2중 연결·2초 폴링 2배·DOM id 중복(label htmlFor 오작동)·입력 상태 분기가 발생한다. 동시에 nav 마크업 통째 중복과 드로어 포커스 트랩/ESC/스크롤락 부재도 같은 교체로 해결된다.                                                                               |
| 6    | high     | 백엔드 로직   | api 에러 매핑 복구 — createAppError에 code/statusCode 부착, getErrorCode `:` split, engine-agent 코드 미러링                                   | isAppError 분기가 항상 false이고 agent 코드가 api STATUS_MAP에 없어 nginx 문법 오류·Docker 404·보호자원 409가 전부 500 INTERNAL_ERROR로 뭉개진다. 사용자가 어느 줄이 틀렸는지 알 수 없는 상태이며, 앞으로 UI에서 에러 표현을 정비해도 서버가 정보를 안 주면 무의미하다.                    |
| 7    | high     | 보안          | engine-agent tagImage 관리 plane 보호 추가 + removeImage의 endsWith 매칭 제거(canonical ID 사용)                                               | tagImage에 검사가 전무해 admin이 제어 plane 이미지를 재태그해 다음 기동에서 Docker socket 마운트 컨테이너를 탈취할 수 있다. removeImage는 digest 꼬리로 가드하고 Docker에는 원문을 넘겨 가드 대상과 삭제 대상이 갈릴 수 있다. 로컬 환경이어도 admin→root-equivalent 경계 붕괴라 등급 유지. |
| 8    | high     | 보안          | API key scope별 최소 role 강제 — admin의 backup:write 자기발급으로 owner 전용 restore 권한 상승 차단                                           | API key 경로가 role 검사와 recent-auth 재인증을 동시에 우회한다. admin이 스스로 발급한 키로 control.sqlite를 이전 스냅샷으로 되돌려 자신의 강등을 취소할 수 있어 역할 모델 자체가 무의미해진다.                                                                                            |
| 9    | high     | 컨벤션·Query  | 데이터 경로 단일화 — 위젯이 useGet* 구독, window.location.reload 12~14곳 제거, 프리페치를 prefetchQuery로, 쿼리 키 QUERY_KEY 중앙화            | reload가 선택 항목·스크롤·폼 입력·열린 터미널 세션을 매번 파기하는 최대 UX 결함이자, 조회 훅 15개 dead code와 invalidateQueries no-op의 원인이다. 전환 시 useCreateVolume의 키 불일치도 함께 고쳐야 '생성했는데 안 뜨는' 회귀를 막는다.                                                    |
| 10   | high     | 웹 UI/UX      | 피드백 체계 일원화 — sonner Toaster 도입, shadcn Alert로 지속 상태 분리, InlineAlert와 즉석 red-950 블록 전량 제거                             | 성공 피드백이 InlineAlert·불리언 텍스트·무피드백 3갈래이고, 삭제를 하단에서 실행했는데 알림은 섹션 최상단에 떠 보이지 않는다. tone 색이 다크 배경 고정이라 라이트에서 튀고 대비도 미달이라 모노톤 전환과도 직결된다.                                                                       |
| 11   | high     | 웹 UI/UX      | 파괴적 작업을 AlertDialog로 승격 — 확인 문자열 정답 노출 제거, 입력 일치 시에만 활성, backup restore/remove 분리                               | 현재 확인 절차는 라벨에 정답을 띄워 복붙 의식으로 전락했고 삭제 버튼은 입력과 무관하게 항상 활성이다. 백업 화면은 확인 입력 하나로 restore와 remove를 동급 버튼으로 제출한다. border 제거 후 위험도를 색이 아닌 절차로 표현해야 하므로 개편과 동시에 진행하는 것이 맞다.                   |
| 12   | high     | 디자인 토큰   | border 전면 제거 전수 치환 — border-t border-background 33곳/gap-px 15곳을 elevation 한 가지 기법으로 통일, Separator는 오버레이 내부에만      | 동일 목적에 두 기법이 공존하고 라이트에서 ΔL 0.045라 구분이 거의 보이지 않는다. 목표 상태의 핵심 작업이며 1·2번 토큰 작업이 끝난 직후에 해야 중간 상태가 생기지 않는다.                                                                                                                    |
| 13   | medium   | 웹 UI/UX      | 상태·로딩·빈 상태 표현 도입 — Skeleton/Empty/Spinner/Table + loading.tsx, Badge 상태 variant, 감사로그 서버 필터·페이지네이션                  | loading.tsx·Suspense가 0건이라 대시보드는 5개 요청이 모두 끝날 때까지 이전 화면에 머물고, running/exited/failed가 동일한 muted 배지로 보여 목록에서 상태를 구분할 수 없다. 모노톤에서 상태 인코딩 규칙(dot+타이포+강조 배경)을 함께 정해야 한다.                                           |
| 14   | high     | 백엔드 로직   | durable job 회수 경로 — heartbeatAt 기반 stall 스윕, 취소 요청 job의 succeeded 덮어쓰기 방지, 백업 실패 무한 재큐잉 백오프                     | heartbeatAt을 쓰기만 하고 읽는 쿼리가 없어 좀비 running job이 uniqueResourceKey 잠금을 영구화하고, 이후 같은 리소스의 모든 요청이 202만 받고 아무 일도 일어나지 않는다. 백업 실패 시 60초마다 재큐잉되어 디스크·알림·job 테이블이 동시에 폭주한다.                                         |
| 15   | medium   | 컨벤션·FSD    | 컨벤션 정리 — cn() 전환 7곳, 한 파일 다중 컴포넌트 분리(props-only 카드는 features로), 반환타입 명시 제거, 매직넘버 상수화, i18n 미추출 문자열 | 조건부 elevation/opacity 클래스가 늘어나는 개편에서 템플릿 리터럴 className은 tailwind-merge를 못 타 충돌한다. infrastructure-widget 383줄 5컴포넌트 같은 파일은 어차피 이번에 손대므로 그때 분리하는 것이 비용이 가장 낮다. 구조적 FSD 위반(역참조·barrel)은 없으므로 잔가지 정리 성격.   |

## 3. 교차검증에서 확정한 쟁점

### panel-shell children 이중 렌더가 실재하는가

- 상반된 주장: UI 영역·컨벤션 영역 모두 220행/222행에서 이중 렌더를 지적. 다른 영역들은 언급 없음(암묵적 무시).
- 확정: 직접 확인 결과 사실. apps/web/src/widgets/panel-shell/panel-shell.tsx에서 모바일 컬럼의 `<main className="min-w-0 flex-1">{children}</main>`(220)와 데스크톱 `<main className="hidden min-w-0 lg:block">{children}</main>`(222)가 동시에 트리에 존재. CSS로만 감추므로 두 트리 모두 마운트됨. EngineInfo도 154행·211행에서 두 번 마운트. SSE 중복 연결·DOM id 중복·폼 상태 분기가 모두 실제 결과.

### shadcn primitive가 '정확한가' — 정확성 vs 목표 부합

- 상반된 주장: shadcn 영역: select/checkbox/switch/tabs/accordion은 공식 new-york-v4와 거의 일치해 '정확하다'. 토큰 영역: 같은 파일들이 border/shadow/bg-input 잔재로 목표(border 제거·모노톤)와 충돌하므로 '문제다'.
- 확정: 둘 다 사실이며 충돌이 아님. 직접 확인 결과 select.tsx:31 `border border-input`, select.tsx:54 `border bg-popover shadow-md`, checkbox.tsx:13 `border border-input shadow-xs`가 실재. 즉 '공식 소스 기준으로는 정확' + '이번 개편 목표 기준으로는 전량 치환 대상'. 작업 순서상 공식 소스를 기준선으로 유지한 채 border/shadow만 elevation으로 치환하는 규칙을 문서화해 CLI 재추가분에도 동일 적용하는 것이 맞음.

### api의 AppError가 실제로 code/statusCode를 갖는가

- 상반된 주장: 백엔드 영역: api createAppError는 순수 Error를 반환해 isAppError가 항상 false. 반면 with-error-handling.ts는 isAppError 분기를 정상 경로처럼 작성.
- 확정: 백엔드 영역이 정확. apps/api/src/lib/error.ts:174 `createAppError = (code, cause) => new Error(code, ...)`로 code/statusCode 프로퍼티가 없고, isAppError(176-182)는 세 키를 모두 요구하므로 항상 false. engine-agent(lib/error.ts)는 반대로 실제로 부착함. 따라서 api의 모든 에러 매핑은 `message === 코드` 관례에만 의존하며 details 전달 경로는 계약상 존재하나 항상 유실됨.

### engine-agent 에러가 api에서 500으로 뭉개지는가

- 상반된 주장: 백엔드 영역: api getErrorCode에 `:` split이 없고 agent 에러코드가 api STATUS_MAP에 없어 전부 500. 다른 영역은 언급 없음.
- 확정: 사실 확인. apps/api/src/lib/with-error-handling.ts:22는 `code in STATUS_MAP`만 검사(split 없음), apps/engine-agent/src/lib/with-error-handling.ts:18은 `candidate.split(':')[0]` 적용. 비대칭 확인. 또한 apps/api/src/lib/error-code.ts를 grep한 결과 NGINX_CONFIG_INVALID·DOCKER_NOT_FOUND·EXEC_FAILED가 없고 MANAGEMENT_RESOURCE_PROTECTED만 존재. nginx 문법 오류가 500 INTERNAL_ERROR로 표시되고 validationOutput이 유실되는 것은 실제 동작.

### engine-agent tagImage에 관리 plane 보호가 있는가

- 상반된 주장: 보안 영역: 보호가 전혀 없어 제어 plane 이미지 하이재킹 가능(critical). 백엔드 영역은 이미지 관련 지적에서 removeImage만 다룸.
- 확정: 보안 영역이 정확. create-engine-control-service.ts:532-536의 tagImage는 imageTagRequestSchema.parse 후 곧바로 dockerEngineClient.tagImage 호출로 끝나며 어떤 검사도 없음. 바로 아래 removeImage(537-)는 getImages+getContainers로 관리 plane 검사를 수행 — 보호 의도가 명확한데 tag만 누락된 비대칭. 다만 실제 악용에는 admin 권한 + recent-auth + 이후 compose 재기동이 필요하므로 즉시 원격 탈취는 아님. 로컬 단일 사용자 환경이라도 admin→root-equivalent 경로이므로 high 유지.

### traffic-worker 수집 정지가 드문 예외 상황인가 흔한 경로인가

- 상반된 주장: 백엔드 영역: 로그 포맷 변경/깨진 JSON 같은 드문 상황에서 영구 정지(critical).
- 확정: 실제로는 더 흔함. create-traffic-ingestion-service.ts:209가 `database.insertEvents(parsed.events)`를 무조건 호출하는데, 완결된 라인이 하나도 없는 읽기(nginx가 라인을 쓰는 도중 poll이 겹치는 경우)만으로도 events=[]가 됨. database.ts:56-80의 insertEvents는 빈 배열을 drizzle `insert().values([])`에 그대로 넘기며 drizzle은 이를 거부. 즉 부분 라인만 존재하는 평범한 poll에서도 예외가 나고 체크포인트가 전진하지 못함. severity critical 유지, 우선순위 상향.

### 보안 항목의 실제 위협 등급 (로컬 바인딩 + 백엔드 권한 강제 적용 후)

- 상반된 주장: 보안 영역이 CSP unsafe-inline/connect-src 와일드카드(medium), Origin 검증 부재(medium), viewer 감사 로그 열람(medium), SSE actor 상한 부재(medium), validator가 인증보다 먼저(medium)를 제시.
- 확정: 위협모델 적용해 하향 조정. CSP·Origin·validator 순서는 개인 머신 로컬 바인딩 + 세션 쿠키 SameSite=Lax + 브라우저 사용자 1인 전제에서 실질 악용 경로가 없어 low. viewer 감사 로그 열람은 문서(docs/llm.txt는 owner/admin)와 구현 불일치이므로 low(정합성 이슈로 재분류). SSE actor 상한 부재는 자기 자신만 영향받아 low. 반대로 admin의 backup:write API key 자기발급 권한 상승은 역할 경계 자체를 무너뜨려 high 유지, tagImage도 high 유지. nginx 보호 계약 substring 파싱 우회는 로컬에서도 rate limit/CSP 무력화로 이어지지만 admin 권한이 전제라 medium으로 조정.

### 엔티티 조회 훅이 죽은 코드인가

- 상반된 주장: 컨벤션 영역: useGetEngineOverview 하나만 사용되고 나머지 15개는 dead code. UI 영역: 위젯이 props를 useState로 미러링. 두 진술이 같은 사실의 양면.
- 확정: 코드로 확인. apps/web/src/entities/infrastructure/infrastructure.query.ts는 `queryKey: ['infrastructure','overview']`(리터럴, QUERY_KEY 미사용)로 조회하는데 useCreateVolume의 onSuccess는 `QUERY_KEY.INFRASTRUCTURE.VOLUME.LIST`를 무효화 — 접두사 매칭 불성립. 현재는 위젯이 reload로 갱신하므로 증상이 가려져 있고, 쿼리 구독으로 전환하는 순간 '생성했는데 목록에 안 뜨는' 버그로 드러남. 즉 전환 작업 시 키 정합성 수정이 함께 필요.

### @radix-ui/react-slot 이중 설치가 실제 문제인가

- 상반된 주장: shadcn 영역: 사용처 0건이며 radix-ui 통합 패키지와 이중 설치라 context 분리 위험(medium).
- 확정: 사용처 0건은 사실 확인(shared/ui 전 파일이 `from 'radix-ui'`로만 import). 다만 실제 context 분리는 같은 primitive를 두 경로로 import할 때만 발생하며 현재는 그런 사용이 없어 위험은 이론적. severity low로 하향 — asChild 도입 시 `import { Slot } from 'radix-ui'`를 쓰고 개별 패키지를 제거하는 정리 작업으로 충분.

## 4. 영역별 findings

### 웹 패널 UI/UX·정보구조 (apps/web: (panel) pages, widgets, shared/common, panel-shell)

패널은 "PageHeader + WidgetSection + MasterDetail" 이라는 일관된 뼈대를 갖췄지만, 그 뼈대가 표현하는 정보 위계가 사실상 하나뿐이라 모든 화면이 같은 밀도(p-3 + gap-px)로 균질하게 눌려 있습니다. border를 지우고 radius를 0으로 만든 상태에서 요소 구분을 1px 배경선(gap-px/mt-px)에만 의존하고 있어, 답답함의 원인은 "간격이 좁다"보다 "구분 수단이 1px 선 하나뿐이고 폭 제한·수직 리듬·상태 인코딩이 전혀 없다"는 데 있습니다. 가장 큰 구조적 결함은 panel-shell이 children을 데스크톱/모바일 main에 두 번 렌더한다는 점으로(라인 220·222), 모든 위젯이 이중 마운트되어 SSE/WebSocket 중복 연결과 DOM id 중복(label htmlFor 오작동)을 유발합니다. 상태 표현 계층도 비어 있습니다 — toast 시스템이 없고, loading.tsx/Skeleton이 한 곳도 없으며, 변경 성공 피드백은 위젯마다 InlineAlert·불리언 텍스트·무피드백으로 제각각이고, 14곳에서 window.location.reload()로 전체 새로고침을 해 선택 상태·스크롤·폼 입력이 날아갑니다. 위험 작업은 AlertDialog 없이 상세 패널 안 자유 텍스트 입력으로 처리되며 라벨이 정답을 그대로 노출하고, 백업 화면은 같은 입력 하나로 restore와 remove 두 개의 동급 버튼을 제출합니다. 접근성 최소선에서는 커스텀 Button과 MasterDetail 목록 버튼, 사이드바 Link 전부 focus-visible 스타일이 없고 현재 위치를 aria-current로 알리지 않습니다.

#### [critical] panel-shell이 children을 두 번 렌더 — 모든 위젯이 이중 마운트된다

- 근거: `apps/web/src/widgets/panel-shell/panel-shell.tsx:161,220,222`
- 내용: 모바일 컬럼(`<div className="flex ... lg:hidden">` 161행) 안의 `<main className="min-w-0 flex-1">{children}</main>`(220행)과 데스크톱 `<main className="hidden min-w-0 lg:block">{children}</main>`(222행)이 동시에 트리에 존재한다. CSS로만 감출 뿐 둘 다 마운트되므로 모든 페이지 위젯이 2개 인스턴스로 돈다. 실제 피해: (1) container-control-widget의 `new EventSource(...)`(container-control-widget.tsx:316)와 traffic-widget의 `new EventSource('/api/traffic/live...')`(traffic-widget.tsx:49)가 뷰포트와 무관하게 항상 2개 연결을 연다, (2) deployment-widget의 2초 폴링 setInterval(deployment-widget.tsx:101)도 2배로 돈다, (3) `id={`confirmation-${container.id}`}`(container-control-widget.tsx:217) 같은 고정 id가 문서에 중복 존재해 Label htmlFor가 숨겨진 쪽 입력을 가리킬 수 있다, (4) 폼 입력·선택 상태가 두 트리에서 따로 유지되어 리사이즈 시 입력이 사라진 것처럼 보인다.
- 조치: children을 렌더하는 main을 하나로 통일한다. 사이드바를 데스크톱 고정 + 모바일 오버레이로 나누되(aside 하나, 드로어는 같은 nav를 조건부 위치로), main은 grid의 두 번째 셀 하나만 두고 모바일 헤더는 main 위에 sticky로 얹는다. shadcn `Sidebar`(SidebarProvider/Sidebar/SidebarInset) 도입 시 이 구조가 기본으로 해결된다.

#### [critical] 변경 후 window.location.reload() 14곳 — 선택·스크롤·폼 상태가 전부 초기화된다

- 근거: `apps/web/src/widgets/container/container-control-widget.tsx:256,286, apps/web/src/widgets/infrastructure/infrastructure-widget.tsx:175,189,292,306, apps/web/src/widgets/nginx/nginx-config-widget.tsx:82, apps/web/src/widgets/nginx/nginx-route-control-widget.tsx:64,77, apps/web/src/widgets/user/user-widget.tsx:100, apps/web/src/widgets/container/container-create-widget.tsx:88, apps/web/src/widgets/backup/backup-widget.tsx:73`
- 내용: 컨테이너 start/stop/restart, 네트워크·볼륨 생성/삭제, nginx apply, 사용자 역할 변경 등이 성공하면 mutation 결과를 쓰지 않고 페이지를 통째로 새로고침한다. MasterDetail 선택 id는 useState(use-master-detail-selection.ts:11)이므로 새로고침 시 항상 목록 첫 항목으로 되돌아간다 — 20번째 컨테이너를 재시작하면 1번 컨테이너 상세로 튕긴다. backup은 `setTimeout(() => window.location.reload(), 800)`(backup-widget.tsx:73)로 800ms 뒤 예고 없이 화면이 날아간다. 또한 새로고침 사이 로딩 표시가 없어(loading.tsx 부재) 사용자는 클릭이 먹었는지 알 수 없다.
- 조치: reload를 제거하고 각 mutation의 onSuccess에서 `queryClient.invalidateQueries({ queryKey: QUERY_KEY.<DOMAIN>.ALL })`로 대체한다(entities/*.query.ts 훅 안에서). 서버 데이터가 페이지 props로만 내려오는 위젯은 해당 목록을 queryOptions로 승격해 위젯이 useQuery로 소비하게 하고, 페이지는 prefetch만 담당한다.

#### [high] toast 시스템 부재 — 성공 피드백이 위젯마다 다르고 일부는 아예 없다

- 근거: `apps/web/package.json:12-33, apps/web/src/widgets/backup/backup-widget.tsx:89, apps/web/src/widgets/prune/prune-widget.tsx:135, apps/web/src/widgets/registry/registry-widget.tsx:100, apps/web/src/widgets/image/image-widget.tsx:91-102, apps/web/src/widgets/api-key/api-key-widget.tsx:79-91`
- 내용: package.json에 sonner 등 toast 의존성이 없고 코드 전역에 toast 호출이 0건이다. 그 결과 성공 표현이 (a) InlineAlert tone=notice(backup:89), (b) `started` 불리언 + `text-xs text-emerald-700` 생텍스트(prune:135, registry:100), (c) 아무 피드백 없음(image 삭제 remove:91-102, api-key revoke:79-91 — 목록에서 항목이 조용히 사라지거나 badge만 바뀜)로 갈린다. 특히 상세 패널 하단에서 삭제를 실행했는데 에러/성공 알림은 섹션 최상단(InlineAlert의 `mx-3 mb-3`, inline-alert.tsx:19)에 렌더되어 스크롤 밖이라 보이지 않는다.
- 조치: shadcn `sonner` Toaster를 app layout에 추가하고, 모든 mutation 성공/실패 피드백을 toast로 일원화한다. 폼 내부 검증 오류처럼 위치가 중요한 것만 InlineAlert(→ shadcn Alert)로 남기고, 지금처럼 섹션 상단에 붙는 전역 에러는 toast로 옮긴다.

#### [high] 로딩 상태가 사실상 없음 — loading.tsx/Skeleton 0건, 페이지 전환 시 빈 화면

- 근거: `apps/web/src/app/[locale]: loading.tsx·error.tsx 파일 없음, apps/web/src/widgets/engine/engine-info.tsx:51-56, apps/web/src/app/[locale]/(panel)/page.tsx:27-39`
- 내용: app 라우트 전체에 loading.tsx·error.tsx·Suspense가 하나도 없다. 대시보드 페이지는 `await Promise.all([getApiHealth, getEngineDashboard, getTrafficSummary, getTrafficAnalytics, getNginxStatus])`(page.tsx:27-39)로 5개 요청이 전부 끝나야 렌더되므로, 엔진이 느리면 네비게이션 클릭 후 이전 화면에 그대로 머문다(사이드바 하이라이트도 안 바뀜). 스켈레톤은 engine-info의 3줄 pulse(engine-info.tsx:51-56)가 유일하다. 데이터 fetch 실패 시에도 `.catch(() => undefined)`로 삼켜 상태 카드가 '—'만 표시되고(overview-widget.tsx:35-44) 왜 실패했는지 알 수 없다.
- 조치: 각 (panel) 라우트에 loading.tsx를 추가하고 shadcn `Skeleton`으로 PageHeader+WidgetSection 골격을 그린다. 대시보드는 상태 카드와 트래픽 위젯을 각각 Suspense 경계로 분리해 빠른 것부터 스트리밍한다. catch로 삼킨 실패는 undefined 대신 '연결 실패' 상태로 구분해 Alert/배지로 표시한다.

#### [high] 위험 작업 확인 플로우: 다이얼로그 없이 인라인 자유입력 + 라벨이 정답을 그대로 노출

- 근거: `apps/web/src/widgets/container/container-control-widget.tsx:204-227, apps/web/src/widgets/image/image-widget.tsx:55-78, apps/web/src/widgets/infrastructure/infrastructure-widget.tsx:75-94,127-150, apps/web/src/widgets/notification/notification-widget.tsx:219-233`
- 내용: 삭제 확인이 상세 패널 맨 아래 인라인 폼으로 들어가 있고, 라벨이 `{labels.removeConfirmation}: {name}`(container-control-widget.tsx:214-216) 형태로 입력해야 할 문자열을 바로 위에 노출한다 — 확인 절차가 복붙 의식으로 전락해 오삭제 방지 효과가 없다. 삭제 버튼은 입력값과 무관하게 항상 활성(disabled는 busy만, :223)이라 틀리게 입력하면 서버 400을 받고서야 실패 메시지를 본다(prune만 `confirmation !== CONFIRMATION`으로 버튼을 잠근다, prune-widget.tsx:130). 무엇이 함께 사라지는지(볼륨/네트워크 종속 컨테이너 등) 설명도 없다.
- 조치: shadcn `AlertDialog`를 도입해 위험 작업을 모달로 승격한다: 제목에 대상 이름, 본문에 영향 범위(연결된 컨테이너 수 등), 확인 입력은 라벨에 정답을 쓰지 말고 placeholder/설명으로 분리, 확인 문자열이 정확히 일치할 때만 확인 버튼 활성화. 목록/상세 본문에서 삭제 폼을 걷어낸다.

#### [high] 백업 화면: 하나의 확인 입력으로 restore와 remove를 동급 버튼 두 개로 제출

- 근거: `apps/web/src/widgets/backup/backup-widget.tsx:129-148`
- 내용: 같은 form 안에 `<Input name="confirmation">` 하나를 두고 `<Button name="operation" value="restore">`와 `<Button name="operation" value="remove">`를 `flex gap-px`로 나란히 둔다(:140-147). 둘 다 `variant="default"`라 시각적 위계가 동일하고, 두 작업의 파괴 성격(복원 = 현재 상태 덮어쓰기 / 삭제 = 백업 소멸)이 전혀 구분되지 않는다. 게다가 restore 성공 시 800ms 후 페이지가 리로드된다(:73). Enter 키로 제출하면 어느 버튼이 선택되는지도 불분명하다.
- 조치: restore와 remove를 별도 AlertDialog로 분리하고 각각 고유 확인 문구를 요구한다. remove는 destructive 위계, restore는 secondary + 경고 문구로 구분한다. Enter 기본 제출 동작을 없애기 위해 form-per-action 구조로 바꾼다.

#### [high] 대시보드(/)와 /traffic이 동일한 TrafficWidget을 통째로 중복 렌더 — 대시보드가 세로로 길어지는 주원인

- 근거: `apps/web/src/app/[locale]/(panel)/page.tsx:79-102, apps/web/src/app/[locale]/(panel)/traffic/page.tsx:20-43`
- 내용: 두 페이지가 완전히 같은 props 집합으로 TrafficWidget을 렌더한다(라벨 목록까지 동일). 대시보드는 상태 카드 6장 + 트래픽 KPI 4장 + Top paths + status counts + 25행 라이브 테일(traffic-live-tail.tsx:20 MAX_EVENTS=25, min-w-190 테이블)까지 한 페이지에 누적되어 스크롤이 길고, 정작 /traffic으로 이동해도 같은 내용이라 이동할 이유가 없다. 대시보드의 '한 페이지 누적' 문제는 위젯을 더 얹어서가 아니라 세부 분석 화면을 요약 화면에 통째로 끼워 넣었기 때문이다.
- 조치: 대시보드는 요약 전용으로 축소한다 — 상태 카드 + 트래픽 KPI 4개 + '자세히 보기 → /traffic' 링크까지. Top paths·status counts·라이브 테일은 /traffic에만 둔다. TrafficWidget을 TrafficSummaryWidget(요약)과 TrafficAnalyticsWidget(상세)으로 분리한다.

#### [high] 사이드바가 목적지와 액션을 섞고, 21개 항목·8개 섹션을 접기·검색 없이 나열

- 근거: `apps/web/src/shared/lib/navigation.ts:20-82, apps/web/src/widgets/panel-shell/panel-shell.tsx:120-146`
- 내용: `/containers/new`(생성 폼)와 `/infrastructure/prune`(정리 실행)은 목적지가 아니라 부모 화면의 액션인데 nav 항목으로 올라와 있다(navigation.ts:32,61). 반대로 `/deployments/secrets`·`/nginx/routes`는 부모와 형제로 평면 배치되어 계층이 사라졌다. 섹션 8개가 모두 펼쳐진 상태로 고정(`mb-6` 반복, panel-shell.tsx:122)이며 접기·검색·핀 기능이 없어 owner 권한에서는 사이드바가 화면 높이를 넘어 스크롤된다(`overflow-y-auto`, :118). 섹션 제목은 `text-xs text-muted-foreground`(:123) 한 단계뿐이라 그룹 경계도 약하다.
- 조치: 생성/정리 같은 액션은 nav에서 빼고 부모 페이지 헤더의 primary 버튼으로 옮긴다(예: 컨테이너 페이지 우상단 '새 컨테이너'). 자식 라우트는 shadcn Sidebar의 SidebarMenuSub로 부모 아래 중첩한다. 섹션은 Collapsible로 접기 가능하게 하고 상단에 명령 팔레트(shadcn Command, Cmd+K)를 붙여 21개 이동을 검색으로 대체한다.

#### [high] 현재 위치 표시가 배경색뿐 — aria-current 없음, 하위 페이지에서 breadcrumb/뒤로가기 부재

- 근거: `apps/web/src/widgets/panel-shell/panel-shell.tsx:128-136,183-191, apps/web/src/shared/common/page-header.tsx:8-13`
- 내용: 활성 항목은 `active ? 'bg-foreground text-background' : 'hover:bg-muted'`(panel-shell.tsx:130-132)로만 표시하고 `aria-current="page"`가 전체 코드베이스에 0건이라 스크린리더는 현재 위치를 알 수 없다. PageHeader는 title/description 두 필드뿐(page-header.tsx:3-6)이라 `/containers/new`, `/nginx/routes`, `/deployments/secrets`, `/infrastructure/prune` 같은 2단계 페이지에서 부모로 돌아갈 링크나 breadcrumb이 없다. 게다가 getActiveItemKey는 가장 긴 href를 고르므로(:88-96) 자식 페이지에서는 부모 항목 하이라이트가 꺼져 계층 맥락이 완전히 사라진다.
- 조치: Link에 `aria-current={active ? 'page' : undefined}` 추가. PageHeader에 optional `breadcrumb`(shadcn Breadcrumb) 및 `actions` 슬롯을 추가해 하위 페이지는 부모 링크를, 목록 페이지는 primary 액션 버튼을 헤더에 노출한다.

#### [high] 커스텀 Button·MasterDetail 목록·사이드바 링크에 focus-visible 스타일이 전혀 없다

- 근거: `apps/web/src/shared/ui/button.tsx:17-26, apps/web/src/shared/common/master-detail/master-detail.tsx:37-43, apps/web/src/widgets/panel-shell/panel-shell.tsx:129-133, apps/web/src/shared/ui/input.tsx:8`
- 내용: 직접 작성한 Button은 클래스에 focus 관련 유틸이 없다(button.tsx:21 — hover:opacity-85, disabled만). MasterDetail 항목 버튼(master-detail.tsx:38-40)과 사이드바 Link(panel-shell.tsx:130)도 마찬가지다. 반면 shadcn에서 가져온 Select/Checkbox/Tabs/Switch/Accordion은 `focus-visible:ring-[3px] focus-visible:ring-ring/50`을 갖고 있어(select.tsx:31, checkbox.tsx:13, tabs.tsx:46) 같은 폼 안에서 키보드 포커스가 어떤 요소에서는 보이고 어떤 요소에서는 사라진다. Input은 `outline-none`으로 브라우저 기본 포커스를 끄고 `focus:border-foreground`만 남겼는데(input.tsx:8), border를 전면 제거하는 방향에서는 이 단서마저 사라진다.
- 조치: Button/목록 버튼/Link에 공통 focus-visible 토큰(`focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring`)을 적용한다. border 제거 방향에 맞춰 Input/Textarea의 포커스 단서를 border 대신 배경 elevation 변화(bg-foreground/[0.06]) + outline 링으로 재정의하고, shadcn 공식 Button을 도입해 focus/variant를 표준화한다.

#### [high] 폭 제한·여백이 전혀 없어 콘텐츠가 뷰포트 끝까지 늘어남 (max-w/mx-auto 0건)

- 근거: `apps/web/src/app/[locale]: max-w·mx-auto grep 결과 0건, apps/web/src/widgets/panel-shell/panel-shell.tsx:220,222, apps/web/src/shared/common/page-header.tsx:9`
- 내용: main에 padding도 max-width도 없고(panel-shell.tsx:220,222) 페이지는 곧바로 `<div className="grid gap-px">`로 시작한다(예: containers/page.tsx:24). 유일한 여백은 각 섹션 내부의 `p-3`(12px)이다. 결과적으로 2560px 모니터에서 감사 로그 테이블과 배포 폼(xl:grid-cols-4, deployment-widget.tsx:196)이 화면 폭 전체로 늘어나 한 행을 읽기 위한 시선 이동 거리가 과도해지고, 반대로 화면 가장자리에는 12px밖에 없어 '꽉 찼는데 답답한' 인상을 만든다.
- 조치: main에 `px-6 py-6`(또는 토큰화된 값)과 `max-w-[1440px] mx-auto`를 적용하고, 폼처럼 읽기 폭이 중요한 컨텐츠는 `max-w-3xl`로 한 번 더 제한한다. 밀도는 p-3 고정 대신 섹션 패딩(24px) / 카드 패딩(16px) / 리스트 행(12px) 3단계로 나눈다.

#### [high] 구분 수단이 1px 배경선(gap-px/mt-px) 하나뿐이라 섹션 경계·위계가 무너진다

- 근거: `apps/web/src/shared/common/widget-section.tsx:14, apps/web/src/shared/common/master-detail/master-detail.tsx:29,32, apps/web/src/app/[locale]/(panel)/page.tsx:59, apps/web/src/widgets/traffic/traffic-widget.tsx:78,99`
- 내용: WidgetSection은 `mt-px ... bg-card`(widget-section.tsx:14), 페이지는 `grid gap-px`(page.tsx:59), 내부 그리드도 `grid gap-px bg-background`(traffic-widget.tsx:78,99, master-detail.tsx:29,32)로 전부 1px 배경선에 의존한다. 즉 카드 사이 간격 = 1px, 섹션 사이 간격 = 1px으로 동일해서 '페이지 안의 큰 블록'과 '블록 안의 셀'이 같은 무게로 보인다. 여기에 border 제거·radius 0이 겹치면 화면 전체가 하나의 격자 덩어리로 읽힌다. 타이포 위계도 h1 text-xl(page-header.tsx:10) → h2 text-sm(widget-section.tsx:17)으로 급격히 붕괴하고 그 아래 h3/p는 다시 text-sm이라 단계가 사라진다.
- 조치: 1px 선 대신 배경 elevation 레이어로 층을 만든다: 페이지 배경(base) → 섹션(bg-foreground/[0.03]) → 내부 카드(bg-foreground/[0.05]) → hover(+0.02). 섹션 간 간격은 24~32px로 벌리고, 타이포는 h1 text-2xl / 섹션 h2 text-base font-medium / 항목 h3 text-sm / 보조 text-xs text-foreground/60 4단계로 정리한다.

#### [high] MasterDetail 목록: 검색·정렬·가상화 없음, 모바일에서 max-h-72 중첩 스크롤

- 근거: `apps/web/src/shared/common/master-detail/master-detail.tsx:29-33, apps/web/src/widgets/container/container-control-widget.tsx:326-340, apps/web/src/widgets/image/image-widget.tsx:112-125`
- 내용: 목록 컬럼은 `lg:grid-cols-[240px_minmax(0,1fr)]` 고정 240px에 `max-h-72 overflow-y-auto lg:max-h-none`(master-detail.tsx:29,31)이다. 모바일에서는 페이지 스크롤 안에 288px 높이의 내부 스크롤이 겹쳐(스크롤 축 중첩) 손가락이 어느 영역에 있느냐에 따라 다른 것이 움직인다. 데스크톱에서는 높이 제한이 풀려 컨테이너/이미지가 100개면 목록이 그대로 100행 늘어나고 검색·필터·정렬이 전혀 없어 원하는 항목을 찾으려면 눈으로 스캔해야 한다. 항목당 정보도 title/subtitle/badge 3개로 고정되어 상태별 그룹핑이 불가능하다.
- 조치: MasterDetail에 검색 input(shadcn Command 또는 Input + 필터)과 상태 필터(Select/ToggleGroup)를 props로 받아 목록 상단에 고정한다. 모바일은 내부 스크롤 대신 목록→상세 2단계 화면 전환(또는 Sheet)으로 바꿔 스크롤 중첩을 제거하고, 데스크톱 목록은 sticky 헤더 + 자체 스크롤 영역(`lg:h-[calc(100vh-…)] lg:overflow-y-auto`)으로 확정한다.

#### [high] 감사 로그·트래픽 테일 표: 정렬·페이지네이션 없음, min-w 강제로 카드 안 가로 스크롤

- 근거: `apps/web/src/widgets/audit/audit-widget.tsx:24-33,49-76, apps/web/src/features/traffic-live-tail/traffic-live-tail.tsx:60-84`
- 내용: 감사 로그는 서버가 준 전체 이벤트를 클라이언트 substring 필터로만 거른다(audit-widget.tsx:27-33) — 날짜 범위·operation·result 필터도, 페이지네이션도, 정렬도 없다. 표는 `min-w-210`(840px, :50), 트래픽 테일은 `min-w-190`(760px, traffic-live-tail.tsx:61)로 고정돼 있어 이미 240px 목록을 뺀 좁은 영역 안에서 가로 스크롤이 생긴다. thead가 sticky가 아니라 스크롤하면 컬럼 의미를 잃는다. 시간 표기는 `createdAt.replace('T',' ').replace('.000Z','Z')` 문자열 치환(audit-widget.tsx:63, traffic-live-tail.tsx:74)이라 로컬 타임존 변환이 되지 않고, 같은 앱 안의 formatDateTime(shared/lib/format-date-time.ts)과도 어긋난다.
- 조치: shadcn `Table`을 도입해 thead sticky·zebra 대신 행 hover(bg-foreground/[0.03])로 통일하고, 감사 로그는 서버측 필터(operation/result/기간)와 커서 또는 offset 페이지네이션을 붙인다. 시간 표기는 formatDateTime 하나로 통일한다. 모바일에서는 표 대신 행 카드 리스트로 전환한다.

#### [high] 상태(state) 표현이 Badge default/muted 2단계로 붕괴 — running/exited/failed가 시각적으로 동일

- 근거: `apps/web/src/shared/ui/badge.tsx:5-15, apps/web/src/widgets/container/container-control-widget.tsx:108,332, apps/web/src/widgets/job/job-widget.tsx:108, apps/web/src/widgets/user/user-widget.tsx:50, apps/web/src/widgets/deployment/deployment-widget.tsx:73-81`
- 내용: Badge는 default(bg-foreground)와 muted 두 가지뿐이라(badge.tsx:5-15) 컨테이너 state(running/exited/paused), job status, 사용자 active/disabled가 전부 같은 muted 배지로 렌더된다(container-control-widget.tsx:108,332 / job-widget.tsx:108 / user-widget.tsx:50). 유일한 예외인 배포 릴리스는 하드코딩 색(`bg-emerald-950`/`bg-red-950`/`bg-amber-950`, deployment-widget.tsx:73-81)을 써서 나머지와 톤이 어긋난다. 결과적으로 목록에서 '멈춘 컨테이너'와 '돌아가는 컨테이너'를 배지로 구분할 수 없다.
- 조치: 모노톤 안에서 상태를 인코딩하는 규칙을 정한다: 상태 점(dot) + 텍스트 조합으로, 정상=foreground 100% 채움, 진행중=펄스 애니메이션, 경고/실패=foreground 텍스트 + bg-foreground/[0.08] 강조 + 아이콘(AlertTriangle/XCircle). 색은 destructive 토큰 한 곳만 예외 허용하고 emerald/amber/red-950 하드코딩은 전부 제거한다. Badge에 status variant를 추가해 도메인 위젯이 문자열 매핑으로 쓰게 한다.

#### [medium] 파괴적 버튼이 하드코딩 red 클래스로 흩어져 있고 destructive variant는 거의 안 쓰인다

- 근거: `apps/web/src/widgets/container/container-control-widget.tsx:223,151, apps/web/src/widgets/infrastructure/infrastructure-widget.tsx:90,146,200,317, apps/web/src/widgets/image/image-widget.tsx:74, apps/web/src/widgets/job/job-widget.tsx:63, apps/web/src/shared/ui/inline-alert.tsx:12-15, apps/web/src/shared/ui/button.tsx:10-15`
- 내용: Button에 destructive variant가 정의돼 있는데(button.tsx:12) 실제 삭제 버튼들은 `variant="default"` + `className="bg-red-700 text-white"`로 덮어쓴다(container-control-widget.tsx:223, infrastructure-widget.tsx:90,146). image 삭제는 아예 색 없이 default라(image-widget.tsx:74) 저장 버튼과 구분되지 않는다. 에러 표시도 InlineAlert(bg-red-950, inline-alert.tsx:12)와 raw `<p className="bg-red-950 ...">`(infrastructure-widget.tsx:200,317, container-create-widget.tsx:57)와 `text-red-700`(prune-widget.tsx:137)이 혼재한다. 유지보수뿐 아니라 사용자 입장에서 '이 버튼이 위험한가'가 화면마다 다르게 읽힌다.
- 조치: 파괴 액션은 반드시 `variant="destructive"`만 쓰고 className 색 오버라이드를 금지한다. 모노톤 방향에 맞춰 destructive를 채도 낮은 단일 토큰으로 재정의하고, 에러 표시는 shadcn Alert(variant=destructive) 하나로 통일해 InlineAlert의 red-950/green-950/amber-950 하드코딩을 걷어낸다.

#### [medium] 컨테이너 상세에서 같은 에러가 두 번, 다른 스타일로 렌더된다

- 근거: `apps/web/src/widgets/container/container-control-widget.tsx:320-324,150-154,351`
- 내용: 위젯 최상단에서 `error`를 InlineAlert로 그리고(:320-324), 동일한 `error` 문자열을 ContainerDetailCard에 prop으로 넘겨(:351) 카드 안에서 `<p className="bg-red-950 p-3 text-sm text-red-100" role="alert">`로 한 번 더 그린다(:150-154). 액션 실패 시 같은 메시지가 화면 위아래에 서로 다른 모양으로 두 번 뜨고, role="alert"도 두 번 발화되어 스크린리더가 중복 낭독한다.
- 조치: 에러 표현 지점을 한 곳으로 정한다 — 전역/작업 단위 실패는 toast, 폼 단위 실패는 해당 폼 하단 Alert. ContainerDetailCard의 error prop을 제거한다.

#### [medium] 폼 검증 피드백이 없다 — 필드 단위 오류·aria-invalid·설명 텍스트 부재

- 근거: `apps/web/src/widgets/deployment/deployment-widget.tsx:195-285, apps/web/src/widgets/container/container-create-widget.tsx:96-174, apps/web/src/widgets/api-key/api-key-widget.tsx:107-152`
- 내용: 모든 폼이 FormData + native `required`만 쓰고, 서버 오류는 폼 밖 단일 알림으로만 표시된다(deployment-widget.tsx:150 → :189). 어느 필드가 잘못됐는지 표시하는 `aria-invalid`/`aria-describedby`/필드 하단 오류 메시지가 코드베이스에 0건이다. 배포 매니페스트 폼은 라벨만 있는 14개 입력이 `xl:grid-cols-4` 한 덩어리로 나열되고(:196) 그룹 소제목이 없어 '라우팅/리소스/롤아웃/시크릿'이 뒤섞인다. 단위 변환이 숨어 있는 필드(memoryMiB→bytes :128, cpu→nanoCpus :130)에 도움말이 없고, secretBindings는 `KEY=path` 형식 규칙을 placeholder에만 의존한다(:279).
- 조치: shadcn `Form`(react-hook-form + zodResolver) + FormField/FormDescription/FormMessage를 도입해 필드 단위 오류·설명을 표준화한다. contracts의 zod 스키마를 그대로 resolver에 재사용하면 서버와 동일 규칙이 된다. 배포 폼은 fieldset+legend(또는 Accordion)로 라우팅/리소스/롤아웃/시크릿 4그룹으로 나눈다.

#### [medium] 비활성 버튼의 이유를 알려주지 않는다 (Tooltip 컴포넌트가 있는데 미사용)

- 근거: `apps/web/src/widgets/user/user-widget.tsx:40,61,74-84, apps/web/src/widgets/deployment/deployment-widget.tsx:322-348,282, apps/web/src/widgets/container/container-create-widget.tsx:171, apps/web/src/shared/ui/tooltip.tsx`
- 내용: user-widget은 `immutable = user.role === 'owner' || user.id === currentUserId`일 때 역할 Select와 두 버튼을 모두 비활성화하지만(:40,61,74,80) 왜 안 되는지 설명이 없다 — 자기 자신을 못 바꾸는 건지 owner라 못 바꾸는 건지 사용자는 알 수 없다. 배포 버튼은 `hasActiveDeployment`(:322-326)로 잠기고 생성 버튼은 `images.length === 0`(:282, container-create-widget.tsx:171)로 잠기는데 역시 무음이다. shared/ui/tooltip.tsx는 존재하지만 위젯 어디에서도 import되지 않는다.
- 조치: 비활성 컨트롤은 Tooltip으로 사유를 노출한다(비활성 요소는 포인터 이벤트가 없으므로 wrapper span에 tabIndex/aria-describedby를 붙인다). images가 0건일 때는 버튼 비활성 대신 '이미지를 먼저 pull 하세요 → /registry' 링크가 있는 empty state를 보여준다.

#### [medium] 빈 상태가 회색 문장 한 줄 — 다음 행동으로 이어지는 CTA가 없다

- 근거: `apps/web/src/widgets/container/container-control-widget.tsx:325, apps/web/src/widgets/image/image-widget.tsx:111, apps/web/src/widgets/infrastructure/infrastructure-widget.tsx:243,339, apps/web/src/widgets/backup/backup-widget.tsx:105, apps/web/src/widgets/audit/audit-widget.tsx:47`
- 내용: 모든 빈 상태가 `<p className="p-3 text-sm text-muted-foreground">{labels.empty}</p>` 한 줄로 동일하다. 컨테이너가 0개일 때 `/containers/new`로 가는 링크가 없고, 이미지가 0개일 때 registry pull로 가는 경로가 없으며, 감사 로그 필터 결과 0건과 '데이터 자체가 없음'을 같은 문장으로 표시한다(audit-widget.tsx:47 — 필터 걸린 상태인지 구분 불가).
- 조치: EmptyState 공통 컴포넌트를 shared/common에 추가한다(아이콘 + 제목 + 1줄 설명 + primary CTA). '결과 없음(필터 때문)'과 '데이터 없음'을 구분해 전자는 '필터 초기화' 버튼을 제공한다.

#### [medium] 서버 데이터를 위젯 로컬 state로 복제해 화면 간 데이터가 어긋난다

- 근거: `apps/web/src/widgets/registry/registry-widget.tsx:44, apps/web/src/widgets/image/image-widget.tsx:84, apps/web/src/widgets/job/job-widget.tsx:38, apps/web/src/widgets/notification/notification-widget.tsx:47, apps/web/src/widgets/deployment/deployment-widget.tsx:87-89,97-109, apps/web/src/widgets/backup/backup-widget.tsx`
- 내용: 대부분의 위젯이 서버 props를 `useState(initialX)`로 복사한 뒤 mutation 결과를 setState로 직접 조작한다(registry-widget.tsx:44, image-widget.tsx:84, job-widget.tsx:38, notification-widget.tsx:47). 그래서 TanStack Query 캐시와 화면이 갈라지고, 사이드바 EngineInfo가 refetch로 갱신돼도 목록은 그대로 남는다. deployment-widget은 아예 `window.setInterval`로 2초마다 raw fetch를 돌려 setState한다(:101-108) — 탭이 백그라운드여도 계속 돌고, 이중 마운트(#1)로 2배가 되며, 로딩/실패 표시가 없다.
- 조치: 목록형 서버 데이터는 entities의 queryOptions로 승격하고 위젯은 useQuery로만 읽는다. 진행 중 릴리스 폴링은 setInterval 대신 `refetchInterval: hasActive ? 2000 : false`로 대체한다. 페이지는 prefetch + HydrationBoundary만 담당한다(현재 페이지들이 이미 setQueryData로 절반쯤 하고 있음).

#### [medium] 모바일 사이드바 드로어: 포커스 트랩·ESC·스크롤 잠금 없음, 배경이 button 요소

- 근거: `apps/web/src/widgets/panel-shell/panel-shell.tsx:168-172`
- 내용: `role="dialog" aria-modal="true"`만 붙인 수제 오버레이다(:169). 열려 있어도 뒤쪽 main의 링크·버튼에 Tab으로 접근 가능하고, Escape로 닫히지 않으며, body 스크롤이 잠기지 않아 드로어 뒤 페이지가 같이 스크롤된다. 배경 딤은 `<button aria-label={close} className="absolute inset-0 bg-black/50">`(:170)이라 스크린리더에 전면 버튼으로 노출되고, 닫은 뒤 트리거 버튼으로 포커스가 돌아가지 않는다. 딤 색도 하드코딩 `bg-black/50`이라 모노톤 토큰 밖이다.
- 조치: shadcn `Sheet`(Radix Dialog 기반)로 교체하면 포커스 트랩·ESC·스크롤 잠금·포커스 복귀가 기본 제공된다. 딤은 토큰(bg-foreground/40)으로 바꾼다.

#### [medium] MasterDetail 선택이 URL에 없어 딥링크·뒤로가기·새로고침에서 유실

- 근거: `apps/web/src/shared/common/master-detail/use-master-detail-selection.ts:10-22, apps/web/src/widgets/container/container-control-widget.tsx:237`
- 내용: 선택 id가 컴포넌트 useState라(use-master-detail-selection.ts:11) 특정 컨테이너/이미지/매니페스트 상세를 동료에게 링크로 공유할 수 없고, 브라우저 뒤로가기는 선택 이력을 인식하지 못하며, 위 #2의 reload와 겹치면 작업할 때마다 첫 항목으로 되돌아간다. 목록이 바뀌면 선택을 첫 항목으로 리셋하는 useEffect(:13-18)까지 있어, 폴링/갱신 중 사용자가 보던 상세가 임의로 바뀔 수 있다.
- 조치: 선택 id를 `?selected=<id>` searchParam으로 올린다(next/navigation useSearchParams + router.replace, scroll:false). 목록 갱신 시 선택 항목이 사라진 경우에만 리셋하고, 존재하면 유지한다.

#### [low] 상세 카드의 제목 태그가 위젯마다 h3와 p로 갈려 문서 구조가 일관되지 않는다

- 근거: `apps/web/src/widgets/container/container-control-widget.tsx:107, apps/web/src/widgets/infrastructure/infrastructure-widget.tsx:57,113, apps/web/src/widgets/deployment/deployment-widget.tsx:309, apps/web/src/widgets/notification/notification-widget.tsx:180, apps/web/src/widgets/backup/backup-widget.tsx:121, apps/web/src/widgets/image/image-widget.tsx:49`
- 내용: 같은 역할(상세 패널의 대상 이름)인데 container/network/volume은 `<h3 className="truncate text-sm font-semibold">`(container-control-widget.tsx:107, infrastructure-widget.tsx:57,113)이고 deployment/notification/backup/image는 `<p className="truncate text-sm font-semibold">`(deployment-widget.tsx:309, notification-widget.tsx:180, backup-widget.tsx:121, image-widget.tsx:49)이다. 스크린리더 헤딩 탐색으로 상세 영역에 도달할 수 있는 화면과 없는 화면이 갈린다. traffic-widget의 카드 제목은 h3(traffic-widget.tsx:101,114)이라 또 다른 층위를 만든다.
- 조치: MasterDetail에 detailTitle/detailMeta 슬롯을 만들어 h3 렌더를 컴포넌트가 책임지게 하고, 위젯은 문자열만 넘긴다. 페이지 h1 → 섹션 h2 → 상세 h3 규칙을 shared/common에서 강제한다.

#### [low] prune 화면이 디자인시스템을 우회 — raw checkbox + 인라인 색 텍스트

- 근거: `apps/web/src/widgets/prune/prune-widget.tsx:111-114,135-140`
- 내용: 다른 모든 화면이 shadcn Checkbox를 쓰는데 prune만 `<label><input type="checkbox" .../></label>` 원시 마크업이다(:111-114) — 크기·포커스링·체크 표시가 다르게 보인다. 성공은 `<p className="text-xs text-emerald-700">`, 실패는 `<p className="text-xs text-red-700" role="alert">`(:135-139)로 InlineAlert를 쓰지 않아 톤과 위치가 어긋난다. 또 확인 문구 `DELETE UNUSED RESOURCES`가 라벨에 그대로 노출되어(:126-128) #5와 같은 문제를 반복한다.
- 조치: Checkbox 컴포넌트로 교체하고 피드백은 toast(성공)/Alert(실패)로 통일한다. 실행 확인은 AlertDialog로 승격하면서 정리 대상 개수·회수 용량을 다이얼로그 본문에 요약해 보여준다.

### shadcn/ui 사용 정확성과 도입 범위

현재 `apps/web/src/shared/ui`의 13개 primitive는 두 부류로 갈린다. Radix 기반 5개(accordion, checkbox, select, switch, tabs)와 tooltip 일부는 shadcn new-york-v4 공식 소스를 거의 그대로 복사한 것이라 data-slot·cva·focus-visible ring이 정확하다(select는 공식과 `position="item-aligned"`/`align="center"` 기본값까지 일치함을 registry로 확인). 반면 button·badge·card·input·textarea·label·inline-alert 7개는 공식 소스를 쓰지 않은 자체 구현이라 cva·size·asChild(Slot)·focus-visible ring·aria-invalid가 전부 빠져 있고, 그 결과 호출부에서 `h-7 px-2 text-xs`·`bg-red-700 text-white` 같은 하드코딩 오버라이드가 20곳 이상 번지고 있다. 도입 범위 면에서는 docs/SHADCN-COMPONENTS.md가 "필수"로 분류한 Dialog, Alert Dialog, Sheet, Sidebar, Table, Skeleton, Empty, Sonner, Progress, Separator, Command, Field, Pagination, Scroll Area가 하나도 없고, 그 자리를 손으로 만든 `role="dialog"` 모달 2개, raw `<table>` 2개, `animate-pulse` 스켈레톤, 인라인 확인 폼 형태의 파괴적 작업 UI가 메우고 있다. 특히 파괴적 작업(container remove, network/volume remove, prune)이 AlertDialog 없이 화면에 상시 노출된 인라인 폼이라는 점, 모달 2곳에 포커스 트랩·ESC·포커스 복귀가 없다는 점이 사용성·접근성상 가장 큰 실질 위험이다. 목표 디자인(border 제거·radius 0·모노톤)과 관련해서는 `* { border-radius: 0 }` 전역 규칙이 복사해 온 shadcn 소스의 rounded-* 를 전부 무력화하고 있고, globals.css에 `--radius`·`--secondary`·`--sidebar-*`·`--chart-*` 토큰이 없어 Sidebar/Chart/Badge secondary를 CLI로 추가하는 순간 깨진다. radix-ui 통합 패키지 사용 자체는 현재 공식 new-york-v4와 동일한 방식이라 문제없으나, package.json에 사용되지 않는 `@radix-ui/react-slot`이 별도로 남아 있어 정리가 필요하다.

#### [critical] Button이 shadcn 공식 구현이 아니라 자체 구현 — cva·size·asChild·focus ring·aria-invalid 전부 누락

- 근거: `apps/web/src/shared/ui/button.tsx:4-26, apps/web/package.json:16`
- 내용: 공식 new-york-v4 button.tsx는 `cva`로 variant 6종(default/destructive/outline/secondary/ghost/link) + size 8종(default/xs/sm/lg/icon 계열)을 정의하고, base에 `focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50`, `aria-invalid:border-destructive`, `[&_svg:not([class*='size-'])]:size-4`, `asChild`용 `Slot.Root`를 포함한다(registry `/r/styles/new-york-v4/button.json`으로 확인). 현재 구현은 `VARIANT_CLASSES: Record<ButtonVariant, string>` 4종뿐이고 size 개념이 없으며, base 클래스가 `transition-opacity hover:opacity-85 disabled:...` 뿐이라 **키보드 포커스 링이 전혀 없다**. asChild가 없어 링크형 버튼(`Link` 래핑)도 불가능하다. `defaultVariant`가 공식(default)과 반대인 `outline`이라 CLI로 다른 shadcn 컴포넌트를 추가하면 그쪽이 기대하는 Button 기본 모양과 어긋난다.
- 조치: `apps/web/src/shared/ui/button.tsx`를 공식 new-york-v4 소스로 교체하고(레포 컨벤션에 맞춰 arrow function + `export const Button`), variant는 모노톤 목표에 맞게 outline을 border 대신 `bg-foreground/[0.03] hover:bg-foreground/[0.06]` elevation으로 재정의한다. size(`default`/`sm`/`xs`/`icon`)를 반드시 넣어 호출부의 `h-7 px-2 text-xs` 하드코딩을 `size="xs"`로 흡수시킨다. `asChild`를 위해 `import { Slot } from 'radix-ui'`를 쓰고 package.json의 `@radix-ui/react-slot`은 제거한다.

#### [critical] 파괴적 작업(remove·prune)에 AlertDialog가 없어 인라인 확인 폼이 화면에 상시 노출

- 근거: `apps/web/src/widgets/container/container-control-widget.tsx:204-226, apps/web/src/widgets/infrastructure/infrastructure-widget.tsx:77-92, apps/web/src/widgets/infrastructure/infrastructure-widget.tsx:129-148, apps/web/src/widgets/prune/prune-widget.tsx:110-133`
- 내용: docs/SHADCN-COMPONENTS.md가 Alert Dialog를 "필수 — remove, rmi, prune, rollback confirmation"으로 지정했으나 도입되지 않았다. 컨테이너 삭제는 상세 카드 하단에 이름 입력 `<Input name="confirmation">` + force `Checkbox` + `<Button className="bg-red-700 text-white">`가 항상 렌더되고(container-control-widget.tsx:204-226), network/volume 삭제(infrastructure-widget.tsx:77-92, 129-148), prune(prune-widget.tsx:118-133)도 같은 형태다. 위험 행동의 확인 절차가 모달로 격리되지 않아 (1) 실수 클릭 경로가 항상 열려 있고 (2) 위젯마다 확인 UX가 조금씩 달라 일관성이 없으며 (3) 삭제 버튼이 `variant="destructive"` 토큰 대신 `bg-red-700 text-white` 하드코딩이라 모노톤 테마와도 어긋난다.
- 조치: `bunx shadcn@latest add alert-dialog`로 `apps/web/src/shared/ui/alert-dialog.tsx`를 추가하고, 위 4개 지점을 `AlertDialog` + `AlertDialogAction`(destructive Button variant)으로 통일한다. 이름 타이핑 확인이 필요한 곳은 AlertDialogContent 안에 Field+Input을 넣고 일치 전까지 Action을 disabled 처리한다. `bg-red-700 text-white` 오버라이드는 전부 제거하고 Button의 destructive variant + `--destructive` 토큰으로 흡수한다.

#### [critical] Dialog/Sheet 없이 손으로 만든 모달 2곳 — 포커스 트랩·ESC·스크롤 락·포커스 복귀 없음

- 근거: `apps/web/src/widgets/panel-shell/panel-shell.tsx:169-171, apps/web/src/features/interactive-terminal/interactive-terminal.tsx:157-166`
- 내용: panel-shell의 모바일 내비게이션은 `<div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true">`로 직접 만들어져 있고, 오버레이가 화면 전체를 덮는 `<button aria-label={labels.close} className="absolute inset-0 bg-black/50">`이다(panel-shell.tsx:170). `aria-modal="true"`를 선언했지만 실제로 배경 포커스를 가두지 않고, ESC 닫기·body scroll lock·닫은 뒤 트리거로 포커스 복귀가 전부 없다. interactive-terminal의 풀스크린 터미널(interactive-terminal.tsx:157)도 동일하며 `bg-zinc-950 text-zinc-50`으로 테마 토큰을 벗어난 하드코딩 색을 쓴다. 즉 `aria-modal` 선언만 있고 계약을 지키지 않는 상태라 스크린리더 사용자에게는 오히려 잘못된 정보다.
- 조치: `bunx shadcn@latest add dialog sheet`로 추가한 뒤, panel-shell 모바일 내비게이션은 `Sheet`(side="left")로, interactive-terminal 풀스크린은 `Dialog` + `DialogContent className="max-w-none h-screen w-screen"`로 교체한다. 터미널의 `bg-zinc-950/text-zinc-50`은 `bg-background/text-foreground` 또는 터미널 전용 토큰으로 바꾼다. Radix가 포커스 트랩·ESC·스크롤 락을 제공하므로 수동 `role`/`aria-modal` 속성은 제거한다.

#### [high] Input·Textarea·Label·Card·Badge가 공식 소스와 불일치 — focus-visible ring / aria-invalid / Radix Label 미사용

- 근거: `apps/web/src/shared/ui/input.tsx:4-12, apps/web/src/shared/ui/textarea.tsx:4-12, apps/web/src/shared/ui/label.tsx:4-5, apps/web/src/shared/ui/card.tsx:4-5, apps/web/src/shared/ui/badge.tsx:5-21`
- 내용: registry 확인 결과 공식 input/textarea는 `focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50`, `aria-invalid:border-destructive aria-invalid:ring-destructive/20`, `disabled:cursor-not-allowed disabled:opacity-50`, `selection:bg-primary`를 포함한다. 현재 input.tsx:8은 `outline-none ... focus:border-foreground`뿐이라 (1) `focus`/`focus-visible` 구분이 없고 (2) 검증 실패 시 시각 표시가 없으며 (3) disabled 스타일이 없다. label.tsx:5는 Radix `Label` 대신 native `<label>`이라 `peer-disabled:opacity-50`·`group-data-[disabled=true]` 처리가 없고, 공식의 `flex items-center gap-2`가 없어 checkbox와 나란히 쓰는 곳에서 호출부가 `className="flex h-10 items-center gap-2 px-3"`을 매번 덧붙인다(container-control-widget.tsx:216). card.tsx는 CardHeader/CardTitle/CardDescription/CardAction/CardContent/CardFooter 6개 서브컴포넌트가 없어 위젯마다 `<p className="text-xs text-muted-foreground">` + `<p className="text-lg font-semibold">`를 직접 반복한다(traffic-widget.tsx:79-95). badge.tsx는 variant가 default/muted 2개뿐이고 공식의 secondary/destructive/outline/asChild가 없어 상태 배지가 `className="bg-red-700 text-white"`로 덮인다(job-widget.tsx:63).
- 조치: 5개 파일 모두 공식 new-york-v4 소스를 기준으로 재작성한다(arrow function·반환타입 미명시로 변환). Label은 `import { Label as LabelPrimitive } from 'radix-ui'`로 교체, Card는 서브컴포넌트 전체를 export하고 traffic-widget/prune-widget의 stat 타일은 `Card`+`CardHeader`+`CardTitle` 또는 shadcn `Item`으로 옮긴다. Badge는 cva에 `status` 계열 variant(예: neutral/attention/danger)를 모노톤 opacity 기반으로 추가해 `bg-red-700` 하드코딩을 제거한다.

#### [high] Sonner(toast) 미도입 — mutation 피드백이 InlineAlert와 즉석 <p> 마크업으로 이원화

- 근거: `apps/web/src/shared/ui/inline-alert.tsx:11-16, apps/web/src/features/interactive-terminal/interactive-terminal.tsx:154, apps/web/src/features/live-log-stream/live-log-stream.tsx:78, apps/web/src/widgets/container/container-create-widget.tsx:57, apps/web/src/widgets/infrastructure/infrastructure-widget.tsx:200, apps/web/src/widgets/infrastructure/infrastructure-widget.tsx:317, apps/web/src/features/accept-invitation-panel/accept-invitation-panel.tsx:71, apps/web/src/widgets/prune/prune-widget.tsx:134-139`
- 내용: 코드베이스 전체에 `sonner`/`toast` 문자열이 0건이다. 피드백은 `InlineAlert`(15개 파일)로 하는데, 정작 같은 의미의 마크업을 InlineAlert를 거치지 않고 직접 쓴 곳이 7곳 이상이다(`<p className="bg-red-950 p-3 text-sm text-red-100" role="alert">`). 게다가 InlineAlert의 톤 색이 `bg-red-950 text-red-100`/`bg-green-950 text-green-100`/`bg-amber-950 text-amber-100`으로 **다크 배경 고정**이라 라이트 모드에서 페이지 전체 무채색 위에 진한 색 블록이 튀고, 목표인 모노톤·opacity 위계와 정면 충돌한다. prune-widget.tsx:134-139는 또 다른 형태(`text-xs text-emerald-700` / `text-xs text-red-700`)를 쓴다.
- 조치: `bunx shadcn@latest add sonner`로 도입하고 `apps/web/src/app/[locale]/layout.tsx`에 `<Toaster />`를 1회 마운트한다. 정리 방향: (1) mutation 성공/실패처럼 **일시적**인 피드백은 전부 `toast.success/toast.error`로 이관 — 위 7곳 즉석 `<p>`와 각 위젯의 error InlineAlert가 대상. (2) 폼 필드 검증·권한 없음·오프라인처럼 **지속적 상태**는 shadcn 공식 `Alert`로 교체하고 `InlineAlert`는 삭제한다. (3) Alert 톤은 하드코딩 색 대신 `bg-foreground/[0.04]` + `text-destructive`/`text-foreground/70` 형태의 모노톤+포인트 컬러로 재정의한다.

#### [high] Table 미도입 — raw <table>로 감사 로그·트래픽 테일 구현, 정렬·페이지네이션 없음

- 근거: `apps/web/src/widgets/audit/audit-widget.tsx:50-77, apps/web/src/features/traffic-live-tail/traffic-live-tail.tsx:61-73`
- 내용: docs/SHADCN-COMPONENTS.md가 Table·Data Table·Pagination을 "필수(containers, images, jobs, audit, routes)"로 지정했으나 미도입이다. audit-widget.tsx:50은 `<table className="w-full min-w-210 text-left text-xs">`에 `<th className="p-2 font-medium">`, `<tr className="border-t border-background">`를 직접 반복하고, traffic-live-tail.tsx:61-73도 동일한 마크업을 별도로 복제한다. 두 곳 모두 정렬·컬럼 표시 토글·페이지네이션이 없고, audit는 클라이언트 `filter` 문자열 검색만 있다(audit-widget.tsx:44). row 구분이 `border-t`라 border 전면 제거 방향과도 충돌한다.
- 조치: `bunx shadcn@latest add table pagination`으로 `apps/web/src/shared/ui/table.tsx`를 추가하고 위 2곳을 `Table/TableHeader/TableRow/TableCell`로 교체한다. row 구분은 `[&_tr]:border-0` 후 `odd:bg-foreground/[0.02]` 또는 `hover:bg-foreground/[0.03]` elevation으로 대체한다. audit·jobs·images처럼 목록이 커지는 화면은 TanStack Table 기반 Data Table + `Pagination`으로 올린다.

#### [high] Skeleton·Empty·Spinner 미도입 — 로딩/빈 상태 마크업이 위젯마다 복제

- 근거: `apps/web/src/widgets/engine/engine-info.tsx:52-56, apps/web/src/widgets/audit/audit-widget.tsx:47, apps/web/src/widgets/api-key/api-key-widget.tsx:153, apps/web/src/widgets/image/image-widget.tsx:111, apps/web/src/widgets/job/job-widget.tsx:100, apps/web/src/widgets/artifact/artifact-widget.tsx:230`
- 내용: 로딩 스켈레톤은 engine-info.tsx:53-55에서 `<div className="h-4 animate-pulse rounded-sm bg-muted" />`를 3줄 복붙한 것이 유일하고, 나머지 쿼리 위젯에는 로딩 표현이 아예 없다(`data === undefined`면 빈 화면). 빈 상태는 `<p className="p-3 text-sm text-muted-foreground">{labels.empty}</p>` 형태가 14개 위젯에 그대로 복제되어 있어, 아이콘·설명·복구 액션이 없는 최소 표현으로 고정돼 있다. `Spinner`도 없어 새로고침 표시는 `RefreshCw className={`size-3 ${refreshing ? 'animate-spin' : ''}`}`로 템플릿 리터럴 조립이다(engine-info.tsx:48 — `cn()` 미사용).
- 조치: `bunx shadcn@latest add skeleton empty spinner`를 추가한다. engine-info의 3줄은 `Skeleton`으로, 14곳 empty 문단은 `Empty`+`EmptyMedia`+`EmptyTitle`+`EmptyDescription`(+필요 시 액션 Button)로 통일하고, `WidgetSection`이 `emptyState` prop을 받도록 해 중복을 한 곳으로 모은다. engine-info.tsx:48의 템플릿 리터럴 className은 `cn()`으로 바꾸고 새로고침 표시는 `Spinner`로 교체한다.

#### [high] Sidebar·ScrollArea 미도입 — panel-shell이 데스크톱/모바일 내비게이션 마크업을 통째로 2벌 복제

- 근거: `apps/web/src/widgets/panel-shell/panel-shell.tsx:123-148, apps/web/src/widgets/panel-shell/panel-shell.tsx:186-218`
- 내용: 동일한 섹션 순회·활성 상태 판정·EngineInfo·세션 정보·LogoutButton 블록이 데스크톱 `<aside>`(123-148행)와 모바일 오버레이(186-218행)에 완전히 중복 작성돼 있다. 활성 항목 스타일(`active ? 'bg-foreground text-background' : 'hover:bg-muted'`)도 두 곳에 각각 하드코딩된 템플릿 리터럴이라 한쪽만 고칠 위험이 크다. docs/SHADCN-COMPONENTS.md는 전체 셸을 Sidebar+Sheet+Scroll Area 조합으로 지정했다.
- 조치: `bunx shadcn@latest add sidebar scroll-area`를 도입해 `SidebarProvider`/`Sidebar`/`SidebarGroup`/`SidebarMenuButton`(isActive prop)으로 단일 정의를 만들고, 모바일은 Sidebar가 내장한 Sheet 모드를 쓴다. 그러면 169-218행 오버레이 전체가 삭제된다. 단 Sidebar는 `--sidebar-foreground`/`--sidebar-accent`/`--sidebar-border` 등 토큰을 요구하므로 아래 토큰 누락 항목을 먼저 해결해야 한다.

#### [high] globals.css에 shadcn 표준 토큰(--radius, --secondary, --sidebar-_, --chart-_) 누락

- 근거: `apps/web/src/app/globals.css:5-24, apps/web/src/app/globals.css:26-45, apps/web/components.json:6-11`
- 내용: `:root`에 정의된 토큰은 background/card/foreground/muted/sidebar/primary/border/input/ring/accent/popover/destructive 계열뿐이다. `--radius`가 없고, `--secondary`/`--secondary-foreground`가 없어 공식 Badge·Button의 `secondary` variant가 무색으로 렌더된다. `--sidebar`는 있으나 Sidebar 컴포넌트가 요구하는 `--sidebar-foreground`/`--sidebar-primary`/`--sidebar-accent`/`--sidebar-border`/`--sidebar-ring`이 없고, Chart가 요구하는 `--chart-1..5`도 없다. components.json은 `"cssVariables": true`이므로 CLI가 추가하는 컴포넌트는 이 토큰들을 전제로 클래스를 뱉는다 → Sidebar/Chart/Combobox를 추가하는 순간 스타일이 조용히 깨진다.
- 조치: `apps/web/src/app/globals.css`의 `:root`와 dark 블록, 그리고 `@theme inline`에 `--secondary`, `--secondary-foreground`, `--sidebar-foreground|primary|primary-foreground|accent|accent-foreground|border|ring`, `--chart-1`~`--chart-5`, `--radius(=0rem)`를 모노톤 oklch 값으로 추가한다. chart 계열은 색상 대신 명도 단계(oklch L만 변화)로 정의해 모노톤 방향을 유지한다.

#### [medium] `* { border-radius: 0 }` 전역 override가 shadcn 소스의 rounded-* 를 무력화 — 죽은 클래스와 향후 CLI 산출물 오염

- 근거: `apps/web/src/app/globals.css:69-71, apps/web/src/shared/ui/select.tsx:54, apps/web/src/shared/ui/switch.tsx:19, apps/web/src/shared/ui/checkbox.tsx:13`
- 내용: globals.css:69의 `* { border-radius: 0; }`는 radius 0 목표와는 일치하지만, 복사해 온 shadcn 소스에 남아 있는 `rounded-md`(select.tsx:54), `rounded-full`(switch.tsx:19), `rounded-[4px]`(checkbox.tsx:13), `rounded-lg`(tabs.tsx:20) 등이 전부 사문화된 클래스로 남는다. 더 큰 문제는 Switch 같은 토글이 radius 0이 되면 형태 인지가 무너진다는 점(캡슐 형태가 토글의 어포던스)과, 앞으로 CLI로 추가할 모든 컴포넌트가 같은 상태로 들어온다는 점이다. 또 `*` 셀렉터는 xterm 등 서드파티 DOM에도 적용된다.
- 조치: `* { border-radius: 0 }` 전역 규칙 대신 `--radius: 0rem` 토큰 + `@theme inline`의 `--radius-sm/md/lg/xl` 파생으로 제어하고, 컴포넌트 소스의 `rounded-*`는 공식 그대로 두어 CLI 재생성/업데이트 시 diff가 나지 않게 한다. Switch·Checkbox 인디케이터처럼 형태가 의미를 갖는 요소는 예외 허용 여부를 먼저 결정한다.

#### [medium] Separator 미도입 — border 전면 제거 목표와 정면 충돌하는 `border-t border-background` 20곳 이상

- 근거: `apps/web/src/widgets/api-key/api-key-widget.tsx:108, apps/web/src/widgets/notification/notification-widget.tsx:130, apps/web/src/widgets/nginx/nginx-config-widget.tsx:329, apps/web/src/widgets/deployment/deployment-widget.tsx:196, apps/web/src/widgets/panel-shell/panel-shell.tsx:152, apps/web/src/features/live-log-stream/live-log-stream.tsx:70`
- 내용: 섹션 구분이 전부 `border-t border-background`(또는 `border-t border-muted`) 하드코딩이며 20곳 이상에서 반복된다. 목표 디자인은 border 전면 제거 후 배경 elevation·간격·타이포 위계로만 구분하는 것이므로 이 클래스들은 전수 제거 대상이다. 동시에 docs/SHADCN-COMPONENTS.md는 Separator를 "조건부 — 배경 분리로 부족한 overlay·menu 내부에서만"으로 이미 못박아 두었는데, 현재는 그 반대로 본문 전역에 border가 깔려 있다.
- 조치: `border-t border-*` 20여 곳을 전수 제거하고 `gap`/`py` 증가 + `bg-foreground/[0.03]` 서브서피스로 대체한다. 오버레이(DropdownMenu/Select/Command) 내부 그룹 분리에만 `bunx shadcn@latest add separator`로 도입한 `Separator`를 쓰고, 그 스타일은 `bg-foreground/10 h-px` 수준으로 낮춘다. `WidgetSection`(shared/common/widget-section.tsx)에 섹션 내 구분용 slot을 두어 위젯이 직접 border 클래스를 쓰지 않게 막는다.

#### [medium] Tooltip이 공식과 구조 불일치 — data-slot 없음, Arrow 없음, Provider를 컴포넌트마다 중복 마운트

- 근거: `apps/web/src/shared/ui/tooltip.tsx:8-26, apps/web/src/widgets/nginx/nginx-directive-editor.tsx:29-34, apps/web/src/widgets/nginx/nginx-upstream-editor.tsx:30-35`
- 내용: registry의 공식 tooltip.tsx는 Provider/Root/Trigger 각각을 래핑해 `data-slot="tooltip-provider|tooltip|tooltip-trigger"`를 부여하고 `delayDuration = 0` 기본값, `sideOffset = 0`, `origin-(--radix-tooltip-content-transform-origin)`, `TooltipPrimitive.Arrow`를 포함한다. 현재 tooltip.tsx:8-12는 `const TooltipProvider = TooltipPrimitive.Provider` 형태의 bare 재export라 data-slot이 전혀 붙지 않고, Content(14-26행)에는 Arrow와 transform-origin이 없으며 `sideOffset=4`로 다르다. 더 중요한 건 사용처가 `TooltipProvider`를 각 tooltip 인스턴스마다 감싸고 있다는 점(nginx-directive-editor.tsx:29, nginx-upstream-editor.tsx:30)으로, provider가 리스트 항목 수만큼 생성되어 `skipDelayDuration`(연속 hover 시 즉시 표시) 그룹 동작이 무력화된다.
- 조치: tooltip.tsx를 공식 소스로 교체(래퍼 함수 + data-slot + Arrow + delayDuration 0)하고, `TooltipProvider`는 `apps/web/src/app/[locale]/layout.tsx` 루트에 1회만 마운트한 뒤 nginx-directive-editor·nginx-upstream-editor의 지역 Provider는 제거한다. 배경은 모노톤 목표에 맞게 공식의 `bg-foreground text-background`를 그대로 쓰면 된다.

#### [medium] Progress 미도입 — 업로드 진행률을 손으로 만든 role="progressbar" div로 구현

- 근거: `apps/web/src/widgets/artifact/artifact-widget.tsx:210-226`
- 내용: artifact 업로드 진행률이 `role="progressbar"` + `aria-valuemin/max/now`를 직접 지정한 `<div>`와 `style={{ width: `${progress}%` }}` 내부 div로 구현돼 있다. aria는 갖췄지만 Radix Progress의 `data-state`/`data-value` 기반 스타일 훅이 없어 다른 진행 표시(pull/build/deployment)를 추가할 때 재사용이 불가능하다. docs/SHADCN-COMPONENTS.md는 Progress를 "필수 — upload, pull, load, build, deployment"로 지정했다.
- 조치: `bunx shadcn@latest add progress`로 추가하고 artifact-widget.tsx:210-226을 `<Progress value={progress} />`로 교체한다. 트랙은 `bg-foreground/[0.08]`, 인디케이터는 `bg-foreground`로 모노톤 유지. 이후 deployment·image pull 진행 표시도 동일 컴포넌트를 쓴다.

#### [medium] prune-widget이 Checkbox primitive 대신 native input[type=checkbox] 사용

- 근거: `apps/web/src/widgets/prune/prune-widget.tsx:110-113`
- 내용: `<label className="flex items-center gap-2 text-xs"><input checked={includeVolumes} onChange={...} type="checkbox" />` 형태로 브라우저 기본 체크박스를 그대로 쓴다. 같은 레포의 다른 9개 위젯은 `@shared/ui/checkbox`를 쓰므로(api-key-widget, container-control-widget, image-widget 등) 가장 위험한 화면(prune)만 시각적으로 이질적이고, OS 기본 파란 accent color가 들어와 모노톤 테마를 깬다. `<label>`도 shared Label이 아닌 native다. docs/SHADCN-COMPONENTS.md §4는 "자체 checkbox를 만들지 않는다"고 명시했다.
- 조치: prune-widget.tsx:110-113을 `<Label htmlFor="prune-include-volumes"><Checkbox id="prune-include-volumes" checked={includeVolumes} onCheckedChange={(checked) => setIncludeVolumes(checked === true)} />{labels.includeVolumes}</Label>`로 교체한다(container-control-widget.tsx:216-219과 동일 패턴).

#### [medium] Switch primitive가 도입만 되고 사용처 0 — boolean 토글이 전부 Checkbox

- 근거: `apps/web/src/shared/ui/switch.tsx:8-31, apps/web/src/widgets/nginx/nginx-route-control-widget.tsx, apps/web/src/widgets/notification/notification-widget.tsx`
- 내용: `@shared/ui/switch` import가 코드베이스 전체에 0건이다(grep `@shared/ui/switch` → shared/ui/switch.tsx 자신 외 무결과). 반면 Checkbox는 9개 위젯에서 쓰이는데, 그중 route enabled·notification enabled·auto-start 같은 "즉시 반영되는 on/off 설정"은 shadcn 가이드상 Switch가 맞는 의미론이다(Checkbox는 폼 제출 전 선택). docs/SHADCN-COMPONENTS.md도 Switch를 "enabled, auto-start, route toggle"로 지정했다. 현재는 컴포넌트가 dead code이면서 동시에 의미론이 잘못 매핑된 상태다.
- 조치: nginx route enabled 토글·notification destination enabled·컨테이너 auto-start 등 즉시 반영 설정을 `Switch`로 교체하고, bulk selection·force 옵션처럼 제출 전 선택은 `Checkbox`로 유지한다. 교체 대상이 없다고 판단되면 switch.tsx를 삭제해 dead code를 남기지 않는다.

#### [medium] Button size variant 부재로 `h-7 px-2 text-xs` 하드코딩이 10곳 이상 확산

- 근거: `apps/web/src/features/traffic-export/traffic-export.tsx:41, apps/web/src/features/traffic-export/traffic-export.tsx:44, apps/web/src/widgets/nginx/nginx-global-editor.tsx:32, apps/web/src/widgets/nginx/nginx-global-editor.tsx:92, apps/web/src/widgets/nginx/nginx-upstream-editor.tsx:176, apps/web/src/widgets/nginx/nginx-upstream-editor.tsx:198, apps/web/src/widgets/nginx/nginx-directive-editor.tsx:70`
- 내용: 공식 Button에 있는 `size: xs/sm/lg/icon`이 없어서 작은 버튼이 필요한 모든 곳이 `className="h-7 px-2 text-xs"`를 복붙한다. 최소 10곳이며 nginx 편집기 계열에 집중돼 있다. 값이 h-7(28px)로 공식 xs(h-6)·sm(h-8) 어느 쪽과도 다르고, 아이콘 전용 버튼(`icon` size)도 없어 `<Button>` 안에 아이콘만 넣는 경우 좌우 패딩이 어색해진다.
- 조치: Button을 공식 cva 기반으로 교체하면서 `size` prop을 도입하고(default/sm/xs/icon/icon-sm), 위 10여 곳을 `size="xs"`로 치환한다. 치환 후 `h-7 px-2 text-xs` 문자열이 0건인지 grep으로 검증한다.

#### [medium] Command·Combobox·DropdownMenu 미도입 — 22개 내비게이션 항목에 검색 진입점 없음, 행 보조 액션도 없음

- 근거: `apps/web/src/widgets/panel-shell/panel-shell.tsx:126-147, apps/web/src/widgets/container/container-control-widget.tsx:155-165, apps/web/src/shared/lib/navigation.ts`
- 내용: 코드베이스에 `role="menu"`/`aria-haspopup`/`role="listbox"` 사용이 0건이다(Radix Select 내부 제외). 내비게이션은 섹션별 링크 나열뿐이라 항목이 20개를 넘는데 검색·퀵점프가 없고, 컨테이너 상세의 start/stop/restart/pause/unpause/inspect/exec/remove 액션이 전부 버튼으로 평면 나열돼 시각적 무게가 균등하다. docs/SHADCN-COMPONENTS.md는 Command를 "필수 — command palette와 resource quick jump", Dropdown Menu를 "필수 — secondary row·resource actions"로 지정했다.
- 조치: `bunx shadcn@latest add command dropdown-menu`를 추가한다. Command는 `apps/web/src/widgets/panel-shell/panel-shell.tsx`에 Cmd+K 팔레트로 붙여 navigation.ts의 섹션·항목을 소스로 쓰고, DropdownMenu는 container-control-widget·image-widget·deployment-widget의 보조 액션(inspect/exec/remove)을 primary 액션(start/stop)과 분리하는 데 쓴다. 이미지/컨테이너/호스트 선택 입력은 Combobox로 올린다.

#### [medium] Field(Form) 미도입 — 필드 단위 검증 표시·aria-describedby 없이 위젯 상단 단일 에러로 뭉침

- 근거: `apps/web/src/widgets/api-key/api-key-widget.tsx:96-98, apps/web/src/widgets/notification/notification-widget.tsx:124-128, apps/web/src/widgets/registry/registry-widget.tsx:153, apps/web/src/widgets/container/container-control-widget.tsx:212-215`
- 내용: 폼이 전부 native `<form onSubmit>` + `new FormData(event.currentTarget)` 방식이고(container-control-widget.tsx:209-212 등), 검증 실패는 위젯 상단 `InlineAlert` 하나로 표시된다. 어떤 필드가 문제인지 연결하는 `aria-invalid`/`aria-describedby`가 없고, Input/Textarea primitive 자체에도 `aria-invalid:` 스타일이 없어(위 항목 참조) 시각·보조기술 양쪽에서 필드 단위 오류 표현이 불가능하다. docs/SHADCN-COMPONENTS.md는 Field를 "필수 — form label, help, validation"으로 지정했다.
- 조치: `bunx shadcn@latest add field`(및 필요 시 form)로 추가하고 api-key/notification/registry/container 생성 폼을 `Field`+`FieldLabel`+`FieldDescription`+`FieldError` 구조로 옮긴다. Input/Textarea를 공식 소스로 교체해 `aria-invalid` 스타일 훅을 먼저 확보한 뒤 진행한다.

#### [medium] 사용되지 않는 @radix-ui/react-slot 의존성 — radix-ui 통합 패키지와 이중 설치

- 근거: `apps/web/package.json:16, apps/web/package.json:29, apps/web/src/shared/ui/button.tsx:1-2`
- 내용: package.json에 `@radix-ui/react-slot: 1.3.3`과 `radix-ui: ^1.6.7`이 둘 다 있는데, `Slot` 심볼 사용처가 코드베이스에 0건이다(grep `Slot` 무결과). 현재 primitive들은 전부 `import { X as XPrimitive } from 'radix-ui'` 방식이고, registry로 확인한 결과 **공식 new-york-v4도 동일하게 `import { Slot } from "radix-ui"`를 쓴다** — 즉 통합 패키지 사용 방식 자체는 공식과 일치한다. 문제는 개별 `@radix-ui/*` 패키지를 섞어두면 통합 패키지가 고정한 서브패키지 버전과 다른 인스턴스가 번들에 들어가 Radix context가 분리될 수 있다는 점이다(특히 Presence/Collection 계열).
- 조치: `@radix-ui/react-slot`을 apps/web/package.json에서 제거하고 asChild가 필요해지면 `import { Slot } from 'radix-ui'`를 쓴다. 앞으로 CLI가 개별 `@radix-ui/react-*`를 추가로 설치하려 하면 통합 패키지로 통일하고, `bun pm ls | grep @radix-ui`로 중복 설치가 없는지 주기 확인한다.

#### [medium] components.json의 components alias가 @features — CLI 생성물이 FSD features(props-only) 규칙을 깰 수 있음

- 근거: `apps/web/components.json:12-18, apps/web/src/shared/ui/button.tsx:1`
- 내용: `aliases.components`가 `@features`로 지정돼 있다. `ui`는 `@shared/ui`로 정확하지만, shadcn 레지스트리의 블록(block)이나 예제 컴포넌트는 `components` alias로 생성되며 이들 다수가 데이터 fetch·상태·mutation을 포함한다. 이 레포의 FSD 규칙상 features는 비즈니스 로직 없는 props-only 레이어이므로, 블록을 그대로 추가하면 즉시 레이어 위반이 발생한다. `hooks` alias(`@shared/hooks`)가 가리키는 디렉터리는 현재 존재하지 않아, use-mobile 같은 훅을 요구하는 Sidebar 추가 시 새 디렉터리가 조용히 생긴다.
- 조치: `components` alias를 `@widgets`로 바꾸거나(블록은 비즈니스 로직 포함이므로 widgets가 맞다), 블록 설치를 금지하고 primitive만 `ui` alias로 추가하는 절차를 docs/SHADCN-COMPONENTS.md §5에 명문화한다. Sidebar 도입 전에 `apps/web/src/shared/hooks/` 디렉터리 존재와 `use-mobile` 배치 위치를 먼저 정한다.

#### [medium] 복사된 shadcn primitive에 남은 border/shadow/bg-input 잔재가 border 제거·모노톤 목표와 충돌

- 근거: `apps/web/src/shared/ui/select.tsx:31, apps/web/src/shared/ui/select.tsx:54, apps/web/src/shared/ui/checkbox.tsx:13, apps/web/src/shared/ui/switch.tsx:19, apps/web/src/shared/ui/accordion.tsx:12, apps/web/src/shared/ui/tabs.tsx:46-48`
- 내용: 공식 소스를 그대로 복사한 5개 primitive에는 `border border-input`(select.tsx:31), `border bg-popover shadow-md`(select.tsx:54), `border border-input shadow-xs`(checkbox.tsx:13), `border border-transparent shadow-xs`(switch.tsx:19), `border-b last:border-b-0`(accordion.tsx:12), `border border-transparent` + `data-[state=active]:shadow-sm`(tabs.tsx:46) 이 그대로 남아 있다. 목표는 border 전면 제거·elevation 기반 구분이므로 이 클래스들이 살아 있는 한 새 디자인과 기존 primitive가 섞여 보인다. 또 `dark:bg-input/30`은 class 기반 `.dark`가 아니라 `prefers-color-scheme`으로만 동작하는 현재 globals.css 구성(globals.css:47)에 의존한다.
- 조치: 각 primitive에서 `border*`/`shadow-*`를 제거하고 `bg-foreground/[0.04]`(기본) → `bg-foreground/[0.08]`(hover) → `bg-foreground/[0.12]`(active) elevation 스케일로 치환한다. 단 팝오버·툴팁 등 **떠 있는 표면**은 배경만으로 분리가 어려우므로 `bg-popover` + 약한 shadow는 예외로 유지할지 먼저 결정한다. 이 치환 규칙을 docs/SHADCN-COMPONENTS.md에 "토큰 적용 절차"로 못박아 이후 CLI 추가분에도 동일 적용한다.

#### [low] WidgetSection/PageHeader/MasterDetail이 shadcn Card·Item 계열 없이 자체 구성

- 근거: `apps/web/src/shared/common/widget-section.tsx:13-25, apps/web/src/shared/common/page-header.tsx:8-13, apps/web/src/shared/common/master-detail/master-detail.tsx:28-62`
- 내용: WidgetSection은 `<section className="mt-px min-w-0 overflow-hidden bg-card">` + 직접 만든 header로 구성되어 Card/CardHeader/CardTitle과 역할이 중복된다. MasterDetail의 리스트 항목은 `<button className={`... ${selected ? 'bg-foreground text-background' : 'bg-card hover:bg-muted'}`}>`처럼 템플릿 리터럴로 className을 조립해(master-detail.tsx:38-40, 51) `cn()` 컨벤션에서도 벗어난다. docs/SHADCN-COMPONENTS.md는 이 자리에 `Item`(stat tile, resource summary, list item)을 지정했다.
- 조치: `bunx shadcn@latest add item`으로 추가한 뒤 MasterDetail 리스트 항목을 `Item`+`ItemMedia`/`ItemContent`/`ItemTitle`/`ItemDescription`으로, WidgetSection을 `Card`+`CardHeader`+`CardTitle`+`CardAction`+`CardContent`로 재구성한다. 최소한 master-detail.tsx:38-40, 51과 panel-shell.tsx:133-135, 195-197의 템플릿 리터럴 className은 `cn()`으로 전환한다.

#### [low] 공식 소스의 function 선언 → 레포의 arrow-only 컨벤션 변환 절차가 문서화되지 않음

- 근거: `apps/web/src/shared/ui/select.tsx:9-17, apps/web/src/shared/ui/badge.tsx:19-21, docs/SHADCN-COMPONENTS.md:112-120`
- 내용: registry의 공식 소스는 모두 `function Button(...)` 형태인데 레포 컨벤션은 arrow function only다. 현재 primitive들은 수동 변환돼 있지만(select.tsx:9 `const Select = ({ ...props }) =>`), 변환 규칙(export 스타일 — badge.tsx는 `export const Badge: FC<...>`, select.tsx는 하단 일괄 `export { ... }`로 서로 다름)이 통일돼 있지 않고 docs/SHADCN-COMPONENTS.md §5의 설치 절차에도 언급이 없다. 앞으로 15개 이상 컴포넌트를 추가할 예정이라 변환 편차가 누적된다.
- 조치: docs/SHADCN-COMPONENTS.md §5에 "CLI 생성 후 필수 변환" 단계를 추가한다: (1) `function X(` → `const X = (`, (2) 반환 타입 미명시 유지, (3) export는 파일 하단 일괄 `export { ... }`로 통일(다중 서브컴포넌트 파일 기준), (4) `@/lib/utils` → `@shared/lib/utils` alias 확인, (5) border/shadow → elevation 치환. 기존 badge.tsx/button.tsx의 `export const` 스타일도 이 규칙에 맞춘다.

### 디자인 토큰 · 모노톤 일관성 · border/radius/opacity 실사용 (apps/web)

globals.css는 oklch 무채색 팔레트를 쓰고 있으나 실질 단계가 background/card/muted/sidebar 4개뿐이라 "elevation 레이어"로 구분을 만들 밑천이 없고, 그 결과 코드베이스는 여전히 `border-t border-background`(20개 파일)와 `gap-px bg-background`(15곳)라는 두 가지 서로 다른 헤어라인 기법으로 구분을 만들고 있습니다. 전역 `* { border-radius: 0 }`는 cascade layer 밖에 선언돼 @layer utilities의 모든 `rounded-*`를 무력화합니다(빌드 산출물로 실측 확인) — 즉 radius 0은 이미 강제되어 있고, 대신 Switch·Checkbox처럼 형태가 의미인 컴포넌트가 조용히 사각형이 됩니다. 더 심각한 것은 shadcn 표준 base 레이어(`* { @apply border-border }`)가 없어 색 없는 `border`/`border-b`(accordion, select-content)가 Tailwind v4 preflight 기본값인 currentColor로 렌더돼 전면 대비 실선이 그어지는 점, 그리고 `--input: oklch(1 0 0)`(라이트=흰색) 때문에 흰 카드 위 Checkbox 테두리가 사실상 보이지 않는 점입니다. opacity 위계는 사실상 부재해(`text-foreground/60` 1회, `text-background/70` 1회) 텍스트는 foreground/muted-foreground 2단, 선택 상태는 `bg-foreground text-background` 전면 반전이라 "고급스러운 미세 톤 변화"와 정반대입니다. 여기에 `bg-red-950`·`text-emerald-700`·`bg-zinc-950` 등 유채색 하드코딩이 20곳 이상 남아 모노톤 방향과 충돌하고 일부는 라이트 모드 대비 미달입니다. 타이포는 body font-family가 Arial/Helvetica(next/font 미도입)에 `text-xs` 136회·`text-sm` 87회로 스케일이 사실상 두 단계뿐입니다.

#### [critical] 전역 `* { border-radius: 0 }` 가 cascade layer 밖에 선언되어 모든 rounded-* 유틸을 무력화 (HACK)

- 근거: `apps/web/src/app/globals.css:70-72, apps/web/.next/static/chunks/3dnwqy7zucfqv.css (`*{border-radius:0}`는 unlayered,`.rounded-full{border-radius:3.40282e38px}` 는 @layer utilities 내부), apps/web/src/shared/ui/switch.tsx:19,27, apps/web/src/shared/ui/checkbox.tsx:13`
- 내용: 빌드된 CSS를 직접 확인한 결과 레이어 순서는 `@layer properties, theme, base, components, utilities` 이고 `*{border-radius:0}` 는 어느 레이어에도 속하지 않습니다. CSS cascade layers 규칙상 unlayered 선언은 모든 layered 선언보다 우선하므로 `.rounded-full`·`.rounded-md`·`.rounded-[4px]` 가 전부 죽습니다. 즉 (a) 컴포넌트에 남아 있는 16개 rounded-* 클래스는 전부 dead class 이고, (b) 형태가 곧 의미인 Switch 트랙/썸(`rounded-full`)과 Checkbox(`rounded-[4px]`)가 조용히 사각형으로 렌더됩니다. 컨벤션의 "HACK·우회 금지" 위반이기도 합니다 — 토큰이 아니라 전역 셀렉터로 디자인을 강제하고 있습니다.
- 조치: 전역 `*` 규칙을 삭제하고 radius 0 을 토큰으로 표현합니다. globals.css `:root` 에 `--radius: 0rem` 을 추가하고 `@theme inline` 에 `--radius-sm: var(--radius); --radius-md: var(--radius); --radius-lg: var(--radius); --radius-xl: var(--radius)` 를 매핑하면 shadcn 컴포넌트의 `rounded-md`/`rounded-lg` 가 자동으로 0 이 됩니다. 형태가 의미인 곳(Switch 트랙·썸, Avatar, 상태 dot)만 `rounded-full` 을 유지하고 이 예외를 `--radius-full: calc(infinity * 1px)` 로 토큰화합니다.

#### [critical] shadcn base 레이어 부재 → 색 없는 `border`/`border-b` 가 currentColor(전면 대비 실선)로 렌더

- 근거: `apps/web/src/shared/ui/accordion.tsx:12 (`border-b last:border-b-0`), apps/web/src/shared/ui/select.tsx:54 (`... rounded-md border bg-popover ...`), apps/web/src/app/globals.css:1-79 (@layer base 블록 자체가 없음), 빌드 CSS `.border-b{border-bottom-style:var(--tw-border-style);border-bottom-width:1px}`(border-color 미지정) + preflight`*,:after,:before{border:0 solid}``
- 내용: Tailwind v4 는 v3 와 달리 기본 border-color 를 gray-200 으로 깔지 않습니다. preflight 의 `border: 0 solid` 는 border-color 를 initial 값인 currentColor 로 되돌리므로, 색을 지정하지 않은 `border`/`border-b` 는 텍스트 색과 동일한 100% 대비 실선이 됩니다. shadcn 이 기본 제공하는 `@layer base { * { @apply border-border outline-ring/50 } }` 가 globals.css 에 없어 이 안전망이 빠져 있습니다. 결과적으로 Accordion 아이템 구분선과 Select 드롭다운 외곽선이 라이트 모드에서 순검정(oklch 0.145), 다크 모드에서 순백(0.985) 실선으로 그려집니다 — 모노톤·border 제거 방향과 정반대인 가장 강한 시각 요소입니다.
- 조치: 두 파일의 색 없는 border 를 제거하는 것이 목표 상태입니다. Accordion 아이템은 `border-b` 대신 컨테이너에 `space-y-px bg-background` + 아이템 `bg-card`, 또는 아이템에 `bg-foreground/[0.03]` 를 주고 `gap-px` 로 분리합니다. SelectContent 는 `border` 를 지우고 `bg-popover shadow-lg` 만 남기되 대비가 부족하면 `bg-foreground/[0.06]` 오버레이를 겹칩니다. 과도기에는 globals.css 에 `@layer base { *, ::after, ::before { border-color: var(--color-border) } }` 를 넣어 currentColor 사고를 원천 차단하십시오.

#### [high] 라이트 모드에서 Checkbox 가 사실상 보이지 않음 (`--input` 이 순백)

- 근거: `apps/web/src/app/globals.css:16 (`--input: oklch(1 0 0)`), apps/web/src/shared/ui/checkbox.tsx:13 (`border border-input ... dark:bg-input/30`), 사용처: apps/web/src/widgets/api-key/api-key-widget.tsx:129, apps/web/src/widgets/notification/notification-widget.tsx:146,154, apps/web/src/widgets/container/container-create-widget.tsx:155,163`
- 내용: Checkbox 는 배경 없이 `border-input` 만으로 형태를 만드는데 라이트 모드 `--input` 이 `oklch(1 0 0)`(순백)입니다. Checkbox 가 놓이는 컨테이너는 대부분 `bg-card`(라이트 = `oklch(1 0 0)`, 동일한 순백)이므로 테두리가 배경과 완전히 같은 색이 되어 `shadow-xs` 잔영 외에는 아무것도 보이지 않습니다. 배경 채움은 `dark:bg-input/30` 으로 다크 모드에만 걸려 있어 라이트에서 보정되지 않습니다. 체크 해제 상태의 체크박스를 찾을 수 없는 것은 사용성 결함입니다. 같은 이유로 `--input` 을 트랙 색으로 쓰는 Switch(switch.tsx:19 `data-[state=unchecked]:bg-input`)도 라이트 모드에서 흰 트랙이 됩니다.
- 조치: `--input` 을 표면 색이 아니라 '입력 요소 채움' 토큰으로 재정의합니다: 라이트 `--input: oklch(0.93 0 0)`, 다크 `--input: oklch(0.28 0 0)`. 동시에 border 전면 제거 방향에 맞춰 Checkbox 를 `border` 없이 `bg-foreground/[0.08] data-[state=checked]:bg-foreground data-[state=checked]:text-background` 로 바꾸면 라이트/다크 양쪽에서 배경 elevation 만으로 형태가 성립합니다.

#### [high] 유채색 하드코딩 20곳 이상 — 모노톤 방향과 충돌하고 `--destructive` 토큰은 사실상 미사용

- 근거: `apps/web/src/shared/ui/inline-alert.tsx:12-15, apps/web/src/widgets/container/container-control-widget.tsx:151,223, apps/web/src/widgets/container/container-create-widget.tsx:57, apps/web/src/widgets/deployment/deployment-widget.tsx:75-80, apps/web/src/widgets/job/job-widget.tsx:63, apps/web/src/widgets/infrastructure/infrastructure-widget.tsx:90,146,200,317, apps/web/src/features/interactive-terminal/interactive-terminal.tsx:157,163, apps/web/src/features/live-log-stream/live-log-stream.tsx:78, apps/web/src/features/accept-invitation-panel/accept-invitation-panel.tsx:71`
- 내용: `bg-red-950 text-red-100`(13곳), `bg-emerald-950`, `bg-amber-950`, `bg-red-700 text-white`, `bg-zinc-950 text-zinc-50` 가 직접 박혀 있습니다. 이들은 전부 다크 배경 전제 값이라 라이트 모드에서는 흰 카드 한가운데 거의 검은 붉은 상자가 떠 있는 형태가 됩니다(라이트 대응 `dark:` 변형 없음). 반면 정작 정의된 `--destructive`/`--destructive-foreground` 토큰은 코드 전체에서 `bg-destructive` 1회만 쓰입니다. 팔레트가 토큰이 아니라 Tailwind 기본 팔레트에 분산되어 있어 모노톤 전환 시 일괄 변경이 불가능합니다.
- 조치: 의미색을 토큰 3쌍으로 축소합니다: `--danger`/`--danger-surface`, `--warning`/`--warning-surface`, `--success`/`--success-surface` 를 :root/dark 양쪽에 정의하고 @theme inline 에 `--color-danger` 등으로 매핑합니다. 모노톤 기조에 맞춰 surface 는 채도가 거의 없는 값(라이트 `oklch(0.95 0.03 27)`, 다크 `oklch(0.24 0.05 27)`)으로 두고, 상태 구분은 가능한 한 `bg-foreground/[0.05]` + 텍스트 라벨로 처리합니다. InlineAlert 의 toneClass 를 `error: 'bg-danger-surface text-danger'` 형태로 교체하고 위젯에 인라인으로 박힌 red/emerald/amber 클래스를 전부 InlineAlert/Badge 로 치환하십시오.

#### [high] 라이트 모드 대비 미달 텍스트 (`text-red-400`, `text-emerald-700`, `text-red-700`)

- 근거: `apps/web/src/features/traffic-export/traffic-export.tsx:53 (`text-xs text-red-400`), apps/web/src/widgets/registry/registry-widget.tsx:149 (`text-xs text-emerald-700`), apps/web/src/widgets/prune/prune-widget.tsx:135,137`
- 내용: 이 텍스트들은 `bg-card`(라이트 = 순백) 위에 렌더됩니다. `red-400` 은 흰 배경 대비 약 2.6:1 로 WCAG AA(작은 텍스트 4.5:1) 미달이고 `text-xs`(12px)라 더 불리합니다. `emerald-700`/`red-700` 은 라이트에선 통과하지만 다크 모드(`--card: oklch(0.212)`)에서는 반대로 대비가 무너집니다. 어느 쪽 모드에서도 안전하지 않은 색 고정입니다.
- 조치: 위 4개 지점을 `text-danger`/`text-success` 시맨틱 토큰으로 교체하고, 토큰 값은 라이트/다크 각각 대비 4.5:1 이상이 되도록 oklch L 값을 분리 지정합니다(라이트 `oklch(0.48 0.16 27)`, 다크 `oklch(0.78 0.14 27)`). 상태 강조가 색에만 의존하지 않도록 텍스트 라벨을 함께 유지하십시오.

#### [high] border 전수 목록 — `border-t border-background` 30여 곳이 실질적으로 '배경색 헤어라인' 우회

- 근거: `apps/web/src/widgets/infrastructure/infrastructure-widget.tsx:77,129,198,206,315,323,373, apps/web/src/widgets/registry/registry-widget.tsx:110,116,153, apps/web/src/widgets/deployment/deployment-widget.tsx:196,287, apps/web/src/widgets/nginx/nginx-config-widget.tsx:329,536, apps/web/src/widgets/nginx/nginx-route-control-widget.tsx:94,150, apps/web/src/widgets/api-key/api-key-widget.tsx:108, apps/web/src/widgets/audit/audit-widget.tsx:62, apps/web/src/widgets/job/job-widget.tsx:78, apps/web/src/widgets/backup/backup-widget.tsx:91, apps/web/src/features/traffic-live-tail/traffic-live-tail.tsx:73, apps/web/src/features/live-log-stream/live-log-stream.tsx:70, apps/web/src/features/interactive-terminal/interactive-terminal.tsx:137, apps/web/src/shared/common/master-detail/master-detail.tsx:31, apps/web/src/widgets/panel-shell/panel-shell.tsx:125,152,209`
- 내용: border 계열 총 사용은 `border-background` 33, `border-t` 32, `border` 16, `border-muted` 5, `border-border` 5, `border-r` 2, `border-b` 3 입니다. 그중 압도적 다수는 `border-t border-background` — 카드(`bg-card`) 위에 페이지 배경색(`--background`) 1px 선을 그어 '틈'처럼 보이게 하는 기법입니다. 같은 목적을 다른 곳에서는 `gap-px bg-background`(15곳, master-detail.tsx:29,32 등)로 달성하고 있어 동일 목적에 두 기법이 공존합니다. 또 이 방식은 라이트 모드에서 card(1.0) 대비 background(0.955) 차이가 ΔL 0.045 로 매우 약해 구분이 거의 보이지 않고, 패널 셸의 `border-muted` 만 유독 진해 경계가 튀는 불일치가 생깁니다.
- 조치: 기법을 `gap-px + bg-background` 한 가지로 통일하고 border 유틸은 전량 제거합니다. (1) `border-t border-background p-3` 반복 블록은 부모를 `grid gap-px bg-background` 로 만들고 자식에 `bg-card p-3` 를 주는 형태로 바꿉니다 — WidgetSection(apps/web/src/shared/common/widget-section.tsx:14)이 이미 `mt-px bg-card` 로 같은 패턴을 쓰므로 여기에 `WidgetSectionBody` 를 추가해 표준화하십시오. (2) 표 행 구분(audit-widget.tsx:62, traffic-live-tail.tsx:73)은 `border-t` 대신 tr 에 `bg-card`, tbody 에 `bg-background` + `border-separate border-spacing-y-px` 로 1px 그리드를 만듭니다. (3) panel-shell 의 `border-r border-muted` 는 `bg-sidebar` 톤 차이로 이미 구분되므로 삭제. (4) master-detail.tsx:31 의 `lg:border-r lg:border-background` 는 상위 29행 `grid gap-px bg-background` 가 이미 같은 선을 만들고 있어 중복 — 삭제.

#### [high] opacity 기반 톤 위계 부재 — elevation 3단·텍스트 3단 스케일이 토큰으로 존재하지 않음

- 근거: `apps/web/src/app/globals.css:5-24,47-68 (표면 토큰 background/card/muted/sidebar 4개뿐), 사용 통계: `text-muted-foreground`102 /`text-foreground`30 /`text-foreground/60`1 /`text-background/70`1,`bg-card`16 /`bg-muted`15 /`bg-background` 29, apps/web/src/shared/ui/button.tsx:21 (`hover:opacity-85`)`
- 내용: 현재 표면 구분은 bg-card ↔ bg-muted 이분법이고, 텍스트 위계도 foreground ↔ muted-foreground 이분법입니다. hover/active 는 `hover:bg-muted`(단일 톤) 또는 요소 전체를 흐리게 하는 `hover:opacity-85` 로 처리돼 미세한 단계가 없습니다. 선택 상태는 `bg-foreground text-background` 전면 반전(master-detail.tsx:40, panel-shell.tsx:138,194)이라 위계가 아니라 충격에 가깝습니다. border 를 없애고 elevation 으로만 구분하려면 최소 3~4단 스케일이 선행되어야 하는데 그 밑천이 없습니다.
- 조치: globals.css 에 elevation·텍스트 스케일을 토큰으로 도입하십시오. :root — `--surface-1: oklch(1 0 0); --surface-2: oklch(0.975 0 0); --surface-3: oklch(0.945 0 0); --overlay-subtle: oklch(0.145 0 0 / 0.03); --overlay-hover: oklch(0.145 0 0 / 0.06); --overlay-active: oklch(0.145 0 0 / 0.10);` / dark — `--surface-1: oklch(0.212 0 0); --surface-2: oklch(0.246 0 0); --surface-3: oklch(0.285 0 0); --overlay-subtle: oklch(0.985 0 0 / 0.04); --overlay-hover: oklch(0.985 0 0 / 0.07); --overlay-active: oklch(0.985 0 0 / 0.11);` 텍스트는 `--text-strong: var(--foreground); --text-muted: oklch(from var(--foreground) l c h / 0.70); --text-subtle: oklch(from var(--foreground) l c h / 0.50);`. @theme inline 에 `--color-surface-1..3`, `--color-overlay-*`, `--color-text-strong/muted/subtle` 매핑. 사용 규칙: 카드=`bg-surface-1`, 강조 블록=`bg-surface-2`, 폼/코드=`bg-surface-3`, hover=`hover:bg-overlay-hover`, 선택=`bg-overlay-active font-medium`, 보조 텍스트=`text-text-muted`, 메타=`text-text-subtle`. 현재 `text-muted-foreground` 102곳을 muted/subtle 로 나눠 배분하십시오.

#### [high] shadcn 표준 토큰 세트 부재 — 추가 컴포넌트 도입 시 즉시 깨짐

- 근거: `apps/web/src/app/globals.css:5-45 (`--radius`, `--secondary`, `--secondary-foreground`, `--chart-1..5`, `--sidebar-foreground/-primary/-primary-foreground/-accent/-accent-foreground/-border/-ring` 전부 없음 — grep 결과 0건), apps/web/components.json:1-16 (style new-york, baseColor neutral, cssVariables true)`
- 내용: components.json 이 있어 `shadcn add` 로 컴포넌트를 계속 붙일 수 있는 구성인데, globals.css 에는 shadcn new-york/neutral 프리셋이 전제하는 토큰의 절반가량이 없습니다. Dialog·Sheet·Sidebar·DropdownMenu·Table·Alert·Skeleton·Sonner 등 앞으로 도입할 컴포넌트는 `bg-secondary`, `text-secondary-foreground`, `rounded-lg`(=var(--radius-lg)), `bg-sidebar-accent`, `border-sidebar-border`, `--chart-*` 를 참조하므로 변수 미정의 → 색 없음/투명으로 렌더됩니다. 또 `@custom-variant dark` 가 없어 클래스 기반 테마 전환 경로도 없습니다.
- 조치: shadcn 공식 neutral 프리셋을 기준선으로 globals.css 를 재작성하되 값만 모노톤으로 조정합니다. 최소 추가분: `--radius: 0rem`(+ @theme inline 의 --radius-sm/md/lg/xl), `--secondary: oklch(0.94 0 0)` / `--secondary-foreground: var(--foreground)`(다크 0.26 / 0.985), `--chart-1..5` 는 무채색 5단(`oklch(0.20/0.35/0.50/0.65/0.80 0 0)`), `--sidebar-foreground`·`--sidebar-primary`·`--sidebar-primary-foreground`·`--sidebar-accent`·`--sidebar-accent-foreground`·`--sidebar-border`·`--sidebar-ring` 7종. 이후 `shadcn add dialog sheet dropdown-menu table alert skeleton sonner separator scroll-area popover command` 순으로 도입하십시오.

#### [medium] body font-family 가 Arial/Helvetica — next/font 미도입 + `--font-sans` 미매핑, 게다가 unlayered 로 유틸리티를 덮음

- 근거: `apps/web/src/app/globals.css:74-79 (`font-family: Arial, Helvetica, sans-serif`, @layer 밖), apps/web/src/app/[locale]/layout.tsx:1-36 (next/font import 없음, html/body 에 폰트 클래스 없음), apps/web/package.json (폰트 패키지 없음)`
- 내용: body 규칙이 cascade layer 밖에 있어 `font-sans`/`font-mono` 유틸리티(@layer utilities)보다 우선합니다. 클래스를 직접 붙인 요소(textarea.tsx:8 의 `font-mono`)는 셀렉터 구체성으로 살아남지만, 상속만 기대하는 모든 요소는 Arial 로 고정됩니다. 모던·미니멀 모노톤 방향에서 타이포는 사실상 유일한 표현 수단인데 시스템 산세리프도 아닌 Arial 고정은 그 자체로 결정적 손실입니다. 또 @theme inline 에 `--font-sans`/`--font-mono` 매핑이 없어 Tailwind 기본 스택이 그대로 쓰입니다.
- 조치: layout.tsx 에서 next/font 로 Geist(또는 Inter)와 Geist_Mono 를 로드해 CSS 변수로 노출하고 `<html className={`${sans.variable} ${mono.variable}`}>` 로 붙입니다. globals.css 의 body 규칙은 `@layer base { body { background: var(--background); color: var(--foreground); font-family: var(--font-sans) } }` 로 레이어 안에 넣고, @theme inline 에 `--font-sans: var(--font-geist-sans); --font-mono: var(--font-geist-mono)` 를 매핑하십시오. 터미널·로그·ID 값은 `font-mono tabular-nums` 로 통일합니다.

#### [medium] 타이포 스케일 사실상 2단 — text-xs 136회 / text-sm 87회, weight 2종

- 근거: `통계: text-xs 136 / text-sm 87 / text-lg 3 / text-2xl 3 / text-xl 1, font-semibold 38 / font-medium 23. apps/web/src/shared/common/page-header.tsx:10-11, apps/web/src/shared/common/widget-section.tsx:17,20, apps/web/src/features/service-status-card/service-status-card.tsx:16, apps/web/src/features/auth-panel/auth-panel.tsx:59-60`
- 내용: border 를 없애고 위계를 타이포로 만들겠다는 방향인데 실제 스케일은 12px/14px 두 단계에 굵기 두 종뿐입니다. 섹션 제목(widget-section.tsx:17)이 `text-sm font-semibold` 로 본문(`text-sm`)과 굵기만 다르고, 페이지 제목은 `text-xl`, 지표값은 `text-2xl` 로 중간 단계(text-base/text-lg)가 비어 있어 위계가 뛰어버립니다. 또 `tracking-[0.18em]` 가 임의값으로 두 곳에 복붙돼 있습니다.
- 조치: @theme inline 에 의미 기반 타이포 토큰을 정의하십시오: `--text-eyebrow: 0.6875rem`(+ `--tracking-eyebrow: 0.18em`), `--text-meta: 0.75rem`, `--text-body: 0.875rem`, `--text-section: 1rem`, `--text-page: 1.375rem`, `--text-metric: 2rem`. 적용: 위젯 섹션 제목=`text-section font-medium`, 본문=`text-body text-text-muted`, 메타/타임스탬프=`text-meta text-text-subtle`, 페이지 헤더=`text-page font-semibold tracking-tight`, 지표=`text-metric font-semibold tabular-nums`. `tracking-[0.18em]` 2곳은 `tracking-eyebrow` 로 치환합니다.

#### [medium] cn() 미사용 템플릿 리터럴 className 7곳 — tailwind-merge 미적용으로 override 불가

- 근거: `apps/web/src/shared/common/master-detail/master-detail.tsx:38-40,49, apps/web/src/widgets/panel-shell/panel-shell.tsx:137-139,193-195, apps/web/src/widgets/deployment/deployment-widget.tsx:335, apps/web/src/widgets/artifact/artifact-widget.tsx:153-154, apps/web/src/widgets/engine/engine-info.tsx:48, apps/web/src/shared/lib/utils.ts:1-4 (cn 존재)`
- 내용: cn 유틸이 있는데도 위 7곳은 백틱 문자열로 조건부 클래스를 이어붙입니다. tailwind-merge 를 거치지 않으므로 (a) 동일 속성 클래스가 중복 병기될 때 승자가 소스 순서가 아니라 CSS 순서에 좌우되고, (b) 조건이 false 일 때 빈 문자열이 남아 이중 공백이 생기며, (c) 앞으로 elevation/opacity 클래스를 조건부로 겹칠 때(`bg-surface-1` + `bg-overlay-active`) 충돌 해소가 안 됩니다. 컨벤션(동적 className 은 cn())의 명시적 위반입니다.
- 조치: 7곳 모두 `cn('기본', 조건 && '조건 클래스', className)` 형태로 교체합니다. 특히 master-detail.tsx:38 선택 상태와 panel-shell.tsx:137/193 활성 네비는 elevation 스케일 도입 시 바로 겹쳐 쓰게 될 지점이라 우선 정리 대상입니다. panel-shell 의 데스크톱(152-159)과 모바일(209-216) 블록, 네비 항목(137/193)은 마크업이 거의 동일하므로 `PanelNavList` 로 추출해 중복 자체를 없애는 편이 좋습니다.

#### [medium] Switch 컴포넌트가 어디서도 쓰이지 않는 dead code (radius 무력화로 형태도 깨진 상태)

- 근거: `apps/web/src/shared/ui/switch.tsx:1-33, grep `<Switch` → widgets/features/app 전체 0건 (Checkbox 는 10곳 사용: apps/web/src/widgets/notification/notification-widget.tsx:154, apps/web/src/widgets/nginx/nginx-route-control-widget.tsx:142 등)`
- 내용: Switch 는 shadcn 에서 가져왔으나 실제 화면 어디에서도 렌더되지 않습니다. 동시에 이번 조사에서 확인된 두 결함(전역 border-radius 0 으로 `rounded-full` 무력화, `--input` 순백으로 라이트 모드 트랙 비가시)을 모두 안고 있어 지금 상태로 도입하면 즉시 깨집니다. boolean 토글은 현재 전부 Checkbox 로 처리되고 있습니다.
- 조치: 둘 중 하나로 정리하십시오. (a) 즉시 반영되는 설정 토글(notification-widget.tsx:154 enabled, nginx-route-control-widget.tsx:142 stripPrefix)을 Switch 로 승격해 폼 제출형 Checkbox 와 의미를 분리하거나, (b) 사용 계획이 없다면 파일을 삭제합니다. 유지한다면 `--radius-full` 예외 토큰과 `--input` 재정의를 선행해야 합니다.

#### [medium] 선택/활성 상태가 전면 색 반전 — 모노톤 미세 위계 방향과 상충

- 근거: `apps/web/src/shared/common/master-detail/master-detail.tsx:40 (`bg-foreground text-background`), :49 (`text-background/70`), apps/web/src/widgets/panel-shell/panel-shell.tsx:138,194, :164,176 (`bg-foreground p-2 text-background` 아이콘 버튼), apps/web/src/shared/ui/badge.tsx:8 (`default: 'bg-foreground text-background'`)`
- 내용: 목록 선택·네비 활성·기본 Badge 가 모두 최대 대비 반전(라이트: 검정 바탕 흰 글자)입니다. 무채색 팔레트에서 이 반전은 사실상 유일한 강조 수단이라 화면에 검은 블록이 여러 개 동시에 존재하게 되고(사이드바 활성 + 목록 선택 + Badge 다수), 어느 것이 현재 컨텍스트인지 위계가 사라집니다. 확정된 방향인 "opacity 기반 미세 톤 변화"와 정반대입니다.
- 조치: 강조를 3단으로 분리하십시오. 네비 활성 = `relative bg-overlay-active font-medium` + 좌측 2px 인디케이터(`before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-foreground`), 목록 선택 = `bg-overlay-hover font-medium`, 전면 반전은 primary 액션 버튼 한 곳으로만 제한합니다. Badge 기본 variant 는 `bg-overlay-subtle text-text-muted` 로 낮추고, 현재 반전 스타일은 `variant="solid"` 로 이름을 바꿔 진짜 필요한 곳에만 쓰십시오.

#### [medium] 모달 오버레이 `bg-black/50` 하드코딩 + 커스텀 다이얼로그 (shadcn Dialog/Sheet 미도입)

- 근거: `apps/web/src/widgets/panel-shell/panel-shell.tsx:169-171 (`fixed inset-0 z-50`+`bg-black/50` 백드롭 버튼), apps/web/src/features/interactive-terminal/interactive-terminal.tsx:157 (`fixed inset-0 z-50 ... bg-zinc-950 p-3 text-zinc-50` role=dialog aria-modal), :46 (`theme: { background: '#09090b', foreground: '#fafafa' }`)`
- 내용: 모달성 UI 두 곳이 각각 손으로 구현돼 있고, 오버레이 색이 `bg-black/50`(토큰 아님)과 `bg-zinc-950`(팔레트 하드코딩)으로 서로 다릅니다. xterm 테마는 아예 hex 리터럴이라 토큰 변경 시 따라오지 않습니다. 라이트 모드에서도 동일한 검정 오버레이가 적용돼 톤이 튀며, 포커스 트랩·ESC 처리·스크롤 락 같은 동작도 Radix 없이 직접 구현돼 있어 UX 일관성이 확보되지 않습니다.
- 조치: `--overlay-scrim: oklch(0.145 0 0 / 0.45)`(다크 `oklch(0.06 0 0 / 0.6)`) 토큰을 추가하고 @theme inline 에 `--color-overlay-scrim` 으로 매핑해 두 곳을 `bg-overlay-scrim` 으로 통일합니다. `radix-ui` 가 이미 의존성에 있으므로 shadcn Sheet(모바일 네비게이션)와 Dialog(터미널 전체화면)를 도입해 커스텀 구현을 대체하면 포커스 관리까지 함께 해결됩니다. xterm 테마는 `getComputedStyle` 로 CSS 변수를 읽어 주입하십시오.

#### [medium] nginx 에디터 3곳만 `rounded-md border border-border` 카드 스타일 — 나머지와 시각 언어 불일치

- 근거: `apps/web/src/widgets/nginx/nginx-upstream-editor.tsx:184, apps/web/src/widgets/nginx/nginx-block-editor.tsx:142, apps/web/src/widgets/nginx/nginx-config-widget.tsx:364, apps/web/src/widgets/artifact/artifact-widget.tsx:153-154 (`border border-dashed`+`border-foreground`/`border-border`)`
- 내용: 코드베이스 대부분이 `border-t border-background` 헤어라인 또는 `gap-px` 방식인데, nginx 에디터의 반복 항목 카드 3곳만 `rounded-md border border-border` 로 실제 사각 테두리를 그립니다(radius 는 전역 규칙에 눌려 무시되므로 모서리 각진 회색 박스로 렌더). artifact 드롭존은 `border-dashed` 로 또 다른 언어를 씁니다. 같은 앱 안에서 '반복 항목 그룹'을 표현하는 방식이 3가지입니다.
- 조치: nginx 3곳은 `bg-surface-2 p-3` + 부모 `grid gap-px` 로 교체해 나머지와 통일하십시오. artifact 드롭존은 드롭 가능 영역이라는 관습적 어포던스가 있지만 border 전면 제거 방향이라면 `bg-overlay-subtle` 바탕 + drag 시 `bg-overlay-active` + `outline-2 outline-dashed outline-foreground/30`(outline 은 border 가 아니라 레이아웃 영향 없음)로 전환하는 편이 일관됩니다.

#### [medium] 라이트 모드 표면 대비가 과소 — card(1.0) vs background(0.955) ΔL 0.045 로 elevation 이 거의 안 보임

- 근거: `apps/web/src/app/globals.css:6-12 (`--background: oklch(0.955)`, `--card: oklch(1)`, `--muted: oklch(0.922)`, `--sidebar: oklch(0.915)`) 대 :49-55 (다크: background 0.162, card 0.212, muted 0.26, sidebar 0.098)`
- 내용: border 를 없애고 배경 elevation 만으로 구분하려면 인접 표면 간 명도차가 충분해야 하는데, 라이트 모드 card↔background 차이는 0.045 L 로 일반 디스플레이·밝은 환경에서 거의 식별되지 않습니다. 반면 다크 모드는 sidebar(0.098) ↔ background(0.162) ↔ card(0.212) 로 단차가 뚜렷해 같은 레이아웃이 두 모드에서 전혀 다른 강도로 보입니다. 특히 `gap-px bg-background` 헤어라인(15곳)과 `border-background`(33곳)가 모두 이 0.045 차이에 의존하므로 라이트 모드에서는 구분선이 사실상 사라집니다.
- 조치: 라이트 표면 단차를 다크와 대칭이 되도록 벌리십시오: `--background: oklch(0.945 0 0)`, `--surface-1(card): oklch(1 0 0)`, `--surface-2: oklch(0.975 0 0)`, `--surface-3: oklch(0.945 0 0)`, `--sidebar: oklch(0.905 0 0)`. 헤어라인은 배경색 재사용 대신 `--hairline: oklch(0.145 0 0 / 0.08)`(다크 `oklch(0.985 0 0 / 0.10)`) 전용 토큰을 두고 `gap-px` 컨테이너 배경을 `bg-hairline` 으로 지정하면 두 모드에서 동일한 강도로 보입니다.

#### [medium] 다크 모드가 prefers-color-scheme 전용 — 사용자 토글 불가, `.dark` 클래스 전략 부재

- 근거: `apps/web/src/app/globals.css:47-68 (`@media (prefers-color-scheme: dark) { :root { ... } }`), apps/web/src/app/[locale]/layout.tsx:26-27 (`<html lang={locale}><body>` — 테마 클래스·suppressHydrationWarning 없음)`
- 내용: 토큰 오버라이드가 미디어 쿼리에만 걸려 있고 `@custom-variant dark (&:is(.dark *))` 선언도 없어 클래스 기반 테마 전환 경로가 없습니다. Tailwind v4 기본 `dark:` 변형이 미디어 쿼리라 shadcn 컴포넌트의 `dark:` 클래스(select.tsx:31, switch.tsx:19, tabs.tsx:46-48, checkbox.tsx:13)는 동작하지만, 사용자가 테마를 고를 수 없고 디자인 검수 시 OS 설정을 바꿔야만 다른 모드를 볼 수 있습니다. 모노톤 개편은 두 모드 동시 검증이 필수인데 현재 구조는 그 검증을 어렵게 합니다.
- 조치: globals.css 상단에 `@custom-variant dark (&:is(.dark *));` 를 선언하고 다크 토큰을 `.dark { ... }` 로 옮기되, 시스템 기본을 유지하려면 `@media (prefers-color-scheme: dark) { :root:not(.light) { ... } }` 와 병행합니다. layout.tsx 의 `<html>` 에 `suppressHydrationWarning` 을 붙이고 테마 클래스를 적용하는 인라인 스크립트(localStorage 조회)를 추가한 뒤 패널 셸에 테마 토글을 노출하십시오.

#### [medium] InlineAlert 의 notice tone 이 `bg-background` — 카드 위에서 알림으로 인지되지 않음

- 근거: `apps/web/src/shared/ui/inline-alert.tsx:13 (`notice: 'bg-background text-foreground'`), :19 (`mx-3 mb-3 p-3 text-sm`), 동일 역할의 인라인 블록: apps/web/src/widgets/container/container-control-widget.tsx:151, apps/web/src/widgets/infrastructure/infrastructure-widget.tsx:200,317`
- 내용: 기본 tone 인 notice 가 페이지 배경색(`--background`)을 그대로 쓰는데, InlineAlert 는 거의 항상 `bg-card` 섹션 내부에 놓입니다. 라이트 모드에서 card(1.0) 위 background(0.955)는 ΔL 0.045 라 알림 블록으로 읽히지 않고, 다른 세 tone(error/success/warning)은 반대로 유채색 다크 블록이라 강도 차이가 극단적입니다. 즉 4개 tone 이 '거의 안 보임' 아니면 '너무 튐' 두 극단에 몰려 있습니다.
- 조치: tone 을 elevation + 시맨틱 토큰 조합으로 재정의하십시오: `notice: 'bg-overlay-subtle text-text-muted'`, `success: 'bg-success-surface text-success'`, `warning: 'bg-warning-surface text-warning'`, `error: 'bg-danger-surface text-danger'`. 좌측 2px 인디케이터(`before:` 의사요소 `before:w-0.5 before:bg-current`)를 더하면 tone 을 형태로도 구분해 색에만 의존하지 않게 됩니다. 위젯에 흩어진 인라인 `bg-red-950 p-3 text-sm text-red-100` 블록을 전부 이 InlineAlert 로 흡수하십시오.

#### [low] 임의값(arbitrary value) 하드코딩 — `rounded-[4px]`, `ring-[3px]`, `p-[3px]`, `tracking-[0.18em]`

- 근거: `apps/web/src/shared/ui/checkbox.tsx:13 (`rounded-[4px]`, `ring-[3px]`), apps/web/src/shared/ui/tabs.tsx:20 (`p-[3px]`), :46 (`ring-[3px]`, `h-[calc(100%-1px)]`), apps/web/src/shared/ui/switch.tsx:19 (`ring-[3px]`, `h-[1.15rem]`), apps/web/src/shared/ui/select.tsx:31, apps/web/src/shared/ui/accordion.tsx:20, apps/web/src/features/auth-panel/auth-panel.tsx:59, apps/web/src/features/accept-invitation-panel/accept-invitation-panel.tsx:57`
- 내용: 포커스 링 두께 `ring-[3px]` 가 5곳에 복붙돼 있고, `rounded-[4px]`(전역 규칙에 눌려 무효), `p-[3px]`, `h-[1.15rem]`, `tracking-[0.18em]`(2곳)이 토큰 없이 흩어져 있습니다. 매직넘버 금지 컨벤션 위반이며, 모노톤 개편에서 포커스 링은 border 를 없앤 뒤 유일하게 남는 상태 표현 수단이라 값이 한 곳에서 관리되어야 합니다. grid-cols 의 `minmax(0,1fr)` 계열 임의값은 레이아웃 목적이므로 문제 없습니다.
- 조치: @theme inline 에 `--ring-width: 3px`, `--tracking-eyebrow: 0.18em` 을 정의하고 `ring-[3px]` → `ring-(--ring-width)`, `tracking-[0.18em]` → `tracking-eyebrow` 로 치환하십시오. `rounded-[4px]` 는 --radius 토큰 도입 시 `rounded-sm` 으로, `p-[3px]`/`h-[1.15rem]` 은 `p-px`/`h-5` 등 스케일 값으로 정규화합니다. border 제거 후에는 포커스 표현을 `focus-visible:border-ring` 이 아니라 `focus-visible:ring-(--ring-width) focus-visible:ring-ring/50` 단일 규칙으로 통일하십시오(현재 checkbox/select/switch/tabs/accordion 이 border+ring 혼용).

#### [low] Button 의 `hover:opacity-85` 가 요소 전체를 투명화 — 배경 위에서 톤이 새어나고 variant 간 불일치

- 근거: `apps/web/src/shared/ui/button.tsx:21 (`transition-opacity hover:opacity-85`), :13-14 (outline/ghost 는 `hover:bg-muted` 로 별도 처리)`
- 내용: default/destructive variant 는 hover 시 요소 전체 opacity 를 85% 로 낮춥니다. 배경색뿐 아니라 텍스트·아이콘까지 함께 흐려져 대비가 떨어지고, 뒤 배경(card/muted/sidebar)에 따라 hover 결과 색이 매번 달라집니다. 같은 컴포넌트 안에서 outline/ghost 는 `hover:bg-muted` 로 배경만 바꾸므로 variant 간 hover 방식도 불일치합니다.
- 조치: opacity 는 요소 전체가 아니라 색 채널에 적용하십시오. default 를 `bg-foreground text-background hover:bg-foreground/90 active:bg-foreground/80`, destructive 를 `bg-danger text-background hover:bg-danger/90`, outline/ghost 를 `hover:bg-overlay-hover active:bg-overlay-active` 로 통일하고 `transition-opacity` 는 `transition-colors` 로 바꿉니다. `disabled:opacity-50` 은 전체 투명화가 관례적으로 허용되는 예외라 유지해도 됩니다.

### 웹 코드 컨벤션·FSD·TanStack Query 정합성 (apps/web/src)

FSD 레이어 위반의 "구조적" 부분(역방향 import, barrel, entities→widgets 참조)은 전무하고, alias 매핑·`FC<Props>`·arrow function·`any` 금지·`useCallback`/`useMemo` 금지·주석 금지는 거의 완벽하게 지켜지고 있습니다. i18n도 ko/en/ja 543키가 완전 일치합니다. 그러나 데이터 계층이 사실상 두 갈래로 쪼개져 있습니다 — 서버 컴포넌트가 `entities/*.api.ts`로 데이터를 받아 props로 내려주고, 위젯은 그 props를 `useState`로 미러링한 뒤 수동으로 배열을 조작하며, 갱신은 `window.location.reload()`(12곳)로 처리합니다. 그 결과 `entities/*.query.ts`에 정의된 15개 이상의 `queryOptions`/`useGet*` 훅은 `useGetEngineOverview` 하나를 빼고 전부 죽은 코드이고, 모든 mutation의 `invalidateQueries`도 구독자가 없어 no-op입니다. SSR 프리페치도 `prefetchQuery` 대신 리터럴 키 `setQueryData`로 되어 있어 캐시가 아무 데서도 소비되지 않습니다. 여기에 `QueryClient` 모듈 싱글턴, 인라인 쿼리키(`['engine','container',…]`, `['infrastructure','overview']`), 무효화 키 불일치, `PanelShell`의 children 이중 렌더 같은 실제 동작 결함이 겹쳐 있습니다. 컨벤션 잔가지(하드코딩 문자열, 매직넘버, 역할 배열 중복, `? :  null`, `cn()` 미사용)는 디자인 개편과 함께 정리하기 좋은 시점입니다.

#### [critical] 서버 props ↔ TanStack Query 이중 데이터 경로 — 조회 훅 15개가 전부 죽은 코드

- 근거: `apps/web/src/entities/engine/engine.query.ts:20-44, apps/web/src/entities/backup/backup.query.ts:11-17, apps/web/src/entities/image/image.query.ts:9-15, apps/web/src/entities/infrastructure/infrastructure.query.ts:10-36, apps/web/src/widgets/engine/engine-info.tsx:23`
- 내용: `useGet*`(useGetContainerList·useGetBackups·useGetImages·useGetArtifacts·useGetUsers·useGetInfrastructure·useGetNginxRoutes·useGetDeploymentReleases 등)를 실제로 호출하는 곳은 `widgets/engine/engine-info.tsx:23`의 `useGetEngineOverview` 단 하나입니다(전 소스 `grep 'useGet.*('` 결과). 나머지 데이터는 전부 `app/**/page.tsx`가 `entities/*.api.ts`로 SSR fetch → 위젯 props로 전달합니다. 즉 `queryOptions` 팩토리·QUERY_KEY의 상당수(ENGINE.DASHBOARD, JOB.DETAIL 등)가 사용처 없이 유지비만 발생하고, 아래 findings 의 mutation 무효화 무효·수동 reload 문제의 근본 원인입니다.
- 조치: 한 축으로 통일합니다. 권장은 query.md 표준 경로 — 페이지는 `queryClient.prefetchQuery(xxxQueryOptions())` + `HydrationBoundary`만 담당하고, 위젯이 `useGetXxx()`로 직접 소비하도록 전환(props 로 데이터 내려주지 않음). 전환하지 않을 도메인은 해당 `queryOptions`/`useGet*`/QUERY_KEY 항목을 삭제해 단일 경로를 명확히 합니다.

#### [high] 모든 변경 후 window.location.reload() — 캐시 무효화 대신 전체 페이지 리로드 12곳

- 근거: `apps/web/src/widgets/container/container-control-widget.tsx:256,286, apps/web/src/widgets/infrastructure/infrastructure-widget.tsx:175,189,292,306, apps/web/src/widgets/nginx/nginx-route-control-widget.tsx:64,77, apps/web/src/widgets/nginx/nginx-config-widget.tsx:82, apps/web/src/widgets/backup/backup-widget.tsx:73, apps/web/src/widgets/user/user-widget.tsx:100, apps/web/src/widgets/container/container-create-widget.tsx:88`
- 내용: mutation 성공 시 `window.location.reload()`(backup 은 `window.setTimeout(..., 800)`까지)로 화면을 갱신합니다. entities mutation 훅들은 이미 `invalidateQueries`를 호출하지만 해당 쿼리를 구독하는 컴포넌트가 없으므로(위 finding) 무효화가 아무 효과가 없어 reload 로 우회한 구조입니다. 전체 리로드는 SPA 상태·스크롤·폼 입력·열린 터미널 세션을 모두 파기하고, 다크/라이트 전환과 무관하게 체감 UX를 크게 떨어뜨립니다.
- 조치: 위젯이 목록을 `useGetXxx()`로 구독하도록 바꾼 뒤 `window.location.reload()` 전부 제거. 그때 mutation `onSuccess`의 `invalidateQueries`가 실제로 동작합니다. 리다이렉트가 필요한 곳만 `useRouter().refresh()` 또는 next-intl `Link` 사용.

#### [high] PanelShell 이 children 을 두 번 렌더 — 페이지 트리 전체가 DOM 에 중복 마운트

- 근거: `apps/web/src/widgets/panel-shell/panel-shell.tsx:220, apps/web/src/widgets/panel-shell/panel-shell.tsx:222`
- 내용: 모바일 컬럼(`<main className="min-w-0 flex-1">{children}</main>`, 220행)과 데스크톱 컬럼(`<main className="hidden min-w-0 lg:block">{children}</main>`, 222행)에서 같은 `children` 을 각각 렌더합니다. CSS 로 하나를 숨길 뿐 React 는 두 트리를 모두 마운트하므로 위젯의 `useState`/`useEffect`/EventSource·WebSocket 구독·쿼리 구독이 2배로 생기고, `id`(`WidgetSection` 의 `aria-labelledby` id, `container-*` 입력 id 등)가 문서 내 중복됩니다. `EngineInfo` 도 154행·211행에서 두 번 마운트됩니다.
- 조치: 레이아웃을 하나의 grid 로 통합하고 `children` 은 한 번만 렌더합니다. 사이드바는 데스크톱 고정 + 모바일 오버레이(같은 `<nav>` 컴포넌트를 조건부 래핑)로 재사용하고, 반복되는 nav 마크업(128-150행 / 184-208행)은 `PanelNav` 컴포넌트로 추출합니다.

#### [high] 엔티티 쿼리 파일의 인라인 배열 키 — QUERY_KEY 중앙관리 이탈

- 근거: `apps/web/src/entities/engine/engine.query.ts:9,22,30,39, apps/web/src/entities/infrastructure/infrastructure.query.ts:12, apps/web/src/entities/job/job.query.ts:75`
- 내용: `const CONTAINER_QUERY_KEY = ['engine','container'] as const`(9행)과 `['engine','container','list']`·`['engine','container','detail',containerId]`·`['engine','container','log',containerId]`, `['infrastructure','overview']`, `setQueryData(['job','current'], job)` 이 전부 `shared/lib/query-key.ts` 밖에 하드코딩돼 있습니다. `QUERY_KEY.ENGINE` 에는 CONTAINER 계열 키 자체가 없고(query-key.ts:41-45), `['job','current']` 는 어디서도 읽지 않는 유령 캐시입니다.
- 조치: `QUERY_KEY.ENGINE.CONTAINER = { ALL, LIST, DETAIL: (id) => …, LOG: (id) => … }`, `QUERY_KEY.INFRASTRUCTURE.OVERVIEW` 를 query-key.ts 에 추가하고 인라인 배열을 전부 치환. `setQueryData(['job','current'])` 는 소비자가 없으므로 삭제하거나 `QUERY_KEY.JOB.DETAIL(job.id)` 로 교체합니다.

#### [high] useCreateVolume 의 invalidate 키가 실제 조회 키와 불일치 — 무효화가 매칭되지 않음

- 근거: `apps/web/src/entities/infrastructure/infrastructure.query.ts:12, apps/web/src/entities/infrastructure/infrastructure.query.ts:78`
- 내용: 볼륨/네트워크 목록은 `infrastructureQueryOptions` 가 `['infrastructure','overview']`(12행) 하나의 키로 가져오는데, `useCreateVolume.onSuccess` 는 `QUERY_KEY.INFRASTRUCTURE.VOLUME.LIST`=`['infrastructure','volume','list']`(78행)를 무효화합니다. 접두사 매칭이 성립하지 않아 볼륨 생성 후 목록 캐시가 갱신되지 않습니다(형제 mutation 들은 `INFRASTRUCTURE.ALL` 을 써서 우연히 매칭). 현재는 위젯이 reload 하므로 증상이 가려져 있지만, 쿼리 구독으로 전환하는 순간 '생성했는데 목록에 안 뜨는' 버그로 드러납니다.
- 조치: `useCreateVolume` 의 무효화를 `QUERY_KEY.INFRASTRUCTURE.ALL`(또는 새로 정의할 `INFRASTRUCTURE.OVERVIEW`)로 맞추고, 사용하지 않는 `VOLUME.LIST`/`NETWORK.LIST` 키는 삭제하거나 실제 조회 키로 사용하도록 정리합니다.

#### [high] QueryClient 를 모듈 최상위 싱글턴으로 생성 — SSR 요청 간 캐시 공유 위험

- 근거: `apps/web/src/shared/lib/query-provider.tsx:6-12`
- 내용: `const queryClient = new QueryClient({...})` 가 모듈 스코프에 있습니다. `'use client'` 파일이라도 App Router 에서는 서버 렌더 시에도 이 모듈이 평가되어 프로세스 하나가 모든 사용자 요청에 같은 인스턴스를 공유할 수 있습니다. 이 패널은 컨테이너·백업·감사로그 등 권한별 데이터를 다루므로 사용자 간 캐시 혼입은 정보 노출로 이어집니다(TanStack 공식 Next.js 가이드가 명시적으로 금지하는 패턴). 또한 `gcTime` 미설정이라 기본 5분 < 아직은 문제 없지만 staleTime 60초와의 관계를 명시해 두는 편이 안전합니다.
- 조치: `const [queryClient] = useState(() => makeQueryClient())` 또는 서버/브라우저 분기 `getQueryClient()` 패턴으로 요청마다 새 인스턴스를 만들도록 변경하고, `defaultOptions.queries` 에 `gcTime`(≥ staleTime)을 함께 명시합니다.

#### [high] SSR 프리페치가 prefetchQuery 아닌 리터럴 키 setQueryData — 소비자도 없어 하이드레이션이 무의미

- 근거: `apps/web/src/app/[locale]/(panel)/page.tsx:41-42, apps/web/src/app/[locale]/(panel)/page.tsx:30, apps/web/src/app/[locale]/(panel)/containers/page.tsx:19`
- 내용: `queryClient.setQueryData(['engine','overview'], …)`, `setQueryData(['engine','container','list'], …)` 처럼 문자열 리터럴로 캐시를 심습니다. `QUERY_KEY.ENGINE.OVERVIEW` 상수가 있는데도 리터럴을 써서 상수 변경 시 조용히 어긋납니다. 게다가 `containers/page.tsx` 가 심는 컨테이너 목록은 이를 읽는 훅이 아무 데도 없어(위젯은 props 사용) dehydrate 페이로드만 늘립니다. `HEALTH.API` 는 실제 응답이 아닌 `{ status: 'ok' }` 를 조작해 넣습니다(30행).
- 조치: `await queryClient.prefetchQuery(engineOverviewQueryOptions())` / `containerListQueryOptions()` 형태로 바꿔 키·queryFn 을 팩토리 한 곳에서만 정의하고, 위젯은 동일 `queryOptions` 를 `useQuery` 로 소비하게 합니다. 소비자를 만들지 않을 항목의 `setQueryData` 는 제거합니다.

#### [high] 서버 props 를 useState 로 미러링 — props 갱신이 반영되지 않는 stale UI

- 근거: `apps/web/src/widgets/api-key/api-key-widget.tsx:48, apps/web/src/widgets/backup/backup-widget.tsx:36, apps/web/src/widgets/artifact/artifact-widget.tsx:53, apps/web/src/widgets/job/job-widget.tsx:38, apps/web/src/widgets/registry/registry-widget.tsx:44, apps/web/src/widgets/deployment/deployment-widget.tsx:87,89, apps/web/src/widgets/prune/prune-widget.tsx:44`
- 내용: `const [apiKeys, setApiKeys] = useState(initialApiKeys)` 형태가 8개 위젯에 반복됩니다. `useState` 초기값은 최초 마운트 때만 반영되므로 서버 컴포넌트가 새 데이터를 내려줘도(라우터 refresh·soft navigation) 화면은 옛 배열을 유지합니다. 게다가 서버 응답 대신 클라이언트가 추측한 값을 넣는 곳도 있습니다 — `api-key-widget.tsx:84` 는 revoke 후 `revokedAt: new Date().toISOString()` 을 직접 만들어 넣어 서버 실제 값과 다를 수 있습니다.
- 조치: 해당 목록을 `useGetXxx()` 쿼리 구독으로 바꾸고 mutation 은 `invalidateQueries` 만 하게 합니다(수동 배열 조작·추측 필드 제거). 전환 전 임시 조치가 필요하면 최소한 서버 데이터를 `key` 로 강제 리마운트하거나 파생값으로 계산해야 합니다.

#### [medium] 위젯이 entities 를 우회해 clientFetch 를 직접 호출 — 데이터 계층 우회

- 근거: `apps/web/src/widgets/container/container-control-widget.tsx:299-300, apps/web/src/widgets/deployment/deployment-widget.tsx:102, apps/web/src/widgets/registry/registry-widget.tsx:55,77,95, apps/web/src/widgets/artifact/artifact-widget.tsx:66,77,91,98,113, apps/web/src/widgets/prune/prune-widget.tsx:58`
- 내용: `container-control-widget` 의 `inspect()` 는 `containerDetailQueryOptions`/`containerLogQueryOptions`(engine.query.ts:28-44)가 이미 존재하는데도 같은 엔드포인트를 `clientFetchData` 로 직접 호출해 URL·스키마가 이중 관리됩니다. `registry-widget` 은 registry 도메인 쿼리 파일 자체가 없어 CRUD 전부(생성/회전/삭제/pull)를 위젯이 직접 fetch 합니다. `artifact-widget` 의 업로드 세션·청크·finalize·load 도 마찬가지입니다.
- 조치: `entities/registry/registry.query.ts`, `entities/artifact/artifact.query.ts`(업로드 mutation 포함)를 신설하고, container inspect 는 기존 `useGetContainerDetail`/`useGetContainerLog` 로 대체합니다. 위젯에서 `clientFetch*` 직접 import 를 금지 규칙으로 둡니다.

#### [medium] deployment 릴리스 진행 상태를 setInterval 로 수동 폴링

- 근거: `apps/web/src/widgets/deployment/deployment-widget.tsx:97-109, apps/web/src/entities/deployment/deployment.query.ts:16-20`
- 내용: `useEffect` 안에서 `window.setInterval(… 2_000)` 으로 `/api/deployment-releases` 를 반복 호출하고 결과를 `setReleaseItems` 로 로컬 state 에 넣습니다. `deploymentReleaseQueryOptions`(entities)가 이미 있고 TanStack 은 `refetchInterval` 로 조건부 폴링을 지원합니다(`engine.query.ts:15` 에서 이미 쓰는 패턴). 현재 구현은 중복 요청 제거·탭 비활성 중단·에러 백오프가 전부 빠져 있습니다.
- 조치: `useGetDeploymentReleases()` 로 교체하고 `refetchInterval: (query) => hasActiveRelease ? RELEASE_POLL_INTERVAL_MS : false` 로 폴링을 위임. `2_000` 은 상수로 승격합니다.

#### [medium] 한 파일 다중 컴포넌트 — SFC 위반, props-only 카드가 widgets 에 잔류

- 근거: `apps/web/src/widgets/infrastructure/infrastructure-widget.tsx:53,106,161,278,368, apps/web/src/widgets/container/container-control-widget.tsx:80, apps/web/src/widgets/image/image-widget.tsx:42, apps/web/src/widgets/user/user-widget.tsx:39, apps/web/src/widgets/nginx/nginx-global-editor.tsx:23,48`
- 내용: `infrastructure-widget.tsx` 한 파일에 `NetworkDetailCard`·`VolumeDetailCard`·`NetworkTab`·`VolumeTab`·`InfrastructureWidget` 5개 컴포넌트(383줄)가 있습니다. 이 중 `NetworkDetailCard`(53)·`VolumeDetailCard`(106), `ContainerDetailCard`(container-control-widget:80), `ImageDetailCard`(image-widget:42), `UserCard`(user-widget:39), `DirectiveRow`(nginx-global-editor:23)는 props+콜백만 받는 순수 UI 라 fsd.md 기준 `features` 소속입니다.
- 조치: 파일당 1 컴포넌트로 분리하고, 데이터/mutation 을 갖지 않는 카드·행 컴포넌트는 `features/<domain>-card/…` 로 이동합니다(예: `features/network-detail-card/network-detail-card.tsx`). 탭 컨테이너(`NetworkTab`/`VolumeTab`)는 mutation 을 쓰므로 widgets 내 별도 파일로 분리합니다.

#### [medium] i18n 소비 방식 이원화 — 한 위젯만 useTranslations, 나머지는 labels props

- 근거: `apps/web/src/widgets/nginx/nginx-config-widget.tsx:58, apps/web/src/app/[locale]/(panel)/nginx/page.tsx:23-32, apps/web/src/app/[locale]/(panel)/api-keys/page.tsx:22-33`
- 내용: 대부분의 페이지가 `getTranslations('Dashboard')` 로 20~30개 문자열을 뽑아 `labels={{...}}` 객체로 위젯에 내려주는 반면, `nginx-config-widget` 만 클라이언트에서 `useTranslations('Dashboard')` 를 직접 씁니다(58행). 같은 위젯이 `labels` prop 과 `t()` 를 동시에 쓰고 있어 번역 키 추가 시 어느 쪽에 넣어야 하는지 규칙이 없습니다. 또한 page 마다 30줄짜리 labels 리터럴이 반복돼 키 누락이 조용히 발생하기 쉽습니다.
- 조치: 클라이언트 위젯은 `useTranslations` 직접 사용으로 통일하는 것을 권장합니다(next-intl 은 `NextIntlClientProvider` 로 이미 클라이언트 메시지를 제공 중). 서버 전용 위젯만 props 유지. 전환 시 page 의 labels 리터럴 블록이 통째로 사라져 페이지 코드가 대폭 단순해집니다.

#### [medium] UI 하드코딩 문자열 — i18n 누락

- 근거: `apps/web/src/widgets/traffic/traffic-widget.tsx:71, apps/web/src/widgets/artifact/artifact-widget.tsx:177,202-203, apps/web/src/features/traffic-live-tail/traffic-live-tail.tsx:64, apps/web/src/widgets/nginx/nginx-config-widget.tsx:207, apps/web/src/widgets/deployment/deployment-widget.tsx:88, apps/web/src/widgets/user/user-widget.tsx:66`
- 내용: `<Badge variant="muted">60m</Badge>`(traffic), `.tar · .tar.gz · .tgz`·`Docker image archive`/`OCI image archive`(artifact), 테이블 헤더 `UTC`(live-tail), 기본 서버 이름 `'server'`(nginx-config), 기본 네트워크 `'containers_edge'`(deployment:88), `<SelectItem value="owner">owner</SelectItem>`(user) 등이 messages 밖에 있습니다. ko/en/ja 키 집합 자체는 543개로 3개 파일이 완전히 일치하므로(누락 0), 문제는 파일 간 불일치가 아니라 코드에 남은 미추출 문자열입니다.
- 조치: 표시용 문자열은 messages 3개 파일에 키를 추가해 추출하고, `containers_edge`·역할 값 같은 식별자는 `shared/lib/constants/` 상수로 분리해 '번역 대상'과 '식별자'를 구분합니다.

#### [medium] 역할 기반 권한 판정 문자열 배열이 12곳에 중복

- 근거: `apps/web/src/shared/lib/session.ts:38-41, apps/web/src/widgets/container/container-control-widget.tsx:238-240, apps/web/src/widgets/artifact/artifact-widget.tsx:62-63, apps/web/src/widgets/nginx/nginx-config-widget.tsx:69, apps/web/src/widgets/infrastructure/infrastructure-widget.tsx:369, apps/web/src/widgets/invitation/invitation-widget.tsx:36`
- 내용: `['owner','admin'].includes(role)` 이 7곳, `['owner','admin','operator'].includes(role)` 이 2곳, `role === 'owner'` 가 4곳에 흩어져 있고 `role` 의 타입도 전부 `string` 입니다. 역할이 하나 추가되거나 이름이 바뀌면 전수 수정이 필요하고, 오타가 타입체크로 걸리지 않습니다. 서버(`session.ts`)는 이미 `canManageApiKeys`/`isOwner` 같은 파생 boolean 을 계산하는데 위젯은 그걸 안 쓰고 raw role 을 다시 판정합니다.
- 조치: `shared/lib/constants/role.ts` 에 `ROLE` as const + `PanelRole` union + `canOperateContainer(role)` 류 술어 함수를 두고, 위젯 props 의 `role: string` 을 `role: PanelRole` 로 좁힙니다. 가능하면 서버가 계산한 권한 boolean 을 그대로 내려 위젯의 재판정을 없앱니다.

#### [medium] mutationFn 입력이 unknown — contracts 스키마로 유도 가능한 타입을 포기

- 근거: `apps/web/src/entities/engine/engine.query.ts:99, apps/web/src/entities/deployment/deployment.query.ts:29, apps/web/src/entities/nginx/nginx.query.ts:51, apps/web/src/entities/infrastructure/infrastructure.query.ts:41, apps/web/src/widgets/infrastructure/infrastructure-widget.tsx:169`
- 내용: `useCreateContainer`/`useCreateDeploymentManifest`/`useCreateNginxRoute`/`useCreateNetwork` 의 `mutationFn: (input: unknown)` 입니다. 호출부(`deployment-widget.tsx:115-146` 의 20필드 객체)가 오타나 필드 누락을 내도 컴파일이 통과하고 런타임 422 로만 드러납니다. `packages/contracts` 에 요청 스키마가 있는 프로젝트에서 `unknown` 을 쓰는 것은 common.md §5.4 위반이기도 합니다.
- 조치: 각 mutation 의 입력을 `z.infer<typeof containerCreateRequestSchema>` 등 contracts 스키마 타입으로 바꾸고, 위젯의 `create = async (input: unknown)`(infrastructure-widget:169)도 함께 좁힙니다. 스키마가 없으면 contracts 에 추가해 API 와 단일 출처를 맞춥니다.

#### [medium] formatBytes 로직 4중 중복

- 근거: `apps/web/src/shared/lib/format-bytes.ts:4-12, apps/web/src/widgets/engine/engine-info.tsx:8-10, apps/web/src/app/[locale]/(panel)/page.tsx:14-16, apps/web/src/widgets/artifact/artifact-widget.tsx:173`
- 내용: 공용 `shared/lib/format-bytes.ts` 가 있는데도 `engine-info.tsx` 가 자체 `MIB`/`formatBytes` 를, `page.tsx` 가 `BYTE_GIB`/`formatGib` 를, `artifact-widget` 이 인라인 `(selectedFile.size / 1_048_576).toFixed(1)` 를 각각 구현합니다. 단위 표기(`MiB` 소수 0자리 vs 1자리 vs GiB)가 화면마다 달라 일관성도 깨집니다.
- 조치: `shared/lib/format-bytes.ts` 에 `formatBytes(bytes, { unit })` 형태로 GiB 까지 지원하도록 한 곳으로 모으고 나머지 3곳을 제거합니다.

#### [medium] 위젯마다 복붙된 busy/error/try-catch 보일러플레이트 15회

- 근거: `apps/web/src/widgets/backup/backup-widget.tsx:45-60, apps/web/src/widgets/registry/registry-widget.tsx:50-106, apps/web/src/widgets/api-key/api-key-widget.tsx:56-91, apps/web/src/widgets/prune/prune-widget.tsx:53-84, apps/web/src/widgets/deployment/deployment-widget.tsx:111-181`
- 내용: `setBusy(x); setError(undefined); try { await mutateAsync(...) } catch (e) { setError(e instanceof Error ? e.message : labels.failed) } finally { setBusy(undefined) }` 패턴이 거의 모든 위젯에 그대로 반복됩니다. TanStack mutation 이 이미 `isPending`/`error` 를 제공하는데 이를 쓰지 않고 수동 상태를 병행 관리하는 것이라, 두 상태가 어긋날 여지도 있습니다.
- 조치: `mutation.isPending` 과 `mutation.error` 를 직접 사용하도록 바꾸고(대부분의 로컬 busy/error state 제거 가능), 여러 mutation 을 묶어 하나의 busy 키가 필요한 화면만 `shared/lib/use-async-action.ts` 같은 공용 훅으로 2회 이상 재사용 규칙에 맞춰 추출합니다.

#### [medium] 매직넘버 다수 — 타임아웃·폴링·진행률·바이트 계수

- 근거: `apps/web/src/widgets/container/container-control-widget.tsx:254, apps/web/src/widgets/backup/backup-widget.tsx:73, apps/web/src/widgets/deployment/deployment-widget.tsx:107,120-137, apps/web/src/widgets/artifact/artifact-widget.tsx:44,47,96,173, apps/web/src/entities/engine/engine.query.ts:15`
- 내용: `timeoutSeconds: 10`(컨테이너 stop/restart), `setTimeout(..., 800)`(reload 지연), `2_000`(폴링 주기), healthcheck `intervalSeconds:5 / retries:6 / timeoutSeconds:3`, `pidsLimit: 256`, `rollbackRetentionSeconds: 86_400`, `memoryMiB * 1_048_576`, 진행률 `25`/`70`/`100` 배분, 해시 청크 `8_388_608`, `refetchInterval: 30_000` 이 코드에 직접 박혀 있습니다. 특히 배포 매니페스트 기본값들은 운영 정책 값이라 코드 안쪽에 숨어 있으면 안 됩니다.
- 조치: 도메인별 `shared/lib/constants/*.ts`(또는 contracts 의 기본값)로 승격: `CONTAINER_STOP_TIMEOUT_SECONDS`, `RELEASE_POLL_INTERVAL_MS`, `DEFAULT_HEALTHCHECK`, `UPLOAD_HASH_CHUNK_BYTES`, `ENGINE_OVERVIEW_REFETCH_MS` 등. 진행률 배분은 `HASH_PROGRESS_WEIGHT`/`UPLOAD_PROGRESS_WEIGHT` 로 명명합니다.

#### [medium] 서버 fetch 계층이 두 가지 방식 + 응답 언랩 스키마 중복

- 근거: `apps/web/src/entities/engine/engine.api.ts:6-20, apps/web/src/entities/infrastructure/infrastructure.api.ts:7,27-41, apps/web/src/entities/job/job.api.ts:17-31`
- 내용: 같은 entities 레이어 안에서 `hc<AppType>` 타입드 클라이언트(engine, infrastructure 상단)와 raw `fetch` + 수동 `'data' in body` 언랩(infrastructure 하단, job, 그 외)이 섞여 있습니다. `const successResponseSchema = z.object({ data: z.unknown(), success: z.literal(true) })` 는 engine.api.ts:6 과 infrastructure.api.ts:7 에 동일하게 중복 정의되고, `data: z.unknown()` 이라 타입 이득도 없습니다.
- 조치: `shared/lib/server-fetch.ts` 에 `serverFetchData<T>(baseUrl, path, cookie, schema)` 하나를 만들어 언랩·에러 처리·스키마 파싱을 통합하고(클라이언트의 `clientFetchData` 와 대칭), 각 `*.api.ts` 는 엔드포인트와 스키마만 선언하게 합니다. 가능하면 `hc<AppType>` 로 통일해 API 타입을 살립니다.

#### [low] 조건부 렌더가 전부 `? … : null` — 컨벤션상 `&&`

- 근거: `apps/web/src/widgets/traffic/traffic-widget.tsx:57,75,76, apps/web/src/widgets/artifact/artifact-widget.tsx:136,137,210,229, apps/web/src/widgets/container/container-control-widget.tsx:126,150,155,168,204, apps/web/src/features/auth-panel/auth-panel.tsx:64,86`
- 내용: `{cond ? <X/> : null}` 형태가 코드베이스 전반(수십 곳)에 사용됩니다. boolean 조건에서는 `{cond && <X/>}` 가 프로젝트 컨벤션입니다. 다만 `{analytics && analytics.requestCount > 0 ? … : null}`(traffic:76)처럼 숫자 falsy 렌더 위험이 있는 자리는 명시적 boolean 화가 필요하므로 기계적 치환은 금물입니다.
- 조치: 조건이 순수 boolean 인 곳만 `&&` 로 치환하고, 숫자·문자열 값이 섞인 조건(`progress > 0`, `artifacts.length === 0` 등)은 비교 연산을 유지합니다. 디자인 개편 시 파일을 어차피 손대므로 그때 함께 정리하는 것이 효율적입니다.

#### [low] 동적 className 을 템플릿 리터럴로 조립 — cn() 미사용

- 근거: `apps/web/src/widgets/panel-shell/panel-shell.tsx:137-139,193-195, apps/web/src/shared/common/master-detail/master-detail.tsx:38-40,49, apps/web/src/widgets/artifact/artifact-widget.tsx:153-155, apps/web/src/widgets/engine/engine-info.tsx:48`
- 내용: `className={`flex … ${active ? 'bg-foreground text-background' : 'hover:bg-muted'}`}` 같이 문자열 보간으로 클래스를 만듭니다. `shared/lib/utils.ts:4` 에 `cn()`(clsx+tailwind-merge)이 이미 있는데 shared/ui 컴포넌트에서만 쓰이고 위젯/공통 컴포넌트에서는 쓰이지 않습니다. tailwind-merge 를 거치지 않아 조건부 클래스가 기본 클래스와 충돌해도 병합되지 않습니다.
- 조치: border 제거·elevation 기반으로 톤을 바꾸는 이번 개편에서 조건부 배경/opacity 클래스가 늘어나므로, 동적 className 은 전부 `cn(base, cond && variant)` 로 전환합니다.

#### [low] 불필요한 반환타입 명시 — 추론 우선 원칙 위반

- 근거: `apps/web/src/shared/lib/navigation.ts:84, apps/web/src/shared/lib/nginx-config/nginx-editor-model.ts:4,6,8,14,17,25,28,47,55,57, apps/web/src/shared/lib/nginx-config/serialize-nginx-config.ts:3,10,12,15,22,31, apps/web/src/widgets/nginx/nginx-config-widget.tsx:204, apps/web/src/widgets/panel-shell/panel-shell.tsx:93`
- 내용: `export const getBlockIndent = (block: NginxBlock): string => …`, `getNavigationSections(...): NavSection[]`, `serverTitle = (block): string =>`, `getActiveItemKey(...): string | null` 등 20여 곳에서 추론 가능한 반환타입을 손으로 적었습니다. common.md §5.2 는 공개 패키지 API·DTO·의존성 계약 4가지 외에는 명시를 금지합니다.
- 조치: nginx-config 유틸군과 navigation/panel-shell 헬퍼의 반환타입 annotation 을 제거합니다(제거 후 `tsc --noEmit` 로 추론 결과가 동일한지 확인). 재귀 함수 등 추론이 불가능해 명시가 필요한 경우만 남깁니다.

#### [low] 컴포넌트 본문 작성 순서 위반 — useRef/커스텀 훅 위치

- 근거: `apps/web/src/widgets/artifact/artifact-widget.tsx:53-61, apps/web/src/widgets/artifact/artifact-widget.tsx:127, apps/web/src/entities/job/job.query.ts:40-60`
- 내용: `artifact-widget` 은 `useState` 8개(53-60) 뒤에 `useRef`(61)가 오고(규약: useRef → useState), `useOperationJobPolling` 커스텀 훅 호출이 함수 정의들 한참 뒤 127행에 있어 그 위 `upload`(100행)·`load`(116행)가 아직 선언 전인 `trackJob` 을 참조합니다(클로저라 동작은 하지만 읽기 흐름이 끊깁니다). `useOperationJobPolling` 자체도 `useState`→`useQuery`→파생값→`useEffect`→함수 순으로 규약과 순서가 다릅니다.
- 조치: `useRef` → `useState` → 파생값/함수 → `useEffect`/커스텀 훅 순으로 재배치하되, 다른 함수가 의존하는 훅 반환값(`trackJob`)은 함수 정의보다 위로 올립니다.

#### [low] shared 하위 비표준 폴더와 레이어 밖 상대경로 import

- 근거: `apps/web/src/shared/common/master-detail/master-detail.tsx:1, apps/web/src/widgets/panel-shell/panel-shell.tsx:33, apps/web/src/app/[locale]/layout.tsx:6, apps/web/src/widgets/nginx/nginx-config-widget.tsx:31-33`
- 내용: fsd.md 는 shared 하위를 `lib/`·`ui/`·`constants/`·`store/` 로 규정하는데 `shared/common/` 이라는 별도 폴더가 존재합니다(PageHeader·WidgetSection·MasterDetail). 또한 `widgets/panel-shell` 이 `../../i18n/navigation` 을, `app/[locale]/layout.tsx` 가 `../../i18n/routing` 을 상대경로로 참조하는데 `src/i18n` 은 어떤 레이어에도 속하지 않고 alias 도 없습니다. `nginx-config-widget` 은 형제 파일을 `./nginx-block-editor` 상대경로로 import 합니다(alias 우선 원칙).
- 조치: `shared/common/*` 을 `shared/ui/`(순수 표현) 또는 `shared/lib/`(훅)로 재배치하고, `src/i18n` 을 `shared/i18n` 으로 옮겨 `@shared/i18n/*` alias 로 참조합니다. 위젯 간 형제 import 도 `@widgets/nginx/...` 로 통일합니다.

#### [low] JSDoc 이 한국어 — 주석 컨벤션(영어) 위반

- 근거: `apps/web/src/shared/common/master-detail/use-master-detail-selection.ts:5-9`
- 내용: 코드베이스 유일한 주석인 이 JSDoc 이 한국어로 작성돼 있습니다. comments.md §2.2 는 JSDoc 을 기본 영어로 규정하며, 다국어가 필요하면 target lang 을 프로젝트에 명시하도록 합니다(현재 명시 없음).
- 조치: 영어로 교체하거나, 팀이 한국어 JSDoc 을 유지하기로 정한다면 `docs/` 에 target lang 결정을 기록합니다. 코드베이스에 주석이 이 한 건뿐이라 규칙 확정 비용이 매우 낮습니다.

### 백엔드 4구성요소 로직 정합성 (apps/api, apps/engine-agent, apps/traffic-worker, infra/nginx)

계층 구조(Route→Service→*ServiceDb, compose에 Drizzle 격리, withErrorHandling/withAuth HOF)와 Zod 계약 단일화는 전반적으로 규약대로 지켜져 있고, upload·backup restore 같은 다중 쓰기는 실제로 트랜잭션으로 묶여 있습니다. 다만 서비스 경계를 넘는 지점에서 실제 버그가 다수 발견됩니다. 가장 큰 문제는 engine-agent 에러코드가 api STATUS_MAP에 하나도 없고 api의 getErrorCode가 `:` 분리를 하지 않아, nginx -t 실패·Docker 404·보호자원 409 같은 의미 있는 실패가 전부 500 INTERNAL_ERROR로 뭉개진다는 점입니다(에이전트 쪽에는 split이 있는데 api에만 없는 비대칭). traffic-worker 수집기는 유효 이벤트가 0건인 청크에서 빈 배열 insert로 예외가 나면 체크포인트가 전진하지 못해 영구 정지하는 경로가 있고, 로그 로테이션 설정 자체가 저장소에 없어 rotation drain 코드가 사실상 미사용입니다. durable job은 heartbeatAt을 기록만 하고 아무 데서도 읽지 않아 stall 회수가 없으며, 그 결과 uniqueResourceKey 잠금이 영구화될 수 있고 취소 요청 후 핸들러가 성공하면 succeeded로 덮어써집니다. 백업 스케줄러는 실패한 백업을 60초마다 무한 재큐잉하는 구조이고, nginx 적용 파이프라인은 non-2xx 응답 시 대기 없이 5회를 즉시 소진해 리로드 중 오탐 롤백을 유발합니다.

#### [critical] engine-agent 에러코드가 api STATUS_MAP에 전무 + api는 `:` 분리 미적용 → 모든 엔진/nginx 실패가 500 INTERNAL_ERROR

- 근거: `apps/api/src/lib/with-error-handling.ts:14-23, apps/api/src/service/shared/engine-agent-client/create-engine-agent-client.ts:94-97, apps/engine-agent/src/service/domain/create-nginx-config-service.ts:248-251, apps/engine-agent/src/lib/error.ts:11-59, apps/api/src/lib/error-code.ts`
- 내용: engine-agent는 `createAppError('NGINX_CONFIG_INVALID:' + validationOutput)`처럼 코드에 부가정보를 붙이고, 자기 쪽 getErrorCode는 `candidate.split(':')[0]`으로 기본코드를 복원합니다(engine-agent/lib/with-error-handling.ts:18). 반면 api의 getErrorCode는 `code in STATUS_MAP`만 검사하고 split이 없습니다(api/lib/with-error-handling.ts:22). 또한 DOCKER_NOT_FOUND·EXEC_FAILED·IMAGE_PULL_FAILED·CONTAINER_NOT_RUNNING·NGINX_PROTECTED_CONTRACT·NGINX_CONTAINER_UNAVAILABLE·NGINX_POST_RELOAD_PROBE_FAILED·NGINX_CONFIG_INVALID·NETWORK_CONNECT_FAILED·PRUNE_PREVIEW_FAILED·EXEC_SESSION_LIMIT_REACHED·REGISTRY_CREDENTIAL_NOT_FOUND 12종을 grep으로 확인한 결과 api/src/lib/error-code.ts에 단 하나도 없습니다. 클라이언트는 `throw createAppError(parseAgentError(body) ?? 'ENGINE_AGENT_'+status)`로 에이전트 코드를 그대로 올리고(create-engine-agent-client.ts:96), 라우트는 audit만 남기고 rethrow합니다(create-nginx-route.ts:191-194). 실패 시나리오: 관리자가 nginx 설정 편집기에서 문법이 틀린 config를 저장 → 에이전트가 `nginx -t` 실패로 400 `{error:"NGINX_CONFIG_INVALID:nginx: [emerg] ..."}` 반환 → api는 이 문자열을 코드로 보고 STATUS_MAP 미존재 판정 → 사용자에게 500 INTERNAL_ERROR와 "내부 오류" 메시지만 노출되고 어느 줄이 틀렸는지 알려주는 validationOutput은 완전히 유실됩니다. 없는 컨테이너 삭제(404 DOCKER_NOT_FOUND), 관리 평면 자원 보호(409 MANAGEMENT_RESOURCE_PROTECTED)도 동일하게 500이 됩니다.
- 조치: apps/api/src/lib/with-error-handling.ts의 getErrorCode를 engine-agent와 동일하게 `code.split(':')[0]` 우선 조회하도록 맞추고, engine-agent STATUS_MAP에만 있는 코드 전체를 apps/api/src/lib/error-code.ts·error-message.ts·STATUS_MAP에 미러링(또는 packages/contracts에 공유 에러코드 모듈을 두고 양쪽이 import)합니다. 추가로 NGINX_CONFIG_INVALID는 코드에 출력을 붙이지 말고 errorResponse의 details로 전달하도록 계약을 바꿉니다.

#### [critical] traffic 수집: 유효 이벤트 0건 청크에서 빈 배열 insert → 예외 → 체크포인트 미전진으로 영구 정지

- 근거: `apps/traffic-worker/src/service/domain/create-traffic-ingestion-service.ts:209-217, 165-173, 264, apps/traffic-worker/src/db/database.ts:56-80`
- 내용: poll()은 `const insertedRequestIds = database.insertEvents(parsed.events)`를 무조건 호출하고(:209), 그 다음 줄에서야 체크포인트를 persist합니다(:217). parseCompleteLines는 모든 줄이 JSON 파싱 실패이거나 스키마 불일치이면 `events: []`, `committedBytes > 0`을 반환합니다(:165-173). insertEvents는 빈 배열을 그대로 drizzle `insert().values([])`에 넘기는데(database.ts:56-80) drizzle insert 빌더는 빈 values를 거부합니다. 예외가 나면 persistCheckpoint에 도달하지 못하므로 offset이 그대로 남고, start()의 catch는 콘솔 로그만 찍습니다(:264). 실패 시나리오: nginx가 log_format 변경 직후 재적용되어 한 청크 전체가 구 포맷/깨진 JSON이거나, 컨테이너 재기동 중 잘린 줄만 있는 구간이 생기면 그 poll 주기에서 events=[] → insertEvents 예외 → offset 미전진 → 다음 주기도 같은 구간을 다시 읽어 동일 예외. 수집이 영구히 그 지점에서 멈추고 이후 모든 트래픽 통계가 갱신되지 않습니다.
- 조치: create-traffic-ingestion-service.ts에서 `parsed.events.length === 0 ? [] : database.insertEvents(parsed.events)`로 가드하거나, db/database.ts의 insertEvents 진입부에서 `if (events.length === 0) return []`로 방어합니다. 겸해서 insert 실패 시에도 재시도 폭주를 막도록 invalid 구간 스킵 정책(연속 실패 카운트 후 committedBytes 만큼 강제 전진)을 둡니다.

#### [high] durable job: heartbeatAt을 쓰기만 하고 아무도 읽지 않음 → stall 회수 부재 + uniqueResourceKey 잠금 영구화

- 근거: `apps/api/src/service/domain/job/create-operation-job-service.ts:266-268, 183-189, 344-362, apps/api/src/compose/compose-operation-job.ts:42-54, 78-82, apps/api/src/server.ts:124-125`
- 내용: runClaimed는 30초마다 heartbeatAt을 갱신하지만(:266-268), 이 컬럼을 조건으로 쓰는 쿼리는 존재하지 않습니다(grep 결과 heartbeatAt은 write와 toJob 직렬화에만 등장). 회수 경로는 listInterrupted(status in running/cancelling 전부)를 도는 reconcileInterrupted 하나뿐이고, 이는 server.ts:124에서 부팅 시 1회만 호출됩니다. 즉 프로세스가 살아있는 채로 핸들러가 무한 대기(예: engine-agent fetch가 응답 없이 매달림)하면 job은 영원히 running입니다. 그리고 enqueue는 findActiveByKind가 queued/running/cancelling을 active로 보므로(compose-operation-job.ts:42-54) 같은 resourceKey의 후속 요청은 계속 그 좀비 job을 반환합니다(:183-189). 실패 시나리오: deploy.release job 실행 중 engine-agent가 응답 없이 멈춰 fetch가 매달림 → job은 running으로 고정 → 같은 releaseId로 재배포를 시도하면 enqueue가 좀비 job을 그대로 돌려주어 사용자는 202를 받지만 아무 일도 일어나지 않음. api를 재시작하기 전까지 해당 리소스의 모든 job이 차단됩니다.
- 조치: claimNext/reconcile에 heartbeat 만료 조건을 추가합니다. OperationJobServiceDb에 `listStalled(threshold)`를 추가해 `status='running' AND heartbeatAt < now - N*HEARTBEAT_INTERVAL_MS`인 행을 주기적으로(setInterval) 재큐잉/실패 처리하고, reconcileInterrupted도 부팅 전용이 아니라 이 stall 스윕과 로직을 공유하도록 재구성합니다.

#### [high] 취소 요청된 job이 핸들러 성공 시 succeeded로 덮어써짐(대부분 핸들러가 isCancelRequested를 보지 않음)

- 근거: `apps/api/src/service/domain/job/create-operation-job-service.ts:269-291, 326-342, 228-241, apps/api/src/service/domain/job/create-job-handlers.ts:53-107, 184-199`
- 내용: requestCancel은 running job을 'cancelling'으로만 바꾸고 실제 중단은 핸들러가 isCancelRequested를 폴링해야 성립합니다(:333-336). 그러나 isCancelRequested를 실제로 호출하는 핸들러는 handleSystemPrune과 handleTrafficExport 둘뿐이고, handleBackupCreate·handleBackupRestore·handleDeployLoad·handleDeployRelease·handleDeployRollback·handleImagePull·handleUploadFinalize는 전혀 확인하지 않습니다. runClaimed의 성공 경로는 상태를 재확인하지 않고 무조건 `status: 'succeeded'`로 업데이트합니다(:278-283). 취소 반영은 오직 실패 경로(finishFailure의 `(await get(job.id)).status === 'cancelling'`, :231)에만 있습니다. 실패 시나리오: 운영자가 진행 중인 backup.restore를 취소 → 상태가 cancelling으로 바뀌고 UI는 "취소 중"을 표시 → 복원은 그대로 완료되어 DB가 교체되고 job은 succeeded로 마감 → cancelRequestedAt만 남아 취소가 무시된 사실이 감사 로그상으로도 드러나지 않습니다.
- 조치: runClaimed 성공 직전에 상태를 재조회해 cancelling이면 'cancelled'로 마감하거나(또는 succeeded + cancelIgnored 이벤트 기록), 장시간 핸들러(backup.create/restore, image.pull, deploy.*)에 reportProgress 단계마다 ensureNotCancelled를 넣어 협조적 취소 지점을 명시합니다. 취소 불가 핸들러는 requestCancel 단계에서 JOB_CANCEL_FAILED로 거부하는 편이 계약상 정직합니다.

#### [high] 백업 스케줄러가 실패한 백업을 60초마다 무한 재큐잉

- 근거: `apps/api/src/service/domain/job/create-backup-schedule-service.ts:15-36, 38-47, apps/api/src/server.ts:127-128, apps/api/src/compose/compose-operation-job.ts:42-54`
- 내용: enqueueIfDue는 `getNextRunAt()`을 '가장 최근 백업 매니페스트의 createdAt + intervalHours'로만 계산합니다(:16-21). 백업이 실패하면 매니페스트가 생기지 않으므로 nextRunAt은 계속 now()가 되고, server.ts:128의 60초 인터벌마다 새 backup.create job이 큐잉됩니다. unique:true는 '활성' job만 dedup하므로 실패로 종료된 직후 곧바로 다음 job이 들어갑니다. 각 job은 다시 maxAttempts 3회 + 60초 backoff 재시도까지 수행하고 onFinished 알림도 매번 발송됩니다(create-operation-job-service.ts:163-168). 실패 시나리오: 디스크가 가득 차 BACKUP_FAILED가 발생 → 1분마다 새 백업 job 생성 → 각 job이 3회 시도하며 부분 스냅샷 임시파일을 계속 쓰고 실패 알림이 분당 1회 발송 → 디스크·알림 채널·operation_job 테이블이 동시에 폭주합니다. 덤으로 getSchedule은 list 기본 limit 50 안에서만 succeeded를 찾으므로(:38-39) 50분이면 마지막 성공 시각이 null로 표시됩니다.
- 조치: create-backup-schedule-service.ts에 실패 백오프를 도입합니다. 최근 backup.create job의 finishedAt/실패 횟수를 조회해 실패 시 지수 백오프(예: 최소 intervalHours/4)를 적용하고, getNextRunAt이 '마지막 시도 시각'도 고려하도록 바꿉니다. getSchedule의 lastSuccess/lastFailure 조회는 limit 50 목록 스캔 대신 status 필터를 건 별도 조회로 분리합니다.

#### [high] engine-agent 이벤트 스트림: 슬롯 획득 후 실패 경로가 누락되어 동시 스트림 한도가 영구 소진

- 근거: `apps/engine-agent/src/service/domain/create-engine-stream-service.ts:195-200, 216-224, 228-241`
- 내용: openWithSource는 acquire() 후 open() 실패만 보상합니다(:216-224). 그런데 openEventStream은 openWithSource로 소스를 연 뒤 try 밖에서 `await dockerEngineClient.getContainers()`를 호출합니다(:231-235). 여기서 예외가 나면 activeStreams는 감소하지 않고 이미 열린 Docker 이벤트 스트림도 destroy되지 않습니다. MAX_CONCURRENT_STREAMS는 20이며 acquire는 이 카운터만 봅니다(:196). 실패 시나리오: Docker daemon이 일시적으로 느려 /containers/json이 5초 타임아웃으로 실패하는 상황에서 사용자가 이벤트 스트림 열기를 20번 재시도 → activeStreams가 20에 고정 → 이후 모든 로그/통계/이벤트 스트림이 ENGINE_STREAM_LIMIT(429)로 거부되고 engine-agent를 재시작하기 전까지 복구되지 않습니다. 동시에 Docker 소켓 연결 20개가 누수됩니다.
- 조치: openEventStream의 getContainers 호출을 acquire 이전으로 옮기거나(로그/통계 스트림처럼), openWithSource가 소스 생성 이후 후처리까지 감싸도록 시그니처를 바꿔 실패 시 `activeStreams -= 1` + `source.destroy()`를 함께 수행하게 합니다.

#### [high] nginx 리로드 프로브: non-2xx 응답 시 대기 없이 5회를 즉시 소진 → 오탐 롤백

- 근거: `apps/engine-agent/src/service/domain/create-nginx-config-service.ts:211-223, 259-268`
- 내용: probeStatus 루프는 `fetcher(...)`가 예외를 던졌을 때만 250ms를 대기합니다(:218-220). 응답이 오되 ok가 아닌 경우(HUP 처리 중 502/504, 혹은 8081 서버가 아직 새 설정으로 바인딩되기 전 404)에는 sleep 없이 곧바로 다음 시도로 넘어가므로 5회 반복이 수 밀리초 안에 끝납니다. 실패하면 apply는 이전 리비전을 되돌리고 다시 HUP을 보낸 뒤 에러를 던집니다(:264-268). 실패 시나리오: 정상적인 설정을 적용했는데 nginx가 리로드하는 수십~수백 ms 동안 /status가 잠깐 non-2xx를 반환 → 5회가 즉시 소진되어 NGINX_POST_RELOAD_PROBE_FAILED → 방금 적용한 유효한 설정이 자동 롤백되고 HUP이 한 번 더 발생. 사용자에게는(위 1번 findings와 겹쳐) 500으로 표시되어 원인 파악도 어렵습니다.
- 조치: probeStatus의 재시도 지연을 try/catch 밖으로 빼서 성공하지 못한 모든 경우에 적용하고, 총 대기 예산(예: 250ms→500ms 지수 증가, 총 5초 이상)을 매직넘버 대신 상수로 정의합니다. 롤백 후에도 probeStatus를 한 번 더 수행해 롤백 성공 여부를 결과에 반영하는 편이 안전합니다.

#### [high] nginx 라우트 변경이 apply-then-persist 순서라 실패/중단 시 live config와 DB가 어긋남

- 근거: `apps/api/src/service/domain/nginx/create-nginx-proxy-route-service.ts:119-125, 146-153, 156-167, 168-192, apps/api/src/service/shared/engine-agent-client/create-engine-agent-client.ts:228`
- 내용: create/upsert/remove 모두 `applyRoutes(...)`로 nginx 설정을 먼저 적용한 뒤 db.insert/update/delete를 수행합니다. 두 작업은 트랜잭션도 보상 로직도 없습니다. 게다가 applyRoutes는 getNginxConfig → renderNginxProxyRoutes → applyNginxConfig의 read-modify-write이며 expectedSha256 낙관적 검사만 있어(create-nginx-config-service.ts:229-233) 동시 요청 시 한쪽이 NGINX_CONFIG_CONFLICT로 실패합니다. api 클라이언트의 applyNginxConfig 타임아웃은 60초인데 에이전트 측 최악 경로(nginx -t 30초 + 프로브)와 겹치면 api가 먼저 abort할 수 있습니다. 실패 시나리오: 라우트를 추가하는 도중 api 프로세스가 재시작되거나 db.insert가 실패하면, nginx는 해당 라우트를 서비스하지만 nginx_route 테이블에는 없는 상태가 됩니다. 목록 화면에 안 보이는 라우트로 외부 트래픽이 계속 흘러가고, 다음 라우트 변경이 일어날 때까지 아무도 제거할 수 없습니다(반대로 api가 60초 타임아웃으로 abort했는데 에이전트가 적용을 끝낸 경우도 동일).
- 조치: DB 기록을 먼저 커밋하고 nginx 적용을 그 뒤에 수행하되 적용 실패 시 DB를 되돌리거나(같은 트랜잭션 내 apply 금지), 최소한 부팅 시 `reconcileNginxRoutes()`를 추가해 DB 목록으로 렌더한 config를 강제 재적용하는 자가치유 경로를 둡니다. 동시 적용은 nginxProxyRouteService 수준의 직렬화(단일 mutex 또는 uniqueResourceKey job)로 막습니다.

#### [high] 로그 로테이션 구성이 저장소에 전혀 없음 → access.jsonl 무한 증가, rotation drain 코드 미사용

- 근거: `infra/nginx/nginx.conf:14, compose.yaml:161, infra/nginx/entrypoint.sh:1-11, apps/traffic-worker/src/service/domain/create-traffic-ingestion-service.ts:128-139, 183-195, apps/traffic-worker/src/db/database.ts:84`
- 내용: nginx는 /var/log/nginx/access.jsonl에 JSONL을 계속 append하고(nginx.conf:14), 이미지 엔트리포인트는 config 복사 후 바로 nginx를 exec할 뿐 로테이션 설정이 없습니다. compose.yaml/infra/scripts 전체를 grep해도 logrotate 관련 파일이 없습니다. traffic-worker의 retention(deleteBefore)은 SQLite 행만 지우고 원본 로그 파일에는 손대지 않습니다(database.ts:84). 결과적으로 findPathByIdentity의 inode 추적·rotation drain·dropRotatedPartial 로직(:128-139, :210-214)은 실환경에서 한 번도 실행되지 않는 경로입니다. 실패 시나리오: 일 수백만 요청 환경에서 nginx-logs 볼륨이 수십 GB로 증가해 호스트 디스크를 소진하고, 그 시점에 nginx는 로그 기록 실패로 요청 처리에 영향을 받습니다. 또한 운영자가 나중에 로테이션을 붙이면 압축(.gz) 설정에 따라 inode가 바뀌어 findPathByIdentity가 원본을 못 찾고 checkpoint를 offset 0으로 리셋해(:183-195) 미읽은 꼬리가 유실됩니다.
- 조치: infra/nginx에 로테이션 수단을 명시적으로 추가합니다(사이드카 logrotate 또는 nginx의 access_log 경로를 날짜별로 나누고 USR1 재오픈). 압축은 rotation drain과 충돌하므로 최소 1세대는 비압축 유지하도록 정책을 고정하고, traffic-worker에 '체크포인트가 가리키는 inode를 못 찾음' 지표를 getState에 노출해 유실을 관측 가능하게 합니다.

#### [medium] job 재시도 시 실행 흔적(startedAt/heartbeatAt/progressStep)과 failureCode가 queued 상태로 남음

- 근거: `apps/api/src/service/domain/job/create-operation-job-service.ts:242-257, 369-379, packages/contracts/src/operation-job.ts:86-105`
- 내용: finishFailure의 재시도 분기는 `update(job.id, { failureCode: code, scheduledAt: retryAt, status: 'queued' })`만 수행합니다(:250). startedAt·heartbeatAt·progressStep은 이전 시도 값 그대로 남고 failureCode도 유지됩니다. operationJobSchema는 이 필드들을 그대로 노출하므로(contracts/operation-job.ts:86-105) 목록/상세 API 소비자는 'queued인데 시작 시각과 실패 코드가 있는' 모순된 job을 받습니다. 실패 시나리오: image.pull이 1회 실패해 60초 뒤 재시도로 예약되면, 대기열 화면에는 상태 '대기'이면서 실패 코드 IMAGE_PULL_FAILED와 진행 단계 'pull'이 함께 표시됩니다. 운영자는 이미 실패로 끝난 job인지 재시도 대기 중인지 구분할 수 없습니다.
- 조치: 재시도 update에 `heartbeatAt: null, progressStep: null, startedAt: null`을 함께 넣고, failureCode는 lastFailureCode 같은 별도 필드로 분리하거나 재시도 시 null로 초기화합니다(직전 실패 사유는 이미 retry-scheduled 이벤트에 기록되어 있습니다, :251-256).

#### [medium] enqueue 중복 제거가 payload 차이를 무시하고 기존 job을 그대로 반환

- 근거: `apps/api/src/service/domain/job/create-operation-job-service.ts:183-189, apps/api/src/route/backup/create-backup-route.ts:111-120, apps/api/src/service/domain/job/create-backup-schedule-service.ts:30-34`
- 내용: enqueue는 unique 또는 uniqueResourceKey가 있으면 활성 job을 찾아 payload 비교 없이 그대로 반환합니다(:184-188). 라우트는 이 job으로 202를 응답하므로 호출자는 자기 요청이 수락된 것으로 오해합니다. backup.restore 라우트만 사후에 `job.payload.backupId !== backupId`를 검사해 BACKUP_RESTORE_IN_PROGRESS를 던지는데(create-backup-route.ts:118-120), 이는 이 위험을 인지하고도 한 곳만 막았다는 뜻입니다. backup.create는 스케줄러가 `{label:'automatic'}`으로 unique:true 큐잉을 합니다. 실패 시나리오: 자동 백업 job이 실행 중일 때 운영자가 라벨을 지정해 수동 백업을 요청하면, 서버는 202와 함께 'automatic' 라벨의 기존 job을 반환합니다. 운영자는 자기 백업이 시작된 줄 알지만 실제로는 만들어지지 않고, 완료 알림도 다른 라벨로 옵니다.
- 조치: enqueue가 dedupe 여부를 구분해 반환(예: `{ job, deduplicated: true }`)하거나, payload 해시가 다르면 409(JOB_ALREADY_ACTIVE 계열 코드 신설)로 거부합니다. 최소한 backup.restore와 동일한 payload 검증을 unique 계열 모든 라우트에 일관 적용해야 합니다.

#### [medium] claimNext가 select-then-update 2단계라 다중 인스턴스에서 동일 리소스 중복 실행 가능

- 근거: `apps/api/src/compose/compose-operation-job.ts:55-71, 42-54, apps/api/src/service/domain/job/create-operation-job-service.ts:209-226, 294-311`
- 내용: claimNext는 queued 행을 select한 뒤 별도 update로 status='running'을 겁니다. compose 구현의 update는 `where id = ? AND status = 'queued'`로 CAS를 걸어(compose-operation-job.ts:64-71) 같은 job의 이중 claim 자체는 막지만, attempt 증가값을 select 시점 값 기반으로 계산하고(`candidate.attempt + 1`, :214), 무엇보다 tick의 동시 실행 방지는 프로세스 로컬 `processing` 플래그뿐입니다(:294-299). enqueue의 uniqueResourceKey 잠금도 select 기반이라 원자적이지 않습니다(compose-operation-job.ts:42-54). 실패 시나리오: api를 2 레플리카로 확장하면 동일 releaseId에 대해 두 프로세스가 거의 동시에 enqueue 검사를 통과해 deploy.release job이 2개 생성되고, 같은 컨테이너 이름/라우트에 대해 두 배포 파이프라인이 동시에 nginx 설정을 적용합니다(NGINX_CONFIG_CONFLICT와 좀비 컨테이너 발생).
- 조치: claim을 단일 UPDATE ... WHERE status='queued' AND scheduledAt<=now RETURNING(현재 claim의 CAS를 claimNext에 통합)으로 원자화하고, enqueue의 중복 방지는 operation_job에 (kind, resourceKey) 부분 유니크 인덱스(활성 상태 한정)를 추가해 DB가 강제하도록 합니다. 단일 인스턴스 전제라면 docs와 compose에 그 제약을 명시해야 합니다.

#### [medium] 백업 복원이 nginx_route·deployment_release를 되돌리지만 실제 nginx 설정과 컨테이너는 되돌리지 않음

- 근거: `apps/api/src/compose/compose-backup.ts:15-32, 61-89, apps/api/src/service/domain/backup/create-backup-service.ts:47-48, 157-171`
- 내용: PRESERVED_TABLES에 operation_job·user·session·artifact 등은 포함되지만 nginx_route, deployment, deployment_release, deployment_manifest는 포함되지 않아 스냅샷 시점 값으로 교체됩니다(compose-backup.ts:15-32). 백업 아티팩트는 control.sqlite와 traffic.sqlite뿐이며(create-backup-service.ts:47-48) nginx-config 볼륨의 current.conf는 백업 대상이 아닙니다. 복원 후 nginx 설정을 재적용하는 후처리도 없습니다(:157-171). 실패 시나리오: 라우트 A를 추가한 뒤 그 이전 백업으로 복원하면, DB의 nginx_route에는 A가 없지만 live current.conf에는 A의 server 블록이 그대로 남아 외부 트래픽이 계속 흐릅니다. 반대로 복원된 DB에만 존재하는 라우트 B는 nginx에 반영되지 않아 502가 납니다. 다음 라우트 변경이 일어날 때까지 이 불일치가 지속됩니다.
- 조치: backupService.restore 성공 직후(또는 handleBackupRestore 마지막 단계에서) nginxProxyRouteService의 전체 재렌더 적용을 호출하고, deployment_release는 reconcileInterrupted와 동일한 정합화 루틴을 태웁니다. 복원 대상 테이블 목록과 그 부작용을 docs에 명시하는 것도 필요합니다.

#### [medium] 배포 실패 경로가 생성한 컨테이너를 제거하지 않고 사용자 네트워크에 붙은 채 남김

- 근거: `apps/api/src/service/domain/deployment/create-deployment-release-service.ts:427-428, 466-489, 316-333, apps/api/src/service/domain/job/create-job-handlers.ts:84-91`
- 내용: run()의 catch는 containerId가 있으면 stop과 probe 네트워크 disconnect만 수행합니다(:481-484). 컨테이너 remove는 없고, 성공적으로 manifest.network에 connect된 뒤(:427) 실패한 경우 그 네트워크 연결도 끊지 않습니다. cleanupExpiredContainers는 status='healthy'인 릴리스의 previous 컨테이너만 제거하므로(:316-333) 실패한 릴리스의 컨테이너는 어떤 GC에도 걸리지 않습니다. deploy.release job은 terminal 에러라 재시도조차 하지 않습니다(create-job-handlers.ts:84-91). 실패 시나리오: 관찰 단계(observationSeconds) 프로브가 실패해 롤백되면, 새 이미지의 컨테이너가 stopped 상태로 사용자 네트워크에 attach된 채 영구히 남습니다. 배포 실패를 반복할수록 stopped 컨테이너와 이미지 레이어가 누적되어 디스크를 잠식하고 prune 미리보기 목록만 부풀립니다.
- 조치: run/runRollback의 실패 정리 블록에서 `performContainerAction(containerId, { action: 'remove', confirmation: release.containerName, force: true, removeVolumes: false })`까지 수행하거나(실패 시 warning만 기록), cleanupExpiredContainers를 failed/rolled-back 릴리스의 containerId도 회수하도록 확장합니다.

#### [medium] 정상 배포에 경고 문자열을 failureCode에 기록해 성공 릴리스가 실패처럼 보임

- 근거: `apps/api/src/service/domain/deployment/create-deployment-release-service.ts:459-464, 206-211`
- 내용: healthy로 마감한 뒤 이전 컨테이너 stop이 실패하면 `.catch(() => update(id, { failureCode: 'PREVIOUS_CONTAINER_STOP_WARNING' }))`로 failureCode를 덮어씁니다(:463). runRollback도 동일하게 `MANUAL_ROLLBACK:CURRENT_CONTAINER_STOP_WARNING`을 성공 결과에 씁니다(:206-211). failureCode는 계약상 '실패 사유' 필드이므로 소비자는 이를 오류로 렌더합니다. 실패 시나리오: 배포가 완전히 성공했는데 이전 컨테이너가 이미 수동으로 삭제되어 stop이 404를 반환하면, 릴리스 상태는 healthy이면서 failureCode에 경고가 채워집니다. UI는 성공한 배포를 실패/경고 상태로 표시해 운영자가 불필요한 롤백을 시도할 수 있습니다.
- 조치: 경고는 failureCode가 아니라 별도 필드(warningCode) 또는 operation_job 이벤트/audit_log로 분리합니다. 계약(deploymentReleaseSchema)에 warningCode를 추가하고 web 렌더링에서 실패와 구분해 표시합니다.

#### [medium] 대화형 exec가 백프레셔를 흡수하지 않고 세션을 강제 종료

- 근거: `apps/engine-agent/src/service/shared/create-interactive-exec-session.ts:125-134, 158, apps/engine-agent/src/route/create-interactive-exec-route.ts:12`
- 내용: attached.socket은 attach 직후 resume()만 되고(:158) 이후 어디에서도 pause()되지 않습니다. 대신 데이터 수신 때마다 websocket.raw.getBufferedAmount()가 1MiB(INTERACTIVE_EXEC_MAX_BUFFERED_OUTPUT_BYTES)를 넘으면 즉시 closeSession(1013)으로 세션을 끊습니다(:126-128). 실패 시나리오: 컨테이너에서 `cat large.log`나 빌드 로그처럼 순간 출력이 큰 명령을 실행하면, 브라우저가 잠시 소비가 밀리는 것만으로 버퍼가 1MiB를 넘어 터미널이 '출력 소비 속도가 너무 느립니다'로 강제 종료됩니다. 사용자는 명령을 완료하지 못하고 세션을 다시 열어야 합니다.
- 조치: 버퍼 임계 초과 시 우선 `attached.socket.pause()`로 흐름을 멈추고, 주기적으로 getBufferedAmount를 확인해 임계 이하로 떨어지면 resume()합니다. 일정 시간(예: 수 초) 동안 해소되지 않을 때만 1013으로 종료하도록 2단계 정책으로 바꿉니다.

#### [medium] SSE 하트비트가 닫힌 controller에 enqueue를 시도해 uncaught 예외 가능

- 근거: `apps/engine-agent/src/service/domain/create-engine-stream-service.ts:139-193`
- 내용: heartbeat 인터벌은 `closed` 플래그만 확인하고 `controller.enqueue(...)`를 호출합니다(:181-185). closed는 finish/cancel 경로에서만 true가 되므로, 소비자 측에서 스트림이 error 상태가 되었지만 cancel 콜백이 아직 호출되지 않은 구간에서는 enqueue가 TypeError를 던집니다. data 핸들러 쪽 enqueue도 동일하게 보호가 없습니다(:172-174). 실패 시나리오: 클라이언트가 SSE 연결을 비정상 종료(네트워크 끊김)해 응답 스트림이 errored 상태가 되면, 15초 뒤 하트비트 타이머에서 enqueue 예외가 setInterval 콜백 안에서 발생합니다. Promise 체인 밖이라 잡히지 않고 engine-agent 프로세스의 uncaughtException으로 올라갑니다.
- 조치: enqueue 호출을 try/catch로 감싸 실패 시 release()로 정리하도록 하고(하트비트·data 양쪽), controller.desiredSize === null(닫힘) 검사도 추가합니다.

#### [medium] traffic 보존 정책이 nginx가 기록한 이벤트 시각 기준이라 시계 오차에 취약

- 근거: `apps/traffic-worker/src/db/database.ts:63, 84, apps/traffic-worker/src/service/domain/create-traffic-ingestion-service.ts:223, 240`
- 내용: deleteBefore는 `occurred_at < now - retentionMs`로 삭제하는데(database.ts:84), occurred_at은 로그 라인의 `timestamp` 필드에서 파생됩니다(database.ts:63). 즉 수집 시각이 아니라 로그가 주장하는 시각입니다. 게다가 이벤트 삽입 직후 같은 poll 안에서 deleteBefore가 호출됩니다(ingestion:223). 실패 시나리오: 호스트/컨테이너 시계가 과거로 틀어진 상태에서 nginx가 남긴 라인들은 삽입되자마자 같은 poll의 deleteBefore에 의해 즉시 삭제됩니다(ingestedEventCount는 증가하는데 조회 결과는 0건). 반대로 시계가 미래로 튄 구간의 행은 retention을 영원히 통과해 남습니다. 또 매 poll마다 전체 범위 삭제를 수행하므로 대량 데이터에서 poll 지연을 유발합니다.
- 조치: ingested_at(수집 시각) 컬럼을 추가해 retention은 ingested_at 기준으로 수행하고, occurred_at은 조회/집계 전용으로 둡니다. deleteBefore는 매 poll이 아니라 별도 저빈도 타이머(예: 5분)에서 실행하도록 분리합니다.

#### [medium] engine-agent 응답 truncated 판정이 경계값에서 오탐 → 유효한 nginx 설정이 거부됨

- 근거: `apps/engine-agent/src/service/shared/create-docker-engine-client.ts:326-335, 366-378, apps/engine-agent/src/service/domain/create-nginx-config-service.ts:241-251`
- 내용: 응답 수집기는 `truncated ||= storedBytes < chunk.byteLength || storedBytes >= maxStoredBytes`로 판정합니다(:335). 두 번째 조건이 '>= 한계'이므로 실제로 잘린 바이트가 하나도 없어도 본문 길이가 정확히 maxStoredBytes면 truncated=true가 됩니다. 첫 번째 조건은 누적값(storedBytes)과 청크 길이를 비교하는 것이라 사실상 의미가 없습니다. nginx apply는 `validation.exitCode !== 0 || validation.truncated`이면 후보 설정을 삭제하고 실패로 처리합니다(:248-251). 실패 시나리오: `nginx -t` 출력이 정확히 1,048,576바이트가 되는 경우(경고가 매우 많은 대형 설정) 검증이 성공(exitCode 0)했는데도 truncated로 판정되어 NGINX_CONFIG_INVALID로 거부됩니다. exec 결과 표시에서도 잘리지 않은 출력이 '잘림'으로 표시됩니다.
- 조치: 판정을 실제 드랍 바이트 기준으로 바꿉니다. 누적 수신 바이트(receivedBytes)를 따로 세고 `truncated = receivedBytes > maxStoredBytes`로만 계산하도록 requestDockerEngine/requestDockerEngineFile을 수정합니다.

#### [medium] 로그 디렉터리 전수 stat 중 파일 소멸 시 poll 전체가 중단

- 근거: `apps/traffic-worker/src/service/domain/create-traffic-ingestion-service.ts:128-139, 41-48, 176-182, 263-268`
- 내용: findPathByIdentity는 readdir 후 각 엔트리에 대해 getIdentity(=stat)를 예외 처리 없이 호출합니다(:131-137). readdir과 stat 사이에 파일이 사라지면 ENOENT가 그대로 전파되어 poll이 중단되고, start()의 run 래퍼는 콘솔 에러만 남깁니다(:264). 체크포인트 갱신은 물론 deleteBefore도 그 주기에 수행되지 않습니다. 실패 시나리오: 로테이션/정리 스크립트가 /var/log/nginx의 오래된 파일을 지우는 순간과 poll이 겹치면 그 주기의 수집이 통째로 스킵됩니다. 로테이션 직후처럼 원본 inode 탐색이 필요한 시점에 반복되면, 새 활성 파일로 리셋되는 경로(:183-195)에 도달하지 못한 채 실패만 반복될 수 있습니다.
- 조치: findPathByIdentity의 후보 stat을 getIdentityIfPresent(:41-48)로 바꿔 ENOENT를 건너뛰고, 디렉터리 전수 스캔 대신 `${basename(accessLogPath)}.*` 패턴으로 후보를 좁힙니다.

#### [medium] api의 isAppError 분기가 죽은 코드 — createAppError가 code/statusCode 없는 순수 Error를 반환

- 근거: `apps/api/src/lib/error.ts:4-9, 174-182, apps/api/src/lib/with-error-handling.ts:35-41, apps/engine-agent/src/lib/error.ts:63-72`
- 내용: api의 createAppError는 `new Error(code)`만 반환하므로(error.ts:174) code·statusCode 프로퍼티가 없고, isAppError는 이 세 키를 모두 요구하므로(:176-182) 항상 false입니다. 결과적으로 withErrorHandling의 isAppError 분기(:35-41)는 절대 실행되지 않고, 모든 에러 매핑이 message 문자열 == 에러코드 관례에 의존합니다. AppError 타입 선언과 details 필드도 실제로는 쓰이지 않습니다. engine-agent는 반대로 code/statusCode를 실제로 부착합니다(engine-agent/lib/error.ts:63-72). 실패 시나리오: 도메인 로직이 사용자 입력 문자열을 message에 담아 throw하면 그 문자열이 그대로 에러코드 후보로 조회되고, details를 통한 부가 정보 전달 경로가 계약상 존재하는데도 실제로는 항상 유실됩니다.
- 조치: engine-agent와 동일하게 api의 createAppError도 code·statusCode(·details)를 부착한 AppError를 반환하도록 통일하고, 두 앱이 같은 구현을 공유하도록 packages/contracts(또는 신설 packages/errors)로 승격합니다. 그러면 1번 findings의 매핑 문제도 함께 해소됩니다.

#### [low] nginx 리비전 파일이 GC되지 않고 getState가 매 호출 전수 stat

- 근거: `apps/engine-agent/src/service/domain/create-nginx-config-service.ts:253-258, 277-292, packages/contracts/src/nginx.ts:23-27`
- 내용: apply는 이전 설정을 `${previousSha256}.revision`으로 보존하고 삭제 정책이 없습니다(:253-258). getState는 configRoot의 모든 항목을 readdir한 뒤 정규식에 맞는 파일마다 stat을 수행해 history를 만듭니다(:279-290). nginxConfigStateSchema.history에도 길이 제한이 없습니다. 실패 시나리오: 설정을 자주 편집하는 환경에서 nginx-config 볼륨에 리비전 파일이 무한 축적되고, 설정 화면을 열 때마다 파일 수에 비례한 stat이 발생해 응답이 느려지며 응답 본문 크기도 계속 커집니다.
- 조치: apply 성공 후 최신 N개(예: 20)만 남기고 오래된 .revision을 정리하는 로직을 추가하고, getState는 mtime 정렬 후 상한(상수로 정의)을 적용해 반환합니다.

### 보안 경계 재검토 (인가 · 입력 검증 · 관리 plane 자기보호 · 시크릿 · SSRF · 웹 · rate limit)

12라운드 하드닝의 골격(HMAC 내부 인증, recent-auth step-up, 관리 plane 라벨 보호, AES-256-GCM 시크릿, SSRF DNS 검증, prune preview sha 재검증)은 실제로 코드에 구현되어 있고 상당히 견고합니다. 특히 prune job이 실행 시점에 preview sha256을 재계산해 재검증하는 점(create-job-handlers.ts:110-113), Docker Engine 경로 전부 encodeURIComponent 적용, HMAC nonce+skew 검증, registry credential 원문 미노출(serialize)은 모두 정상 동작합니다. 그러나 관리 plane 자기보호에는 새로 발견한 실질적 구멍이 있습니다. `tagImage`에는 관리 plane 검사가 전혀 없어 admin이 제어 plane 이미지 태그를 하이재킹할 수 있고, admin이 `backup:write` API key를 스스로 발급해 owner 전용 restore를 수행할 수 있으며, nginx 보호 계약 검증이 substring·first-match 파싱이라 decoy 블록으로 rate limit·CSP를 무력화할 수 있습니다. 또 여러 가드가 "직접 참조를 해석해 검사한 뒤 Docker에는 원문 문자열을 그대로 전달"하는 패턴이라 가드 대상과 실제 대상이 갈릴 수 있습니다(removeImage의 endsWith가 가장 명확). 마지막으로 engine-agent가 보호 network를 강제하지 않아 SECURITY.md §5의 "Agent는 API의 판정을 맹신하지 않는다" 원칙이 network 축에서 깨져 있습니다. 이번 UI 개편에서는 border 제거·모노톤 전환이 인가 로직에 직접 닿지 않지만, 위험 등급(파괴적·root-equivalent)을 색이 아닌 타이포·간격·확인 절차로 표현해야 하므로 확인 다이얼로그·재입력 UX는 그대로 유지해야 합니다.

#### [critical] image tag에 관리 plane 보호가 전혀 없어 제어 plane 이미지 태그를 하이재킹할 수 있다

- 근거: `apps/engine-agent/src/service/domain/create-engine-control-service.ts:532-536, apps/api/src/service/domain/control/create-control-service.ts:80, packages/contracts/src/engine-control.ts:316-323, apps/api/src/route/control/create-control-route.ts:645-686`
- 내용: `tagImage`는 `dockerEngineClient.tagImage(imageId, request.repository, request.tag)`를 그대로 호출하며, 대상 이미지가 관리 plane 컨테이너에 사용 중인지도, 목적지 repository가 제어 plane 이미지 이름인지도 검사하지 않습니다. `imageTagRequestSchema`의 repository 정규식은 `/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/`라 `containers-engine-agent` 같은 이름을 그대로 허용합니다. compose.yaml의 5개 서비스는 `image:` 없이 `build:`만 쓰므로 빌드 이미지 태그는 `containers-<service>:latest`이고, docker tag는 기존 태그를 덮어씁니다. 즉 admin(+recent-auth)만으로 임의 이미지를 `containers-engine-agent:latest`로 재태그해 두면 다음 `docker compose up`(--build 없이) 시 Docker socket이 마운트된 컨테이너가 공격자 이미지로 기동됩니다. 대조적으로 `removeImage`는 `containers.some(c => c.ImageID === image.Id && isManagementPlaneResource(c.Labels))` 검사를 하고 있어(같은 파일 547-549) 보호 의도가 명확한데 tag만 빠져 있습니다. SECURITY.md 위험도 등급상 이는 root-equivalent(owner + break-glass) 경로인데 admin 등급으로 도달합니다.
- 조치: engine-agent `create-engine-control-service.ts`의 `tagImage`에 두 가지 가드를 추가: (1) 대상 이미지가 관리 plane 컨테이너의 ImageID이면 `MANAGEMENT_RESOURCE_PROTECTED`, (2) `request.repository`가 제어 plane 이미지 이름 집합(`containers-api`/`containers-web`/`containers-engine-agent`/`containers-nginx`/`containers-traffic-worker`, compose project 이름 기반으로 생성)과 일치하거나 그 prefix면 거부. 이 이름 목록은 이미 흩어져 있는 PROTECTED_CONTAINERS/PROTECTED_VOLUMES/PROTECTED_NETWORKS와 함께 `packages/contracts`의 단일 상수 모듈로 모으고 api·agent가 같은 소스를 import 하도록 정리하십시오.

#### [high] admin이 backup:write API key를 스스로 발급해 owner 전용 백업 복원을 수행할 수 있다 (권한 상승)

- 근거: `apps/api/src/route/api-key/create-api-key-route.ts:12,44, packages/contracts/src/api-key.ts:27-34, apps/api/src/route/backup/create-backup-route.ts:18,32-37, apps/api/src/route/backup/create-backup-route.ts:103-116`
- 내용: API key 생성은 `ADMIN_ROLES = [owner, admin]` + recent-auth만 요구하고(`create-api-key-route.ts:12,44`), `apiKeyCreateSchema.scopes`는 9개 scope 전부를 제한 없이 허용합니다. 반면 backup 라우트의 `authenticateWrite`는 `headers.has('authorization')`이면 `apiKeyService.authenticate(headers, API_KEY_SCOPE.BACKUP_WRITE)`만 통과시키고, session 경로일 때만 `BACKUP_ROLES = [USER_ROLE.OWNER]` + recent-auth를 요구합니다. 따라서 admin은 `backup:write` scope 키를 발급한 뒤 그 키로 `/api/backups/:id/restore`를 호출해 control.sqlite 전체를 이전 스냅샷으로 되돌릴 수 있습니다(자신의 강등 취소, owner 계정 상태 되돌리기 등). SECURITY.md §3은 "API 키에는 root-equivalent scope를 기본 발급하지 않는다. owner가 명시적으로 허용해도…"라고 owner 승인을 전제하는데 구현은 admin에게 열려 있습니다. 같은 구조로 API key 경로는 recent-auth 재인증도 전면 우회합니다.
- 조치: `create-api-key-route.ts`에서 scope별 최소 role을 매핑해(예: `backup:write`·`secret:write`는 owner + recent-auth, 나머지는 admin) 발급 시점에 강제하고, `apiKeyCreateSchema`에 role 상한을 넘길 수 있도록 시그니처를 바꾸십시오. 추가로 backup restore처럼 파괴적인 operation은 API key 경로 자체를 막고(scope 존재 여부와 무관하게 session-only) `backup:write`는 생성·조회로만 한정하는 편이 SECURITY.md §14의 의도와 맞습니다.

#### [high] nginx 보호 계약 검증이 substring·first-match 파싱이라 decoy 블록으로 rate limit·CSP를 우회할 수 있다

- 근거: `apps/engine-agent/src/service/domain/create-nginx-config-service.ts:71-79, 120-127, 147-184, apps/api/src/route/nginx/create-nginx-route.ts:184`
- 내용: `extractServerBlock`은 `config.indexOf('server_name ' + serverName)`으로 첫 등장 위치를 찾고, `extractLocation`은 `/location \/api\//` 정규식의 첫 매치를 씁니다. 두 가지 우회가 성립합니다. (1) `server_name panel.containers.localhost;`처럼 보호 이름을 prefix로 갖는 decoy server 블록을 앞에 두고 필수 토큰(listen 8080, CSP/X-Frame-Options/X-Content-Type-Options, 두 upstream proxy_pass, limit_req가 있는 /api/ 및 sign-in location)을 모두 채워 넣으면 `indexOf`가 decoy를 잡아 계약 검사를 통과하고, 실제 `server_name panel.containers.local` 블록은 뒤에 rate limit·CSP 없이 둘 수 있습니다. nginx는 정확히 일치하는 뒤쪽 블록으로 라우팅하므로 검사 대상과 실제 서비스 블록이 갈립니다. (2) `location /api/dummy { limit_req zone=containers_api_rate ...; }`를 실제 `location /api/ {` 앞에 두면 정규식 첫 매치가 dummy를 잡아 `apiLocation` 검사가 통과합니다. `hasExcessiveBurst`도 `location.match`로 첫 limit_req만 봅니다. 전체 nginx.conf 편집은 admin + recent-auth로 가능하며(create-nginx-route.ts:184), 이 보호 계약은 SECURITY.md §7의 "UI나 API에서 제거할 수 없다"는 유일한 방어선입니다. `nginx -t`는 decoy 구성도 valid로 통과시킵니다.
- 조치: substring 검사를 실제 파서로 대체하십시오. 최소한 (a) server 블록 경계를 먼저 토큰화해 전부 수집한 뒤 `server_name` 값을 공백/세미콜론 기준으로 정확히 토큰 분해해 `panel.containers.local`을 포함하는 **모든** 블록을 검사하고, (b) 각 블록 안의 `location` 을 전부 열거해 `/api/` prefix를 실제로 커버하는 location(정확히 `/api/` 또는 `^~ /api/`)을 골라 검사하며, (c) 여러 개가 발견되면 전부 계약을 만족해야 통과시키는 all-must-pass 방식으로 바꾸십시오. 장기적으로는 raw config 전체 편집을 없애고 GUI 모델에서 config를 렌더링하는 방향(create-nginx-proxy-route-service.ts의 renderNginxProxyRoutes 패턴)이 더 안전합니다.

#### [high] removeImage 가드가 digest suffix로 이미지를 찾고 Docker에는 사용자 원문을 넘겨 가드 대상과 삭제 대상이 갈릴 수 있다

- 근거: `apps/engine-agent/src/service/domain/create-engine-control-service.ts:537-553, 69-79, 494-517, 290-297, apps/engine-agent/src/service/shared/create-docker-engine-client.ts:715-724`
- 내용: `removeImage`는 `images.find(c => c.Id === imageId || c.Id.endsWith(imageId) || c.Id.startsWith(imageId))`로 대상을 정하는데, `image.Id`는 `sha256:...` 형태이므로 `startsWith`/`===`는 사실상 죽은 분기이고 실제 매칭은 **digest 꼬리(endsWith)** 로 이뤄집니다. 그런데 관리 plane 검사를 통과한 뒤 Docker에 넘기는 것은 해석된 `image.Id`가 아니라 **사용자 원문 `imageId`** 입니다(551행). Docker는 digest **앞부분(prefix)** 으로 해석하므로, 어떤 비관리 이미지의 digest 꼬리가 관리 plane 이미지 digest의 앞부분과 일치하는 짧은 문자열을 고르면 가드는 비관리 이미지를 보고 통과시키고 Docker는 관리 plane 이미지를 삭제합니다. `/api/images`가 모든 role에게 full digest를 반환하므로 공격자는 두 digest를 모두 알 수 있고, 임의 이미지를 load/pull 해 원하는 꼬리를 가진 digest를 만들 수 있습니다. 동일한 "해석은 로컬, 실행은 원문" 패턴이 `performContainerAction`(515행), `executeContainer`(296행), `connect/disconnectContainerNetwork`(257·287행)에도 있습니다. 반대로 `removeNetwork`는 해석된 `network.Id`를 넘기고 있어(569행) 올바른 형태를 이미 갖고 있습니다.
- 조치: 모든 engine-control 함수에서 `findContainerByReference`/`images.find` 로 해석한 canonical ID(`container.Id`, `image.Id`)를 Docker 호출에 그대로 사용하도록 통일하고, 해석에 실패해 대상을 특정하지 못하면 `DOCKER_NOT_FOUND`로 fail-closed 하십시오(현재 `if (container && isManagement...)`는 대상 미발견 시 통과합니다). `endsWith` 매칭은 제거하고 `sha256:` prefix를 벗긴 뒤 prefix 매칭만 허용하며, 다중 매치는 모호성 오류로 거부하십시오.

#### [medium] engine-agent가 보호 network를 강제하지 않아 "Agent는 API 판정을 맹신하지 않는다" 원칙이 network 축에서 깨져 있다

- 근거: `apps/engine-agent/src/service/domain/create-engine-control-service.ts:260-271, 247-259, apps/api/src/service/domain/control/create-control-service.ts:17-28, 35-44, apps/api/src/compose/compose.ts:76-89`
- 내용: agent의 `createContainer`는 volume은 `PROTECTED_VOLUMES`로 막지만 network는 `host`/`none`만 거부하고 `containers_control`/`containers_ingress`/`containers_probe`는 통과시킵니다. `connectContainerNetwork`도 대상 컨테이너가 관리 plane인지만 보고 **연결하려는 network가 관리 network인지는 검사하지 않습니다**. 현재 공개 API 경로는 `create-control-service.ts:37`과 manifest 서비스가 각각 `PROTECTED_NETWORKS`를 검사하고 있어 즉시 악용되지는 않지만, SECURITY.md §5는 "Agent는 API의 판정을 맹신하지 않고 operation별 허용 DTO를 검증한다"를 명시하며 §10은 Agent port가 internal 네트워크에서만 들리는 것을 불변식으로 둡니다. 보호 목록이 api compose.ts(76-89행 PROTECTED_CONTAINERS/89행 PROTECTED_NETWORKS), api control-service.ts(17-28행), agent(88-98행 PROTECTED_VOLUMES)에 각각 중복 정의되어 이미 network 축에서 불일치가 발생한 상태입니다. 사용자 컨테이너가 `containers_control`에 붙으면 HMAC이 없는 agent `/health`·`/ws/exec/:ticket`과 traffic-worker·api 내부 포트에 직접 도달합니다.
- 조치: 보호 network·volume·container 이름을 `packages/contracts`의 단일 상수로 옮기고, agent의 `createContainer`와 `connectContainerNetwork` 양쪽에서 `PROTECTED_NETWORKS.includes(network)` 검사를 추가하십시오. 배포 릴리스가 probe network를 붙여야 하므로, probe 연결은 별도의 내부 전용 operation(`attachProbeNetwork`)으로 분리해 일반 connect 경로에서는 관리 network를 전면 거부하는 편이 안전합니다.

#### [medium] nginx route의 보호 컨테이너 목록이 정확 문자열 매칭이라 대소문자·Docker DNS alias로 우회해 제어 plane 서비스를 라우팅할 수 있다

- 근거: `apps/api/src/compose/compose.ts:76-87, apps/api/src/service/domain/nginx/create-nginx-proxy-route-service.ts:105-109, packages/contracts/src/nginx.ts:39,54, apps/api/src/service/domain/nginx/create-nginx-proxy-route-service.ts:59, infra/nginx/nginx.conf:19`
- 내용: `assertProtectedTarget`은 `protectedContainers.includes(payload.targetContainer)`로 소문자 10개 이름만 정확히 비교하는데, `containerTargetPattern = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/`은 대문자와 `.`을 허용하고 hostname 필드와 달리 `.toLowerCase()`도 적용되지 않습니다. 렌더링된 location은 `set $containers_route_upstream "http://<target>:<port>"`이고 nginx는 `resolver 127.0.0.11`(Docker embedded DNS)로 이름을 해석하는데 DNS는 대소문자를 구분하지 않으므로 `API`, `Engine-Agent`, 또는 `api.containers_ingress` 같은 network-qualified alias가 모두 제어 plane 서비스로 해석됩니다. 생성되는 route 블록은 `proxy_set_header Cookie ""`/`Authorization ""`로 인증정보를 지우므로 즉시 데이터 유출은 아니지만, 해당 server 블록에는 `limit_req zone=containers_auth_rate`가 없으므로 **로그인 5r/m rate limit을 완전히 우회하는 /api/auth/sign-in/email 경로**를 만들 수 있습니다(앱 레벨 10/min만 남음).
- 조치: `nginxProxyRouteInputSchema.targetContainer`에 `.trim().toLowerCase()`를 추가하고, `assertProtectedTarget`을 정확 매칭 대신 (a) 소문자 정규화 후 비교, (b) `<protected>.<anything>` 형태의 network-qualified 이름 거부, (c) 가능하면 이름 목록이 아니라 engine-agent에 조회해 `isManagementPlaneResource` 라벨로 판정하는 방식으로 바꾸십시오. 동시에 렌더링된 route server 블록에도 `limit_req zone=containers_api_rate`를 기본 삽입해 rate limit 사각지대를 없애십시오.

#### [medium] better-auth 외 커스텀 /api/* 변경 route에 Origin·Host 검증이 전혀 없다

- 근거: `apps/api/src/compose/create-app.ts:168-204, apps/api/src/auth/create-auth.ts:13-25, apps/api/src/server.ts:25-28, infra/nginx/nginx.conf:61-62`
- 내용: `trustedOrigins`는 better-auth 인스턴스에만 전달되어 `/api/auth/*` 핸들러에서만 Origin 검증에 쓰입니다. 그 외 모든 mutation route(`/api/containers`, `/api/nginx/config/apply`, `/api/backups/:id/restore` 등)는 세션 쿠키만 확인할 뿐 Origin/Host 헤더를 보지 않습니다. 현재는 SameSite=Lax 쿠키와 `validator('json')`의 content-type 요구가 실질 방어선이지만, SECURITY.md §7은 "cookie 인증 mutation은 Origin과 Host를 검증하고 CSRF token 또는 Better Auth가 권장하는 방어를 적용한다"를 명시적 요구사항으로 두고 있어 구현이 문서에 미치지 못합니다. 또한 nginx 패널 블록이 `listen 8080 default_server`(nginx.conf:61)라 임의 Host 헤더로도 패널에 도달하므로 Host 기반 신뢰 경계가 존재하지 않습니다. `/api/exec/ws/:ticket` WebSocket 업그레이드에도 Origin 검사가 없습니다(create-interactive-exec-proxy-route.ts:100-108).
- 조치: `create-app.ts`의 `/api/*` 미들웨어에 mutating method 및 WebSocket 업그레이드에 대한 Origin 검증을 추가하십시오. `AUTH_TRUSTED_ORIGINS`를 재사용해 Origin 헤더가 없거나 목록에 없으면 403으로 거부하고, Origin이 없는 non-browser 클라이언트는 API key 경로(Authorization 헤더)만 허용하는 형태가 기존 구조와 잘 맞습니다.

#### [medium] viewer role이 전체 감사 로그(actorEmail·operation·detail)를 조회할 수 있다

- 근거: `apps/api/src/route/audit/create-audit-route.ts:36, apps/api/src/service/domain/audit/create-audit-service.ts:130-137, packages/contracts/src/audit.ts:10-23, docs/llm.txt:186`
- 내용: `createAuditRoute`는 `[OWNER, ADMIN, VIEWER, AUDITOR]`를 허용하지만 docs/llm.txt는 `/api/audit GET (owner/admin, read-only)`으로 문서화돼 있고 SECURITY.md §5의 role 모델에서도 audit resource 열람은 auditor 이상 개념입니다. viewer는 감사 로그를 통해 모든 actor의 이메일, 수행 operation, targetId(컨테이너/이미지/볼륨 이름), registry credential의 username·serverAddress(create-control-route.ts:132 detail)까지 열람합니다. 다행히 raw sourceIp는 `auditEventSchema`에 필드가 없어 Zod strip으로 제거되고 `sourceIpMasked`만 나가므로 §12의 IP 통제는 지켜지고 있습니다.
- 조치: `create-audit-route.ts:36`의 허용 role을 `[OWNER, ADMIN, AUDITOR]`로 좁히고 docs/llm.txt의 표기와 일치시키십시오. viewer에게도 감사 열람을 주려면 operation/targetId만 남기고 actorEmail·detail을 제외한 축약 뷰를 별도 제공하는 편이 낫습니다.

#### [medium] 패널 CSP가 script-src 'unsafe-inline' + connect-src 와일드카드 ws:/wss: 를 허용한다

- 근거: `infra/nginx/nginx.conf:65, apps/engine-agent/src/service/domain/create-nginx-config-service.ts:36,159`
- 내용: `script-src 'self' 'unsafe-inline'`은 XSS가 발생했을 때 inline 스크립트 실행을 그대로 허용하므로 CSP의 주된 방어 가치를 상실시킵니다. 더 나아가 `connect-src 'self' ws: wss:`는 **임의의 호스트로의 WebSocket 연결**을 허용해, XSS가 성립할 경우 세션 데이터·터미널 출력·트래픽 로그를 외부로 유출하는 채널이 열립니다(exfiltration containment 실패). 보호 계약 검사는 `Content-Security-Policy` 문자열 존재 여부만 확인하므로(create-nginx-config-service.ts:36,159) 지시어 내용이 약화돼도 검출되지 않습니다. 현재 웹앱에 `dangerouslySetInnerHTML` 사용처는 없어 즉시 악용 경로는 없지만, 이번 UI 전면 개편에서 shadcn 컴포넌트를 대량 도입하면 sink가 늘어날 수 있습니다.
- 조치: Next.js nonce 기반 CSP로 전환하십시오(proxy/middleware에서 요청별 nonce 생성 → `script-src 'self' 'nonce-...' 'strict-dynamic'`). `connect-src`는 `'self'`만 남기고 동일 오리진 WebSocket은 `'self'`로 커버되므로 `ws: wss:` 와일드카드를 제거하십시오. 그리고 보호 계약 토큰을 헤더 이름 존재 확인에서 지시어 단위 검사(`object-src 'none'`, `frame-ancestors 'none'`, unsafe-inline 부재)로 강화하십시오.

#### [medium] SSE 스트림에 actor별 상한이 없고, 미인증 mutating 요청이 maintenance drain을 무기한 지연시킬 수 있다

- 근거: `apps/api/src/route/stream/create-engine-stream-proxy-route.ts:26-58, apps/engine-agent/src/service/domain/create-engine-stream-service.ts:27,195-200, apps/api/src/compose/create-app.ts:170-184, apps/api/src/service/domain/maintenance/create-maintenance-service.ts:19-27,35-48`
- 내용: engine-agent에는 `MAX_CONCURRENT_STREAMS = 20` 전역 상한만 있고 actor별 상한이 없어, viewer 한 명이 `/api/stream/containers/:id/logs`를 20개 열면 나머지 사용자 전원의 로그·stats·events 스트림이 `ENGINE_STREAM_LIMIT`으로 막힙니다. API proxy 쪽에는 상한 자체가 없어 각 연결마다 15초 주기 세션 재확인 `setInterval`과 upstream 연결이 쌓입니다. 별개로 `create-app.ts`의 유지보수 미들웨어는 **인증 여부와 무관하게** 모든 mutating `/api/*` 요청에 대해 `maintenanceService.enter()`를 호출하고 `await next()` 동안 카운터를 유지합니다. `validator('json')`의 body 파싱이 `next()` 내부에서 일어나므로 미인증 공격자가 느린 POST body를 흘려보내면 `inflightMutations > 0`이 유지되어 `drain(timeoutMs)`가 `MAINTENANCE_DRAIN_TIMEOUT`으로 실패하고 백업 복원이 차단됩니다.
- 조치: API proxy 계층에 actor(userId)별 동시 SSE 상한(예: 3)과 전역 상한을 두고 초과 시 429를 반환하십시오. 유지보수 카운터는 인증·인가를 통과한 요청에 한해 증가하도록 `enter()` 호출을 라우트 핸들러 내부(또는 인증 후 미들웨어)로 옮기고, drain 대상이 아닌 미인증 요청은 카운트하지 마십시오.

#### [medium] 입력 검증(validator)이 인증보다 먼저 실행되어 미인증 요청이 대용량 body 파싱과 스키마 탐색을 유발한다

- 근거: `apps/api/src/route/control/create-control-route.ts:465-469, 515-522, apps/api/src/route/backup/create-backup-route.ts:93-104, infra/nginx/nginx.conf:86, apps/api/src/compose/create-app.ts:205-230`
- 내용: 거의 모든 라우트가 `validator('json', schema)` 미들웨어를 등록한 뒤 핸들러 **내부**에서 `requireRole`/`requireRecentRole`을 호출합니다(예: create-control-route.ts:465에서 검증, 469에서 인증). 따라서 세션이 없는 요청도 최대 65MB(`client_max_body_size 65m`, nginx.conf:86)까지 body를 파싱시키고 Zod 스키마를 통과시킬 수 있으며, 검증 실패 응답은 라우트의 `errorResponse` envelope를 거치지 않고 hono-openapi 기본 형식으로 나가 필드 이름·제약 조건을 미인증 상태에서 열람할 수 있습니다(create-app.test.ts에 400 응답 형태에 대한 검증이 전혀 없어 계약이 고정돼 있지 않습니다). 로그인 rate limit은 `/api/auth/sign-in/email`에만 걸려 있어 이 경로들은 일반 300r/m zone만 적용됩니다.
- 조치: `create-app.ts`의 `/api/*` 미들웨어 단계에서 인증/세션 확인을 먼저 수행하는 공통 게이트를 두거나, 각 라우트를 `withAuth`-유사 HOF로 감싸 인증을 validator보다 앞에 배치하십시오. 최소한 hono-openapi validator에 커스텀 hook을 지정해 검증 실패 응답을 `errorResponse('VALIDATION_ERROR', ...)` envelope로 통일하고 상세 issue는 비프로덕션에서만 노출하십시오.

#### [medium] exec 환경변수에 key allowlist·길이 제한·audit 기록이 없다 (SECURITY.md §9 미구현)

- 근거: `packages/contracts/src/engine-control.ts:50-57, 66-73, apps/api/src/route/control/create-control-route.ts:571, apps/engine-agent/src/service/domain/create-engine-control-service.ts:290-297`
- 내용: `containerExecRequestSchema.environment`와 `interactiveExecTicketRequestSchema.environment`는 `z.array(z.string().max(8_192)).max(128)`로 형식 제약이 전혀 없습니다. 컨테이너 생성 스키마가 `/^[A-Za-z_][A-Za-z0-9_]*=.*$/` 정규식을 적용하는 것과 대비됩니다(engine-control.ts:104-112). audit에는 `executable`과 `argumentCount`만 남고 환경변수 key는 기록되지 않습니다(create-control-route.ts:571). SECURITY.md §9는 "환경변수 주입은 key allowlist와 값 길이 제한을 적용하고 audit에는 key만 남긴다"를 명시합니다. 또한 `user` 필드가 `z.string().max(128).optional()`이라 `root`/`0:0` 지정이 owner+recent-auth만으로 가능해, §9의 "`root`와 `Privileged=true`는 break-glass" 규정과 어긋납니다.
- 조치: exec 계열 environment에 `KEY=VALUE` 정규식과 key allowlist(또는 최소한 금지 prefix)를 적용하고, 값 길이를 별도로 제한하십시오. audit detail에 `environmentKeys` 배열(값 제외)을 추가하고, `user`가 `root`/`0`으로 시작하는 경우 별도의 break-glass 확인 절차(대상명 재입력 + 별도 audit operation)를 요구하도록 라우트를 분기하십시오.

#### [low] deployment manifest가 보호 volume을 검증하지 않아 방어가 agent 한 곳에만 존재한다

- 근거: `apps/api/src/service/domain/deployment/create-deployment-manifest-service.ts:151-160, packages/contracts/src/deployment.ts:52-61,17, apps/engine-agent/src/service/domain/create-engine-control-service.ts:262-264`
- 내용: manifest 생성은 `protectedHostnames`와 `protectedNetworks`, `bridge/host/none`은 검사하지만 `volumes[].name`에 대한 보호 volume 검사가 없습니다. `dockerResourceNameSchema`는 `containers_control-data` 같은 이름을 그대로 허용하므로 manifest는 저장되고, 실제 차단은 릴리스 시점에 agent의 `createContainer`가 `PROTECTED_VOLUMES`로 거부할 때 처음 발생합니다. docs/llm.txt는 "control/ingress/probe/host networks와 9개 protected volume은 user-created container나 deployment manifest에서 사용할 수 없다"고 기술하고 있어 문서와 구현이 어긋납니다. 결과는 실패한 릴리스 job과 뒤늦은 피드백이며, 방어 계층이 하나뿐이라 agent 측 목록이 바뀌면 즉시 뚫립니다.
- 조치: `create-deployment-manifest-service.ts`의 `create`에 `payload.volumes.some(v => PROTECTED_VOLUMES.includes(v.name))` 검사를 추가하고, 이 목록을 api control-service/agent와 공유하는 contracts 상수로 통일하십시오. UI에서도 manifest 저장 단계에서 즉시 오류를 보여줄 수 있습니다.

#### [low] interactive exec ticket이 만료 정리 없이 누적되고 consume 시점에 관리 plane 재검증을 하지 않는다

- 근거: `apps/engine-agent/src/service/domain/create-interactive-exec-service.ts:25-32,46-76, apps/api/src/route/control/create-interactive-exec-proxy-route.ts:48-99`
- 내용: `tickets` Map은 `consumeTicket`에서만 삭제되고 만료 스윕이 없어, 티켓을 발급만 하고 접속하지 않으면 컨테이너 참조·명령·환경변수가 프로세스 메모리에 무기한 남습니다(owner 전용이므로 영향은 제한적이나 명령·환경변수 문자열이 계속 상주). 또한 관리 plane 보호 검사는 `createTicket` 시점에만 수행되고 `consumeTicket`/`attach`에서는 재확인하지 않아, SECURITY.md §9의 "exec는 container ID를 다시 inspect해 존재와 현재 상태를 확인한다" 요구를 30초 창 안에서 만족하지 못합니다. 대상 컨테이너를 찾지 못한 경우(`container`가 undefined)에도 티켓이 발급되는 fail-open 구조입니다.
- 조치: `createTicket`에서 만료된 티켓을 스윕하는 루프를 추가하거나 주기적 정리 타이머를 두고, `consumeTicket` 직후 `attach` 이전에 `isManagementPlaneResource` + 컨테이너 존재·running 상태를 다시 확인하십시오. 대상 컨테이너를 특정하지 못하면 `DOCKER_NOT_FOUND`로 거부하는 fail-closed로 바꾸는 것이 안전합니다.

#### [low] 관리 plane 이벤트 필터가 스트림 오픈 시점의 컨테이너 ID 스냅샷에 고정된다

- 근거: `apps/engine-agent/src/service/domain/create-engine-stream-service.ts:229-241`
- 내용: `openEventStream`은 스트림을 연 시점에 `getContainers()`로 관리 plane 컨테이너 ID 집합을 한 번 만들고 이후 그 Set으로 필터링합니다. `docker compose up --force-recreate`나 제어 plane 업그레이드로 컨테이너가 재생성되면 새 ID는 집합에 없으므로, 이미 열려 있는 SSE 세션에는 제어 plane 컨테이너의 create/start/die 이벤트가 그대로 노출됩니다. 모든 role이 `/api/stream/events`에 접근 가능하므로(create-engine-stream-proxy-route.ts:10) viewer도 제어 plane 재기동 시점과 컨테이너 ID를 관측할 수 있습니다.
- 조치: 이벤트 필터를 ID 스냅샷 대신 이벤트 payload의 `Actor.Attributes` 라벨(`com.docker.compose.project`, `managed-by`)로 직접 판정하도록 바꾸십시오. Docker 이벤트는 컨테이너 라벨을 포함하므로 스냅샷 없이 stateless 필터링이 가능합니다.

#### [low] loadOrCreateSecret이 기존 시크릿 파일의 권한(0600)을 검증하지 않는다

- 근거: `packages/config/src/secret.ts:6-19,26-28, apps/api/src/server.ts:56,71-75`
- 내용: `loadOrCreateSecret`은 파일이 없을 때만 `mode 0o600` + `chmod 0o600`을 적용하고, 이미 존재하는 파일은 길이(32자 이상)만 확인한 뒤 그대로 읽습니다. 볼륨 복원, 수동 편집, 다른 UID의 프로세스가 만든 파일 등으로 권한이 0644가 되어 있어도 조용히 사용되며, SECURITY.md §9의 "All files 0600" 가정이 런타임에서 검증되지 않습니다. 이 함수는 agent HMAC 시크릿, traffic HMAC 시크릿, deployment/notification 마스터 키 전부에 쓰입니다.
- 조치: 읽기 경로에서도 `stat` 후 `mode & 0o077 !== 0`이면 부팅을 실패시키거나 최소한 `chmod 0o600`으로 교정하고 경고 로그를 남기십시오. 부팅 시 실패시키는 편이 control plane 성격에 맞습니다.

#### [low] withErrorHandling이 비 AppError 예외 객체 전체를 콘솔에 출력해 입력값·시크릿이 로그로 샐 수 있다

- 근거: `apps/api/src/lib/with-error-handling.ts:44-45, apps/api/src/service/domain/deployment/create-deployment-secret-service.ts:82-85`
- 내용: `console.error('[api] request failed: code=...', error)`는 AppError가 아닌 모든 예외의 객체 전체(message, cause, Zod issues 등)를 그대로 stdout으로 내보냅니다. AppError 경로는 code/message만 출력해 잘 통제되어 있지만, 서비스 내부에서 던져진 Zod 오류나 crypto/DB 예외는 입력값 조각을 포함할 수 있습니다. SECURITY.md §2는 "`.env`와 secret 값을 로그, audit payload, API 응답에 넣지 않는다", §6은 "스택트레이스·시크릿·토큰·개인정보를 로그에 남기지 않는다"를 불변식으로 두고 있어 이 경로가 유일한 예외가 됩니다.
- 조치: 두 번째 인자 출력을 `error instanceof Error ? error.name + ': ' + error.message : 'unknown'`처럼 축약하고, 스택트레이스와 원본 객체는 개발 환경(NODE_ENV !== 'production')에서만 출력하도록 분기하십시오. Zod 오류는 issue의 `path`만 남기고 `input`/`received`는 제외하십시오.
