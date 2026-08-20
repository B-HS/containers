# 워크로드 라우트 템플릿이 Cookie·Authorization 을 제거해 세션 기반 앱이 전부 깨진다

## 증상

forge.hyuns.uk 의 Forgejo 에서 가입·로그인은 성공(303)하는데 다음 요청부터 로그아웃 상태다. 내부 네트워크에서 컨테이너에 직접 로그인하면 세션이 정상 유지된다(`/user/settings` 200) — 앱·DB·SECRET_KEY 문제가 아니다.

## 원인

`create-nginx-proxy-route-service.ts` 의 라우트 렌더러가 모든 워크로드 location 에 `proxy_set_header Cookie ""; proxy_set_header Authorization "";` 를 박아 **요청의 인증 헤더를 통째로 제거**했다. 2026-08-04 감사에서 "대소문자 변형 alias 로 제어 plane 컨테이너를 라우트 대상으로 삼을 수 있다"는 구멍의 완화책으로 들어간 것인데, 그 구멍 자체는 이후 대상 검증(exact-match `assertReachableTarget` + `assertProtectedTarget`)으로 근본 수정됐다. 남은 제거 로직은 보안 이득 없이 — 패널 쿠키는 host-only 라 워크로드 호스트로 전송되지 않는다 — 세션 로그인·HTTP 인증(git over HTTPS 포함)이 필요한 모든 워크로드를 깨뜨렸다.

## 해결

라우트 템플릿에서 두 `proxy_set_header` 제거 라인을 삭제해 인증 헤더를 upstream 에 그대로 전달한다. 라우트 대상은 여전히 (1) 보호 컨테이너 이름 거부, (2) 엔진의 실존 컨테이너 exact-match + routable 네트워크 검증을 통과해야 하므로 제어 plane 으로의 자격증명 전달 경로는 없다.

기존 라우트는 다음 라우트 upsert(릴리스 포함) 때 새 템플릿으로 재렌더된다.

## 함께 발견된 것 (별도 항목)

- Forgejo 이미지에 `FORGEJO__security__INSTALL_LOCK` 만 주면 엔트리포인트 템플릿이 `SECRET_KEY` 를 빈 값으로 쓴다. `forgejo/secret-key` deployment secret 을 만들어 주입했다(스택 v16.1).
- Forgejo 처럼 단일 인스턴스·상태ful 워크로드는 blue-green 릴리스와 충돌한다 — 신·구 컨테이너가 같은 `/data` 볼륨을 열면 LevelDB 큐 락으로 새 인스턴스가 기동 중 멈춰 프로브에 실패한다. 재배포 전 구 컨테이너를 먼저 정지해야 한다(짧은 다운타임).

## 검증

- `create-nginx-proxy-route-service.test.ts` — 인증 헤더 전달로 기대값 갱신, 전체 게이트 통과.
- 실측: api 재빌드 후 릴리스 재실행으로 라우트 재렌더 → 공개 URL 로그인 세션 유지 확인 예정.
