# API 키 발급 위젯이 admin 에게 항상 실패하는 기본값을 준다

## 증상

admin 세션으로 API 키 발급 폼을 열면 전체 scope 가 기본 선택돼 있고, 그대로 제출하면 owner 전용 scope(backup:write·secret:write) 때문에 서버가 `FORBIDDEN` 을 반환한다. 서버 보안은 정상이지만 admin 의 기본 UX 가 항상 실패한다.

## 원인

`widgets/api-key/api-key-widget.tsx` 가 role 을 모르는 채 `API_KEY_SCOPE_VALUES` 전체를 기본 선택했다. owner 전용 목록은 `apps/api` 서비스 내부에만 있어 웹이 참조할 수 없었다.

## 해결 (feat/api-key-parity)

- owner 전용 scope 목록을 `@containers/contracts/api-key` 의 `OWNER_ONLY_API_KEY_SCOPES` 로 승격해 api 서비스와 웹이 같은 원본을 쓴다.
- 위젯이 `isOwner` prop 을 받아 owner 가 아니면 owner 전용 scope 를 기본 선택에서 빼고 체크박스를 비활성화한다.
